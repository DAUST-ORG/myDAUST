import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FEE_STRUCTURE, type CreatePaymentPlanInput, type InitiatePaymentInput } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.js";

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** A student's invoices with schedule + payments and derived balances. Ownership-scoped. */
  async getStudentBilling(studentId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: {
        term: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    return invoices.map((inv) => ({
      id: inv.id,
      term: inv.term.name,
      total: inv.totalAmount,
      paid: inv.amountPaid,
      balance: inv.totalAmount - inv.amountPaid,
      status: inv.status,
      installments: inv.plan?.installments ?? [],
      payments: inv.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
      })),
    }));
  }

  /** Admin (bursar/finance) configures an installment schedule for an invoice. */
  async createPaymentPlan(input: CreatePaymentPlanInput, actorId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { plan: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.plan) throw new BadRequestException("Invoice already has a payment plan");

    const lines = input.installments.map((l) => ({
      sequence: l.sequence,
      dueDate: new Date(l.dueDate),
      amountDue: l.amount ?? Math.round((invoice.totalAmount * (l.percent ?? 0)) / 100),
    }));
    const sum = lines.reduce((acc, l) => acc + l.amountDue, 0);
    if (sum !== invoice.totalAmount) {
      throw new BadRequestException(
        `Installments (${sum}) must sum to the invoice total (${invoice.totalAmount})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.paymentPlan.create({
        data: {
          invoiceId: invoice.id,
          createdById: actorId,
          installments: { create: lines },
        },
        include: { installments: { orderBy: { sequence: "asc" } } },
      });
      await tx.auditLog.create({
        data: {
          entity: "PaymentPlan",
          entityId: plan.id,
          action: "created",
          actorId,
          data: { invoiceId: invoice.id, installments: lines.length },
        },
      });
      return plan;
    });
  }

  /** Student initiates a payment toward an invoice they own. Returns the gateway redirect. */
  async initiatePayment(studentId: string, input: InitiatePaymentInput) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { term: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.studentId !== studentId) throw new ForbiddenException("Not your invoice");

    const balance = invoice.totalAmount - invoice.amountPaid;
    if (input.amount > balance) {
      throw new BadRequestException(`Amount exceeds outstanding balance (${balance} XOF)`);
    }

    const ref = `MD-${randomUUID()}`;
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId,
        amount: input.amount,
        method: input.method,
        status: "pending",
        providerRef: ref,
      },
    });

    const { redirectUrl } = await this.provider.requestPayment({
      ref,
      amount: input.amount,
      itemName: `Tuition — ${invoice.term.name}`,
      customField: { invoiceId: invoice.id, studentId, paymentId: payment.id },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "Payment",
        entityId: payment.id,
        action: "initiated",
        actorId: studentId,
        data: { amount: input.amount, method: input.method },
      },
    });

    return { paymentId: payment.id, redirectUrl };
  }

  /**
   * Handle a PayTech IPN. The webhook — never the browser redirect — is the source of truth.
   * Verified, idempotent (dedupe by token + guarded state transition), transactional.
   * Returns whether the payload was authentic (controller maps to 200/403).
   */
  async handleIpn(payload: Record<string, unknown>): Promise<{ valid: boolean }> {
    const v = this.provider.verifyIpn(payload);
    if (!v.valid || !v.ref || !v.token) return { valid: v.valid };

    // Idempotency: record this delivery once. A duplicate token is a no-op.
    try {
      await this.prisma.webhookEvent.create({
        data: { token: v.token, paymentRef: v.ref, payload: payload as object },
      });
    } catch {
      return { valid: true }; // already processed
    }

    // Non-tuition charges ride the same verified rail, routed by ref prefix.
    if (v.ref.startsWith("DINE-")) {
      await this.settleDiningOrder(v.ref.slice(5), v.success);
      return { valid: true };
    }
    if (v.ref.startsWith("APPFEE-")) {
      await this.settleApplicationFee(v.ref.slice(7), v.success);
      return { valid: true };
    }

    const payment = await this.prisma.payment.findUnique({ where: { providerRef: v.ref } });
    if (!payment) return { valid: true };

    if (!v.success) {
      if (payment.status === "pending") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "cancelled", ipnPayload: payload as object },
        });
        await this.audit(payment.id, "cancelled", payload);
      }
      return { valid: true };
    }

    await this.settlePayment(payment.id, { via: "ipn", payload: payload as object, method: v.method });
    return { valid: true };
  }

  /**
   * Apply a successful payment: allocate to installments oldest-due-first, roll up the invoice,
   * audit, and email the receipt. Idempotent (no-op when already success). Shared by the IPN
   * path and the bursar's manual confirm (for verified-but-IPN-lost payments).
   */
  private async settlePayment(
    paymentId: string,
    opts: { via: "ipn" | "manual"; payload?: object; method?: string | null; actorId?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { plan: { include: { installments: true } } } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status === "success") return; // already applied

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "success",
          ...(opts.payload ? { ipnPayload: opts.payload } : {}),
        },
      });

      // Allocate to installments oldest-due-first (when a plan exists).
      let remaining = payment.amount;
      const installments = (payment.invoice.plan?.installments ?? [])
        .filter((i) => i.amountPaid < i.amountDue)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.sequence - b.sequence);

      for (const inst of installments) {
        if (remaining <= 0) break;
        const owed = inst.amountDue - inst.amountPaid;
        const apply = Math.min(owed, remaining);
        const newPaid = inst.amountPaid + apply;
        await tx.paymentAllocation.create({
          data: { paymentId: payment.id, installmentId: inst.id, amount: apply },
        });
        await tx.installment.update({
          where: { id: inst.id },
          data: {
            amountPaid: newPaid,
            status: newPaid >= inst.amountDue ? "paid" : "partial",
          },
        });
        remaining -= apply;
      }

      const newInvoicePaid = payment.invoice.amountPaid + payment.amount;
      await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: {
          amountPaid: newInvoicePaid,
          status: newInvoicePaid >= payment.invoice.totalAmount ? "paid" : "partial",
        },
      });

      await tx.auditLog.create({
        data: {
          entity: "Payment",
          entityId: payment.id,
          action: opts.via === "ipn" ? "succeeded" : "manually-confirmed",
          actorId: opts.actorId,
          data: { amount: payment.amount, method: opts.method ?? payment.method },
        },
      });
    });

    await this.emailReceipt(payment.id);
  }

  /** Bursar verified the money in the PayTech dashboard but the IPN never arrived. */
  async confirmPaymentManually(paymentId: string, actorId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "pending") throw new BadRequestException("Only pending payments can be confirmed");
    await this.settlePayment(paymentId, { via: "manual", actorId });
    return { ok: true };
  }

  /** Bursar confirmed the checkout was abandoned; explicitly cancel the stale pending payment. */
  async cancelPaymentManually(paymentId: string, actorId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "pending") throw new BadRequestException("Only pending payments can be cancelled");
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status: "cancelled" } });
    await this.audit(paymentId, "manually-cancelled", { actorId });
    return { ok: true };
  }

  /** IPN said a weekend dining order was paid. Idempotent: only a cart order transitions. */
  private async settleDiningOrder(orderId: string, success: boolean) {
    if (!success) return;
    await this.prisma.diningOrder.updateMany({
      where: { id: orderId, status: "cart" },
      data: { status: "paid" },
    });
    await this.prisma.auditLog.create({
      data: { entity: "DiningOrder", entityId: orderId, action: "paid-via-ipn" },
    });
  }

  /** IPN said an application fee was paid. Idempotent boolean flip. */
  private async settleApplicationFee(applicantId: string, success: boolean) {
    if (!success) return;
    await this.prisma.applicant.updateMany({
      where: { id: applicantId, feePaid: false },
      data: { feePaid: true },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Applicant", entityId: applicantId, action: "application-fee-paid" },
    });
  }

  /** Email a payment receipt to the student (best-effort; dev-logs without a provider). */
  private async emailReceipt(paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: { include: { person: true } }, invoice: { include: { term: true } } },
    });
    if (!p) return;
    await this.mail.send({
      to: p.student.person.email,
      subject: `Payment receipt — ${p.invoice.term.name}`,
      html: `
        <h2>Payment received</h2>
        <p>Hi ${p.student.person.firstName}, we've received your payment.</p>
        <table cellpadding="6">
          <tr><td><strong>Amount</strong></td><td>${p.amount.toLocaleString("en-US")} XOF</td></tr>
          <tr><td><strong>Method</strong></td><td>${p.method}</td></tr>
          <tr><td><strong>Reference</strong></td><td>${p.providerRef}</td></tr>
          <tr><td><strong>Term</strong></td><td>${p.invoice.term.name}</td></tr>
        </table>
        <p>View the full receipt anytime in your myDAUST billing page.</p>`,
    });
  }

  // --- Admin (bursar/finance) tracking ---

  async listPayments(status?: string) {
    const payments = await this.prisma.payment.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        invoice: { include: { term: true } },
        student: { include: { person: true } },
      },
    });
    return payments.map((p) => ({
      id: p.id,
      student: `${p.student.person.firstName} ${p.student.person.lastName}`,
      studentNo: p.student.studentNo,
      term: p.invoice.term.name,
      amount: p.amount,
      method: p.method,
      status: p.status,
      providerRef: p.providerRef,
      createdAt: p.createdAt,
    }));
  }

  /** Director/bursar money-in view: billed vs collected vs outstanding, plus method mix. */
  async getCollectionSummary() {
    const [billed, collectedAgg, byMethod, counts] = await Promise.all([
      this.prisma.invoice.aggregate({ _sum: { totalAmount: true, amountPaid: true } }),
      this.prisma.payment.aggregate({
        where: { status: "success" },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ["method"],
        where: { status: "success" },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.invoice.groupBy({ by: ["status"], _count: true }),
    ]);

    const totalBilled = billed._sum.totalAmount ?? 0;
    const totalCollected = collectedAgg._sum.amount ?? 0;
    return {
      currency: "XOF",
      billed: totalBilled,
      collected: totalCollected,
      outstanding: totalBilled - (billed._sum.amountPaid ?? 0),
      collectionRate: totalBilled === 0 ? 0 : Math.round((totalCollected / totalBilled) * 100),
      byMethod: byMethod.map((m) => ({
        method: m.method,
        amount: m._sum.amount ?? 0,
        count: m._count,
      })),
      invoicesByStatus: counts.map((c) => ({ status: c.status, count: c._count })),
    };
  }

  /** Bursar drill-down: one student's full account (invoices, schedule, payments, balances). */
  async getStudentAccount(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { person: true, program: true },
    });
    if (!student) throw new NotFoundException("Student not found");

    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: {
        term: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    const billed = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const paid = invoices.reduce((s, i) => s + i.amountPaid, 0);
    return {
      student: {
        studentNo: student.studentNo,
        name: `${student.person.firstName} ${student.person.lastName}`,
        program: student.program?.name ?? "—",
        email: student.person.email,
      },
      totals: { billed, paid, balance: billed - paid },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        term: inv.term.name,
        total: inv.totalAmount,
        paid: inv.amountPaid,
        balance: inv.totalAmount - inv.amountPaid,
        status: inv.status,
        hasPlan: !!inv.plan,
        installments: inv.plan?.installments ?? [],
        payments: inv.payments.map((p) => ({
          id: p.id, amount: p.amount, method: p.method, status: p.status, createdAt: p.createdAt,
        })),
      })),
    };
  }

  /** Installments past due and not fully paid, across all students (bursar collections view). */
  async listOverdue() {
    const overdue = await this.prisma.installment.findMany({
      where: { dueDate: { lt: new Date() }, status: { in: ["pending", "partial", "overdue"] } },
      orderBy: { dueDate: "asc" },
      include: {
        plan: { include: { invoice: { include: { student: { include: { person: true } }, term: true } } } },
      },
    });
    return overdue
      .filter((i) => i.amountPaid < i.amountDue)
      .map((i) => ({
        installmentId: i.id,
        student: `${i.plan.invoice.student.person.firstName} ${i.plan.invoice.student.person.lastName}`,
        studentNo: i.plan.invoice.student.studentNo,
        term: i.plan.invoice.term.name,
        sequence: i.sequence,
        dueDate: i.dueDate,
        amountDue: i.amountDue,
        amountPaid: i.amountPaid,
        outstanding: i.amountDue - i.amountPaid,
      }));
  }

  /** Scheduled: flag installments overdue once their due date passes. Returns count updated. */
  async markOverdueInstallments(): Promise<number> {
    const res = await this.prisma.installment.updateMany({
      where: { dueDate: { lt: new Date() }, status: { in: ["pending", "partial"] } },
      data: { status: "overdue" },
    });
    return res.count;
  }

  /**
   * Reconciliation surfaces stale pendings for HUMAN review — it never auto-cancels, because a
   * payment whose IPN was lost may be genuinely paid; the bursar checks the PayTech dashboard
   * and uses confirm/cancel. (If PayTech exposes a status API later, poll it here instead.)
   */
  async listStalePendingPayments(graceMinutes = 60) {
    const cutoff = new Date(Date.now() - graceMinutes * 60_000);
    const stale = await this.prisma.payment.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      include: { student: { include: { person: true } }, invoice: { include: { term: true } } },
    });
    return stale.map((p) => ({
      id: p.id,
      student: `${p.student.person.firstName} ${p.student.person.lastName}`,
      studentNo: p.student.studentNo,
      term: p.invoice.term.name,
      amount: p.amount,
      method: p.method,
      providerRef: p.providerRef,
      createdAt: p.createdAt,
      ageMinutes: Math.round((Date.now() - p.createdAt.getTime()) / 60_000),
    }));
  }

  // --- Management accounting: cost centers, expenses, budgets, director money-in/out ---

  listCostCenters() {
    return this.prisma.costCenter.findMany({ orderBy: { code: "asc" } });
  }

  async createExpense(
    input: {
      costCenterCode: string;
      category: string;
      description?: string;
      payee?: string;
      amount: number;
      isEstimate: boolean;
      incurredOn: string;
    },
    actorId?: string,
  ) {
    const expense = await this.prisma.expense.create({
      data: {
        costCenterCode: input.costCenterCode,
        category: input.category,
        description: input.description,
        payee: input.payee,
        amount: input.amount,
        isEstimate: input.isEstimate,
        incurredOn: new Date(input.incurredOn),
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Expense", entityId: expense.id, action: "created", actorId, data: input },
    });
    return expense;
  }

  async updateExpense(
    id: string,
    patch: Partial<{
      costCenterCode: string;
      category: string;
      description: string;
      payee: string;
      amount: number;
      isEstimate: boolean;
      incurredOn: string;
    }>,
    actorId?: string,
  ) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");
    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(patch.costCenterCode !== undefined ? { costCenterCode: patch.costCenterCode } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.payee !== undefined ? { payee: patch.payee } : {}),
        ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
        ...(patch.isEstimate !== undefined ? { isEstimate: patch.isEstimate } : {}),
        ...(patch.incurredOn !== undefined ? { incurredOn: new Date(patch.incurredOn) } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Expense", entityId: id, action: "updated", actorId, data: patch },
    });
    return expense;
  }

  async deleteExpense(id: string, actorId?: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");
    await this.prisma.expense.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { entity: "Expense", entityId: id, action: "deleted", actorId, data: { amount: existing.amount, category: existing.category } },
    });
    return { ok: true };
  }

  async listExpenses() {
    const rows = await this.prisma.expense.findMany({
      orderBy: { incurredOn: "desc" },
      take: 200,
      include: { costCenter: true },
    });
    return rows.map((e) => ({
      id: e.id,
      costCenter: `${e.costCenterCode} ${e.costCenter.name}`,
      category: e.category,
      payee: e.payee,
      description: e.description,
      amount: e.amount,
      isEstimate: e.isEstimate,
      incurredOn: e.incurredOn,
    }));
  }

  async setBudget(input: { costCenterCode: string; fiscalYear: string; allocated: number }) {
    return this.prisma.budget.upsert({
      where: {
        costCenterCode_fiscalYear: {
          costCenterCode: input.costCenterCode,
          fiscalYear: input.fiscalYear,
        },
      },
      update: { allocated: input.allocated },
      create: input,
    });
  }

  /** Director's institution-wide money-in vs money-out, by cost center and rolled up by group. */
  async directorOverview(fiscalYear = "FY2026") {
    const [centers, payments, expenseAgg, budgets] = await Promise.all([
      this.prisma.costCenter.findMany(),
      this.prisma.payment.findMany({
        where: { status: "success" },
        include: { invoice: { select: { costCenterCode: true } } },
      }),
      this.prisma.expense.groupBy({ by: ["costCenterCode"], _sum: { amount: true } }),
      this.prisma.budget.findMany({ where: { fiscalYear } }),
    ]);

    const revenueByCc = new Map<string, number>();
    for (const p of payments) {
      const cc = p.invoice.costCenterCode;
      revenueByCc.set(cc, (revenueByCc.get(cc) ?? 0) + p.amount);
    }

    // Auxiliary revenue that doesn't ride invoices: dining orders → 3600, application fees → 4200.
    const [diningAgg, paidApplicants] = await Promise.all([
      this.prisma.diningOrder.aggregate({
        where: { status: { in: ["paid", "preparing", "ready", "collected"] } },
        _sum: { totalXof: true },
      }),
      this.prisma.applicant.count({ where: { feePaid: true } }),
    ]);
    const diningRevenue = diningAgg._sum.totalXof ?? 0;
    if (diningRevenue > 0) revenueByCc.set("3600", (revenueByCc.get("3600") ?? 0) + diningRevenue);
    // Uses the CURRENT configured fee; historical fee changes will skew this management view
    // slightly until per-payment amounts are recorded for app fees.
    const feeRow = await this.prisma.feeItem.findUnique({ where: { key: "application_fee" } });
    const appFeeRevenue = paidApplicants * (feeRow?.minXof ?? FEE_STRUCTURE.applicationFee);
    if (appFeeRevenue > 0) revenueByCc.set("4200", (revenueByCc.get("4200") ?? 0) + appFeeRevenue);
    const expenseByCc = new Map<string, number>();
    for (const e of expenseAgg) expenseByCc.set(e.costCenterCode, e._sum.amount ?? 0);

    const byCode = new Map(centers.map((c) => [c.code, c]));
    const groupTotals = new Map<string, { revenue: number; expense: number }>();
    const leaves = centers.filter((c) => c.type !== "group");

    for (const c of leaves) {
      const revenue = revenueByCc.get(c.code) ?? 0;
      const expense = expenseByCc.get(c.code) ?? 0;
      const groupCode = c.parentCode ?? c.code;
      const g = groupTotals.get(groupCode) ?? { revenue: 0, expense: 0 };
      g.revenue += revenue;
      g.expense += expense;
      groupTotals.set(groupCode, g);
    }

    const moneyIn = [...revenueByCc.values()].reduce((s, v) => s + v, 0);
    const moneyOut = [...expenseByCc.values()].reduce((s, v) => s + v, 0);

    return {
      fiscalYear,
      totals: { moneyIn, moneyOut, net: moneyIn - moneyOut, cashPosition: moneyIn - moneyOut },
      centers: leaves
        .map((c) => ({
          code: c.code,
          name: c.name,
          type: c.type,
          revenue: revenueByCc.get(c.code) ?? 0,
          expense: expenseByCc.get(c.code) ?? 0,
          net: (revenueByCc.get(c.code) ?? 0) - (expenseByCc.get(c.code) ?? 0),
        }))
        .filter((c) => c.revenue > 0 || c.expense > 0),
      groups: [...groupTotals.entries()].map(([code, g]) => ({
        code,
        name: byCode.get(code)?.name ?? code,
        revenue: g.revenue,
        expense: g.expense,
        net: g.revenue - g.expense,
      })),
      budget: budgets.map((b) => {
        const spent = expenseByCc.get(b.costCenterCode) ?? 0;
        return {
          code: b.costCenterCode,
          name: byCode.get(b.costCenterCode)?.name ?? b.costCenterCode,
          allocated: b.allocated,
          spent,
          pct: b.allocated === 0 ? 0 : Math.round((spent / b.allocated) * 100),
        };
      }),
    };
  }

  /**
   * Refund a successful payment: reverse its installment/invoice allocations, mark it refunded,
   * attempt a gateway refund when the provider supports it, audit, and email the student.
   */
  async refundPayment(paymentId: string, reason: string | undefined, actorId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true, invoice: true, student: { include: { person: true } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "success") throw new BadRequestException("Only successful payments can be refunded");

    await this.prisma.$transaction(async (tx) => {
      for (const alloc of payment.allocations) {
        const inst = await tx.installment.findUniqueOrThrow({ where: { id: alloc.installmentId } });
        const newPaid = Math.max(0, inst.amountPaid - alloc.amount);
        await tx.installment.update({
          where: { id: inst.id },
          data: {
            amountPaid: newPaid,
            status: newPaid <= 0 ? "pending" : newPaid >= inst.amountDue ? "paid" : "partial",
          },
        });
      }
      const newInvoicePaid = Math.max(0, payment.invoice.amountPaid - payment.amount);
      await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: { amountPaid: newInvoicePaid, status: newInvoicePaid <= 0 ? "open" : "partial" },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
      await tx.auditLog.create({
        data: { entity: "Payment", entityId: payment.id, action: "refunded", actorId, data: { amount: payment.amount, reason: reason ?? null } },
      });
    });

    let gateway: { ok: boolean; ref?: string } = { ok: false };
    if (this.provider.refund) {
      try {
        gateway = await this.provider.refund(payment.providerRef, payment.amount);
      } catch {
        gateway = { ok: false };
      }
    }

    await this.mail.send({
      to: payment.student.person.email,
      subject: "Your DAUST payment has been refunded",
      html: `<h2>Refund processed</h2><p>Hi ${payment.student.person.firstName}, a refund of <strong>${payment.amount.toLocaleString("en-US")} XOF</strong> has been recorded${reason ? ` (${reason})` : ""}. Your balance has been updated accordingly.</p>`,
    });

    return { ok: true, refundedAmount: payment.amount, gatewayRefund: gateway.ok };
  }

  /** Accounts-receivable aging: outstanding installment balances bucketed by days overdue. */
  async arAging() {
    const installments = await this.prisma.installment.findMany({
      where: { status: { in: ["pending", "partial", "overdue"] } },
      include: { plan: { include: { invoice: { include: { student: { include: { person: true } }, term: true } } } } },
    });
    const now = Date.now();
    const buckets = [
      { key: "current", label: "Not yet due", min: -Infinity, max: 0, amount: 0, count: 0 },
      { key: "1-30", label: "1–30 days", min: 0, max: 30, amount: 0, count: 0 },
      { key: "31-60", label: "31–60 days", min: 30, max: 60, amount: 0, count: 0 },
      { key: "61-90", label: "61–90 days", min: 60, max: 90, amount: 0, count: 0 },
      { key: "90+", label: "Over 90 days", min: 90, max: Infinity, amount: 0, count: 0 },
    ];
    const rows: { student: string; studentNo: string; term: string; daysOverdue: number; outstanding: number }[] = [];
    for (const inst of installments) {
      const outstanding = inst.amountDue - inst.amountPaid;
      if (outstanding <= 0) continue;
      const days = Math.floor((now - inst.dueDate.getTime()) / 86_400_000);
      const b = buckets.find((x) => days > x.min && days <= x.max) ?? buckets[0]!;
      b.amount += outstanding;
      b.count += 1;
      const inv = inst.plan.invoice;
      rows.push({
        student: `${inv.student.person.firstName} ${inv.student.person.lastName}`,
        studentNo: inv.student.studentNo,
        term: inv.term.name,
        daysOverdue: Math.max(0, days),
        outstanding,
      });
    }
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return {
      buckets: buckets.map(({ key, label, amount, count }) => ({ key, label, amount, count })),
      totalOutstanding: buckets.reduce((s, b) => s + b.amount, 0),
      rows,
    };
  }

  /** Printable receipt data for a single payment. */
  async getReceipt(paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: { include: { person: true } },
        invoice: { include: { term: true } },
        allocations: { include: { installment: true } },
      },
    });
    if (!p) throw new NotFoundException("Payment not found");
    return {
      id: p.id,
      student: `${p.student.person.firstName} ${p.student.person.lastName}`,
      studentNo: p.student.studentNo,
      email: p.student.person.email,
      term: p.invoice.term.name,
      amount: p.amount,
      method: p.method,
      status: p.status,
      providerRef: p.providerRef,
      paidAt: p.updatedAt,
      allocations: p.allocations.map((a) => ({ sequence: a.installment.sequence, amount: a.amount })),
    };
  }

  /** Eight canned management reports composed from existing aggregates. */
  async reports() {
    const [summary, aging, payments, director] = await Promise.all([
      this.getCollectionSummary(),
      this.arAging(),
      this.listPayments(),
      this.directorOverview(),
    ]);
    const succeeded = payments.filter((p) => p.status === "success");
    const byTerm = new Map<string, number>();
    for (const p of succeeded) byTerm.set(p.term, (byTerm.get(p.term) ?? 0) + p.amount);

    return {
      collections: summary,
      aging,
      paymentsByMethod: summary.byMethod,
      revenueByTerm: [...byTerm.entries()].map(([term, amount]) => ({ term, amount })),
      cashByCostCenter: director.centers.filter((c) => c.revenue > 0 || c.expense > 0),
      budgetVsActual: director.budget,
      recentPayments: succeeded.slice(0, 10),
      totals: director.totals,
    };
  }

  private async audit(entityId: string, action: string, data: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: { entity: "Payment", entityId, action, data: data as object },
    });
  }
}

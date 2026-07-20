import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  COST_CENTER_TUITION,
  FEE_STRUCTURE,
  splitEvenXof,
  type CreatePaymentPlanInput,
  type InitiatePaymentInput,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.js";
import { loadEnv } from "../config/env.js";

// Standard annual tuition, billed as the official 4-installment quarterly plan — mirrors
// packages/db/prisma/import-students.ts so admin-created students match the imported roster.
// Official DAUST payment sheet (tuition-only): 4 x 743,750 XOF due Aug 5 / Nov 5 / Jan 5 / Mar 5.
const STANDARD_TUITION_XOF = FEE_STRUCTURE.tuitionPerYear; // 2_975_000
const TUITION_TERM_NAME = "Fall 2026";
const TUITION_INSTALLMENT_DUE = ["2026-08-05", "2026-11-05", "2027-01-05", "2027-03-05"] as const;

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

  /**
   * The institution-wide fee schedule (the DAUST payment-plan sheet). This is the
   * template staff edit; it does not retroactively change invoices already raised —
   * those carry their own installments and are edited per student.
   */
  async getFeePlan(academicYearLabel?: string) {
    const year =
      academicYearLabel ??
      (await this.prisma.academicYear.findFirst({ where: { status: "active" } }))?.label;
    if (!year) return { academicYearLabel: null, rows: [], totals: { full: 0, tuition: 0 } };

    const rows = await this.prisma.feePlanInstallment.findMany({
      where: { academicYearLabel: year },
      orderBy: { sequence: "asc" },
    });
    return {
      academicYearLabel: year,
      rows,
      totals: {
        full: rows.reduce((s, r) => s + r.amountFullXof, 0),
        tuition: rows.reduce((s, r) => s + r.amountTuitionXof, 0),
      },
    };
  }

  async updateFeePlanRow(
    actorId: string,
    id: string,
    input: { label?: string; dueOn?: string; amountFullXof?: number; amountTuitionXof?: number },
  ) {
    const row = await this.prisma.feePlanInstallment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Fee plan installment not found");

    const updated = await this.prisma.feePlanInstallment.update({
      where: { id },
      data: {
        label: input.label ?? row.label,
        dueOn: input.dueOn ? new Date(input.dueOn) : row.dueOn,
        amountFullXof: input.amountFullXof ?? row.amountFullXof,
        amountTuitionXof: input.amountTuitionXof ?? row.amountTuitionXof,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "FeePlanInstallment",
        entityId: id,
        action: "fee-plan-updated",
        actorId,
        data: {
          before: { full: row.amountFullXof, tuition: row.amountTuitionXof },
          after: { full: updated.amountFullXof, tuition: updated.amountTuitionXof },
        },
      },
    });
    return updated;
  }

  /**
   * Per-student override of a plan's installments: edit each installment's amount + due date.
   * The invoice total follows the installment sum, so lowering an installment lowers what the
   * student owes (balance nets automatically). An installment cannot be set below what has
   * already been paid into it. Recomputes installment + invoice status. Audited.
   */
  async updatePaymentPlan(
    actorId: string,
    invoiceId: string,
    rows: { id: string; dueDate: string; amountDue: number }[],
  ) {
    if (rows.length === 0) throw new BadRequestException("At least one installment is required");

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { plan: { include: { installments: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.totalAmount < 0) throw new BadRequestException("Cannot edit a credit memo");
    if (!invoice.plan) throw new BadRequestException("Invoice has no payment plan to edit");

    const byId = new Map(invoice.plan.installments.map((i) => [i.id, i]));
    for (const r of rows) {
      const inst = byId.get(r.id);
      if (!inst) throw new BadRequestException(`Installment ${r.id} does not belong to this plan`);
      if (!Number.isInteger(r.amountDue) || r.amountDue < 0) {
        throw new BadRequestException("Installment amount must be a non-negative integer");
      }
      if (r.amountDue < inst.amountPaid) {
        throw new BadRequestException(
          `Installment ${inst.sequence} already has ${inst.amountPaid} paid; cannot set below that`,
        );
      }
      if (Number.isNaN(new Date(r.dueDate).getTime())) {
        throw new BadRequestException("Invalid due date");
      }
    }

    const now = Date.now();
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const inst = byId.get(r.id)!;
        const due = new Date(r.dueDate);
        const status: "paid" | "partial" | "overdue" | "pending" =
          inst.amountPaid >= r.amountDue ? "paid"
          : inst.amountPaid > 0 ? "partial"
          : due.getTime() < now ? "overdue"
          : "pending";
        await tx.installment.update({
          where: { id: r.id },
          data: { amountDue: r.amountDue, dueDate: due, status },
        });
      }

      const fresh = await tx.installment.findMany({ where: { planId: invoice.plan!.id } });
      const newTotal = fresh.reduce((s, i) => s + i.amountDue, 0);
      const invStatus: "paid" | "partial" | "open" =
        newTotal > 0 && invoice.amountPaid >= newTotal ? "paid"
        : invoice.amountPaid > 0 ? "partial"
        : "open";
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { totalAmount: newTotal, status: invStatus },
      });

      await tx.auditLog.create({
        data: {
          entity: "PaymentPlan",
          entityId: invoice.plan!.id,
          action: "plan-updated",
          actorId,
          data: { invoiceId: invoice.id, oldTotal: invoice.totalAmount, newTotal },
        },
      });
    });

    return { ok: true };
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
    if (v.ref.startsWith("PLINK-")) {
      await this.settlePaymentLinkIpn(v.ref.slice(6), v.success, payload as object, v.method);
      return { valid: true };
    }
    // Public bill portal (payment.daust.net): the ref IS the Payment.providerRef.
    if (v.ref.startsWith("BILL-")) {
      await this.settleBillIpn(v.ref, v.success, payload as object, v.method);
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

  /** All student accounts with derived balances + status. Powers the standalone billing admin. */
  async listStudentAccounts() {
    const students = await this.prisma.student.findMany({
      orderBy: { studentNo: "asc" },
      include: {
        person: true,
        program: true,
        invoices: { include: { plan: { include: { installments: true } } } },
      },
    });
    const now = Date.now();
    return students.map((s) => {
      const billed = s.invoices.reduce((a, i) => a + i.totalAmount, 0);
      const paid = s.invoices.reduce((a, i) => a + i.amountPaid, 0);
      const balance = billed - paid;
      const installments = s.invoices.flatMap((i) => i.plan?.installments ?? []);
      const openCharges = installments.filter((i) => i.amountPaid < i.amountDue).length;
      const overdue = installments.some((i) => i.amountPaid < i.amountDue && i.dueDate.getTime() < now);
      return {
        id: s.id,
        studentNo: s.studentNo,
        name: `${s.person.firstName} ${s.person.lastName}`.replace(/\s+/g, " ").trim(),
        program: s.program?.name ?? null,
        photoUrl: s.photoUrl,
        billed,
        paid,
        balance,
        openCharges,
        overdue,
        status: balance <= 0 ? "paid" : overdue ? "overdue" : "due",
        invoiceId: s.invoices[0]?.id ?? null,
      };
    });
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
        description: inv.description,
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

  // --- Standalone billing admin: student + ad-hoc charge management ---
  // A "charge" is one small Invoice + a single-installment plan, so it flows through the exact
  // same balance/settlement rail as tuition with zero changes to settlePayment or balance math.

  private splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.replace(/\s+/g, " ").trim().split(" ");
    const firstName = parts.shift() ?? "";
    return { firstName, lastName: parts.join(" ") || firstName };
  }

  /** Mint a unique campus ID for a student created without an official registrar number. */
  private async generateStudentNo(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const base = await this.prisma.student.count();
    for (let i = 0; i < 100; i++) {
      const candidate = `DAUST-${year}-${String(base + 1 + i).padStart(4, "0")}`;
      const exists = await this.prisma.student.findUnique({ where: { studentNo: candidate } });
      if (!exists) return candidate;
    }
    return `DAUST-${year}-${randomUUID().slice(0, 8)}`;
  }

  /** Bill the standard annual tuition (idempotent per student+term). */
  private async billStandardTuition(studentId: string, actorId: string) {
    const term = await this.prisma.term.findUnique({ where: { name: TUITION_TERM_NAME } });
    if (!term) throw new BadRequestException(`Term "${TUITION_TERM_NAME}" is not set up`);
    const existing = await this.prisma.invoice.findFirst({ where: { studentId, termId: term.id } });
    if (existing) return;
    const amounts = splitEvenXof(STANDARD_TUITION_XOF, TUITION_INSTALLMENT_DUE.length);
    const installments = TUITION_INSTALLMENT_DUE.map((d, idx) => ({
      sequence: idx + 1,
      dueDate: new Date(`${d}T00:00:00Z`),
      amountDue: amounts[idx] ?? 0,
    }));
    const invoice = await this.prisma.invoice.create({
      data: {
        studentId,
        termId: term.id,
        totalAmount: STANDARD_TUITION_XOF,
        costCenterCode: COST_CENTER_TUITION,
        plan: { create: { createdById: actorId, installments: { create: installments } } },
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Invoice", entityId: invoice.id, action: "tuition-billed", actorId, data: { amount: STANDARD_TUITION_XOF } },
    });
  }

  /**
   * Create a real platform student (Person + Student) from the billing admin. They immediately
   * appear in the registrar roster and can pay on payment.daust.net. Optionally auto-bills tuition.
   */
  async createStudent(
    actorId: string,
    input: {
      fullName: string;
      dateOfBirth: string;
      studentNo?: string;
      email?: string;
      programCode?: string;
      billTuition?: boolean;
    },
  ) {
    const { firstName, lastName } = this.splitName(input.fullName);
    if (!firstName) throw new BadRequestException("Full name is required");
    const dob = new Date(`${input.dateOfBirth.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) throw new BadRequestException("Invalid date of birth");

    const studentNo = input.studentNo?.trim() || (await this.generateStudentNo());
    if (await this.prisma.student.findUnique({ where: { studentNo } })) {
      throw new BadRequestException(`Student ID ${studentNo} already exists`);
    }
    const email = input.email?.trim().toLowerCase() || `${studentNo.toLowerCase()}@students.daust.edu`;
    if (await this.prisma.person.findUnique({ where: { email } })) {
      throw new BadRequestException(`Email ${email} is already in use`);
    }

    let programId: string | null = null;
    if (input.programCode) {
      const program = await this.prisma.program.findUnique({ where: { code: input.programCode } });
      if (!program) throw new BadRequestException("Unknown program");
      programId = program.id;
    }

    const student = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: { email, firstName, lastName, kind: "student", roles: ["student"] },
      });
      const created = await tx.student.create({
        data: { personId: person.id, studentNo, dateOfBirth: dob, programId },
      });
      await tx.auditLog.create({
        data: { entity: "Student", entityId: created.id, action: "student-created", actorId, data: { studentNo, email } },
      });
      return created;
    });

    if (input.billTuition !== false) await this.billStandardTuition(student.id, actorId);
    return { id: student.id, studentNo };
  }

  /** Add an ad-hoc charge to one, several, or all students. Each charge = one single-installment invoice. */
  async addCharge(
    actorId: string,
    input: { studentIds: string[]; description: string; amountXof: number; costCenterCode?: string; dueDate?: string },
  ) {
    const description = input.description.trim();
    if (!description) throw new BadRequestException("Charge description is required");
    const amount = Math.floor(input.amountXof);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("Amount must be positive");

    const costCenterCode = input.costCenterCode ?? COST_CENTER_TUITION;
    if (!(await this.prisma.costCenter.findUnique({ where: { code: costCenterCode } }))) {
      throw new BadRequestException("Unknown cost center");
    }
    const term = await this.prisma.term.findUnique({ where: { name: TUITION_TERM_NAME } });
    if (!term) throw new BadRequestException(`Term "${TUITION_TERM_NAME}" is not set up`);
    const dueDate = input.dueDate ? new Date(input.dueDate) : new Date();
    if (Number.isNaN(dueDate.getTime())) throw new BadRequestException("Invalid due date");

    const ids = [...new Set(input.studentIds)];
    if (ids.length === 0) throw new BadRequestException("No students selected");
    const validIds = (
      await this.prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true } })
    ).map((s) => s.id);
    if (validIds.length === 0) throw new NotFoundException("No matching students");

    // Chunk so a big "charge all" stays comfortably under the interactive-transaction timeout.
    const CHUNK = 25;
    let count = 0;
    for (let i = 0; i < validIds.length; i += CHUNK) {
      const slice = validIds.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        slice.map((studentId) =>
          this.prisma.invoice.create({
            data: {
              studentId,
              termId: term.id,
              totalAmount: amount,
              description,
              costCenterCode,
              plan: {
                create: {
                  createdById: actorId,
                  installments: { create: [{ sequence: 1, dueDate, amountDue: amount }] },
                },
              },
            },
          }),
        ),
      );
      count += slice.length;
    }
    await this.prisma.auditLog.create({
      data: {
        entity: "Charge",
        entityId: "bulk",
        action: "charges-added",
        actorId,
        data: { description, amount, costCenterCode, count, studentIds: validIds },
      },
    });
    return { ok: true, count };
  }

  /**
   * Attach an individual discount / scholarship to a student — a named account credit
   * (negative-total invoice) that reduces their balance and rides the same balance math.
   * Separate from the automatic BAC scholarship; this is staff-applied per student.
   */
  async applyDiscount(
    actorId: string,
    input: { studentId: string; label: string; amountXof: number; kind?: string; costCenterCode?: string },
  ) {
    const label = input.label.trim();
    if (!label) throw new BadRequestException("A label is required");
    const amount = Math.floor(input.amountXof);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("Amount must be positive");
    const student = await this.prisma.student.findUnique({ where: { id: input.studentId } });
    if (!student) throw new NotFoundException("Student not found");
    const costCenterCode = input.costCenterCode ?? COST_CENTER_TUITION;
    if (!(await this.prisma.costCenter.findUnique({ where: { code: costCenterCode } }))) {
      throw new BadRequestException("Unknown cost center");
    }
    const term = await this.prisma.term.findUnique({ where: { name: TUITION_TERM_NAME } });
    if (!term) throw new BadRequestException(`Term "${TUITION_TERM_NAME}" is not set up`);
    const kind = input.kind === "scholarship" ? "Scholarship" : "Discount";
    const credit = await this.prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: -amount,
        amountPaid: 0,
        status: "paid", // excludes it from payable selection; balance math still nets it
        description: `${kind} — ${label}`,
        costCenterCode,
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Invoice", entityId: credit.id, action: "discount-applied", actorId, data: { label, amount, kind } },
    });
    return { ok: true, creditId: credit.id };
  }

  /**
   * Remove a charge for any student.
   * - Fully unpaid → hard-delete the invoice + plan (nothing was collected).
   * - Paid/partially paid → REVERSAL, no refund: delete the charge and post a negative
   *   "credit-memo" invoice for the collected amount so it offsets the student's remaining/
   *   future charges (a credit balance if it exceeds what's owed). The real Payment rows are
   *   preserved (re-pointed onto the credit memo) for audit. Reuses the existing balance math.
   */
  async removeCharge(actorId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { plan: { include: { installments: true } }, payments: true },
    });
    if (!invoice) throw new NotFoundException("Charge not found");
    if (invoice.totalAmount < 0) throw new BadRequestException("Account credits cannot be removed");

    const installmentIds = invoice.plan?.installments.map((i) => i.id) ?? [];
    const paymentIds = invoice.payments.map((p) => p.id);
    const settled =
      invoice.amountPaid > 0 || invoice.payments.some((p) => p.status === "success" || p.status === "refunded");

    if (!settled) {
      await this.prisma.$transaction(async (tx) => {
        if (installmentIds.length || paymentIds.length) {
          await tx.paymentAllocation.deleteMany({
            where: { OR: [{ installmentId: { in: installmentIds } }, { paymentId: { in: paymentIds } }] },
          });
        }
        await tx.payment.deleteMany({ where: { invoiceId } });
        if (invoice.plan) {
          await tx.installment.deleteMany({ where: { planId: invoice.plan.id } });
          await tx.paymentPlan.delete({ where: { id: invoice.plan.id } });
        }
        await tx.invoice.delete({ where: { id: invoiceId } });
        await tx.auditLog.create({
          data: {
            entity: "Invoice",
            entityId: invoiceId,
            action: "charge-removed",
            actorId,
            data: { description: invoice.description, amount: invoice.totalAmount },
          },
        });
      });
      return { ok: true, credited: 0 };
    }

    // Paid/partial: reverse the collected amount into an account credit (no cash refund).
    const creditAmount = invoice.amountPaid;
    await this.prisma.$transaction(async (tx) => {
      const credit = await tx.invoice.create({
        data: {
          studentId: invoice.studentId,
          termId: invoice.termId,
          totalAmount: -creditAmount,
          amountPaid: 0,
          status: "paid", // excludes it from checkoutBill's open/partial selection
          description: `Credit — reversal of ${invoice.description ?? `${TUITION_TERM_NAME} tuition`}`,
          costCenterCode: invoice.costCenterCode,
        },
      });
      if (installmentIds.length || paymentIds.length) {
        await tx.paymentAllocation.deleteMany({
          where: { OR: [{ installmentId: { in: installmentIds } }, { paymentId: { in: paymentIds } }] },
        });
      }
      // Preserve the real payment records by moving them onto the credit memo (FK requires an invoice).
      if (paymentIds.length) {
        await tx.payment.updateMany({ where: { invoiceId }, data: { invoiceId: credit.id } });
      }
      if (invoice.plan) {
        await tx.installment.deleteMany({ where: { planId: invoice.plan.id } });
        await tx.paymentPlan.delete({ where: { id: invoice.plan.id } });
      }
      await tx.invoice.delete({ where: { id: invoiceId } });
      await tx.auditLog.create({
        data: {
          entity: "Invoice",
          entityId: invoiceId,
          action: "charge-removed-credit",
          actorId,
          data: { description: invoice.description, chargeAmount: invoice.totalAmount, creditAmount, creditInvoiceId: credit.id },
        },
      });
    });
    return { ok: true, credited: creditAmount };
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
    // Standalone payment links (no invoice) carry their own cost center; invoice-linked ones
    // are already counted through their Payment above.
    const linkAgg = await this.prisma.paymentLink.groupBy({
      by: ["costCenterCode"],
      where: { status: "paid", invoiceId: null },
      _sum: { amountXof: true },
    });
    for (const l of linkAgg) {
      revenueByCc.set(l.costCenterCode, (revenueByCc.get(l.costCenterCode) ?? 0) + (l._sum.amountXof ?? 0));
    }
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


  // --- Payment links (bursar-generated, any amount/purpose; PLINK- refs on the IPN rail) ---

  async createPaymentLink(
    actorId: string,
    input: {
      payeeName: string;
      payeeMeta?: string;
      studentId?: string;
      invoiceId?: string;
      amountXof: number;
      purpose: string;
      costCenterCode?: string;
      dueDate?: string;
      expiresAt?: string;
    },
  ) {
    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (input.studentId && invoice.studentId !== input.studentId) {
        throw new BadRequestException("Invoice does not belong to that student");
      }
      const balance = invoice.totalAmount - invoice.amountPaid;
      if (input.amountXof > balance) {
        throw new BadRequestException(`Amount exceeds the invoice balance (${balance} XOF)`);
      }
    }
    if (input.costCenterCode) {
      const cc = await this.prisma.costCenter.findUnique({ where: { code: input.costCenterCode } });
      if (!cc) throw new BadRequestException("Unknown cost center");
    }

    const link = await this.prisma.paymentLink.create({
      data: {
        token: randomBytes(18).toString("hex"),
        amountXof: input.amountXof,
        purpose: input.purpose,
        payeeName: input.payeeName,
        payeeMeta: input.payeeMeta ?? null,
        studentId: input.studentId ?? null,
        invoiceId: input.invoiceId ?? null,
        costCenterCode: input.costCenterCode ?? "9100",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "PaymentLink", entityId: link.id, action: "link-created", actorId, data: { amountXof: input.amountXof, purpose: input.purpose, invoiceId: input.invoiceId ?? null } },
    });
    return { ...link, url: `${loadEnv().PORTAL_ORIGIN}/pay/${link.token}` };
  }

  async listPaymentLinks() {
    const links = await this.prisma.paymentLink.findMany({ orderBy: { createdAt: "desc" } });
    const now = Date.now();
    return links.map((l) => ({
      ...l,
      url: `${loadEnv().PORTAL_ORIGIN}/pay/${l.token}`,
      expired: l.status === "active" && l.expiresAt !== null && l.expiresAt.getTime() < now,
    }));
  }

  async cancelPaymentLink(id: string, actorId: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.status === "paid") throw new BadRequestException("Already paid");
    const updated = await this.prisma.paymentLink.update({ where: { id }, data: { status: "cancelled" } });
    await this.prisma.auditLog.create({
      data: { entity: "PaymentLink", entityId: id, action: "link-cancelled", actorId },
    });
    return updated;
  }

  /** Bank-transfer / offline settlement: bursar verified the money arrived out of band. */
  async markPaymentLinkPaid(id: string, actorId: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.status !== "active") throw new BadRequestException(`Link is ${link.status}`);

    if (link.invoiceId) {
      const payment = await this.prisma.payment.upsert({
        where: { providerRef: `PLINK-${link.id}` },
        update: {},
        create: {
          invoiceId: link.invoiceId,
          studentId: link.studentId ?? (await this.prisma.invoice.findUniqueOrThrow({ where: { id: link.invoiceId } })).studentId,
          amount: link.amountXof,
          method: "card", // schema enum has no bank type; the link record carries method="manual"
          status: "pending",
          providerRef: `PLINK-${link.id}`,
        },
      });
      await this.settlePayment(payment.id, { via: "manual", actorId });
    }

    const updated = await this.prisma.paymentLink.update({
      where: { id },
      data: { status: "paid", method: "manual", paidAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { entity: "PaymentLink", entityId: id, action: "link-paid-manual", actorId },
    });
    return updated;
  }

  /** Public: what the standalone pay page shows. Cancelled links 404; expiry is computed. */
  async getPublicLink(token: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link || link.status === "cancelled") throw new NotFoundException("Link not found");
    const expired = link.status === "active" && link.expiresAt !== null && link.expiresAt.getTime() < Date.now();
    return {
      ref: `PLINK-${link.id.slice(0, 8).toUpperCase()}`,
      amountXof: link.amountXof,
      purpose: link.purpose,
      payeeName: link.payeeName,
      payeeMeta: link.payeeMeta,
      dueDate: link.dueDate,
      expiresAt: link.expiresAt,
      status: expired ? "expired" : link.status,
      method: link.method,
      paidAt: link.paidAt,
    };
  }

  /** Public: start a gateway checkout for an active link. */
  async checkoutLink(token: string, method: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link || link.status === "cancelled") throw new NotFoundException("Link not found");
    if (link.status === "paid") throw new BadRequestException("Already paid");
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This payment link has expired");
    }

    const ref = `PLINK-${link.id}`;
    if (link.invoiceId) {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: link.invoiceId } });
      await this.prisma.payment.upsert({
        where: { providerRef: ref },
        update: {},
        create: {
          invoiceId: invoice.id,
          studentId: link.studentId ?? invoice.studentId,
          amount: link.amountXof,
          method: (["wave", "orange_money", "card"].includes(method) ? method : "card") as never,
          status: "pending",
          providerRef: ref,
        },
      });
    }

    const payUrl = `${loadEnv().PORTAL_ORIGIN}/pay/${link.token}`;
    const { redirectUrl } = await this.provider.requestPayment({
      ref,
      amount: link.amountXof,
      itemName: link.purpose,
      customField: { paymentLinkId: link.id },
      // Anonymous payers must land back on the pay page, never inside the portal.
      successUrl: `${payUrl}?back=1`,
      cancelUrl: payUrl,
    });
    return { redirectUrl };
  }

  private async settlePaymentLinkIpn(linkId: string, success: boolean, payload: object, method: string | null) {
    const link = await this.prisma.paymentLink.findUnique({ where: { id: linkId } });
    if (!link) return;

    const payment = await this.prisma.payment.findUnique({ where: { providerRef: `PLINK-${linkId}` } });
    if (!success) {
      if (payment?.status === "pending") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "cancelled", ipnPayload: payload },
        });
      }
      await this.prisma.auditLog.create({
        data: { entity: "PaymentLink", entityId: linkId, action: "link-payment-failed", data: payload },
      });
      return;
    }

    if (payment) await this.settlePayment(payment.id, { via: "ipn", payload, method });
    if (link.status !== "paid") {
      await this.prisma.paymentLink.update({
        where: { id: linkId },
        data: { status: "paid", method: method ?? "unknown", paidAt: new Date() },
      });
      await this.prisma.auditLog.create({
        data: { entity: "PaymentLink", entityId: linkId, action: "link-paid", data: payload },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public bill portal (payment.daust.net): pay a real student account by ID + DOB.
  // No login; the DOB is a weak second factor, so responses never confirm whether
  // the ID exists (no enumeration oracle) and the controller rate-limits by IP.
  // Money still rides the exact same rail as the platform: a pending Payment now,
  // settled by the verified IPN via settlePayment (allocation + audit + receipt).
  // ---------------------------------------------------------------------------

  /** Public: outstanding balance + charges for a student matched by ID + date of birth. */
  async lookupBill(studentNo: string, dob: string) {
    const student = await this.findStudentForBill(studentNo, dob);
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "asc" },
      include: { term: true, plan: { include: { installments: { orderBy: { sequence: "asc" } } } } },
    });
    const balanceXof = invoices.reduce((s, i) => s + (i.totalAmount - i.amountPaid), 0);
    // Account credits are negative-total invoices; surface them as a positive figure for display.
    const creditXof = invoices.filter((i) => i.totalAmount < 0).reduce((s, i) => s - i.totalAmount, 0);
    const charges = invoices.flatMap((inv) =>
      (inv.plan?.installments ?? []).map((i) => ({
        // Ad-hoc charges carry a description; tuition installments fall back to term + sequence.
        label: inv.description ?? `${inv.term.name} · installment ${i.sequence}`,
        dueDate: i.dueDate,
        amountXof: i.amountDue,
        paidXof: i.amountPaid,
        status: i.status,
      })),
    );
    return {
      studentName: `${student.person.firstName} ${student.person.lastName}`.replace(/\s+/g, " ").trim(),
      studentNo: student.studentNo,
      program: student.program?.name ?? null,
      term: invoices[0]?.term.name ?? null,
      balanceXof,
      creditXof,
      dueDate: charges.find((c) => c.status !== "paid")?.dueDate ?? null,
      charges,
    };
  }

  /** Public: start a PayTech checkout of `amountXof` toward the student's oldest open invoice. */
  async checkoutBill(studentNo: string, dob: string, amountXof: number, method: string) {
    const student = await this.findStudentForBill(studentNo, dob);
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "asc" },
    });
    // Net of any account credits (negative-total credit-memo invoices).
    const netBalance = invoices.reduce((s, i) => s + (i.totalAmount - i.amountPaid), 0);
    if (netBalance <= 0) throw new BadRequestException("This account has no outstanding balance");
    const invoice = invoices.find(
      (i) => (i.status === "open" || i.status === "partial") && i.totalAmount - i.amountPaid > 0,
    );
    if (!invoice) throw new BadRequestException("This account has no outstanding balance");
    const invoiceBalance = invoice.totalAmount - invoice.amountPaid;
    // Clamp to the invoice's own balance AND the net account balance (so a credit can't be overpaid).
    const amount = Math.min(Math.max(1, Math.floor(amountXof)), invoiceBalance, netBalance);

    const ref = `BILL-${randomUUID()}`;
    await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: student.id,
        amount,
        method: (["wave", "orange_money", "card"].includes(method) ? method : "card") as never,
        status: "pending",
        providerRef: ref,
      },
    });

    const payUrl = `${loadEnv().PAYMENT_ORIGIN}/pay-bill`;
    const { redirectUrl } = await this.provider.requestPayment({
      ref,
      amount,
      itemName: `DAUST tuition · ${student.studentNo}`,
      customField: { studentNo: student.studentNo },
      successUrl: `${payUrl}?paid=1`,
      cancelUrl: payUrl,
    });
    return { redirectUrl };
  }

  /** IPN settler for a BILL- payment: the ref is the Payment.providerRef verbatim. */
  private async settleBillIpn(ref: string, success: boolean, payload: object, method: string | null) {
    const payment = await this.prisma.payment.findUnique({ where: { providerRef: ref } });
    if (!payment) return;
    if (!success) {
      if (payment.status === "pending") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "cancelled", ipnPayload: payload },
        });
        await this.audit(payment.id, "cancelled", payload);
      }
      return;
    }
    await this.settlePayment(payment.id, { via: "ipn", payload, method });
  }

  // Hard bound on wrong-DOB guesses per ID across ALL sources — the real defense
  // against enumerating a student's balance by brute-forcing their date of birth
  // (the IP-based guard is spoofable on a directly-reachable origin). In-memory is
  // fine for the single prod api task; move to Redis when scaled.
  private readonly failedBillLookups = new Map<string, number[]>();
  private static readonly BILL_FAIL_WINDOW_MS = 60 * 60_000;
  private static readonly BILL_MAX_FAILS = 10;

  /** Match a student by studentNo + DOB (date-only, UTC). Generic 404 on any mismatch. */
  private async findStudentForBill(studentNo: string, dob: string) {
    const key = studentNo.trim().toLowerCase();
    const now = Date.now();
    const recentFails = (this.failedBillLookups.get(key) ?? []).filter(
      (t) => now - t < FinanceService.BILL_FAIL_WINDOW_MS,
    );
    if (recentFails.length >= FinanceService.BILL_MAX_FAILS) {
      throw new HttpException(
        "Too many failed attempts for this ID. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const student = await this.prisma.student.findUnique({
      where: { studentNo: studentNo.trim() },
      include: { person: true, program: true },
    });
    const ok =
      !!student?.dateOfBirth && student.dateOfBirth.toISOString().slice(0, 10) === dob.slice(0, 10);
    if (!ok) {
      recentFails.push(now);
      this.failedBillLookups.set(key, recentFails);
      throw new NotFoundException("No account matches that ID and date of birth");
    }
    this.failedBillLookups.delete(key); // reset the counter on a successful match
    return student;
  }

  private async audit(entityId: string, action: string, data: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: { entity: "Payment", entityId, action, data: data as object },
    });
  }
}

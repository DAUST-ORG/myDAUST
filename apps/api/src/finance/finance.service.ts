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
import { Prisma } from "@mydaust/db";
import {
  COST_CENTER_TUITION,
  FEE_STRUCTURE,
  WirePaymentConfig as WirePaymentConfigSchema,
  splitEvenXof,
  toDakarDateKey,
  type CreatePaymentPlanInput,
  type AccountBalanceSummary,
  type InitiatePaymentInput,
  type WireApprovalInput,
  type WirePaymentConfig,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.js";
import {
  REQUEST_TO_PAY_PROVIDERS,
  type RequestToPayRegistry,
  type RequestToPayStatus,
} from "./request-to-pay.provider.js";
import { loadEnv } from "../config/env.js";
import { WireProofStorage } from "./wire-proof.storage.js";
import {
  decorateInstallment,
  deriveApiAccountPosition,
  derivedInstallmentsById,
  invoicePositionSummary,
  legacyInstallmentStatus,
  payableLinesOldestFirst,
  projectedInstallmentStatus,
  selectOldestPayableTarget,
} from "./account-position.js";
import { allocateProportionallyXof } from "./component-allocation.js";
import {
  assignStandardPackageInTransaction,
  type StandardPackageAssignment,
} from "./standard-package.js";
import {
  deriveAccountSpecialStatus,
  invoicePlanType,
} from "./account-customization.js";

// Shared fee constants are bootstrap fallbacks only. Standard billing always reads
// the current administrator-approved FeeSchedule revision from the database.
const TUITION_TERM_NAME = "Fall 2026";
const WIRE_CONFIG_KEY = "wire_payment_config";
const DEFAULT_WIRE_CONFIG: WirePaymentConfig = {
  enabled: false,
  bankName: "",
  beneficiary: "",
  accountNumber: "",
  iban: "",
  swift: "",
  branch: "",
  instructions: "",
  notificationRecipients: ["finance@daust.edu.sn"],
};

/** Payment-plan dates are Dakar calendar dates, never arbitrary timestamps. */
export function parseFinanceDateOnly(value: string, label = "Due date"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${label} is not a valid calendar date`);
  }
  return parsed;
}

/** Roll up already-derived account positions without netting one student's credit against another. */
function aggregateAccountReport(
  summaries: readonly AccountBalanceSummary[],
): AccountBalanceSummary {
  const amount = (
    key:
      | "balanceXof"
      | "outstandingXof"
      | "creditXof"
      | "overdueXof"
      | "dueTodayXof"
      | "notYetDueXof"
      | "futureScheduledXof"
      | "unscheduledXof",
  ) => summaries.reduce((sum, summary) => sum + summary[key], 0);
  const firstDate = (key: "nextDueDate" | "oldestOverdueDate") =>
    summaries
      .map((summary) => summary[key])
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null;
  const outstandingXof = amount("outstandingXof");
  const creditXof = amount("creditXof");
  const overdueXof = amount("overdueXof");
  const unscheduledXof = amount("unscheduledXof");
  return {
    balanceXof: amount("balanceXof"),
    outstandingXof,
    creditXof,
    overdueXof,
    dueTodayXof: amount("dueTodayXof"),
    notYetDueXof: amount("notYetDueXof"),
    futureScheduledXof: amount("futureScheduledXof"),
    unscheduledXof,
    nextDueDate: firstDate("nextDueDate"),
    oldestOverdueDate: firstDate("oldestOverdueDate"),
    daysPastDue: summaries.reduce(
      (oldest, summary) => Math.max(oldest, summary.daysPastDue),
      0,
    ),
    standing:
      summaries.length === 0 ||
      summaries.every((summary) => summary.standing === "no_billing")
        ? "no_billing"
        : overdueXof > 0
          ? "overdue"
          : unscheduledXof > 0
            ? "unscheduled"
            : outstandingXof > 0
              ? "on_time"
              : creditXof > 0
                ? "credit"
                : "cleared",
  };
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly wireProofs: WireProofStorage,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(REQUEST_TO_PAY_PROVIDERS)
    private readonly rtpRails: RequestToPayRegistry,
  ) {}

  /** Retry serializable money mutations when PostgreSQL detects a concurrent write. */
  private async serializableTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable transaction retry limit exhausted");
  }

  private async loadPayableAccount(
    studentId: string,
    client: Pick<Prisma.TransactionClient, "invoice"> = this.prisma,
  ) {
    const invoices = await client.invoice.findMany({
      where: { studentId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        term: true,
        plan: {
          include: {
            installments: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
          },
        },
      },
    });
    const position = deriveApiAccountPosition(invoices);
    const payableTarget = selectOldestPayableTarget(invoices, position);
    return {
      invoices,
      position,
      lines: payableLinesOldestFirst(invoices, position),
      target: payableTarget,
    };
  }

  private requirePayableTarget(
    account: Awaited<ReturnType<FinanceService["loadPayableAccount"]>>,
    amountXof: number,
    requestedInvoiceId?: string,
  ) {
    const amount = Math.floor(amountXof);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        "Amount must be a positive whole number of XOF",
      );
    }
    const target = account.target;
    if (!target) {
      throw new BadRequestException("This account has no outstanding balance");
    }
    if (requestedInvoiceId && requestedInvoiceId !== target.invoiceId) {
      throw new BadRequestException(
        "Payments must be applied to the account's oldest outstanding charge first",
      );
    }
    if (amount > target.invoicePayableXof) {
      throw new BadRequestException(
        `Amount exceeds the current payable balance (${target.invoicePayableXof} XOF)`,
      );
    }
    const invoice = account.invoices.find(
      (candidate) => candidate.id === target.invoiceId,
    )!;
    return { amount, target, invoice };
  }

  async getWirePaymentConfig(): Promise<WirePaymentConfig> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: WIRE_CONFIG_KEY },
    });
    const parsed = WirePaymentConfigSchema.safeParse(
      row?.valueJson ?? DEFAULT_WIRE_CONFIG,
    );
    return parsed.success ? parsed.data : DEFAULT_WIRE_CONFIG;
  }

  async getPublicWirePaymentConfig() {
    const { notificationRecipients: _notificationRecipients, ...publicConfig } =
      await this.getWirePaymentConfig();
    return publicConfig;
  }

  async updateWirePaymentConfig(input: WirePaymentConfig, actorId: string) {
    const config = WirePaymentConfigSchema.parse(input);
    if (config.enabled) {
      if (
        !config.bankName ||
        !config.beneficiary ||
        (!config.accountNumber && !config.iban)
      ) {
        throw new BadRequestException(
          "Enabled wire payments require a bank, beneficiary, and account number or IBAN",
        );
      }
      if (config.notificationRecipients.length === 0) {
        throw new BadRequestException(
          "Add at least one Finance notification recipient",
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: WIRE_CONFIG_KEY },
        create: { key: WIRE_CONFIG_KEY, valueJson: config as never },
        update: { valueJson: config as never },
      }),
      this.prisma.auditLog.create({
        data: {
          entity: "AppSetting",
          entityId: WIRE_CONFIG_KEY,
          action: "wire-config-updated",
          actorId,
          data: {
            enabled: config.enabled,
            bankName: config.bankName,
            recipients: config.notificationRecipients.length,
          },
        },
      }),
    ]);
    return config;
  }

  private async requireWireConfig() {
    const config = await this.getWirePaymentConfig();
    if (!config.enabled)
      throw new BadRequestException(
        "Wire payments are not currently available",
      );
    return config;
  }

  private wireSummary(w: {
    id: string;
    status: string;
    submittedAmountXof: number;
    confirmedAmountXof: number | null;
    contactEmail: string;
    createdAt: Date;
    reviewedAt: Date | null;
    rejectionReason: string | null;
  }) {
    return {
      id: w.id,
      status: w.status,
      submittedAmountXof: w.submittedAmountXof,
      confirmedAmountXof: w.confirmedAmountXof,
      contactEmail: w.contactEmail,
      submittedAt: w.createdAt,
      reviewedAt: w.reviewedAt,
      rejectionReason: w.rejectionReason,
    };
  }

  private publicWireSummary(w: Parameters<FinanceService["wireSummary"]>[0]) {
    const { contactEmail: _contactEmail, ...summary } = this.wireSummary(w);
    return summary;
  }

  private async createInvoiceWire(input: {
    invoiceId: string;
    studentId: string;
    amountXof: number;
    contactEmail: string;
    source: string;
    submittedById?: string;
    submittedByEmail?: string;
    paymentLinkId?: string;
    file: Express.Multer.File;
  }) {
    const config = await this.requireWireConfig();
    const { notificationRecipients, ...bankSnapshot } = config;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { student: { include: { person: true } } },
    });
    if (!invoice || invoice.studentId !== input.studentId)
      throw new NotFoundException("Invoice not found");
    const account = await this.loadPayableAccount(input.studentId);
    const { amount } = this.requirePayableTarget(
      account,
      input.amountXof,
      invoice.id,
    );
    const active = await this.prisma.wireTransferSubmission.findFirst({
      where: { invoiceId: invoice.id, status: "submitted" },
    });
    if (active)
      throw new BadRequestException(
        "A wire transfer is already under review for this charge",
      );

    const stored = await this.wireProofs.put(input.file);
    const ref = `WIRE-${randomUUID()}`;
    const wire = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          studentId: input.studentId,
          amount,
          method: "wire",
          status: "pending",
          provider: "wire",
          providerRef: ref,
          source: input.source,
          initiatedById: input.submittedById,
          initiatedByEmail: input.submittedByEmail ?? input.contactEmail,
        },
      });
      const created = await tx.wireTransferSubmission.create({
        data: {
          source: input.source,
          studentId: input.studentId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          paymentLinkId: input.paymentLinkId,
          submittedAmountXof: amount,
          contactEmail: input.contactEmail,
          submittedById: input.submittedById,
          submittedByEmail: input.submittedByEmail,
          proofObjectKey: stored.key,
          proofFileName: input.file.originalname,
          proofMimeType: stored.mime,
          proofSize: input.file.size,
          bankSnapshot: bankSnapshot as never,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "WireTransferSubmission",
          entityId: created.id,
          action: "submitted",
          actorId: input.submittedById,
          data: {
            source: input.source,
            amountXof: amount,
            invoiceId: invoice.id,
            paymentLinkId: input.paymentLinkId ?? null,
          },
        },
      });
      return created;
    });
    await this.emailWireSubmitted(
      wire.id,
      notificationRecipients,
      invoice.student.person.email,
    );
    return this.wireSummary(wire);
  }

  async submitStudentWire(
    studentId: string,
    actor: { personId: string; email: string },
    invoiceId: string,
    amountXof: number,
    file: Express.Multer.File,
    context: { source?: string } = {},
  ) {
    return this.createInvoiceWire({
      invoiceId,
      studentId,
      amountXof,
      contactEmail: actor.email,
      source: context.source ?? "student_portal",
      submittedById: actor.personId,
      submittedByEmail: actor.email,
      file,
    });
  }

  /** Authenticated guardian paying for a linked child after GuardianStudent authorization. */
  async submitGuardianWire(
    studentId: string,
    actor: { personId: string; email: string },
    invoiceId: string,
    amountXof: number,
    file: Express.Multer.File,
  ) {
    return this.createInvoiceWire({
      invoiceId,
      studentId,
      amountXof,
      contactEmail: actor.email,
      source: "parent_portal",
      submittedById: actor.personId,
      submittedByEmail: actor.email,
      file,
    });
  }

  async submitPublicBillWire(
    studentNo: string,
    dob: string,
    amountXof: number,
    contactEmail: string,
    file: Express.Multer.File,
  ) {
    const student = await this.findStudentForBill(studentNo, dob);
    const account = await this.loadPayableAccount(student.id);
    const { amount, invoice } = this.requirePayableTarget(account, amountXof);
    return this.createInvoiceWire({
      invoiceId: invoice.id,
      studentId: student.id,
      amountXof: amount,
      contactEmail,
      source: "public_bill",
      file,
    });
  }

  async submitPaymentLinkWire(
    token: string,
    contactEmail: string,
    file: Express.Multer.File,
  ) {
    const config = await this.requireWireConfig();
    const { notificationRecipients, ...bankSnapshot } = config;
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link || link.status === "cancelled")
      throw new NotFoundException("Link not found");
    if (link.status === "paid") throw new BadRequestException("Already paid");
    if (link.expiresAt && link.expiresAt.getTime() < Date.now())
      throw new BadRequestException("This payment link has expired");
    const active = await this.prisma.wireTransferSubmission.findFirst({
      where: { paymentLinkId: link.id, status: "submitted" },
    });
    if (active)
      throw new BadRequestException(
        "A wire transfer is already under review for this payment link",
      );
    if (link.invoiceId) {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: link.invoiceId },
      });
      return this.createInvoiceWire({
        invoiceId: invoice.id,
        studentId: link.studentId ?? invoice.studentId,
        amountXof: link.amountXof,
        contactEmail,
        source: "payment_link",
        paymentLinkId: link.id,
        file,
      });
    }

    const stored = await this.wireProofs.put(file);
    const wire = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wireTransferSubmission.create({
        data: {
          source: "payment_link",
          paymentLinkId: link.id,
          submittedAmountXof: link.amountXof,
          contactEmail,
          proofObjectKey: stored.key,
          proofFileName: file.originalname,
          proofMimeType: stored.mime,
          proofSize: file.size,
          bankSnapshot: bankSnapshot as never,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "WireTransferSubmission",
          entityId: created.id,
          action: "submitted",
          data: {
            source: "payment_link",
            amountXof: link.amountXof,
            paymentLinkId: link.id,
          },
        },
      });
      return created;
    });
    await this.emailWireSubmitted(wire.id, notificationRecipients);
    return this.wireSummary(wire);
  }

  /** A student's invoices with schedule + payments and derived balances. Ownership-scoped. */
  async getStudentBilling(studentId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: {
        term: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
        payments: { orderBy: { createdAt: "desc" } },
        wireTransfers: { orderBy: { createdAt: "desc" } },
      },
    });
    const position = deriveApiAccountPosition(invoices);
    const derived = derivedInstallmentsById(position);
    return invoices.map((inv) => {
      const summary = invoicePositionSummary(position, inv.id);
      return {
        id: inv.id,
        createdAt: inv.createdAt,
        term: inv.term.name,
        packageType: inv.packageType,
        academicYearLabel: inv.academicYearLabel,
        feeScheduleRevision: inv.feeScheduleRevision,
        total: inv.totalAmount,
        paid: inv.amountPaid,
        balance: inv.status === "void" ? 0 : inv.totalAmount - inv.amountPaid,
        status:
          inv.status === "void"
            ? "void"
            : inv.totalAmount - inv.amountPaid <= 0
              ? "paid"
              : inv.amountPaid > 0
                ? "partial"
                : "open",
        summary,
        effectiveOutstandingXof: summary.outstandingXof,
        effectiveStatus: summary.standing,
        installments: (inv.plan?.installments ?? []).map((installment) =>
          decorateInstallment(installment, derived),
        ),
        payments: inv.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          method: p.method,
          status: p.status,
          providerRef: p.providerRef,
          source: p.source,
          initiatedByEmail: p.initiatedByEmail,
          settledAt: p.settledAt,
          refundedAt: p.refundedAt,
          createdAt: p.createdAt,
        })),
        wireTransfers: inv.wireTransfers.map((w) => this.wireSummary(w)),
      };
    });
  }

  /** Additive account summary for the student portal; keeps `/my/billing` array-compatible. */
  async getStudentBillingSummary(studentId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      include: {
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    return deriveApiAccountPosition(invoices).summary;
  }

  /** Admin (bursar/finance) configures an installment schedule for an invoice. */
  async createPaymentPlan(input: CreatePaymentPlanInput, actorId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { plan: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.plan)
      throw new BadRequestException("Invoice already has a payment plan");

    const now = new Date();
    const lines = input.installments.map((l) => {
      const dueDate = parseFinanceDateOnly(l.dueDate);
      const amountDue =
        l.amount ?? Math.round((invoice.totalAmount * (l.percent ?? 0)) / 100);
      return {
        sequence: l.sequence,
        dueDate,
        amountDue,
        status: projectedInstallmentStatus(
          { dueDate, amountDue, amountPaid: 0 },
          now,
        ),
      };
    });
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

  /** The current administrator-approved, immutable fee-schedule revision. */
  async getFeePlan(academicYearLabel?: string) {
    const year =
      academicYearLabel ??
      (
        await this.prisma.academicYear.findFirst({
          where: { status: "active" },
        })
      )?.label;
    if (!year)
      return {
        academicYearLabel: null,
        scheduleId: null,
        revision: null,
        status: null,
        approvedAt: null,
        rows: [],
        totals: { full: 0, tuition: 0, housing: 0, cafeteria: 0 },
      };

    const schedule = await this.prisma.feeSchedule.findFirst({
      where: { academicYearLabel: year, status: "approved" },
      orderBy: { revision: "desc" },
      include: { rows: { orderBy: { sequence: "asc" } } },
    });
    const rows = schedule?.rows ?? [];
    return {
      academicYearLabel: year,
      scheduleId: schedule?.id ?? null,
      revision: schedule?.revision ?? null,
      status: schedule?.status ?? null,
      approvedAt: schedule?.approvedAt ?? null,
      rows,
      totals: {
        full: rows.reduce((s, r) => s + r.amountFullXof, 0),
        tuition: rows.reduce((s, r) => s + r.amountTuitionXof, 0),
        housing: rows.reduce((s, r) => s + r.amountHousingXof, 0),
        cafeteria: rows.reduce((s, r) => s + r.amountCafeteriaXof, 0),
      },
    };
  }

  async updateFeePlanRow(
    actorId: string,
    id: string,
    input: {
      label?: string;
      dueOn?: string;
      amountFullXof?: number;
      amountTuitionXof?: number;
    },
  ) {
    const row = await this.prisma.feePlanInstallment.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Fee plan installment not found");

    const updated = await this.prisma.feePlanInstallment.update({
      where: { id },
      data: {
        label: input.label ?? row.label,
        dueOn: input.dueOn
          ? parseFinanceDateOnly(input.dueOn, "Fee-plan due date")
          : row.dueOn,
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
          after: {
            full: updated.amountFullXof,
            tuition: updated.amountTuitionXof,
          },
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
    rows: {
      id: string;
      dueDate: string;
      amountDue: number;
      label?: string | null;
    }[],
  ) {
    if (rows.length === 0)
      throw new BadRequestException("At least one installment is required");
    for (const r of rows) {
      if (!Number.isInteger(r.amountDue) || r.amountDue < 0) {
        throw new BadRequestException(
          "Installment amount must be a non-negative integer",
        );
      }
      parseFinanceDateOnly(r.dueDate);
    }

    return this.serializableTransaction(async (tx) => {
      // Paid totals and plan membership must be read inside the same transaction that
      // writes the schedule. A concurrent settlement either wins first and is observed
      // here, or forces this transaction to retry before a stale plan can be committed.
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { plan: { include: { installments: true } } },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.totalAmount < 0)
        throw new BadRequestException("Cannot edit a credit memo");
      if (!invoice.plan)
        throw new BadRequestException("Invoice has no payment plan to edit");

      const byId = new Map(invoice.plan.installments.map((i) => [i.id, i]));
      for (const row of rows) {
        const installment = byId.get(row.id);
        if (!installment) {
          throw new BadRequestException(
            `Installment ${row.id} does not belong to this plan`,
          );
        }
        if (row.amountDue < installment.amountPaid) {
          throw new BadRequestException(
            `Installment ${installment.sequence} already has ${installment.amountPaid} paid; cannot set below that`,
          );
        }
      }

      const now = new Date();
      for (const r of rows) {
        const inst = byId.get(r.id)!;
        const due = parseFinanceDateOnly(r.dueDate);
        const status = projectedInstallmentStatus(
          { dueDate: due, amountDue: r.amountDue, amountPaid: inst.amountPaid },
          now,
        );
        await tx.installment.update({
          where: { id: r.id },
          data: {
            amountDue: r.amountDue,
            dueDate: due,
            status,
            ...(r.label === undefined
              ? {}
              : { label: r.label?.trim() || null }),
          },
        });
      }

      const fresh = await tx.installment.findMany({
        where: { planId: invoice.plan!.id },
      });
      const newTotal = fresh.reduce((s, i) => s + i.amountDue, 0);
      const invStatus: "paid" | "partial" | "open" =
        newTotal > 0 && invoice.amountPaid >= newTotal
          ? "paid"
          : invoice.amountPaid > 0
            ? "partial"
            : "open";
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: newTotal,
          status: invStatus,
          revision: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          entity: "PaymentPlan",
          entityId: invoice.plan!.id,
          action: "plan-updated",
          actorId,
          data: {
            invoiceId: invoice.id,
            oldTotal: invoice.totalAmount,
            newTotal,
          },
        },
      });
      return { ok: true };
    });
  }

  async replacePaymentPlan(
    actorId: string,
    invoiceId: string,
    rows: {
      id?: string;
      sequence: number;
      dueDate: string;
      amountDue: number;
      label?: string | null;
    }[],
  ) {
    if (rows.length === 0)
      throw new BadRequestException("At least one installment is required");
    if (new Set(rows.map((r) => r.sequence)).size !== rows.length) {
      throw new BadRequestException(
        "Installment sequence numbers must be unique",
      );
    }
    for (const row of rows) {
      if (
        !Number.isInteger(row.sequence) ||
        row.sequence < 1 ||
        !Number.isInteger(row.amountDue) ||
        row.amountDue < 0
      ) {
        throw new BadRequestException(
          "Installment sequence and amount must be non-negative integers",
        );
      }
      parseFinanceDateOnly(row.dueDate);
    }
    const newTotal = rows.reduce((sum, row) => sum + row.amountDue, 0);
    return this.serializableTransaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { plan: { include: { installments: true } } },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.totalAmount < 0)
        throw new BadRequestException("Cannot plan a credit memo");
      if (newTotal < invoice.amountPaid) {
        throw new BadRequestException(
          "Plan total cannot be below the amount already paid",
        );
      }
      const existing = new Map(
        (invoice.plan?.installments ?? []).map((row) => [row.id, row]),
      );
      const protectedIds = new Set(
        (invoice.plan?.installments ?? [])
          .filter((row) => row.amountPaid > 0)
          .map((row) => row.id),
      );
      for (const id of protectedIds) {
        const replacement = rows.find((row) => row.id === id);
        const current = existing.get(id)!;
        if (!replacement) {
          throw new BadRequestException(
            `Paid installment ${current.sequence} cannot be removed`,
          );
        }
        if (replacement.amountDue < current.amountPaid) {
          throw new BadRequestException(
            `Installment ${current.sequence} cannot be reduced below ${current.amountPaid} XOF already paid`,
          );
        }
      }
      for (const row of rows) {
        if (row.id && !existing.has(row.id)) {
          throw new BadRequestException(
            "An installment does not belong to this plan",
          );
        }
      }

      const plan =
        invoice.plan ??
        (await tx.paymentPlan.create({
          data: { invoiceId, createdById: actorId },
        }));
      const incomingIds = new Set(
        rows.flatMap((row) => (row.id ? [row.id] : [])),
      );
      await tx.installment.deleteMany({
        where: {
          planId: plan.id,
          id: { notIn: [...incomingIds] },
          amountPaid: 0,
        },
      });
      for (const current of existing.values()) {
        if (incomingIds.has(current.id)) {
          await tx.installment.update({
            where: { id: current.id },
            data: { sequence: -current.sequence },
          });
        }
      }
      const now = new Date();
      for (const row of rows) {
        const current = row.id ? existing.get(row.id) : undefined;
        const amountPaid = current?.amountPaid ?? 0;
        const dueDate = parseFinanceDateOnly(row.dueDate);
        const status = projectedInstallmentStatus(
          { dueDate, amountDue: row.amountDue, amountPaid },
          now,
        );
        if (current) {
          await tx.installment.update({
            where: { id: current.id },
            data: {
              sequence: row.sequence,
              dueDate,
              amountDue: row.amountDue,
              label: row.label?.trim() || null,
              status,
            },
          });
        } else {
          await tx.installment.create({
            data: {
              planId: plan.id,
              sequence: row.sequence,
              dueDate,
              amountDue: row.amountDue,
              label: row.label?.trim() || null,
              status,
            },
          });
        }
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          totalAmount: newTotal,
          revision: { increment: 1 },
          status:
            invoice.amountPaid >= newTotal
              ? "paid"
              : invoice.amountPaid > 0
                ? "partial"
                : "open",
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "PaymentPlan",
          entityId: plan.id,
          action: invoice.plan ? "plan-replaced" : "created",
          actorId,
          data: {
            invoiceId,
            oldTotal: invoice.totalAmount,
            newTotal,
            installments: rows.length,
          },
        },
      });
      return { ok: true };
    });
  }

  /** Student initiates a payment toward an invoice they own. Returns the gateway redirect. */
  async initiatePayment(
    studentId: string,
    input: InitiatePaymentInput,
    context: {
      source?: string;
      initiatedById?: string;
      initiatedByEmail?: string;
    } = {},
  ) {
    if (input.method === "wire") {
      throw new BadRequestException(
        "Wire transfers must include a proof of payment",
      );
    }
    const requested = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, studentId: true },
    });
    if (!requested) throw new NotFoundException("Invoice not found");
    if (requested.studentId !== studentId)
      throw new ForbiddenException("Not your invoice");
    const account = await this.loadPayableAccount(studentId);
    const { amount, invoice } = this.requirePayableTarget(
      account,
      input.amount,
      input.invoiceId,
    );
    if (
      await this.prisma.wireTransferSubmission.findFirst({
        where: { invoiceId: invoice.id, status: "submitted" },
      })
    ) {
      throw new BadRequestException(
        "A wire transfer is already under review for this charge",
      );
    }

    const ref = `MD-${randomUUID()}`;
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId,
        amount,
        method: input.method,
        status: "pending",
        providerRef: ref,
        source: context.source ?? "student_portal",
        initiatedById: context.initiatedById,
        initiatedByEmail: context.initiatedByEmail,
      },
    });

    const { redirectUrl } = await this.provider.requestPayment({
      ref,
      amount,
      itemName: `Tuition — ${invoice.term.name}`,
      customField: { invoiceId: invoice.id, studentId, paymentId: payment.id },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "Payment",
        entityId: payment.id,
        action: "initiated",
        actorId: context.initiatedById,
        data: {
          amount,
          method: input.method,
          source: context.source ?? "student_portal",
        },
      },
    });

    return { paymentId: payment.id, redirectUrl };
  }

  /**
   * Handle a PayTech IPN. The webhook — never the browser redirect — is the source of truth.
   * Verified, idempotent (dedupe by token + guarded state transition), transactional.
   * Returns whether the payload was authentic (controller maps to 200/403).
   */
  async handleIpn(
    payload: Record<string, unknown>,
  ): Promise<{ valid: boolean }> {
    const v = this.provider.verifyIpn(payload);
    if (!v.valid || !v.ref || !v.token) return { valid: v.valid };

    // Record each delivery once. A duplicate still runs the idempotent downstream
    // settler: a prior delivery may have inserted this row before settlement failed.
    try {
      await this.prisma.webhookEvent.create({
        data: { token: v.token, paymentRef: v.ref, payload: payload as object },
      });
    } catch (error) {
      const duplicate =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002";
      if (!duplicate) throw error;
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
      await this.settlePaymentLinkIpn(
        v.ref.slice(6),
        v.success,
        payload as object,
        v.method,
      );
      return { valid: true };
    }
    // Public bill portal (payment.daust.net): the ref IS the Payment.providerRef.
    if (v.ref.startsWith("BILL-")) {
      await this.settleBillIpn(v.ref, v.success, payload as object, v.method);
      return { valid: true };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: v.ref },
    });
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

    await this.settlePayment(payment.id, {
      via: "ipn",
      payload: payload as object,
      method: v.method,
    });
    return { valid: true };
  }

  /**
   * Apply a successful payment: allocate to installments oldest-due-first, roll up the invoice,
   * audit, and email the receipt. Idempotent (no-op when already success). Shared by the IPN
   * path and the bursar's manual confirm (for verified-but-IPN-lost payments).
   */
  private async settlePayment(
    paymentId: string,
    opts: {
      via: "ipn" | "manual" | "wire" | "pi_spi";
      payload?: object;
      method?: string | null;
      actorId?: string;
      confirmedAmount?: number;
      /** Set when a request-to-pay settled, so the rail row and link flip with the money. */
      piSpiReview?: { id: string; paymentLinkId?: string | null };
      wireReview?: {
        id: string;
        paymentLinkId?: string | null;
        bankReference?: string;
        confirmationNote?: string;
        reviewedByName: string;
        reviewedByEmail: string;
      };
    },
  ) {
    const runSettlement = () =>
      this.prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.findUnique({
            where: { id: paymentId },
          });
          if (!payment) throw new NotFoundException("Payment not found");
          if (payment.status === "success") return false;
          if (payment.status !== "pending") {
            throw new BadRequestException(`Payment is ${payment.status}`);
          }
          const amount = opts.confirmedAmount ?? payment.amount;
          if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new BadRequestException(
              "Settled amount must be a positive whole number of XOF",
            );
          }

          // Re-read the whole account inside the serializable transaction. Two different
          // payments may both have been valid when initiated; only one may consume a given
          // payable line, and the retrying transaction must see the winner's new balance.
          const account = await this.loadPayableAccount(payment.studentId, tx);
          const originalInvoice = account.invoices.find(
            (invoice) => invoice.id === payment.invoiceId,
          );
          if (!originalInvoice) {
            throw new BadRequestException(
              "Payment accounting target no longer exists",
            );
          }
          if (opts.via === "wire") {
            this.requirePayableTarget(account, amount, payment.invoiceId);
          }

          const claimed = await tx.payment.updateMany({
            where: { id: payment.id, status: "pending" },
            data: {
              status: "success",
              amount,
              settledAt: new Date(),
              ...(opts.payload ? { ipnPayload: opts.payload } : {}),
            },
          });
          if (claimed.count === 0) return false;

          const payableBeforeXof = account.position.summary.outstandingXof;
          const directlyPayableLines = [] as typeof account.lines;
          if (originalInvoice.status !== "void") {
            for (const line of account.lines) {
              // Never leapfrog another invoice (A-Aug / B-Sep / A-Dec). Once a
              // different invoice is next, the remainder becomes an account credit.
              if (line.invoiceId !== originalInvoice.id) break;
              directlyPayableLines.push(line);
            }
          }
          const directCapacityXof = directlyPayableLines.reduce(
            (sum, line) => sum + line.outstandingXof,
            0,
          );
          const directAppliedXof = Math.min(amount, directCapacityXof);
          const creditMemoXof = amount - directAppliedXof;

          if (
            directAppliedXof > 0 &&
            tx.invoiceComponent &&
            tx.paymentComponentAllocation
          ) {
            let components = await tx.invoiceComponent.findMany({
              where: { invoiceId: originalInvoice.id },
              include: { allocations: true },
              orderBy: { id: "asc" },
            });
            if (components.length === 0) {
              const kind =
                originalInvoice.costCenterCode === "9100"
                  ? "tuition"
                  : originalInvoice.costCenterCode === "3700"
                    ? "housing"
                    : originalInvoice.costCenterCode === "3600"
                      ? "cafeteria"
                      : "other";
              const created = await tx.invoiceComponent.create({
                data: {
                  invoiceId: originalInvoice.id,
                  kind,
                  costCenterCode: originalInvoice.costCenterCode,
                  amountXof: originalInvoice.totalAmount,
                },
                include: { allocations: true },
              });
              components = [created];
            }
            const split = allocateProportionallyXof(
              directAppliedXof,
              components.map((component) => ({
                id: component.id,
                availableXof:
                  component.amountXof -
                  component.allocations.reduce(
                    (sum, allocation) =>
                      sum + allocation.amountXof - allocation.refundedAmountXof,
                    0,
                  ),
              })),
            );
            await tx.paymentComponentAllocation.createMany({
              data: split.map((allocation) => ({
                paymentId: payment.id,
                invoiceComponentId: allocation.id,
                amountXof: allocation.amountXof,
              })),
            });
          }

          // Allocation rows record actual cash only. Account/invoice credits stay in
          // creditAppliedXof, so a receipt never pretends that a scholarship was cash.
          let remainingDirect = directAppliedXof;
          const installmentsById = new Map(
            (originalInvoice.plan?.installments ?? []).map(
              (installment) => [installment.id, installment] as const,
            ),
          );
          for (const line of directlyPayableLines) {
            if (remainingDirect <= 0) break;
            if (!line.installmentId) {
              remainingDirect -= Math.min(line.outstandingXof, remainingDirect);
              continue;
            }
            const installment = installmentsById.get(line.installmentId);
            if (!installment) continue;
            const apply = Math.min(line.outstandingXof, remainingDirect);
            if (apply <= 0) continue;
            const newPaid = installment.amountPaid + apply;
            await tx.paymentAllocation.create({
              data: {
                paymentId: payment.id,
                installmentId: installment.id,
                amount: apply,
              },
            });
            await tx.installment.update({
              where: { id: installment.id },
              data: {
                amountPaid: newPaid,
                status: projectedInstallmentStatus({
                  dueDate: installment.dueDate,
                  amountDue: installment.amountDue,
                  amountPaid: newPaid,
                }),
              },
            });
            remainingDirect -= apply;
          }

          if (directAppliedXof > 0) {
            const newInvoicePaid =
              originalInvoice.amountPaid + directAppliedXof;
            await tx.invoice.update({
              where: { id: originalInvoice.id },
              data: {
                amountPaid: newInvoicePaid,
                revision: { increment: 1 },
                status:
                  newInvoicePaid >= originalInvoice.totalAmount
                    ? "paid"
                    : "partial",
              },
            });
          }
          if (directAppliedXof === 0) {
            await tx.invoice.update({
              where: { id: originalInvoice.id },
              data: { revision: { increment: 1 } },
            });
          }

          const creditMemo =
            creditMemoXof > 0
              ? await tx.invoice.create({
                  data: {
                    number: `CR-PAY-${payment.id}`,
                    studentId: payment.studentId,
                    termId: originalInvoice.termId,
                    totalAmount: -creditMemoXof,
                    amountPaid: 0,
                    status: "paid",
                    packageType: "credit",
                    description: `Unapplied payment credit — ${payment.providerRef}`,
                    costCenterCode: originalInvoice.costCenterCode,
                  },
                })
              : null;

          await tx.auditLog.create({
            data: {
              entity: "Payment",
              entityId: payment.id,
              action:
                opts.via === "ipn"
                  ? "succeeded"
                  : opts.via === "wire"
                    ? "wire-confirmed"
                    : opts.via === "pi_spi"
                      ? "pi-spi-settled"
                      : "manually-confirmed",
              actorId: opts.actorId,
              data: {
                amount,
                method: opts.method ?? payment.method,
                payableBeforeXof,
                appliedXof: directAppliedXof,
                unappliedCreditXof: creditMemoXof,
                directAppliedXof,
                creditMemoXof,
                creditMemoInvoiceId: creditMemo?.id ?? null,
              },
            },
          });

          if (opts.piSpiReview) {
            await tx.piSpiRequest.update({
              where: { id: opts.piSpiReview.id },
              data: {
                status: "settled",
                settledAmountXof: amount,
                settledAt: new Date(),
              },
            });
            if (opts.piSpiReview.paymentLinkId) {
              await tx.paymentLink.update({
                where: { id: opts.piSpiReview.paymentLinkId },
                data: { status: "paid", method: "pi_spi", paidAt: new Date() },
              });
            }
          }

          if (opts.wireReview) {
            await tx.wireTransferSubmission.update({
              where: { id: opts.wireReview.id },
              data: {
                status: "approved",
                confirmedAmountXof: amount,
                bankReference: opts.wireReview.bankReference,
                confirmationNote: opts.wireReview.confirmationNote,
                reviewedById: opts.actorId,
                reviewedByName: opts.wireReview.reviewedByName,
                reviewedByEmail: opts.wireReview.reviewedByEmail,
                reviewedAt: new Date(),
              },
            });
            if (opts.wireReview.paymentLinkId) {
              await tx.paymentLink.update({
                where: { id: opts.wireReview.paymentLinkId },
                data: { status: "paid", method: "wire", paidAt: new Date() },
              });
            }
            await tx.auditLog.create({
              data: {
                entity: "WireTransferSubmission",
                entityId: opts.wireReview.id,
                action: "approved",
                actorId: opts.actorId,
                data: {
                  confirmedAmountXof: amount,
                  bankReference: opts.wireReview.bankReference ?? null,
                },
              },
            });
          }
          return true;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

    let didSettle = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        didSettle = await runSettlement();
        break;
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }

    if (didSettle) await this.emailReceipt(paymentId);
  }

  /** Bursar verified the money in the PayTech dashboard but the IPN never arrived. */
  async confirmPaymentManually(paymentId: string, actorId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "pending")
      throw new BadRequestException("Only pending payments can be confirmed");
    await this.settlePayment(paymentId, { via: "manual", actorId });
    return { ok: true };
  }

  /** Bursar confirmed the checkout was abandoned; explicitly cancel the stale pending payment. */
  async cancelPaymentManually(paymentId: string, actorId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "pending")
      throw new BadRequestException("Only pending payments can be cancelled");
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: "cancelled" },
    });
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
      data: {
        entity: "DiningOrder",
        entityId: orderId,
        action: "paid-via-ipn",
      },
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
      data: {
        entity: "Applicant",
        entityId: applicantId,
        action: "application-fee-paid",
      },
    });
  }

  async listWireTransfers(status?: "submitted" | "approved" | "rejected") {
    const rows = await this.prisma.wireTransferSubmission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        student: { include: { person: true } },
        invoice: { include: { term: true } },
        paymentLink: true,
      },
    });
    return rows.map((w) => ({
      ...this.wireSummary(w),
      source: w.source,
      student: w.student
        ? `${w.student.person.firstName} ${w.student.person.lastName}`.trim()
        : (w.paymentLink?.payeeName ?? "External payer"),
      studentNo: w.student?.studentNo ?? w.paymentLink?.payeeMeta ?? null,
      purpose:
        w.paymentLink?.purpose ??
        w.invoice?.description ??
        w.invoice?.term.name ??
        "Student account payment",
      invoiceId: w.invoiceId,
      paymentLinkId: w.paymentLinkId,
      proofFileName: w.proofFileName,
      proofMimeType: w.proofMimeType,
      proofSize: w.proofSize,
      bankReference: w.bankReference,
      confirmationNote: w.confirmationNote,
      reviewedByName: w.reviewedByName,
      reviewedByEmail: w.reviewedByEmail,
    }));
  }

  async getWireProof(id: string) {
    const wire = await this.prisma.wireTransferSubmission.findUnique({
      where: { id },
    });
    if (!wire) throw new NotFoundException("Wire transfer not found");
    return {
      data: await this.wireProofs.get(wire.proofObjectKey),
      fileName: wire.proofFileName.replace(/[\r\n"]/g, ""),
      mimeType: wire.proofMimeType,
    };
  }

  async approveWireTransfer(
    id: string,
    input: WireApprovalInput,
    reviewer: { personId: string; email: string; name: string },
  ) {
    const wire = await this.prisma.wireTransferSubmission.findUnique({
      where: { id },
      include: { payment: true, invoice: true, paymentLink: true },
    });
    if (!wire) throw new NotFoundException("Wire transfer not found");
    if (wire.status === "approved") return { ok: true };
    if (wire.status !== "submitted")
      throw new BadRequestException(
        "Only submitted wire transfers can be approved",
      );
    if (!input.bankReference && !input.confirmationNote) {
      throw new BadRequestException(
        "Enter a bank reference or confirmation note",
      );
    }
    if (
      wire.paymentLinkId &&
      input.confirmedAmountXof !== wire.submittedAmountXof
    ) {
      throw new BadRequestException(
        "A payment-link wire must match the link amount exactly",
      );
    }

    if (wire.payment && wire.invoice) {
      const account = await this.loadPayableAccount(wire.invoice.studentId);
      this.requirePayableTarget(
        account,
        input.confirmedAmountXof,
        wire.invoice.id,
      );
      await this.settlePayment(wire.payment.id, {
        via: "wire",
        actorId: reviewer.personId,
        confirmedAmount: input.confirmedAmountXof,
        wireReview: {
          id: wire.id,
          paymentLinkId: wire.paymentLinkId,
          bankReference: input.bankReference,
          confirmationNote: input.confirmationNote,
          reviewedByName: reviewer.name,
          reviewedByEmail: reviewer.email,
        },
      });
    } else if (wire.paymentLink) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.wireTransferSubmission.updateMany({
          where: { id: wire.id, status: "submitted" },
          data: {
            status: "approved",
            confirmedAmountXof: input.confirmedAmountXof,
            bankReference: input.bankReference,
            confirmationNote: input.confirmationNote,
            reviewedById: reviewer.personId,
            reviewedByName: reviewer.name,
            reviewedByEmail: reviewer.email,
            reviewedAt: new Date(),
          },
        });
        if (claimed.count === 0) return false;
        await tx.paymentLink.update({
          where: { id: wire.paymentLink!.id },
          data: { status: "paid", method: "wire", paidAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            entity: "WireTransferSubmission",
            entityId: wire.id,
            action: "approved",
            actorId: reviewer.personId,
            data: {
              confirmedAmountXof: input.confirmedAmountXof,
              bankReference: input.bankReference ?? null,
            },
          },
        });
        return true;
      });
      if (!changed) return { ok: true };
    } else {
      throw new BadRequestException(
        "Wire transfer is missing its accounting target",
      );
    }

    await this.emailWireDecision(id, "approved");
    return { ok: true };
  }

  async rejectWireTransfer(
    id: string,
    reason: string,
    reviewer: { personId: string; email: string; name: string },
  ) {
    const wire = await this.prisma.wireTransferSubmission.findUnique({
      where: { id },
    });
    if (!wire) throw new NotFoundException("Wire transfer not found");
    if (wire.status === "rejected") return { ok: true };
    if (wire.status !== "submitted")
      throw new BadRequestException(
        "Only submitted wire transfers can be rejected",
      );
    const cleanReason = reason.trim();
    if (!cleanReason)
      throw new BadRequestException("A rejection reason is required");
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.wireTransferSubmission.updateMany({
        where: { id, status: "submitted" },
        data: {
          status: "rejected",
          rejectionReason: cleanReason,
          reviewedById: reviewer.personId,
          reviewedByName: reviewer.name,
          reviewedByEmail: reviewer.email,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count === 0) return;
      if (wire.paymentId) {
        await tx.payment.updateMany({
          where: { id: wire.paymentId, status: "pending" },
          data: { status: "cancelled" },
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "WireTransferSubmission",
          entityId: id,
          action: "rejected",
          actorId: reviewer.personId,
          data: { reason: cleanReason },
        },
      });
    });
    await this.emailWireDecision(id, "rejected");
    return { ok: true };
  }

  // --- PI-SPI (request-to-pay) --------------------------------------------

  /** The rail, or a 400 when it is not configured — never a silent no-op at checkout. */
  private piSpiRail() {
    const rail = this.rtpRails.get("pi_spi");
    if (!rail?.isConfigured()) {
      throw new BadRequestException(
        "Instant payment (PI-SPI) is not available right now",
      );
    }
    return rail;
  }

  /** Whether the pay screens should offer PI-SPI at all. */
  piSpiEnabled(): boolean {
    return this.rtpRails.get("pi_spi")?.isConfigured() ?? false;
  }

  /**
   * Resolve a payer alias to its owner so the payer can confirm the name before we push a
   * request at them. Alias lookups are how a typo becomes a visible error rather than a
   * request sent to a stranger.
   */
  async verifyPiSpiAlias(alias: string) {
    const found = await this.piSpiRail().verifyAlias(alias);
    if (!found)
      throw new NotFoundException("That payment alias was not recognised");
    return found;
  }

  private piSpiSummary(r: {
    txId: string;
    status: RequestToPayStatus;
    statusReason: string | null;
    payerName: string | null;
    amountXof: number;
    settledAmountXof: number | null;
    expiresAt: Date | null;
    createdAt: Date;
  }) {
    return {
      txId: r.txId,
      status: r.status,
      statusReason: r.statusReason,
      payerName: r.payerName,
      amountXof: r.amountXof,
      settledAmountXof: r.settledAmountXof,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /**
   * Core request-to-pay creation, shared by all four payer surfaces.
   *
   * Order matters: the Payment + PiSpiRequest rows are written first, then the rail is
   * called. A request that reaches the payer without a local row would be unsettleable
   * when its webhook arrives, whereas a local row whose rail call fails is simply marked
   * rejected and retried.
   */
  private async createPiSpiRequest(input: {
    source: string;
    alias: string;
    amountXof: number;
    motif: string;
    documentRef?: string;
    studentId?: string;
    invoiceId?: string;
    paymentLinkId?: string;
    applicantId?: string;
    actorId?: string;
    initiatedByEmail?: string;
  }) {
    const rail = this.piSpiRail();
    const amount = Math.floor(input.amountXof);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        "Amount must be a positive whole number of XOF",
      );
    }

    // Only one payable request per target at a time, matching the DB partial unique index.
    const target = input.invoiceId
      ? { invoiceId: input.invoiceId }
      : input.paymentLinkId
        ? { paymentLinkId: input.paymentLinkId }
        : { applicantId: input.applicantId! };
    const active = await this.prisma.piSpiRequest.findFirst({
      where: { ...target, status: { in: ["initiated", "sent"] } },
    });
    if (active) {
      throw new BadRequestException(
        "A payment request is already awaiting approval for this charge. Approve or let it expire before sending another.",
      );
    }

    // The rail caps txId at 35 chars, so this is deliberately short — not the MD-<uuid>
    // format the PayTech path uses (38 chars, which the rail would reject).
    const txId = `PIS${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const expiresAt = new Date(
      Date.now() + loadEnv().PI_SPI_REQUEST_TTL_HOURS * 3600_000,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      // Applicant fees have no Invoice, so they carry no Payment row — the fee is marked
      // paid on the Applicant itself when the rail settles.
      const payment =
        input.invoiceId && input.studentId
          ? await tx.payment.create({
              data: {
                invoiceId: input.invoiceId,
                studentId: input.studentId,
                amount,
                method: "pi_spi",
                status: "pending",
                provider: "pi_spi",
                providerRef: txId,
                source: input.source,
                initiatedById: input.actorId,
                initiatedByEmail: input.initiatedByEmail,
              },
            })
          : null;
      const request = await tx.piSpiRequest.create({
        data: {
          txId,
          source: input.source,
          status: "initiated",
          payerAlias: input.alias,
          amountXof: amount,
          motif: input.motif.slice(0, 140),
          studentId: input.studentId,
          invoiceId: input.invoiceId,
          paymentId: payment?.id,
          paymentLinkId: input.paymentLinkId,
          applicantId: input.applicantId,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "PiSpiRequest",
          entityId: request.id,
          action: "initiated",
          actorId: input.actorId,
          data: { source: input.source, amountXof: amount, txId },
        },
      });
      return request;
    });

    try {
      const result = await rail.requestPayment({
        txId,
        amount,
        payerAlias: input.alias,
        motif: input.motif,
        documentRef: input.documentRef,
        dueAt: expiresAt,
        // Ask the rail to resolve the payer so we can show who was billed.
        confirmation: false,
      });
      const updated = await this.prisma.piSpiRequest.update({
        where: { id: created.id },
        data: {
          end2endId: result.end2endId,
          status: result.status,
          statusReason: result.statusReason,
          payerName: result.payerName,
          payerCountry: result.payerCountry,
          lastCheckedAt: new Date(),
        },
      });
      // A rail-side rejection is terminal: release the pending payment immediately rather
      // than leaving the payer's balance looking committed.
      if (updated.status === "rejected" && updated.paymentId) {
        await this.prisma.payment.updateMany({
          where: { id: updated.paymentId, status: "pending" },
          data: { status: "failed" },
        });
      }
      return this.piSpiSummary(updated);
    } catch (err) {
      await this.prisma.$transaction(async (tx) => {
        await tx.piSpiRequest.update({
          where: { id: created.id },
          data: {
            status: "rejected",
            statusReason: "SEND_FAILED",
          },
        });
        if (created.paymentId) {
          await tx.payment.updateMany({
            where: { id: created.paymentId, status: "pending" },
            data: { status: "failed" },
          });
        }
      });
      throw err;
    }
  }

  /** Authenticated student paying their own invoice. */
  async submitStudentPiSpi(
    studentId: string,
    actorId: string,
    input: {
      invoiceId: string;
      alias: string;
      amountXof: number;
      saveAlias?: boolean;
    },
    context: { source?: string; initiatedByEmail?: string } = {},
  ) {
    const requested = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, studentId: true },
    });
    if (!requested || requested.studentId !== studentId) {
      throw new NotFoundException("Invoice not found");
    }
    const account = await this.loadPayableAccount(studentId);
    const { amount, invoice } = this.requirePayableTarget(
      account,
      input.amountXof,
      input.invoiceId,
    );
    if (input.saveAlias) {
      await this.prisma.student.update({
        where: { id: studentId },
        data: { piSpiAlias: input.alias },
      });
    }
    return this.createPiSpiRequest({
      source: context.source ?? "student_portal",
      alias: input.alias,
      amountXof: amount,
      motif: `DAUST ${invoice.description ?? "tuition"}`,
      documentRef: invoice.number ?? undefined,
      studentId,
      invoiceId: invoice.id,
      actorId,
      initiatedByEmail: context.initiatedByEmail,
    });
  }

  /** Public bill portal — the payer proved studentNo + DOB before reaching here. */
  async submitPublicBillPiSpi(input: {
    studentNo: string;
    dob: string;
    alias: string;
    amountXof: number;
  }) {
    const student = await this.findStudentForBill(input.studentNo, input.dob);
    const account = await this.loadPayableAccount(student.id);
    const { amount, invoice } = this.requirePayableTarget(
      account,
      input.amountXof,
    );
    return this.createPiSpiRequest({
      source: "public_bill",
      alias: input.alias,
      amountXof: amount,
      motif: `DAUST ${invoice.description ?? "tuition"}`,
      documentRef: invoice.number ?? undefined,
      studentId: student.id,
      invoiceId: invoice.id,
    });
  }

  /** Bursar-generated one-off payment link. */
  async submitPaymentLinkPiSpi(token: string, alias: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link || link.status === "cancelled")
      throw new NotFoundException("Payment link not found");
    if (link.status === "paid")
      throw new BadRequestException("This link is already paid");
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new BadRequestException("This payment link has expired");
    }
    if (link.invoiceId) {
      const linkedInvoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: link.invoiceId },
        select: { studentId: true },
      });
      const studentId = link.studentId ?? linkedInvoice.studentId;
      const account = await this.loadPayableAccount(studentId);
      const { amount, invoice } = this.requirePayableTarget(
        account,
        link.amountXof,
        link.invoiceId,
      );
      return this.createPiSpiRequest({
        source: "payment_link",
        alias,
        amountXof: amount,
        motif: link.purpose || "DAUST payment",
        studentId,
        invoiceId: invoice.id,
        paymentLinkId: link.id,
      });
    }
    return this.createPiSpiRequest({
      source: "payment_link",
      alias,
      amountXof: link.amountXof,
      motif: link.purpose || "DAUST payment",
      paymentLinkId: link.id,
    });
  }

  /**
   * Poll a public-bill request. The caller re-proves studentNo + DOB, so a stranger who
   * guesses a txId still cannot read someone else's payment.
   */
  async getPublicBillPiSpiStatus(studentNo: string, dob: string, txId: string) {
    const student = await this.findStudentForBill(studentNo, dob);
    return this.getPiSpiRequest(txId, { studentId: student.id });
  }

  /**
   * Application fee via instant payment. The applicant id is the capability (same model
   * as the PayTech fee checkout); there is no invoice, so settlement flips `feePaid`.
   */
  async submitApplicantPiSpi(
    applicantId: string,
    alias: string,
    amountXof: number,
  ) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
    });
    if (!applicant) throw new NotFoundException("Application not found");
    if (applicant.feePaid) {
      throw new BadRequestException("Application fee already paid");
    }
    return this.createPiSpiRequest({
      source: "application_fee",
      alias,
      amountXof,
      motif: "DAUST application fee",
      documentRef: applicant.id.slice(0, 35),
      applicantId: applicant.id,
    });
  }

  /** Poll an application-fee request; the applicant id scopes it. */
  async getApplicantPiSpiStatus(applicantId: string, txId: string) {
    const request = await this.prisma.piSpiRequest.findUnique({
      where: { txId },
    });
    if (!request || request.applicantId !== applicantId) {
      throw new NotFoundException("Payment request not found");
    }
    return this.piSpiSummary(request);
  }

  /** Poll a request. `scope` narrows it so one payer cannot read another's request. */
  async getPiSpiRequest(
    txId: string,
    scope?: { studentId?: string; token?: string },
  ) {
    const request = await this.prisma.piSpiRequest.findUnique({
      where: { txId },
      include: { paymentLink: { select: { token: true } } },
    });
    if (!request) throw new NotFoundException("Payment request not found");
    if (scope?.studentId && request.studentId !== scope.studentId) {
      throw new NotFoundException("Payment request not found");
    }
    if (scope?.token && request.paymentLink?.token !== scope.token) {
      throw new NotFoundException("Payment request not found");
    }
    return this.piSpiSummary(request);
  }

  /**
   * Apply a verified rail notification.
   *
   * WebhookEvent records the rail's end2endId once. Replays still reach the terminal,
   * idempotent state transition so an earlier post-insert failure can recover.
   */
  async handlePiSpiWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
  ) {
    const rail = this.rtpRails.get("pi_spi");
    if (!rail) return { valid: false };
    const { valid, events } = rail.verifyWebhook(rawBody, signature);
    if (!valid) return { valid: false };

    for (const event of events) {
      const key = event.end2endId ?? event.txId;
      if (!key) continue;
      try {
        await this.prisma.webhookEvent.create({
          data: {
            token: key,
            paymentRef: event.txId ?? key,
            payload: event.raw as never,
          },
        });
      } catch (error) {
        const duplicate =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002";
        if (!duplicate) throw error;
      }
      await this.applyPiSpiEvent(event);
    }
    return { valid: true };
  }

  /** Move one request (and its money) to the state the rail reports. */
  private async applyPiSpiEvent(event: {
    txId: string | null;
    end2endId: string | null;
    status: RequestToPayStatus;
    statusReason: string | null;
    amount: number | null;
  }) {
    const request = await this.prisma.piSpiRequest.findFirst({
      where: event.txId
        ? { txId: event.txId }
        : { end2endId: event.end2endId ?? undefined },
    });
    if (!request) return;
    if (request.status === "settled") return; // terminal

    if (event.status === "settled") {
      // Trust our own recorded amount over the notification's, and never credit more
      // than was requested.
      const amount = Math.min(
        event.amount ?? request.amountXof,
        request.amountXof,
      );
      // Record the rail-wide id before settling — support and the reconciliation sweep
      // both trace by it, and it is the only handle the rail recognises.
      if (event.end2endId && !request.end2endId) {
        await this.prisma.piSpiRequest.update({
          where: { id: request.id },
          data: { end2endId: event.end2endId },
        });
      }
      if (request.paymentId) {
        await this.settlePayment(request.paymentId, {
          via: "pi_spi",
          method: "pi_spi",
          confirmedAmount: amount,
          payload: event as unknown as object,
          piSpiReview: { id: request.id, paymentLinkId: request.paymentLinkId },
        });
      } else {
        // Application fee: no invoice ledger, just the flag the admissions flow reads.
        await this.prisma.$transaction(async (tx) => {
          await tx.piSpiRequest.update({
            where: { id: request.id },
            data: {
              status: "settled",
              settledAmountXof: amount,
              settledAt: new Date(),
            },
          });
          if (request.applicantId) {
            await tx.applicant.update({
              where: { id: request.applicantId },
              data: { feePaid: true },
            });
          }
        });
      }
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.piSpiRequest.update({
        where: { id: request.id },
        data: {
          status: event.status,
          statusReason: event.statusReason,
          end2endId: request.end2endId ?? event.end2endId,
          lastCheckedAt: new Date(),
        },
      });
      // Anything terminal-but-unpaid releases the pending payment.
      if (
        request.paymentId &&
        ["rejected", "cancelled", "expired"].includes(event.status)
      ) {
        await tx.payment.updateMany({
          where: { id: request.paymentId, status: "pending" },
          data: { status: event.status === "expired" ? "failed" : "cancelled" },
        });
      }
    });
  }

  /**
   * Poll the rail for requests whose webhook never arrived.
   *
   * Not optional: webhook delivery depends on the rail reaching us, so without this a lost
   * notification would leave a student's paid invoice showing a balance indefinitely.
   */
  async reconcilePiSpiRequests(limit = 50): Promise<number> {
    const rail = this.rtpRails.get("pi_spi");
    if (!rail?.isConfigured()) return 0;
    const pending = await this.prisma.piSpiRequest.findMany({
      where: { status: { in: ["initiated", "sent"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    let changed = 0;
    for (const request of pending) {
      // Expire locally when the rail has stopped tracking it.
      if (request.expiresAt && request.expiresAt < new Date()) {
        await this.applyPiSpiEvent({
          txId: request.txId,
          end2endId: request.end2endId,
          status: "expired",
          statusReason: "EXPIRED",
          amount: null,
        });
        changed += 1;
        continue;
      }
      try {
        const latest = await rail.getRequest(request.txId);
        if (!latest || latest.status === request.status) {
          await this.prisma.piSpiRequest.update({
            where: { id: request.id },
            data: { lastCheckedAt: new Date() },
          });
          continue;
        }
        await this.applyPiSpiEvent({
          txId: request.txId,
          end2endId: latest.end2endId ?? request.end2endId,
          status: latest.status,
          statusReason: latest.statusReason,
          amount: latest.amount,
        });
        changed += 1;
      } catch {
        // A rail outage must not abort the sweep; the next run retries.
        continue;
      }
    }
    return changed;
  }

  private async emailWireSubmitted(
    id: string,
    financeRecipients: string[],
    studentEmail?: string,
  ) {
    const wire = await this.prisma.wireTransferSubmission.findUnique({
      where: { id },
      include: { student: { include: { person: true } }, paymentLink: true },
    });
    if (!wire) return;
    const amount = wire.submittedAmountXof.toLocaleString("en-US");
    if (financeRecipients.length > 0) {
      await this.mail.send({
        to: financeRecipients,
        subject: `Wire proof awaiting review — ${amount} XOF`,
        html: `<h2>Wire transfer proof submitted</h2><p>${wire.student?.studentNo ?? wire.paymentLink?.payeeName ?? "A payer"} submitted proof for <strong>${amount} XOF</strong>.</p><p>Sign in to Billing Admin to review it.</p>`,
      });
    }
    const recipients = [
      ...new Set(
        [wire.contactEmail, studentEmail, wire.student?.person.email].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ];
    await this.mail.send({
      to: recipients,
      subject: "Wire transfer submitted — awaiting DAUST review",
      html: `<h2>Proof received</h2><p>We received your proof for <strong>${amount} XOF</strong>. Your official balance will change only after DAUST Finance verifies the deposit.</p>`,
    });
  }

  private async emailWireDecision(
    id: string,
    decision: "approved" | "rejected",
  ) {
    const wire = await this.prisma.wireTransferSubmission.findUnique({
      where: { id },
      include: { student: { include: { person: true } } },
    });
    if (!wire) return;
    const recipients = [
      ...new Set(
        [wire.contactEmail, wire.student?.person.email].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ];
    const amount = (
      wire.confirmedAmountXof ?? wire.submittedAmountXof
    ).toLocaleString("en-US");
    await this.mail.send({
      to: recipients,
      subject:
        decision === "approved"
          ? "Wire transfer approved"
          : "Wire transfer needs attention",
      html:
        decision === "approved"
          ? `<h2>Wire transfer approved</h2><p>DAUST Finance confirmed <strong>${amount} XOF</strong>. The payment has been applied to the account.</p>`
          : `<h2>Wire transfer not approved</h2><p>${wire.rejectionReason ?? "Finance could not verify the deposit."}</p><p>You may submit a new proof after correcting the issue.</p>`,
    });
  }

  /** Email a payment receipt to the student (best-effort; dev-logs without a provider). */
  private async emailReceipt(paymentId: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: { include: { person: true } },
        invoice: { include: { term: true } },
        initiatedBy: { select: { firstName: true, lastName: true } },
      },
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
    if (
      p.initiatedByEmail &&
      p.initiatedByEmail.toLowerCase() !== p.student.person.email.toLowerCase()
    ) {
      const payerName = p.initiatedBy
        ? `${p.initiatedBy.firstName} ${p.initiatedBy.lastName}`.trim()
        : "Payer";
      const studentName =
        `${p.student.person.firstName} ${p.student.person.lastName}`.trim();
      await this.mail.send({
        to: p.initiatedByEmail,
        subject: `Payment receipt for ${studentName}`,
        html: `
          <h2>Payment received</h2>
          <p>Hi ${payerName}, we've received your payment for <strong>${studentName}</strong>.</p>
          <table cellpadding="6">
            <tr><td><strong>Amount</strong></td><td>${p.amount.toLocaleString("en-US")} XOF</td></tr>
            <tr><td><strong>Method</strong></td><td>${p.method}</td></tr>
            <tr><td><strong>Reference</strong></td><td>${p.providerRef}</td></tr>
            <tr><td><strong>Term</strong></td><td>${p.invoice.term.name}</td></tr>
          </table>
          <p>You can review this receipt in the parent billing portal.</p>`,
      });
    }
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
      source: p.source,
      initiatedByEmail: p.initiatedByEmail,
      settledAt: p.settledAt,
      refundedAt: p.refundedAt,
      createdAt: p.createdAt,
    }));
  }

  /** Director/bursar money-in view: billed vs collected vs outstanding, plus method mix. */
  async getCollectionSummary() {
    const invoices = await this.prisma.invoice.findMany({
      include: {
        student: { select: { recordStatus: true } },
        plan: { include: { installments: true } },
      },
    });

    const byStudent = new Map<string, typeof invoices>();
    for (const invoice of invoices) {
      const account = byStudent.get(invoice.studentId) ?? [];
      account.push(invoice);
      byStudent.set(invoice.studentId, account);
    }
    const reportAccounts = [...byStudent.entries()]
      .map(([studentId, accountInvoices]) => ({
        studentId,
        invoices: accountInvoices,
        summary: deriveApiAccountPosition(accountInvoices).summary,
      }))
      .filter(
        (account) =>
          account.invoices[0]?.student.recordStatus !== "archived" ||
          account.summary.outstandingXof > 0,
      );
    const includedStudentIds = reportAccounts.map(
      (account) => account.studentId,
    );
    const [collectedAgg, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          status: "success",
          studentId: { in: includedStudentIds },
          invoice: { status: { not: "void" } },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ["method"],
        where: {
          status: "success",
          studentId: { in: includedStudentIds },
          invoice: { status: { not: "void" } },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const reportInvoices = reportAccounts.flatMap(
      (account) => account.invoices,
    );
    const accountSummaries = reportAccounts.map((account) => account.summary);
    const summary = aggregateAccountReport(accountSummaries);
    const totalBilled = reportInvoices
      .filter((invoice) => invoice.status !== "void" && invoice.totalAmount > 0)
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const totalCollected = collectedAgg._sum.amount ?? 0;
    const invoiceCounts = new Map<string, number>();
    for (const invoice of reportInvoices) {
      invoiceCounts.set(
        invoice.status,
        (invoiceCounts.get(invoice.status) ?? 0) + 1,
      );
    }
    return {
      currency: "XOF",
      billed: totalBilled,
      collected: totalCollected,
      outstanding: summary.outstandingXof,
      credit: summary.creditXof,
      overdue: summary.overdueXof,
      summary,
      accountCount: accountSummaries.filter(
        (account) => account.standing !== "no_billing",
      ).length,
      overdueAccountCount: accountSummaries.filter(
        (account) => account.overdueXof > 0,
      ).length,
      collectionRate:
        totalBilled === 0
          ? 0
          : Math.round((totalCollected / totalBilled) * 100),
      byMethod: byMethod.map((m) => ({
        method: m.method,
        amount: m._sum.amount ?? 0,
        count: m._count,
      })),
      invoicesByStatus: [...invoiceCounts].map(([status, count]) => ({
        status,
        count,
      })),
    };
  }

  /** All student accounts with derived balances + status. Powers the standalone billing admin. */
  async listStudentAccounts() {
    const [students, pendingPlanChanges] = await Promise.all([
      this.prisma.student.findMany({
        orderBy: { studentNo: "asc" },
        include: {
          person: true,
          program: true,
          holds: { where: { active: true }, orderBy: { placedAt: "asc" } },
          invoices: {
            orderBy: { createdAt: "desc" },
            include: { plan: { include: { installments: true } } },
          },
        },
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          kind: "payment_plan",
          status: "pending",
          targetType: "Invoice",
        },
        select: { targetId: true },
      }),
    ]);
    const pendingPlanInvoiceIds = new Set(
      pendingPlanChanges.flatMap((request) =>
        request.targetId ? [request.targetId] : [],
      ),
    );
    return students.flatMap((s) => {
      const position = deriveApiAccountPosition(s.invoices);
      const summary = position.summary;
      const specialAccount = deriveAccountSpecialStatus(
        s.invoices,
        pendingPlanInvoiceIds,
      );
      if (s.recordStatus === "archived" && summary.outstandingXof <= 0)
        return [];
      const chargeInvoices = s.invoices.filter(
        (invoice) => invoice.status !== "void" && invoice.totalAmount > 0,
      );
      const billed = chargeInvoices.reduce((a, i) => a + i.totalAmount, 0);
      const paid = chargeInvoices.reduce((a, i) => a + i.amountPaid, 0);
      // The billing row represents a real charge, so skip negative credit memos
      // (discounts/reversals) when picking which invoice the row stands for.
      const payableTarget = selectOldestPayableTarget(s.invoices, position);
      const standardPlan = chargeInvoices.find((invoice) =>
        ["standard_full", "standard_tuition_legacy"].includes(
          invoice.packageType,
        ),
      );
      const primary =
        standardPlan ??
        s.invoices.find((invoice) => invoice.id === payableTarget?.invoiceId) ??
        chargeInvoices[0] ??
        s.invoices.find((invoice) => invoice.status !== "void");
      const openCharges = position.installments.filter(
        (installment) => installment.outstandingXof > 0,
      ).length;
      const status =
        summary.standing === "overdue"
          ? "overdue"
          : summary.outstandingXof > 0
            ? "due"
            : "paid";
      return [
        {
          id: s.id,
          studentNo: s.studentNo,
          name: `${s.person.firstName} ${s.person.lastName}`
            .replace(/\s+/g, " ")
            .trim(),
          program: s.program?.name ?? null,
          photoUrl: s.photoUrl,
          billed,
          paid,
          balance: summary.balanceXof,
          remaining: summary.outstandingXof,
          remainingXof: summary.outstandingXof,
          openCharges,
          overdue: summary.overdueXof > 0,
          status,
          summary,
          recordStatus: s.recordStatus,
          hasActiveHold: s.holds.length > 0,
          activeHoldCount: s.holds.length,
          activeHolds: s.holds.map((hold) => ({
            id: hold.id,
            type: hold.type,
            reason: hold.reason,
            placedAt: hold.placedAt,
          })),
          invoiceId: primary?.id ?? null,
          // Human handle + description drive the design's "Billing" and "Plan" columns.
          billingNumber: primary?.number ?? null,
          billingDescription: primary?.description ?? null,
          packageType: primary?.packageType ?? null,
          academicYearLabel: primary?.academicYearLabel ?? null,
          feeScheduleRevision: primary?.feeScheduleRevision ?? null,
          planType: primary ? invoicePlanType(primary) : null,
          specialAccount,
        },
      ];
    });
  }

  /** Bursar drill-down: one student's full account (invoices, schedule, payments, balances). */
  async getStudentAccount(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { person: true, program: true },
    });
    if (!student) throw new NotFoundException("Student not found");

    const [invoices, activeHolds, pendingPlanChanges] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        include: {
          term: true,
          plan: {
            include: { installments: { orderBy: { sequence: "asc" } } },
          },
          payments: { orderBy: { createdAt: "desc" } },
          wireTransfers: { orderBy: { createdAt: "desc" } },
        },
      }),
      this.prisma.studentHold.findMany({
        where: { studentId, active: true },
        orderBy: { placedAt: "asc" },
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          kind: "payment_plan",
          status: "pending",
          targetType: "Invoice",
        },
        select: { targetId: true },
      }),
    ]);

    const position = deriveApiAccountPosition(invoices);
    const derived = derivedInstallmentsById(position);
    const payableTarget = selectOldestPayableTarget(invoices, position);
    const pendingPlanInvoiceIds = new Set(
      pendingPlanChanges.flatMap((request) =>
        request.targetId ? [request.targetId] : [],
      ),
    );
    const specialAccount = deriveAccountSpecialStatus(
      invoices,
      pendingPlanInvoiceIds,
    );
    const chargeInvoices = invoices.filter(
      (invoice) => invoice.status !== "void" && invoice.totalAmount > 0,
    );
    const billed = chargeInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const paid = chargeInvoices.reduce((s, i) => s + i.amountPaid, 0);
    return {
      student: {
        studentNo: student.studentNo,
        name: `${student.person.firstName} ${student.person.lastName}`,
        program: student.program?.name ?? "—",
        email: student.person.email,
      },
      totals: {
        billed,
        paid,
        balance: position.summary.balanceXof,
        remaining: position.summary.outstandingXof,
        remainingXof: position.summary.outstandingXof,
      },
      summary: position.summary,
      specialAccount,
      payableTarget,
      activeHolds: activeHolds.map((hold) => ({
        id: hold.id,
        type: hold.type,
        reason: hold.reason,
        placedAt: hold.placedAt,
      })),
      invoices: invoices.map((inv) => {
        const summary = invoicePositionSummary(position, inv.id);
        const planType = invoicePlanType(inv);
        return {
          id: inv.id,
          createdAt: inv.createdAt,
          term: inv.term.name,
          description: inv.description,
          packageType: inv.packageType,
          academicYearLabel: inv.academicYearLabel,
          feeScheduleId: inv.feeScheduleId,
          feeScheduleRevision: inv.feeScheduleRevision,
          planType,
          isIndividualPlanOverride: planType === "individual_override",
          hasPendingPlanChange: pendingPlanInvoiceIds.has(inv.id),
          total: inv.totalAmount,
          paid: inv.amountPaid,
          balance: inv.status === "void" ? 0 : inv.totalAmount - inv.amountPaid,
          remaining: summary.outstandingXof,
          remainingXof: summary.outstandingXof,
          status:
            inv.status === "void"
              ? "void"
              : inv.totalAmount - inv.amountPaid <= 0
                ? "paid"
                : inv.amountPaid > 0
                  ? "partial"
                  : "open",
          summary,
          effectiveOutstandingXof: summary.outstandingXof,
          effectiveStatus: summary.standing,
          hasPlan: !!inv.plan,
          installments: (inv.plan?.installments ?? []).map((installment) =>
            decorateInstallment(installment, derived),
          ),
          payments: inv.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            status: p.status,
            providerRef: p.providerRef,
            source: p.source,
            initiatedByEmail: p.initiatedByEmail,
            settledAt: p.settledAt,
            refundedAt: p.refundedAt,
            createdAt: p.createdAt,
          })),
          wireTransfers: inv.wireTransfers.map((w) => this.wireSummary(w)),
        };
      }),
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
      const exists = await this.prisma.student.findUnique({
        where: { studentNo: candidate },
      });
      if (!exists) return candidate;
    }
    return `DAUST-${year}-${randomUUID().slice(0, 8)}`;
  }

  /** Bill the approved annual tuition + housing + cafeteria package. */
  private async billStandardTuition(
    studentId: string,
    actorId: string,
  ): Promise<StandardPackageAssignment> {
    try {
      return await this.serializableTransaction((tx) =>
        assignStandardPackageInTransaction(tx, studentId, actorId),
      );
    } catch (error) {
      // PostgreSQL can surface the partial unique-index race as P2002 instead of
      // a serializable P2034. Return the winner so retries stay idempotent.
      const isUniqueRace =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002";
      if (!isUniqueRace) throw error;
      const existing = await this.prisma.invoice.findFirst({
        where: {
          studentId,
          packageType: "standard_full",
          status: { not: "void" },
          feeSchedule: { academicYear: { status: "active" } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (
        !existing ||
        !existing.feeScheduleId ||
        !existing.feeScheduleRevision
      ) {
        throw error;
      }
      return {
        created: false,
        invoiceId: existing.id,
        feeScheduleId: existing.feeScheduleId,
        feeScheduleRevision: existing.feeScheduleRevision,
      };
    }
  }

  /** Bursar/admin direct action: assign the exact already-approved package only. */
  async assignStandardPackage(studentId: string, actorId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, recordStatus: "active" },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Active student not found");
    return this.billStandardTuition(student.id, actorId);
  }

  /**
   * Create a real platform student (Person + Student) from the billing admin. They immediately
   * appear in the registrar roster and can pay on payment.daust.net. Active students always
   * receive the approved full package; a missing schedule rolls the whole creation back.
   */
  async createStudent(
    actorId: string,
    input: {
      fullName: string;
      dateOfBirth: string;
      studentNo?: string;
      email?: string;
      programCode?: string;
    },
  ) {
    const { firstName, lastName } = this.splitName(input.fullName);
    if (!firstName) throw new BadRequestException("Full name is required");
    const dob = new Date(`${input.dateOfBirth.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(dob.getTime()))
      throw new BadRequestException("Invalid date of birth");

    const studentNo =
      input.studentNo?.trim() || (await this.generateStudentNo());
    if (await this.prisma.student.findUnique({ where: { studentNo } })) {
      throw new BadRequestException(`Student ID ${studentNo} already exists`);
    }
    const email =
      input.email?.trim().toLowerCase() ||
      `${studentNo.toLowerCase()}@students.daust.edu`;
    if (await this.prisma.person.findUnique({ where: { email } })) {
      throw new BadRequestException(`Email ${email} is already in use`);
    }

    let programId: string | null = null;
    if (input.programCode) {
      const program = await this.prisma.program.findUnique({
        where: { code: input.programCode },
      });
      if (!program) throw new BadRequestException("Unknown program");
      programId = program.id;
    }

    const student = await this.serializableTransaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          email,
          firstName,
          lastName,
          kind: "student",
          roles: ["student"],
        },
      });
      const created = await tx.student.create({
        data: { personId: person.id, studentNo, dateOfBirth: dob, programId },
      });
      await tx.auditLog.create({
        data: {
          entity: "Student",
          entityId: created.id,
          action: "student-created",
          actorId,
          data: { studentNo, email },
        },
      });
      await assignStandardPackageInTransaction(tx, created.id, actorId);
      return created;
    });
    return { id: student.id, studentNo };
  }

  /** Add an ad-hoc charge to one, several, or all students. Each charge = one single-installment invoice. */
  private billingNumber(year: number, seq: number): string {
    return `BILL-${year}-${String(seq).padStart(3, "0")}`;
  }

  /**
   * Next free sequence for this year's BILL-<year>-NNN handles. A bulk charge
   * reserves a contiguous block from this base; the unique index is the real guard.
   */
  private async nextBillingSeq(year: number): Promise<number> {
    const prefix = `BILL-${year}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const seq = last?.number
      ? Number.parseInt(last.number.slice(prefix.length), 10)
      : 0;
    return (Number.isFinite(seq) ? seq : 0) + 1;
  }

  async addCharge(
    actorId: string,
    input: {
      studentIds: string[];
      description: string;
      amountXof: number;
      costCenterCode?: string;
      dueDate?: string;
      installments?: {
        dueDate: string;
        amountXof: number;
        label?: string | null;
      }[];
    },
  ) {
    const description = input.description.trim();
    if (!description)
      throw new BadRequestException("Charge description is required");
    const amount = Math.floor(input.amountXof);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException("Amount must be positive");

    const costCenterCode = input.costCenterCode ?? COST_CENTER_TUITION;
    if (
      !(await this.prisma.costCenter.findUnique({
        where: { code: costCenterCode },
      }))
    ) {
      throw new BadRequestException("Unknown cost center");
    }
    const term = await this.prisma.term.findUnique({
      where: { name: TUITION_TERM_NAME },
    });
    if (!term)
      throw new BadRequestException(
        `Term "${TUITION_TERM_NAME}" is not set up`,
      );
    const dueDate = parseFinanceDateOnly(
      input.dueDate ?? toDakarDateKey(new Date()),
    );

    // A billing may carry its own installment schedule; without one it stays the
    // single-installment charge the bulk "charge all" path has always created.
    const now = new Date();
    const schedule = input.installments?.length
      ? input.installments.map((line, idx) => {
          const due = parseFinanceDateOnly(
            line.dueDate,
            "Installment due date",
          );
          const amountDue = Math.floor(line.amountXof);
          if (!Number.isFinite(amountDue) || amountDue <= 0) {
            throw new BadRequestException(
              "Installment amounts must be positive",
            );
          }
          return {
            sequence: idx + 1,
            dueDate: due,
            amountDue,
            label: line.label?.trim() || null,
            status: projectedInstallmentStatus(
              { dueDate: due, amountDue, amountPaid: 0 },
              now,
            ),
          };
        })
      : [
          {
            sequence: 1,
            dueDate,
            amountDue: amount,
            label: null,
            status: projectedInstallmentStatus(
              { dueDate, amountDue: amount, amountPaid: 0 },
              now,
            ),
          },
        ];
    const scheduled = schedule.reduce((sum, line) => sum + line.amountDue, 0);
    if (scheduled !== amount) {
      throw new BadRequestException(
        `Installments (${scheduled}) must sum to the billing total (${amount})`,
      );
    }

    const ids = [...new Set(input.studentIds)];
    if (ids.length === 0) throw new BadRequestException("No students selected");
    const validIds = (
      await this.prisma.student.findMany({
        where: { id: { in: ids }, recordStatus: "active" },
        select: { id: true },
      })
    ).map((s) => s.id);
    if (validIds.length === 0)
      throw new NotFoundException("No matching students");

    const billYear = new Date().getUTCFullYear();
    const billBase = await this.nextBillingSeq(billYear);

    // Chunk so a big "charge all" stays comfortably under the interactive-transaction timeout.
    const CHUNK = 25;
    let count = 0;
    for (let i = 0; i < validIds.length; i += CHUNK) {
      const slice = validIds.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        slice.map((studentId, j) =>
          this.prisma.invoice.create({
            data: {
              number: this.billingNumber(billYear, billBase + i + j),
              studentId,
              termId: term.id,
              totalAmount: amount,
              description,
              costCenterCode,
              packageType: "custom",
              components: {
                create: {
                  kind:
                    costCenterCode === "9100"
                      ? "tuition"
                      : costCenterCode === "3700"
                        ? "housing"
                        : costCenterCode === "3600"
                          ? "cafeteria"
                          : "other",
                  costCenterCode,
                  amountXof: amount,
                },
              },
              plan: {
                create: {
                  createdById: actorId,
                  installments: { create: schedule },
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
        data: {
          description,
          amount,
          costCenterCode,
          count,
          installments: schedule.length,
          studentIds: validIds,
        },
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
    input: {
      studentId: string;
      label: string;
      amountXof: number;
      kind?: string;
      costCenterCode?: string;
    },
  ) {
    const label = input.label.trim();
    if (!label) throw new BadRequestException("A label is required");
    const amount = Math.floor(input.amountXof);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException("Amount must be positive");
    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
    });
    if (!student) throw new NotFoundException("Student not found");
    const costCenterCode = input.costCenterCode ?? COST_CENTER_TUITION;
    if (
      !(await this.prisma.costCenter.findUnique({
        where: { code: costCenterCode },
      }))
    ) {
      throw new BadRequestException("Unknown cost center");
    }
    const term = await this.prisma.term.findUnique({
      where: { name: TUITION_TERM_NAME },
    });
    if (!term)
      throw new BadRequestException(
        `Term "${TUITION_TERM_NAME}" is not set up`,
      );
    const kind = input.kind === "scholarship" ? "Scholarship" : "Discount";
    const credit = await this.prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: -amount,
        amountPaid: 0,
        status: "paid", // excludes it from payable selection; balance math still nets it
        packageType: "credit",
        description: `${kind} — ${label}`,
        costCenterCode,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Invoice",
        entityId: credit.id,
        action: "discount-applied",
        actorId,
        data: { label, amount, kind },
      },
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
    if (invoice.totalAmount < 0)
      throw new BadRequestException("Account credits cannot be removed");

    const installmentIds = invoice.plan?.installments.map((i) => i.id) ?? [];
    const paymentIds = invoice.payments.map((p) => p.id);
    const settled =
      invoice.amountPaid > 0 ||
      invoice.payments.some(
        (p) => p.status === "success" || p.status === "refunded",
      );

    if (!settled) {
      await this.prisma.$transaction(async (tx) => {
        if (installmentIds.length || paymentIds.length) {
          await tx.paymentAllocation.deleteMany({
            where: {
              OR: [
                { installmentId: { in: installmentIds } },
                { paymentId: { in: paymentIds } },
              ],
            },
          });
        }
        await tx.payment.deleteMany({ where: { invoiceId } });
        if (invoice.plan) {
          await tx.installment.deleteMany({
            where: { planId: invoice.plan.id },
          });
          await tx.paymentPlan.delete({ where: { id: invoice.plan.id } });
        }
        await tx.invoice.delete({ where: { id: invoiceId } });
        await tx.auditLog.create({
          data: {
            entity: "Invoice",
            entityId: invoiceId,
            action: "charge-removed",
            actorId,
            data: {
              description: invoice.description,
              amount: invoice.totalAmount,
            },
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
          packageType: "credit",
          description: `Credit — reversal of ${invoice.description ?? `${TUITION_TERM_NAME} tuition`}`,
          costCenterCode: invoice.costCenterCode,
        },
      });
      if (installmentIds.length || paymentIds.length) {
        await tx.paymentAllocation.deleteMany({
          where: {
            OR: [
              { installmentId: { in: installmentIds } },
              { paymentId: { in: paymentIds } },
            ],
          },
        });
      }
      // Preserve the real payment records by moving them onto the credit memo (FK requires an invoice).
      if (paymentIds.length) {
        await tx.payment.updateMany({
          where: { invoiceId },
          data: { invoiceId: credit.id },
        });
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
          data: {
            description: invoice.description,
            chargeAmount: invoice.totalAmount,
            creditAmount,
            creditInvoiceId: credit.id,
          },
        },
      });
    });
    return { ok: true, credited: creditAmount };
  }

  /** Installments past due and not fully paid, across all students (bursar collections view). */
  async listOverdue() {
    const aging = await this.arAging();
    return aging.rows
      .filter((row) => row.dueState === "overdue" && row.installmentId !== null)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .map((row) => ({
        installmentId: row.installmentId!,
        student: row.student,
        studentNo: row.studentNo,
        term: row.term,
        sequence: row.sequence,
        dueDate: row.dueDate,
        amountDue: row.amountDue,
        amountPaid: row.amountPaid,
        outstanding: row.outstanding,
        daysPastDue: row.daysOverdue,
      }));
  }

  /** Scheduled reconciliation of the legacy status column against Dakar calendar semantics. */
  async markOverdueInstallments(): Promise<number> {
    const installments = await this.prisma.installment.findMany({
      select: {
        id: true,
        dueDate: true,
        amountDue: true,
        amountPaid: true,
        status: true,
      },
    });
    const now = new Date();
    const changes = installments.flatMap((installment) => {
      const status = projectedInstallmentStatus(installment, now);
      return status === installment.status
        ? []
        : [{ id: installment.id, status }];
    });
    if (changes.length === 0) return 0;
    await this.prisma.$transaction(
      changes.map((change) =>
        this.prisma.installment.update({
          where: { id: change.id },
          data: { status: change.status },
        }),
      ),
    );
    return changes.length;
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
      include: {
        student: { include: { person: true } },
        invoice: { include: { term: true } },
      },
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
      data: {
        entity: "Expense",
        entityId: expense.id,
        action: "created",
        actorId,
        data: input,
      },
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
        ...(patch.costCenterCode !== undefined
          ? { costCenterCode: patch.costCenterCode }
          : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.payee !== undefined ? { payee: patch.payee } : {}),
        ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
        ...(patch.isEstimate !== undefined
          ? { isEstimate: patch.isEstimate }
          : {}),
        ...(patch.incurredOn !== undefined
          ? { incurredOn: new Date(patch.incurredOn) }
          : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Expense",
        entityId: id,
        action: "updated",
        actorId,
        data: patch,
      },
    });
    return expense;
  }

  async deleteExpense(id: string, actorId?: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");
    await this.prisma.expense.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        entity: "Expense",
        entityId: id,
        action: "deleted",
        actorId,
        data: { amount: existing.amount, category: existing.category },
      },
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

  async setBudget(input: {
    costCenterCode: string;
    fiscalYear: string;
    allocated: number;
  }) {
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

  /** Cumulative approved schedule vs durable net cash, plus a capped run-rate forecast. */
  async collectionsTimeline(academicYearLabel?: string) {
    const academicYear = academicYearLabel
      ? await this.prisma.academicYear.findUnique({
          where: { label: academicYearLabel },
          include: { terms: true },
        })
      : await this.prisma.academicYear.findFirst({
          where: { status: "active" },
          include: { terms: true },
        });
    if (!academicYear) throw new NotFoundException("Academic year not found");

    const students = await this.prisma.student.findMany({
      include: {
        invoices: {
          include: {
            term: true,
            plan: { include: { installments: true } },
            payments: true,
          },
        },
      },
    });
    const expectedByDate = new Map<string, number>();
    const cashByDate = new Map<string, number>();
    let unscheduledDebtXof = 0;
    let collectibleBalanceXof = 0;
    for (const student of students) {
      const position = deriveApiAccountPosition(student.invoices);
      const targetInvoiceIds = new Set(
        student.invoices
          .filter(
            (invoice) =>
              invoice.status !== "void" &&
              invoice.totalAmount > 0 &&
              (invoice.academicYearLabel === academicYear.label ||
                invoice.term.academicYearId === academicYear.id),
          )
          .map((invoice) => invoice.id),
      );
      for (const line of position.installments) {
        if (!targetInvoiceIds.has(line.invoiceId)) continue;
        collectibleBalanceXof += line.outstandingXof;
        if (!line.dueDate) {
          unscheduledDebtXof += line.outstandingXof;
          continue;
        }
        const expectedXof = Math.max(
          0,
          line.amountDueXof - line.creditAppliedXof,
        );
        expectedByDate.set(
          line.dueDate,
          (expectedByDate.get(line.dueDate) ?? 0) + expectedXof,
        );
      }
      for (const invoice of student.invoices) {
        if (!targetInvoiceIds.has(invoice.id)) continue;
        for (const payment of invoice.payments) {
          if (
            (payment.status === "success" || payment.status === "refunded") &&
            payment.settledAt
          ) {
            const date = toDakarDateKey(payment.settledAt);
            cashByDate.set(date, (cashByDate.get(date) ?? 0) + payment.amount);
          }
          if (payment.status === "refunded" && payment.refundedAt) {
            const date = toDakarDateKey(payment.refundedAt);
            cashByDate.set(date, (cashByDate.get(date) ?? 0) - payment.amount);
          }
        }
      }
    }

    const today = toDakarDateKey(new Date());
    const termStarts = academicYear.terms.map((term) =>
      toDakarDateKey(term.startDate),
    );
    const termEnds = academicYear.terms.map((term) =>
      toDakarDateKey(term.endDate),
    );
    const startDate = academicYear.startsOn
      ? toDakarDateKey(academicYear.startsOn)
      : (termStarts.sort()[0] ?? [...expectedByDate.keys()].sort()[0] ?? today);
    const endDate = academicYear.endsOn
      ? toDakarDateKey(academicYear.endsOn)
      : (termEnds.sort().at(-1) ??
        [...expectedByDate.keys()].sort().at(-1) ??
        today);
    const scheduledXof = [...expectedByDate.values()].reduce(
      (sum, amount) => sum + amount,
      0,
    );
    const collectedXof = [...cashByDate.entries()]
      .filter(([date]) => date <= today)
      .reduce((sum, [, amount]) => sum + amount, 0);

    const todayMs = Date.parse(`${today}T00:00:00.000Z`);
    const trailingStart = new Date(todayMs - 29 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const trailingEvents = [...cashByDate.entries()].filter(
      ([date]) => date >= trailingStart && date <= today,
    );
    const trailingSettlementDays = new Set(
      trailingEvents.filter(([, amount]) => amount > 0).map(([date]) => date),
    ).size;
    const allSettlementDays = new Set(
      [...cashByDate.entries()]
        .filter(
          ([date, amount]) => date >= startDate && date <= today && amount > 0,
        )
        .map(([date]) => date),
    ).size;
    let forecastStatus:
      "trailing_30_days" | "academic_year_to_date" | "insufficient_data" =
      "insufficient_data";
    let dailyRateXof: number | null = null;
    let settlementDayCount = trailingSettlementDays;
    if (trailingSettlementDays >= 3) {
      forecastStatus = "trailing_30_days";
      dailyRateXof = Math.max(
        0,
        trailingEvents.reduce((sum, [, amount]) => sum + amount, 0) / 30,
      );
    } else if (allSettlementDays > 0) {
      forecastStatus = "academic_year_to_date";
      settlementDayCount = allSettlementDays;
      const elapsedDays = Math.max(
        1,
        Math.floor(
          (todayMs - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000,
        ) + 1,
      );
      dailyRateXof = Math.max(0, collectedXof / elapsedDays);
    }
    if (!dailyRateXof) {
      forecastStatus = "insufficient_data";
      dailyRateXof = null;
    }

    const pointDates = new Set([
      startDate,
      ...expectedByDate.keys(),
      ...[...cashByDate.keys()].filter((date) => date <= today),
      today,
      endDate,
    ]);
    const dates = [...pointDates].sort();
    let expectedCumulativeXof = 0;
    let actualCumulativeXof = 0;
    const points = dates.map((date) => {
      expectedCumulativeXof += expectedByDate.get(date) ?? 0;
      if (date <= today) actualCumulativeXof += cashByDate.get(date) ?? 0;
      const forecastDays = Math.max(
        0,
        Math.floor(
          (Date.parse(`${date}T00:00:00.000Z`) - todayMs) / 86_400_000,
        ),
      );
      return {
        date,
        expectedCumulativeXof,
        actualCumulativeXof: date <= today ? actualCumulativeXof : null,
        forecastCumulativeXof:
          date < today || dailyRateXof === null
            ? null
            : Math.round(
                collectedXof +
                  Math.min(collectibleBalanceXof, dailyRateXof * forecastDays),
              ),
      };
    });
    return {
      academicYear: academicYear.label,
      asOfDate: today,
      currency: "XOF" as const,
      summary: {
        scheduledXof,
        collectedXof,
        varianceXof:
          collectedXof -
          points.filter((point) => point.date <= today).at(-1)!
            .expectedCumulativeXof,
        collectibleBalanceXof,
        unscheduledDebtXof,
      },
      forecast: {
        status: forecastStatus,
        dailyRateXof: dailyRateXof === null ? null : Math.round(dailyRateXof),
        settlementDayCount,
        cappedAtXof: collectedXof + collectibleBalanceXof,
      },
      points,
    };
  }

  /** Stable aggregate contract for the admin-only Director portal. */
  async directorPortalOverview() {
    const [
      activeStudents,
      faculty,
      staff,
      programs,
      applicants,
      pendingApprovals,
      activeHoldRows,
      aging,
      money,
    ] = await Promise.all([
      this.prisma.student.count({ where: { recordStatus: "active" } }),
      this.prisma.person.count({ where: { roles: { has: "faculty" } } }),
      this.prisma.person.count({
        where: { kind: "staff", NOT: { roles: { has: "faculty" } } },
      }),
      this.prisma.program.count(),
      this.prisma.applicant.count(),
      this.prisma.approvalRequest.count({ where: { status: "pending" } }),
      this.prisma.studentHold.findMany({
        where: { active: true },
        distinct: ["studentId"],
        select: { studentId: true },
      }),
      this.arAging(),
      this.directorOverview(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      people: { activeStudents, faculty, staff },
      academics: { programs },
      admissions: { applicants },
      approvals: { pending: pendingApprovals },
      holds: { activeStudents: activeHoldRows.length },
      receivables: {
        overdueAccounts: aging.accountCounts.overdue,
        overdueXof: aging.summary.overdueXof,
        outstandingXof: aging.summary.outstandingXof,
      },
      collections: {
        collectedXof: money.totals.moneyIn,
        expensesXof: money.totals.moneyOut,
        netCashXof: money.totals.net,
      },
      costCenters: money.centers.map((center) => ({
        code: center.code,
        name: center.name,
        revenueXof: center.revenue,
        expenseXof: center.expense,
        netXof: center.net,
      })),
    };
  }

  /** Director's institution-wide money-in vs money-out, by cost center and rolled up by group. */
  async directorOverview(fiscalYear = "FY2026") {
    const [centers, payments, expenseAgg, budgets] = await Promise.all([
      this.prisma.costCenter.findMany(),
      this.prisma.payment.findMany({
        where: { status: { in: ["success", "refunded"] } },
        include: {
          invoice: { select: { costCenterCode: true } },
          componentAllocations: {
            include: {
              invoiceComponent: { select: { costCenterCode: true } },
            },
          },
        },
      }),
      this.prisma.expense.groupBy({
        by: ["costCenterCode"],
        _sum: { amount: true },
      }),
      this.prisma.budget.findMany({ where: { fiscalYear } }),
    ]);

    const revenueByCc = new Map<string, number>();
    for (const p of payments) {
      if (p.componentAllocations.length > 0) {
        for (const allocation of p.componentAllocations) {
          const cc = allocation.invoiceComponent.costCenterCode;
          const net = allocation.amountXof - allocation.refundedAmountXof;
          revenueByCc.set(cc, (revenueByCc.get(cc) ?? 0) + net);
        }
      } else if (p.status === "success") {
        // Legacy settlement before component allocations were introduced.
        const cc = p.invoice.costCenterCode;
        revenueByCc.set(cc, (revenueByCc.get(cc) ?? 0) + p.amount);
      }
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
    if (diningRevenue > 0)
      revenueByCc.set("3600", (revenueByCc.get("3600") ?? 0) + diningRevenue);
    // Uses the CURRENT configured fee; historical fee changes will skew this management view
    // slightly until per-payment amounts are recorded for app fees.
    const feeRow = await this.prisma.feeItem.findUnique({
      where: { key: "application_fee" },
    });
    const appFeeRevenue =
      paidApplicants * (feeRow?.minXof ?? FEE_STRUCTURE.applicationFee);
    if (appFeeRevenue > 0)
      revenueByCc.set("4200", (revenueByCc.get("4200") ?? 0) + appFeeRevenue);
    // Standalone payment links (no invoice) carry their own cost center; invoice-linked ones
    // are already counted through their Payment above.
    const linkAgg = await this.prisma.paymentLink.groupBy({
      by: ["costCenterCode"],
      where: { status: "paid", invoiceId: null },
      _sum: { amountXof: true },
    });
    for (const l of linkAgg) {
      revenueByCc.set(
        l.costCenterCode,
        (revenueByCc.get(l.costCenterCode) ?? 0) + (l._sum.amountXof ?? 0),
      );
    }
    const expenseByCc = new Map<string, number>();
    for (const e of expenseAgg)
      expenseByCc.set(e.costCenterCode, e._sum.amount ?? 0);

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
      totals: {
        moneyIn,
        moneyOut,
        net: moneyIn - moneyOut,
        cashPosition: moneyIn - moneyOut,
      },
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
  async refundPayment(
    paymentId: string,
    reason: string | undefined,
    actorId: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: true,
        invoice: true,
        student: { include: { person: true } },
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status === "refunded") {
      return { ok: true, refundedAmount: payment.amount, gatewayRefund: false };
    }
    const requiresGatewayRefund =
      payment.provider === this.provider.name && Boolean(this.provider.refund);
    const resumesInternalRefund =
      payment.status === "refund_pending" && !requiresGatewayRefund;
    if (payment.status === "refund_pending" && requiresGatewayRefund) {
      throw new BadRequestException(
        "This gateway refund needs Finance reconciliation before it can be retried",
      );
    }
    if (payment.status !== "success" && !resumesInternalRefund)
      throw new BadRequestException("Only successful payments can be refunded");

    // Claim before touching the gateway. Concurrent requests cannot both refund,
    // and a gateway rejection leaves invoice/installment/component ledgers intact.
    if (!resumesInternalRefund) {
      const refundClaim = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: "success" },
        data: { status: "refund_pending" },
      });
      if (refundClaim.count === 0) {
        throw new BadRequestException("This payment is no longer refundable");
      }
    }

    let gateway: { ok: boolean; ref?: string } = { ok: false };
    if (requiresGatewayRefund) {
      try {
        gateway = await this.provider.refund!(
          payment.providerRef,
          payment.amount,
        );
      } catch (error) {
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: "refund_pending" },
          data: { status: "success" },
        });
        throw new BadRequestException(
          `The payment gateway did not confirm the refund: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
      if (!gateway.ok) {
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: "refund_pending" },
          data: { status: "success" },
        });
        throw new BadRequestException(
          "The payment gateway did not confirm the refund",
        );
      }
    }

    // Re-read the payment, invoice, allocations and credit memo inside the same
    // serializable transaction that performs the reversal. A different payment may
    // settle this invoice after the refund screen loads; subtracting from the stale
    // pre-transaction invoice total would otherwise erase that newer payment.
    const runRefund = () =>
      this.prisma.$transaction(
        async (tx) => {
          const current = await tx.payment.findUnique({
            where: { id: payment.id },
            include: {
              allocations: true,
              componentAllocations: true,
              invoice: true,
            },
          });
          if (!current) throw new NotFoundException("Payment not found");
          if (current.status === "refunded") return false;
          if (current.status !== "refund_pending") {
            throw new BadRequestException(
              "The refund is not in a claimable state",
            );
          }

          const creditMemo = await tx.invoice.findUnique({
            where: { number: `CR-PAY-${current.id}` },
          });
          const creditMemoXof =
            creditMemo && creditMemo.status !== "void"
              ? Math.max(0, -creditMemo.totalAmount)
              : 0;
          const directAppliedXof = Math.max(0, current.amount - creditMemoXof);

          const claimed = await tx.payment.updateMany({
            where: { id: current.id, status: "refund_pending" },
            data: { status: "refunded", refundedAt: new Date() },
          });
          if (claimed.count === 0) return false;

          for (const allocation of current.componentAllocations ?? []) {
            await tx.paymentComponentAllocation.update({
              where: { id: allocation.id },
              data: { refundedAmountXof: allocation.amountXof },
            });
          }

          for (const allocation of current.allocations) {
            const installment = await tx.installment.findUniqueOrThrow({
              where: { id: allocation.installmentId },
            });
            const newPaid = Math.max(
              0,
              installment.amountPaid - allocation.amount,
            );
            await tx.installment.update({
              where: { id: installment.id },
              data: {
                amountPaid: newPaid,
                status: projectedInstallmentStatus({
                  dueDate: installment.dueDate,
                  amountDue: installment.amountDue,
                  amountPaid: newPaid,
                }),
              },
            });
          }

          const newInvoicePaid = Math.max(
            0,
            current.invoice.amountPaid - directAppliedXof,
          );
          if (directAppliedXof > 0) {
            await tx.invoice.update({
              where: { id: current.invoice.id },
              data: {
                amountPaid: newInvoicePaid,
                revision: { increment: 1 },
                status:
                  current.invoice.status === "void"
                    ? "void"
                    : newInvoicePaid >= current.invoice.totalAmount
                      ? "paid"
                      : newInvoicePaid > 0
                        ? "partial"
                        : "open",
              },
            });
          }
          if (directAppliedXof === 0) {
            await tx.invoice.update({
              where: { id: current.invoice.id },
              data: { revision: { increment: 1 } },
            });
          }
          if (creditMemo && creditMemo.status !== "void") {
            await tx.invoice.update({
              where: { id: creditMemo.id },
              data: { status: "void" },
            });
          }
          await tx.auditLog.create({
            data: {
              entity: "Payment",
              entityId: current.id,
              action: "refunded",
              actorId,
              data: {
                amount: current.amount,
                directAppliedXof,
                creditMemoXof,
                creditMemoInvoiceId: creditMemo?.id ?? null,
                reason: reason ?? null,
              },
            },
          });
          return true;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

    let didRefund = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        didRefund = await runRefund();
        break;
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }

    if (!didRefund) {
      return { ok: true, refundedAmount: payment.amount, gatewayRefund: false };
    }

    await this.mail.send({
      to: payment.student.person.email,
      subject: "Your DAUST payment has been refunded",
      html: `<h2>Refund processed</h2><p>Hi ${payment.student.person.firstName}, a refund of <strong>${payment.amount.toLocaleString("en-US")} XOF</strong> has been recorded${reason ? ` (${reason})` : ""}. Your balance has been updated accordingly.</p>`,
    });

    return {
      ok: true,
      refundedAmount: payment.amount,
      gatewayRefund: gateway.ok,
    };
  }

  /** Accounts-receivable aging from the canonical per-account position (credits never cross accounts). */
  async arAging() {
    const students = await this.prisma.student.findMany({
      include: {
        person: true,
        holds: { where: { active: true }, select: { id: true } },
        invoices: {
          include: {
            term: true,
            plan: { include: { installments: true } },
          },
        },
      },
    });
    const now = new Date();
    const buckets = [
      {
        key: "current",
        label: "Current / not yet due",
        amount: 0,
        count: 0,
        accounts: new Set<string>(),
        installments: new Set<string>(),
      },
      {
        key: "1-30",
        label: "1–30 days",
        amount: 0,
        count: 0,
        accounts: new Set<string>(),
        installments: new Set<string>(),
      },
      {
        key: "31-60",
        label: "31–60 days",
        amount: 0,
        count: 0,
        accounts: new Set<string>(),
        installments: new Set<string>(),
      },
      {
        key: "61-90",
        label: "61–90 days",
        amount: 0,
        count: 0,
        accounts: new Set<string>(),
        installments: new Set<string>(),
      },
      {
        key: "90+",
        label: "Over 90 days",
        amount: 0,
        count: 0,
        accounts: new Set<string>(),
        installments: new Set<string>(),
      },
      {
        key: "unscheduled",
        label: "Unscheduled",
        amount: 0,
        count: 0,
        accounts: new Set<string>(),
        installments: new Set<string>(),
      },
    ];
    const rows: {
      studentId: string;
      student: string;
      studentNo: string;
      term: string;
      invoiceId: string;
      installmentId: string | null;
      sequence: number | null;
      dueDate: string | null;
      dueState: "unscheduled" | "not_yet_due" | "due_today" | "overdue";
      amountDue: number;
      amountPaid: number;
      daysOverdue: number;
      outstanding: number;
    }[] = [];
    const summaries: AccountBalanceSummary[] = [];
    const includedAccountIds = new Set<string>();
    const heldAccountIds = new Set<string>();
    for (const student of students) {
      const position = deriveApiAccountPosition(student.invoices, now);
      if (
        student.recordStatus === "archived" &&
        position.summary.outstandingXof <= 0
      ) {
        continue;
      }
      summaries.push(position.summary);
      includedAccountIds.add(student.id);
      if (student.holds.length > 0) heldAccountIds.add(student.id);
      if (position.summary.outstandingXof <= 0) continue;
      const invoicesById = new Map(
        student.invoices.map((invoice) => [invoice.id, invoice] as const),
      );
      for (const line of position.installments) {
        if (line.outstandingXof <= 0) continue;
        const bucketKey =
          line.dueState === "unscheduled"
            ? "unscheduled"
            : line.dueState !== "overdue"
              ? "current"
              : line.daysPastDue <= 30
                ? "1-30"
                : line.daysPastDue <= 60
                  ? "31-60"
                  : line.daysPastDue <= 90
                    ? "61-90"
                    : "90+";
        const bucket = buckets.find(({ key }) => key === bucketKey)!;
        bucket.amount += line.outstandingXof;
        bucket.count += 1;
        bucket.accounts.add(student.id);
        if (line.installmentId) bucket.installments.add(line.installmentId);
        const invoice = invoicesById.get(line.invoiceId);
        rows.push({
          studentId: student.id,
          student: `${student.person.firstName} ${student.person.lastName}`,
          studentNo: student.studentNo,
          term: invoice?.term.name ?? "—",
          invoiceId: line.invoiceId,
          installmentId: line.installmentId,
          sequence: line.sequence,
          dueDate: line.dueDate,
          dueState: line.dueState,
          amountDue: line.amountDueXof,
          amountPaid: line.amountPaidXof + line.creditAppliedXof,
          daysOverdue: line.daysPastDue,
          outstanding: line.outstandingXof,
        });
      }
    }
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const summary = aggregateAccountReport(summaries);
    return {
      buckets: buckets.map(
        ({ key, label, amount, count, accounts, installments }) => ({
          key,
          label,
          amount,
          count,
          accountCount: accounts.size,
          installmentCount: installments.size,
        }),
      ),
      totalOutstanding: summary.outstandingXof,
      accountCount: includedAccountIds.size,
      installmentCount: new Set(rows.flatMap((row) => row.installmentId ?? []))
        .size,
      accountCounts: {
        noBilling: summaries.filter((item) => item.standing === "no_billing")
          .length,
        credit: summaries.filter((item) => item.standing === "credit").length,
        cleared: summaries.filter((item) => item.standing === "cleared").length,
        onTime: summaries.filter((item) => item.standing === "on_time").length,
        unscheduled: summaries.filter((item) => item.standing === "unscheduled")
          .length,
        overdue: summaries.filter((item) => item.standing === "overdue").length,
      },
      activeHoldAccountCount: heldAccountIds.size,
      summary,
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
      paidAt: p.settledAt ?? p.updatedAt,
      refundedAt: p.refundedAt,
      source: p.source,
      initiatedByEmail: p.initiatedByEmail,
      allocations: p.allocations.map((a) => ({
        sequence: a.installment.sequence,
        amount: a.amount,
      })),
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
    for (const p of succeeded)
      byTerm.set(p.term, (byTerm.get(p.term) ?? 0) + p.amount);

    return {
      collections: summary,
      aging,
      paymentsByMethod: summary.byMethod,
      revenueByTerm: [...byTerm.entries()].map(([term, amount]) => ({
        term,
        amount,
      })),
      cashByCostCenter: director.centers.filter(
        (c) => c.revenue > 0 || c.expense > 0,
      ),
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
    let linkedStudentId = input.studentId;
    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: input.invoiceId },
        select: { id: true, studentId: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (input.studentId && invoice.studentId !== input.studentId) {
        throw new BadRequestException(
          "Invoice does not belong to that student",
        );
      }
      linkedStudentId = invoice.studentId;
      const account = await this.loadPayableAccount(invoice.studentId);
      this.requirePayableTarget(account, input.amountXof, invoice.id);
    }
    if (input.costCenterCode) {
      const cc = await this.prisma.costCenter.findUnique({
        where: { code: input.costCenterCode },
      });
      if (!cc) throw new BadRequestException("Unknown cost center");
    }

    const link = await this.prisma.paymentLink.create({
      data: {
        token: randomBytes(18).toString("hex"),
        amountXof: input.amountXof,
        purpose: input.purpose,
        payeeName: input.payeeName,
        payeeMeta: input.payeeMeta ?? null,
        studentId: linkedStudentId ?? null,
        invoiceId: input.invoiceId ?? null,
        costCenterCode: input.costCenterCode ?? "9100",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "PaymentLink",
        entityId: link.id,
        action: "link-created",
        actorId,
        data: {
          amountXof: input.amountXof,
          purpose: input.purpose,
          invoiceId: input.invoiceId ?? null,
        },
      },
    });
    return { ...link, url: `${loadEnv().PORTAL_ORIGIN}/pay/${link.token}` };
  }

  async listPaymentLinks() {
    const links = await this.prisma.paymentLink.findMany({
      orderBy: { createdAt: "desc" },
    });
    const now = Date.now();
    return links.map((l) => ({
      ...l,
      url: `${loadEnv().PORTAL_ORIGIN}/pay/${l.token}`,
      expired:
        l.status === "active" &&
        l.expiresAt !== null &&
        l.expiresAt.getTime() < now,
    }));
  }

  async cancelPaymentLink(id: string, actorId: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.status === "paid") throw new BadRequestException("Already paid");
    const updated = await this.prisma.paymentLink.update({
      where: { id },
      data: { status: "cancelled" },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "PaymentLink",
        entityId: id,
        action: "link-cancelled",
        actorId,
      },
    });
    return updated;
  }

  /** Bank-transfer / offline settlement: bursar verified the money arrived out of band. */
  async markPaymentLinkPaid(id: string, actorId: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.status !== "active")
      throw new BadRequestException(`Link is ${link.status}`);

    if (link.invoiceId) {
      const linkedInvoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: link.invoiceId },
        select: { studentId: true },
      });
      const studentId = link.studentId ?? linkedInvoice.studentId;
      const account = await this.loadPayableAccount(studentId);
      this.requirePayableTarget(account, link.amountXof, link.invoiceId);
      const payment = await this.prisma.payment.upsert({
        where: { providerRef: `PLINK-${link.id}` },
        update: {},
        create: {
          invoiceId: link.invoiceId,
          studentId,
          amount: link.amountXof,
          method: "card", // schema enum has no bank type; the link record carries method="manual"
          status: "pending",
          providerRef: `PLINK-${link.id}`,
          source: "finance_manual",
          initiatedById: actorId,
        },
      });
      await this.settlePayment(payment.id, { via: "manual", actorId });
    }

    const updated = await this.prisma.paymentLink.update({
      where: { id },
      data: { status: "paid", method: "manual", paidAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "PaymentLink",
        entityId: id,
        action: "link-paid-manual",
        actorId,
      },
    });
    return updated;
  }

  /** Public: what the standalone pay page shows. Cancelled links 404; expiry is computed. */
  async getPublicLink(token: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: { wireTransfers: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!link || link.status === "cancelled")
      throw new NotFoundException("Link not found");
    const expired =
      link.status === "active" &&
      link.expiresAt !== null &&
      link.expiresAt.getTime() < Date.now();
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
      wireTransfer: link.wireTransfers[0]
        ? this.publicWireSummary(link.wireTransfers[0])
        : null,
    };
  }

  /** Public: start a gateway checkout for an active link. */
  async checkoutLink(token: string, method: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link || link.status === "cancelled")
      throw new NotFoundException("Link not found");
    if (link.status === "paid") throw new BadRequestException("Already paid");
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This payment link has expired");
    }
    if (
      await this.prisma.wireTransferSubmission.findFirst({
        where: { paymentLinkId: link.id, status: "submitted" },
      })
    ) {
      throw new BadRequestException(
        "A wire transfer is already under review for this payment link",
      );
    }

    const ref = `PLINK-${link.id}`;
    if (link.invoiceId) {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: link.invoiceId },
        select: { id: true, studentId: true },
      });
      const studentId = link.studentId ?? invoice.studentId;
      const account = await this.loadPayableAccount(studentId);
      const { amount } = this.requirePayableTarget(
        account,
        link.amountXof,
        invoice.id,
      );
      await this.prisma.payment.upsert({
        where: { providerRef: ref },
        update: {},
        create: {
          invoiceId: invoice.id,
          studentId,
          amount,
          method: (["wave", "orange_money", "card"].includes(method)
            ? method
            : "card") as never,
          status: "pending",
          providerRef: ref,
          source: "payment_link",
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

  private async settlePaymentLinkIpn(
    linkId: string,
    success: boolean,
    payload: object,
    method: string | null,
  ) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { id: linkId },
    });
    if (!link) return;

    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: `PLINK-${linkId}` },
    });
    if (!success) {
      if (payment?.status === "pending") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "cancelled", ipnPayload: payload },
        });
      }
      await this.prisma.auditLog.create({
        data: {
          entity: "PaymentLink",
          entityId: linkId,
          action: "link-payment-failed",
          data: payload,
        },
      });
      return;
    }

    if (payment)
      await this.settlePayment(payment.id, { via: "ipn", payload, method });
    if (link.status !== "paid") {
      await this.prisma.paymentLink.update({
        where: { id: linkId },
        data: {
          status: "paid",
          method: method ?? "unknown",
          paidAt: new Date(),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          entity: "PaymentLink",
          entityId: linkId,
          action: "link-paid",
          data: payload,
        },
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
      include: {
        term: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
        wireTransfers: {
          where: { status: "submitted" },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    const position = deriveApiAccountPosition(invoices);
    const payableTarget = selectOldestPayableTarget(invoices, position);
    const grossCreditXof = invoices
      .filter((invoice) => invoice.totalAmount < 0)
      .reduce((sum, invoice) => sum - invoice.totalAmount, 0);
    const invoicesById = new Map(
      invoices.map((invoice) => [invoice.id, invoice] as const),
    );
    const charges = position.installments.map((line) => {
      const invoice = invoicesById.get(line.invoiceId)!;
      return {
        label:
          invoice.description ??
          (line.sequence
            ? `${invoice.term.name} · installment ${line.sequence}`
            : invoice.term.name),
        dueDate: line.dueDate,
        amountXof: line.amountDueXof,
        paidXof: line.amountPaidXof,
        creditAppliedXof: line.creditAppliedXof,
        effectiveSettledXof: line.amountPaidXof + line.creditAppliedXof,
        outstandingXof: line.outstandingXof,
        status: legacyInstallmentStatus(line),
        paymentProgress: line.paymentProgress,
        dueState: line.dueState,
        daysPastDue: line.daysPastDue,
      };
    });
    return {
      studentName: `${student.person.firstName} ${student.person.lastName}`
        .replace(/\s+/g, " ")
        .trim(),
      studentNo: student.studentNo,
      program: student.program?.name ?? null,
      term: invoices[0]?.term.name ?? null,
      balanceXof: position.summary.balanceXof,
      outstandingXof: position.summary.outstandingXof,
      payableXof: payableTarget?.invoicePayableXof ?? 0,
      creditXof: grossCreditXof,
      dueDate:
        position.summary.oldestOverdueDate ?? position.summary.nextDueDate,
      summary: position.summary,
      charges,
      pendingWires: invoices.flatMap((invoice) =>
        invoice.wireTransfers.map((wire) => this.publicWireSummary(wire)),
      ),
    };
  }

  /** Public: start a PayTech checkout of `amountXof` toward the student's oldest open invoice. */
  async checkoutBill(
    studentNo: string,
    dob: string,
    amountXof: number,
    method: string,
  ) {
    const student = await this.findStudentForBill(studentNo, dob);
    const account = await this.loadPayableAccount(student.id);
    const { amount, invoice } = this.requirePayableTarget(account, amountXof);
    if (
      await this.prisma.wireTransferSubmission.findFirst({
        where: { invoiceId: invoice.id, status: "submitted" },
      })
    ) {
      throw new BadRequestException(
        "A wire transfer is already under review for this charge",
      );
    }
    const ref = `BILL-${randomUUID()}`;
    await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: student.id,
        amount,
        method: (["wave", "orange_money", "card"].includes(method)
          ? method
          : "card") as never,
        status: "pending",
        providerRef: ref,
        source: "public_bill",
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
  private async settleBillIpn(
    ref: string,
    success: boolean,
    payload: object,
    method: string | null,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: ref },
    });
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
      !!student?.dateOfBirth &&
      student.dateOfBirth.toISOString().slice(0, 10) === dob.slice(0, 10);
    if (!ok) {
      recentFails.push(now);
      this.failedBillLookups.set(key, recentFails);
      throw new NotFoundException(
        "No account matches that ID and date of birth",
      );
    }
    this.failedBillLookups.delete(key); // reset the counter on a successful match
    return student;
  }

  private async audit(
    entityId: string,
    action: string,
    data: unknown,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { entity: "Payment", entityId, action, data: data as object },
    });
  }
}

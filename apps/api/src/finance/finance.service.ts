import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import {
  COST_CENTER_TUITION,
  FEE_STRUCTURE,
  normalizeStudentNumber,
  WirePaymentConfig as WirePaymentConfigSchema,
  splitEvenXof,
  toDakarDateKey,
  type CreatePaymentPlanInput,
  type AccountBalanceSummary,
  type WireApprovalInput,
  type WirePaymentConfig,
} from "@mydaust/shared";
import { requirePersonEmail } from "../auth/person-email.js";
import { assertActiveApplicantPaymentCapability } from "../admissions/applicant-payment-capability.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
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
import { displayFeeComponentLabel } from "./fee-components.js";
import {
  assertCurrentEnrollmentInvoicePaymentInTransaction,
  assertCurrentOnboardingPaymentLinkInTransaction,
  syncEnrollmentGateInTransaction,
  type EnrollmentActivation,
  verifiedEnrollmentCashXof,
} from "./admission-payment-gate.js";
import {
  isRunRateEligibleCashRecognition,
  paymentCashRecognition,
  paymentDateProjection,
} from "./payment-cash-recognition.js";
import { externalReferenceFingerprintSha256 } from "./payment-reference.js";
import { normalizeExternalReference } from "./historical-payment-import.manifest.js";
import { BillingProfileService } from "./billing-profile.service.js";

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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

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
  private readonly billingProfiles: BillingProfileService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly wireProofs: WireProofStorage,
    @Inject(REQUEST_TO_PAY_PROVIDERS)
    private readonly rtpRails: RequestToPayRegistry,
    @Optional() billingProfiles?: BillingProfileService,
  ) {
    this.billingProfiles = billingProfiles ?? new BillingProfileService(prisma);
  }

  getBillingProfile(studentId: string, academicYearLabel?: string) {
    return this.billingProfiles.get(studentId, academicYearLabel);
  }

  getBillingProfileOptions(academicYearLabel?: string) {
    return this.billingProfiles.options(academicYearLabel);
  }

  getBillingCatalog(academicYearLabel?: string) {
    return this.billingProfiles.catalog(academicYearLabel);
  }

  listBillingCatalogYears() {
    return this.prisma.academicYear.findMany({
      orderBy: [{ startsOn: "desc" }, { label: "desc" }],
      select: {
        id: true,
        label: true,
        status: true,
        startsOn: true,
        endsOn: true,
      },
    });
  }

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
    const active = await this.prisma.paymentSubmission.findFirst({
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
      const created = await tx.paymentSubmission.create({
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
      requirePersonEmail(invoice.student.person.email, "Student"),
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
    const active = await this.prisma.paymentSubmission.findFirst({
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
      const created = await tx.paymentSubmission.create({
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
        plan: {
          include: {
            installments: {
              orderBy: { sequence: "asc" },
              include: {
                components: {
                  include: {
                    invoiceComponent: { select: { kind: true, label: true } },
                  },
                },
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          include: {
            submission: { select: { bankReference: true } },
          },
        },
        paymentSubmissions: { orderBy: { createdAt: "desc" } },
      },
    });
    const position = deriveApiAccountPosition(invoices);
    const derived = derivedInstallmentsById(position);
    // Voided invoices remain in the Finance ledger and cutover provenance, but
    // they are not a second student payment schedule. This projection is the
    // student-facing current account only.
    return invoices
      .filter((inv) => inv.status !== "void")
      .map((inv) => {
        const summary = invoicePositionSummary(position, inv.id);
        return {
          id: inv.id,
          createdAt: inv.createdAt,
          label:
            inv.packageType === "standard_full"
              ? "Annual fee schedule"
              : inv.description?.trim() || `${inv.term.name} charges`,
          description: inv.description,
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
          installments: (inv.plan?.installments ?? []).map((installment) => ({
            ...decorateInstallment(installment, derived),
            components: (installment.components ?? []).map((component) => ({
              id: component.id,
              invoiceComponentId: component.invoiceComponentId,
              componentKey: component.invoiceComponent.kind,
              label:
                component.invoiceComponent.label ||
                displayFeeComponentLabel(component.invoiceComponent.kind),
              amountXof: component.amountDue,
            })),
          })),
          payments: inv.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            status: p.status,
            providerRef: p.providerRef,
            transactionReference: p.submission?.bankReference ?? null,
            source: p.source,
            initiatedByEmail: p.initiatedByEmail,
            ...paymentDateProjection(p),
            refundedAt: p.refundedAt,
            createdAt: p.createdAt,
          })),
          wireTransfers: inv.paymentSubmissions
            .filter((submission) => submission.source !== "finance_manual")
            .map((submission) => this.wireSummary(submission)),
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
        components: [],
        packageTotalXof: 0,
        totals: { full: 0, tuition: 0, housing: 0, cafeteria: 0 },
      };

    const schedule = await this.prisma.feeSchedule.findFirst({
      where: { academicYearLabel: year, status: "approved" },
      orderBy: { revision: "desc" },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] },
      },
    });
    const rows = schedule?.rows ?? [];
    return {
      academicYearLabel: year,
      scheduleId: schedule?.id ?? null,
      revision: schedule?.revision ?? null,
      status: schedule?.status ?? null,
      approvedAt: schedule?.approvedAt ?? null,
      rows,
      components: schedule?.components ?? [],
      packageTotalXof: (schedule?.components ?? [])
        .filter((component) => component.defaultSelected)
        .reduce((sum, component) => sum + component.annualAmountXof, 0),
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

  /**
   * Apply a successful payment: allocate to installments oldest-due-first, roll up the invoice,
   * audit, and email the receipt. Idempotent (no-op when already success). Shared by the IPN
   * path, proof verification, and Finance's direct received-payment workflow.
   */
  private async settlePayment(
    paymentId: string,
    opts: {
      via: "ipn" | "manual" | "wire" | "pi_spi" | "finance_manual";
      payload?: object;
      method?: string | null;
      actorId?: string;
      confirmedAmount?: number;
      /** Create-and-settle keeps a cashier entry atomic and retryable by its UUID. */
      createPayment?: {
        invoiceId: string;
        studentId: string;
        amount: number;
        method: "cash" | "wave" | "orange_money";
        providerRef: string;
        externalReferenceFingerprintSha256: string | null;
        source: "finance_manual";
        initiatedById: string;
        initiatedByEmail: string | null;
      };
      /** Approved review row retained for the Director's post-hoc audit queue. */
      financeRecord?: {
        id: string;
        contactEmail: string;
        transactionReference: string | null;
        reviewedByName: string;
        reviewedByEmail: string;
      };
      /** A signed provider event is real cash even if its onboarding link was rotated locally. */
      providerConfirmedStaleOnboarding?: boolean;
      /** Set when a request-to-pay settled, so the rail row and link flip with the money. */
      piSpiReview?: {
        id: string;
        paymentLinkId?: string | null;
        end2endId?: string | null;
      };
      wireReview?: {
        id: string;
        paymentLinkId?: string | null;
        method?: "wave" | "orange_money" | "wire";
        bankReference?: string;
        confirmationNote?: string;
        reviewedByName: string;
        reviewedByEmail: string;
        verificationProof?: {
          objectKey: string;
          fileName: string;
          mimeType: string;
          size: number;
        };
      };
    },
  ) {
    const runSettlement = () =>
      this.prisma.$transaction(
        async (tx) => {
          let payment = await tx.payment.findUnique({
            where: { id: paymentId },
          });
          if (!payment && opts.createPayment) {
            payment = await tx.payment.create({
              data: {
                id: paymentId,
                ...opts.createPayment,
                status: "pending",
                provider: "finance_manual",
                ...(opts.payload ? { ipnPayload: opts.payload as never } : {}),
              },
            });
          }
          if (!payment) throw new NotFoundException("Payment not found");
          if (
            opts.createPayment &&
            (payment.invoiceId !== opts.createPayment.invoiceId ||
              payment.studentId !== opts.createPayment.studentId ||
              payment.amount !== opts.createPayment.amount ||
              payment.method !== opts.createPayment.method ||
              payment.providerRef !== opts.createPayment.providerRef ||
              payment.source !== opts.createPayment.source ||
              payment.externalReferenceFingerprintSha256 !==
                opts.createPayment.externalReferenceFingerprintSha256)
          ) {
            throw new BadRequestException(
              "That payment request was already used with different details",
            );
          }
          if (payment.status === "success") {
            return { didSettle: false, activation: null };
          }
          if (
            (payment.status === "cancelled" || payment.status === "failed") &&
            opts.providerConfirmedStaleOnboarding
          ) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: "pending" },
            });
          } else if (payment.status !== "pending") {
            throw new BadRequestException(`Payment is ${payment.status}`);
          }
          const amount = opts.confirmedAmount ?? payment.amount;
          if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new BadRequestException(
              "Settled amount must be a positive whole number of XOF",
            );
          }
          const reviewedPaymentLinkId =
            opts.wireReview?.paymentLinkId ??
            opts.piSpiReview?.paymentLinkId ??
            null;
          let staleVerifiedOnboardingProof: {
            applicantId: string;
            studentId: string;
            paymentLinkId: string;
          } | null = null;
          if (reviewedPaymentLinkId && !opts.providerConfirmedStaleOnboarding) {
            const reviewedLink = opts.wireReview
              ? await tx.paymentLink.findUnique({
                  where: { id: reviewedPaymentLinkId },
                  include: { onboardingApplicant: true },
                })
              : null;
            const onboarding = reviewedLink?.onboardingApplicant;
            if (reviewedLink && onboarding) {
              if (
                reviewedLink.invoiceId !== payment.invoiceId ||
                reviewedLink.studentId !== payment.studentId ||
                onboarding.enrollmentInvoiceId !== payment.invoiceId ||
                onboarding.studentId !== payment.studentId
              ) {
                throw new BadRequestException(
                  "Enrollment payment proof does not match its accounting target",
                );
              }
              const isCurrent =
                reviewedLink.status === "active" &&
                onboarding.onboardingStatus === "payment_pending" &&
                onboarding.activeOnboardingPaymentLinkId === reviewedLink.id;
              if (isCurrent) {
                await assertCurrentOnboardingPaymentLinkInTransaction(
                  tx,
                  reviewedPaymentLinkId,
                  amount,
                );
              } else {
                // Finance has independently verified evidence for an obsolete
                // enrollment link. Book the real cash, keep the obsolete link
                // closed, and flag the account for reconciliation below.
                staleVerifiedOnboardingProof = {
                  applicantId: onboarding.id,
                  studentId: payment.studentId,
                  paymentLinkId: reviewedLink.id,
                };
              }
            } else {
              await assertCurrentOnboardingPaymentLinkInTransaction(
                tx,
                reviewedPaymentLinkId,
                amount,
              );
            }
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
          if (opts.via === "wire" || opts.via === "finance_manual") {
            this.requirePayableTarget(account, amount, payment.invoiceId);
          }

          const claimed = await tx.payment.updateMany({
            where: { id: payment.id, status: "pending" },
            data: {
              status: "success",
              amount,
              method: (opts.method ?? payment.method) as typeof payment.method,
              settledAt: new Date(),
              ...(opts.payload ? { ipnPayload: opts.payload } : {}),
              ...(opts.wireReview?.bankReference
                ? {
                    externalReferenceFingerprintSha256:
                      externalReferenceFingerprintSha256(
                        opts.wireReview.method ?? opts.method ?? payment.method,
                        opts.wireReview.bankReference,
                      ),
                  }
                : {}),
            },
          });
          if (claimed.count === 0) {
            return { didSettle: false, activation: null };
          }

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
                      : opts.via === "finance_manual"
                        ? "received-and-recorded"
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
                transactionReference:
                  opts.financeRecord?.transactionReference ?? null,
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
                ...(opts.piSpiReview.end2endId
                  ? { end2endId: opts.piSpiReview.end2endId }
                  : {}),
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
            await tx.paymentSubmission.update({
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
                activeKey: null,
                ...(opts.wireReview.verificationProof
                  ? {
                      verificationProofObjectKey:
                        opts.wireReview.verificationProof.objectKey,
                      verificationProofFileName:
                        opts.wireReview.verificationProof.fileName,
                      verificationProofMimeType:
                        opts.wireReview.verificationProof.mimeType,
                      verificationProofSize:
                        opts.wireReview.verificationProof.size,
                    }
                  : {}),
              },
            });
            if (
              opts.wireReview.paymentLinkId &&
              !staleVerifiedOnboardingProof
            ) {
              await tx.paymentLink.update({
                where: { id: opts.wireReview.paymentLinkId },
                data: {
                  status: "paid",
                  method: opts.wireReview.method ?? "wire",
                  paidAt: new Date(),
                },
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
          if (opts.financeRecord) {
            const method = (opts.method ?? payment.method) as
              "cash" | "wave" | "orange_money";
            await tx.paymentSubmission.create({
              data: {
                id: opts.financeRecord.id,
                status: "approved",
                method,
                source: "finance_manual",
                studentId: payment.studentId,
                invoiceId: payment.invoiceId,
                paymentId: payment.id,
                submittedAmountXof: amount,
                confirmedAmountXof: amount,
                contactEmail: opts.financeRecord.contactEmail,
                submittedById: opts.actorId,
                submittedByEmail: opts.financeRecord.reviewedByEmail,
                bankSnapshot: {
                  method,
                  enabled: false,
                  label:
                    method === "cash"
                      ? "Cash"
                      : method === "wave"
                        ? "Wave"
                        : "Orange Money",
                  instructions: "Recorded directly by Finance",
                },
                bankReference: opts.financeRecord.transactionReference,
                reviewedById: opts.actorId,
                reviewedByName: opts.financeRecord.reviewedByName,
                reviewedByEmail: opts.financeRecord.reviewedByEmail,
                reviewedAt: new Date(),
              },
            });
            await tx.auditLog.create({
              data: {
                entity: "PaymentSubmission",
                entityId: opts.financeRecord.id,
                action: "recorded-by-finance",
                actorId: opts.actorId,
                data: {
                  paymentId: payment.id,
                  studentId: payment.studentId,
                  invoiceId: payment.invoiceId,
                  amountXof: amount,
                  method,
                  transactionReference: opts.financeRecord.transactionReference,
                },
              },
            });
          }
          const gate = await syncEnrollmentGateInTransaction(tx, {
            invoiceId: originalInvoice.id,
            paymentId: payment.id,
            actorId: opts.actorId,
            inFlightRotationPolicy: "preserve",
          });
          if (staleVerifiedOnboardingProof) {
            await tx.auditLog.create({
              data: {
                entity: "PaymentSubmission",
                entityId: opts.wireReview!.id,
                action: "stale-onboarding-proof-settlement-booked",
                actorId: opts.actorId,
                data: {
                  applicantId: staleVerifiedOnboardingProof.applicantId,
                  studentId: staleVerifiedOnboardingProof.studentId,
                  paymentLinkId: staleVerifiedOnboardingProof.paymentLinkId,
                  paymentId: payment.id,
                  amountXof: amount,
                },
              },
            });
            const existingHold = await tx.studentHold.findFirst({
              where: {
                studentId: staleVerifiedOnboardingProof.studentId,
                active: true,
                type: "payment_reconciliation",
              },
            });
            if (!existingHold) {
              await tx.studentHold.create({
                data: {
                  studentId: staleVerifiedOnboardingProof.studentId,
                  type: "payment_reconciliation",
                  reason:
                    "A payment proof from an obsolete enrollment link was verified; Finance review is required",
                },
              });
            }
          }
          return { didSettle: true, activation: gate?.activation ?? null };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

    let result: {
      didSettle: boolean;
      activation: EnrollmentActivation | null;
    } = { didSettle: false, activation: null };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await runSettlement();
        break;
      } catch (error) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : null;
        if (code === "P2002" && opts.createPayment && attempt < 2) continue;
        if (
          code === "P2002" &&
          (opts.createPayment?.externalReferenceFingerprintSha256 ||
            opts.wireReview?.bankReference)
        ) {
          throw new ConflictException(
            "This payment reference has already been recorded",
          );
        }
        if (code === "P2002" && opts.createPayment) {
          throw new ConflictException(
            "This payment request is already being processed; retry it shortly",
          );
        }
        if (code !== "P2034" || attempt === 2) throw error;
      }
    }

    if (result.didSettle) {
      // Money is already committed. Email/provider failures are deliberately
      // best-effort and must never make a successful settlement look rolled back.
      await Promise.allSettled([this.emailReceipt(paymentId)]);
    }
  }

  /** Settle an invoice-backed proof submission and its ledger rows in one transaction. */
  async settleVerifiedSubmission(input: {
    submissionId: string;
    paymentId: string;
    paymentLinkId?: string | null;
    method: "wave" | "orange_money" | "wire";
    amountXof: number;
    transactionReference: string;
    note?: string;
    reviewer: { personId: string; email: string; name: string };
    verificationProof: {
      objectKey: string;
      fileName: string;
      mimeType: string;
      size: number;
    };
  }) {
    await this.assertFinanceReferenceAvailable(
      input.method,
      input.transactionReference,
      input.paymentId,
    );
    await this.settlePayment(input.paymentId, {
      via: "manual",
      actorId: input.reviewer.personId,
      method: input.method,
      confirmedAmount: input.amountXof,
      wireReview: {
        id: input.submissionId,
        paymentLinkId: input.paymentLinkId,
        method: input.method,
        bankReference: input.transactionReference,
        confirmationNote: input.note,
        reviewedByName: input.reviewer.name,
        reviewedByEmail: input.reviewer.email,
        verificationProof: input.verificationProof,
      },
    });
    return { ok: true };
  }

  async listWireTransfers(status?: "submitted" | "approved" | "rejected") {
    const rows = await this.prisma.paymentSubmission.findMany({
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
    const wire = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!wire) throw new NotFoundException("Wire transfer not found");
    if (!wire.proofObjectKey || !wire.proofFileName || !wire.proofMimeType) {
      throw new NotFoundException("Transfer proof not found");
    }
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
    const wire = await this.prisma.paymentSubmission.findUnique({
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
        const claimed = await tx.paymentSubmission.updateMany({
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
    const wire = await this.prisma.paymentSubmission.findUnique({
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
      const claimed = await tx.paymentSubmission.updateMany({
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
    const target = input.paymentLinkId
      ? { paymentLinkId: input.paymentLinkId }
      : input.invoiceId
        ? { invoiceId: input.invoiceId }
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
    // format legacy redirect rails used (38 chars, which PI-SPI would reject).
    const txId = `PIS${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const expiresAt = new Date(
      Date.now() + loadEnv().PI_SPI_REQUEST_TTL_HOURS * 3600_000,
    );

    const createLocalRequest = () =>
      this.prisma.$transaction(
        async (tx) => {
          if (input.invoiceId) {
            const invoice = await tx.invoice.findUnique({
              where: { id: input.invoiceId },
              select: { id: true, studentId: true, status: true },
            });
            if (
              !invoice ||
              invoice.status === "void" ||
              (input.studentId && invoice.studentId !== input.studentId)
            ) {
              throw new BadRequestException(
                "This payment target is no longer available",
              );
            }
            if (input.source === "public_bill") {
              await assertCurrentEnrollmentInvoicePaymentInTransaction(
                tx,
                input.invoiceId,
                amount,
              );
            }
          }
          if (input.paymentLinkId) {
            await assertCurrentOnboardingPaymentLinkInTransaction(
              tx,
              input.paymentLinkId,
              amount,
            );
          }
          if (input.applicantId) {
            const applicant = await tx.applicant.findUnique({
              where: { id: input.applicantId },
              select: {
                feePaid: true,
                stage: true,
                onboardingStatus: true,
              },
            });
            assertActiveApplicantPaymentCapability(applicant);
            if (applicant.feePaid) {
              throw new BadRequestException("Application fee already paid");
            }
          }
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
              // Payment-link requests name the link as their single polymorphic target;
              // their Payment row above still carries the accounting invoice.
              invoiceId: input.paymentLinkId ? undefined : input.invoiceId,
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
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    let created: Awaited<ReturnType<typeof createLocalRequest>> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        created = await createLocalRequest();
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
    if (!created) {
      throw new Error("PI-SPI initiation transaction retry limit exhausted");
    }

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
    const target = await this.publicBillPaymentTarget(
      input.studentNo,
      input.dob,
      input.amountXof,
    );
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: target.invoiceId },
      select: { id: true, number: true, description: true },
    });
    return this.createPiSpiRequest({
      source: "public_bill",
      alias: input.alias,
      amountXof: target.amountXof,
      motif: `DAUST ${invoice.description ?? "tuition"}`,
      documentRef: invoice.number ?? undefined,
      studentId: target.studentId,
      invoiceId: invoice.id,
    });
  }

  /** Bursar-generated one-off payment link. */
  async submitPaymentLinkPiSpi(token: string, alias: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      include: { onboardingApplicant: { select: { id: true } } },
    });
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
        select: { id: true, studentId: true },
      });
      const studentId = link.studentId ?? linkedInvoice.studentId;
      if (link.onboardingApplicant) {
        return this.createPiSpiRequest({
          source: "payment_link",
          alias,
          amountXof: link.amountXof,
          motif: link.purpose || "DAUST enrollment payment",
          studentId,
          invoiceId: linkedInvoice.id,
          paymentLinkId: link.id,
        });
      }
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
   * as the application-fee checkout); there is no invoice, so settlement flips `feePaid`.
   */
  async submitApplicantPiSpi(
    applicantId: string,
    alias: string,
    amountXof: number,
  ) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
    });
    assertActiveApplicantPaymentCapability(applicant);
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
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      select: { stage: true, onboardingStatus: true },
    });
    assertActiveApplicantPaymentCapability(applicant);
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
      const bookLateOnboardingSettlement = async (
        onboarding: { id: string; studentId: string | null },
        reference: {
          paymentLinkId?: string | null;
          invoiceId?: string | null;
        },
      ) => {
        const amount = Math.min(
          event.amount ?? request.amountXof,
          request.amountXof,
        );
        if (request.paymentId) {
          await this.settlePayment(request.paymentId, {
            via: "pi_spi",
            method: "pi_spi",
            confirmedAmount: amount,
            payload: event as unknown as object,
            providerConfirmedStaleOnboarding: true,
            // Do not revive an obsolete link or void invoice; only the provider
            // request and canonical cash ledger become settled.
            piSpiReview: {
              id: request.id,
              end2endId: event.end2endId,
            },
          });
        }
        await this.prisma.$transaction(async (tx) => {
          await tx.auditLog.create({
            data: {
              entity: "PiSpiRequest",
              entityId: request.id,
              action: "late-onboarding-settlement-booked",
              data: {
                applicantId: onboarding.id,
                paymentLinkId: reference.paymentLinkId ?? null,
                invoiceId: reference.invoiceId ?? null,
                providerStatus: event.status,
                providerAmountXof: amount,
              },
            },
          });
          if (onboarding.studentId) {
            const existingHold = await tx.studentHold.findFirst({
              where: {
                studentId: onboarding.studentId,
                active: true,
                type: "payment_reconciliation",
              },
            });
            if (!existingHold) {
              await tx.studentHold.create({
                data: {
                  studentId: onboarding.studentId,
                  type: "payment_reconciliation",
                  reason:
                    "A cancelled enrollment payment request later reported a settlement; Finance review is required",
                },
              });
            }
          }
        });
      };

      if (request.paymentLinkId) {
        const paymentLink = await this.prisma.paymentLink.findUnique({
          where: { id: request.paymentLinkId },
          include: { onboardingApplicant: true },
        });
        const onboarding = paymentLink?.onboardingApplicant;
        if (
          onboarding &&
          (paymentLink?.status !== "active" ||
            onboarding.onboardingStatus !== "payment_pending" ||
            onboarding.activeOnboardingPaymentLinkId !== paymentLink.id)
        ) {
          await bookLateOnboardingSettlement(onboarding, {
            paymentLinkId: paymentLink.id,
          });
          return;
        }
      }
      if (request.invoiceId && !request.paymentLinkId) {
        const onboarding = await this.prisma.applicant.findUnique({
          where: { enrollmentInvoiceId: request.invoiceId },
          select: { id: true, studentId: true, onboardingStatus: true },
        });
        if (onboarding?.onboardingStatus === "cancelled") {
          await bookLateOnboardingSettlement(onboarding, {
            invoiceId: request.invoiceId,
          });
          return;
        }
      }
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
    const wire = await this.prisma.paymentSubmission.findUnique({
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
    const wire = await this.prisma.paymentSubmission.findUnique({
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
        submission: { select: { bankReference: true } },
      },
    });
    if (!p) return;
    const studentEmail = requirePersonEmail(p.student.person.email, "Student");
    const receiptReference =
      p.submission?.bankReference?.trim() || p.providerRef;
    await this.mail.send({
      to: studentEmail,
      subject: `Payment receipt — ${p.invoice.term.name}`,
      html: `
        <h2>Payment received</h2>
        <p>Hi ${p.student.person.firstName}, we've received your payment.</p>
        <table cellpadding="6">
          <tr><td><strong>Amount</strong></td><td>${p.amount.toLocaleString("en-US")} XOF</td></tr>
          <tr><td><strong>Method</strong></td><td>${p.method}</td></tr>
          <tr><td><strong>Reference</strong></td><td>${escapeHtml(receiptReference)}</td></tr>
          <tr><td><strong>Term</strong></td><td>${p.invoice.term.name}</td></tr>
        </table>
        <p>View the full receipt anytime in your myDAUST billing page.</p>`,
    });
    if (
      p.initiatedByEmail &&
      p.initiatedByEmail.toLowerCase() !== studentEmail.toLowerCase()
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
            <tr><td><strong>Reference</strong></td><td>${escapeHtml(receiptReference)}</td></tr>
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
        submission: { select: { bankReference: true } },
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
      transactionReference: p.submission?.bankReference ?? null,
      source: p.source,
      initiatedByEmail: p.initiatedByEmail,
      ...paymentDateProjection(p),
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
            include: {
              plan: { include: { installments: true } },
              componentOverrides: true,
            },
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

    const [invoices, activeHolds, pendingPlanChanges, billingProfile] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { studentId },
          orderBy: { createdAt: "desc" },
          include: {
            term: true,
            plan: {
              include: {
                installments: {
                  orderBy: { sequence: "asc" },
                  include: {
                    components: {
                      include: {
                        invoiceComponent: {
                          select: { kind: true, label: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            payments: {
              orderBy: { createdAt: "desc" },
              include: {
                submission: { select: { bankReference: true } },
              },
            },
            paymentSubmissions: { orderBy: { createdAt: "desc" } },
            components: {
              include: { allocations: true },
              orderBy: { kind: "asc" },
            },
            componentOverrides: true,
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
        this.billingProfiles.get(studentId),
      ]);

    const academicYears = [
      ...new Set(
        invoices.flatMap((invoice) =>
          invoice.academicYearLabel ? [invoice.academicYearLabel] : [],
        ),
      ),
    ];
    const schedules = academicYears.length
      ? await this.prisma.feeSchedule.findMany({
          where: {
            status: "approved",
            academicYearLabel: { in: academicYears },
          },
          orderBy: { revision: "desc" },
          include: {
            components: {
              orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
            },
          },
        })
      : [];
    const latestScheduleByYear = new Map<string, (typeof schedules)[number]>();
    for (const schedule of schedules) {
      if (!latestScheduleByYear.has(schedule.academicYearLabel)) {
        latestScheduleByYear.set(schedule.academicYearLabel, schedule);
      }
    }

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
      billingProfile,
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
        const invoiceComponents = inv.components ?? [];
        const selectedByKey = new Map(
          invoiceComponents.map((component) => [component.kind, component]),
        );
        const latestCatalog = inv.academicYearLabel
          ? (latestScheduleByYear.get(inv.academicYearLabel)?.components ?? [])
          : [];
        type AvailableComponent = {
          id: string | null;
          key: string;
          label: string;
          description: string | null;
          costCenterCode: string;
          annualAmountXof: number;
          defaultSelected: boolean;
          sortOrder: number;
          selected: boolean;
          invoiceComponentId: string | null;
          allocatedXof: number;
        };
        const availableByKey = new Map<string, AvailableComponent>(
          latestCatalog.map((component) => [
            component.key,
            {
              id: component.id,
              key: component.key,
              label: component.label,
              description: component.description,
              costCenterCode: component.costCenterCode,
              annualAmountXof: component.annualAmountXof,
              defaultSelected: component.defaultSelected,
              sortOrder: component.sortOrder,
              selected: (selectedByKey.get(component.key)?.amountXof ?? 0) > 0,
              invoiceComponentId: selectedByKey.get(component.key)?.id ?? null,
              allocatedXof: (
                selectedByKey.get(component.key)?.allocations ?? []
              ).reduce(
                (sum, allocation) =>
                  sum + allocation.amountXof - allocation.refundedAmountXof,
                0,
              ),
            },
          ]),
        );
        for (const component of invoiceComponents) {
          if (availableByKey.has(component.kind)) continue;
          availableByKey.set(component.kind, {
            id: component.scheduleComponentId,
            key: component.kind,
            label: component.label || displayFeeComponentLabel(component.kind),
            description: null,
            costCenterCode: component.costCenterCode,
            annualAmountXof: component.amountXof,
            defaultSelected: false,
            sortOrder: 999,
            selected: true,
            invoiceComponentId: component.id,
            allocatedXof: component.allocations.reduce(
              (sum, allocation) =>
                sum + allocation.amountXof - allocation.refundedAmountXof,
              0,
            ),
          });
        }
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
          hasIndividualComponentOverride:
            (inv.componentOverrides?.length ?? 0) > 0,
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
          installments: (inv.plan?.installments ?? []).map((installment) => ({
            ...decorateInstallment(installment, derived),
            components: (installment.components ?? []).map((component) => ({
              id: component.id,
              invoiceComponentId: component.invoiceComponentId,
              componentKey: component.invoiceComponent.kind,
              label:
                component.invoiceComponent.label ||
                displayFeeComponentLabel(component.invoiceComponent.kind),
              amountXof: component.amountDue,
            })),
          })),
          payments: inv.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            status: p.status,
            providerRef: p.providerRef,
            transactionReference: p.submission?.bankReference ?? null,
            source: p.source,
            initiatedByEmail: p.initiatedByEmail,
            ...paymentDateProjection(p),
            refundedAt: p.refundedAt,
            createdAt: p.createdAt,
          })),
          wireTransfers: inv.paymentSubmissions
            .filter((submission) => submission.source !== "finance_manual")
            .map((submission) => this.wireSummary(submission)),
          availableComponents: [...availableByKey.values()].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
          ),
          componentOverrides: inv.componentOverrides ?? [],
          components: invoiceComponents.map((component) => {
            const allocatedXof = component.allocations.reduce(
              (sum, allocation) =>
                sum + allocation.amountXof - allocation.refundedAmountXof,
              0,
            );
            return {
              id: component.id,
              key: component.kind,
              kind: component.kind,
              label:
                component.label || displayFeeComponentLabel(component.kind),
              costCenterCode: component.costCenterCode,
              amountXof: component.amountXof,
              allocatedXof,
              selected: component.amountXof > 0,
              scheduleComponentId: component.scheduleComponentId,
            };
          }),
        };
      }),
    };
  }

  private async assertFinanceReferenceAvailable(
    method: "wave" | "orange_money" | "wire",
    transactionReference: string,
    paymentId: string,
  ) {
    const fingerprint = externalReferenceFingerprintSha256(
      method,
      transactionReference,
    );
    if (!fingerprint) {
      throw new BadRequestException(
        "Transaction reference must contain at least one letter or number",
      );
    }
    const fingerprintMatch = await this.prisma.payment.findUnique({
      where: { externalReferenceFingerprintSha256: fingerprint },
      select: { id: true },
    });
    if (fingerprintMatch && fingerprintMatch.id !== paymentId) {
      throw new ConflictException(
        "This payment reference has already been recorded",
      );
    }

    // References verified before the fingerprint column was populated remain
    // authoritative evidence. Compare their normalized values before posting.
    const normalized = normalizeExternalReference(transactionReference)!;
    const legacyRows = await this.prisma.paymentSubmission.findMany({
      where: {
        method,
        status: "approved",
        bankReference: { not: null },
      },
      select: { paymentId: true, bankReference: true },
    });
    const legacyMatch = legacyRows.find(
      (row) => normalizeExternalReference(row.bankReference) === normalized,
    );
    if (legacyMatch && legacyMatch.paymentId !== paymentId) {
      throw new ConflictException(
        "This payment reference has already been recorded",
      );
    }
    return fingerprint;
  }

  /**
   * Post money already received by a named Finance staff member. The browser UUID
   * makes retries idempotent; mobile references independently prevent double entry.
   */
  async recordStudentPayment(input: {
    studentId: string;
    amountXof: number;
    method: "cash" | "wave" | "orange_money";
    transactionReference?: string;
    idempotencyKey: string;
    actor: { personId: string; email: string; name: string };
  }) {
    const paymentId = input.idempotencyKey.toLowerCase();
    const providerRef = `FINANCE-MANUAL-${paymentId}`;
    const transactionReference =
      input.method === "cash"
        ? null
        : input.transactionReference?.trim() || null;
    if (input.method === "cash" && input.transactionReference?.trim()) {
      throw new BadRequestException(
        "Cash payments do not use a transaction reference",
      );
    }
    if (input.method !== "cash" && !transactionReference) {
      throw new BadRequestException(
        "A transaction reference is required for mobile money",
      );
    }
    if (!Number.isSafeInteger(input.amountXof) || input.amountXof <= 0) {
      throw new BadRequestException(
        "Amount must be a positive whole number of XOF",
      );
    }

    const expectedFingerprint = transactionReference
      ? externalReferenceFingerprintSha256(input.method, transactionReference)
      : null;
    if (transactionReference && !expectedFingerprint) {
      throw new BadRequestException(
        "Transaction reference must contain at least one letter or number",
      );
    }
    const existing = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        invoiceId: true,
        studentId: true,
        amount: true,
        method: true,
        status: true,
        source: true,
        providerRef: true,
        externalReferenceFingerprintSha256: true,
      },
    });
    if (
      existing &&
      (existing.studentId !== input.studentId ||
        existing.amount !== input.amountXof ||
        existing.method !== input.method ||
        existing.source !== "finance_manual" ||
        existing.providerRef !== providerRef ||
        existing.externalReferenceFingerprintSha256 !== expectedFingerprint)
    ) {
      throw new BadRequestException(
        "That payment request was already used with different details",
      );
    }
    if (existing?.status === "success") {
      return {
        ok: true,
        paymentId,
        receipt: await this.getReceipt(paymentId),
      };
    }
    if (existing && existing.status !== "pending") {
      throw new BadRequestException(`Payment is ${existing.status}`);
    }

    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
      include: { person: true },
    });
    if (!student) throw new NotFoundException("Student not found");
    const studentEmail = requirePersonEmail(student.person.email, "Student");

    let invoiceId = existing?.invoiceId;
    if (!invoiceId) {
      const account = await this.loadPayableAccount(input.studentId);
      invoiceId = this.requirePayableTarget(account, input.amountXof).invoice
        .id;
    }
    let fingerprint: string | null = null;
    if (
      transactionReference &&
      (input.method === "wave" || input.method === "orange_money")
    ) {
      fingerprint = await this.assertFinanceReferenceAvailable(
        input.method,
        transactionReference,
        paymentId,
      );
    }

    await this.settlePayment(paymentId, {
      via: "finance_manual",
      actorId: input.actor.personId,
      method: input.method,
      confirmedAmount: input.amountXof,
      payload: transactionReference
        ? { externalReference: transactionReference, recordedByFinance: true }
        : { recordedByFinance: true },
      createPayment: {
        invoiceId,
        studentId: input.studentId,
        amount: input.amountXof,
        method: input.method,
        providerRef,
        externalReferenceFingerprintSha256: fingerprint,
        source: "finance_manual",
        initiatedById: input.actor.personId,
        initiatedByEmail: null,
      },
      financeRecord: {
        id: randomUUID(),
        contactEmail: studentEmail,
        transactionReference,
        reviewedByName: input.actor.name,
        reviewedByEmail: input.actor.email,
      },
    });
    return {
      ok: true,
      paymentId,
      receipt: await this.getReceipt(paymentId),
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
      where: {
        id: studentId,
        recordStatus: { in: ["active", "pending_payment"] },
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("Billable student not found");
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
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)
      ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
      : new Date(Number.NaN);
    if (
      Number.isNaN(dob.getTime()) ||
      dob.toISOString().slice(0, 10) !== input.dateOfBirth
    )
      throw new BadRequestException("Invalid date of birth");

    const studentNo = normalizeStudentNumber(
      input.studentNo || (await this.generateStudentNo()),
    );
    if (
      await this.prisma.student.findFirst({
        where: { studentNo: { equals: studentNo, mode: "insensitive" } },
      })
    ) {
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
    void input;
    void actorId;
    throw new BadRequestException(
      "Expense creation requires an administrator approval request",
    );
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
    void id;
    void patch;
    void actorId;
    throw new BadRequestException(
      "Expense corrections require an administrator approval request",
    );
  }

  async deleteExpense(id: string, actorId?: string) {
    void id;
    void actorId;
    throw new BadRequestException(
      "Approved expenses are immutable; submit a void approval request",
    );
  }

  async listExpenses() {
    const rows = await this.prisma.expense.findMany({
      where: { status: "approved" },
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
            payments: {
              include: {
                paymentBalanceImportRow: {
                  select: {
                    batch: { select: { sourceAsOfDate: true } },
                  },
                },
                workbookCutoverRecords: {
                  select: {
                    batch: { select: { sourceAsOfDate: true } },
                  },
                },
                workbookReplacementEvents: {
                  where: { kind: "reconstruction_payment" },
                  select: {
                    kind: true,
                    batch: { select: { sourceAsOfDate: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const expectedByDate = new Map<string, number>();
    const cashByDate = new Map<string, number>();
    const forecastCashByDate = new Map<string, number>();
    const balanceReconciliationDates = new Set<string>();
    let balanceReconciliationXof = 0;
    let balanceReconciliationPaymentCount = 0;
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
          const recognition = paymentCashRecognition(payment);
          if (
            (payment.status === "success" || payment.status === "refunded") &&
            recognition
          ) {
            const date = toDakarDateKey(recognition.occurredOn);
            cashByDate.set(date, (cashByDate.get(date) ?? 0) + payment.amount);
            if (isRunRateEligibleCashRecognition(recognition)) {
              forecastCashByDate.set(
                date,
                (forecastCashByDate.get(date) ?? 0) + payment.amount,
              );
            } else {
              balanceReconciliationDates.add(date);
              balanceReconciliationXof += payment.amount;
              balanceReconciliationPaymentCount += 1;
            }
          }
          if (payment.status === "refunded" && payment.refundedAt) {
            const date = toDakarDateKey(payment.refundedAt);
            cashByDate.set(date, (cashByDate.get(date) ?? 0) - payment.amount);
            forecastCashByDate.set(
              date,
              (forecastCashByDate.get(date) ?? 0) - payment.amount,
            );
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
    const forecastCollectedXof = [...forecastCashByDate.entries()]
      .filter(([date]) => date <= today)
      .reduce((sum, [, amount]) => sum + amount, 0);
    const trailingEvents = [...forecastCashByDate.entries()].filter(
      ([date]) => date >= trailingStart && date <= today,
    );
    const trailingSettlementDays = new Set(
      trailingEvents.filter(([, amount]) => amount > 0).map(([date]) => date),
    ).size;
    const allSettlementDays = new Set(
      [...forecastCashByDate.entries()]
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
      dailyRateXof = Math.max(0, forecastCollectedXof / elapsedDays);
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
      balanceReconciliation: {
        paymentCount: balanceReconciliationPaymentCount,
        amountXof: balanceReconciliationXof,
        sourceAsOfDates: [...balanceReconciliationDates].sort(),
        dateBasis: "source_as_of" as const,
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
        where: { active: true, student: { recordStatus: "active" } },
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
        where: { status: "approved", isEstimate: false },
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
   * Refund a successful payment through DAUST's internal Finance reversal process.
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
    const resumesInternalRefund = payment.status === "refund_pending";
    if (payment.status !== "success" && !resumesInternalRefund)
      throw new BadRequestException("Only successful payments can be refunded");

    // Claim before reversing the ledgers so concurrent requests cannot both refund.
    if (!resumesInternalRefund) {
      const refundClaim = await this.prisma.payment.updateMany({
        where: { id: payment.id, status: "success" },
        data: { status: "refund_pending" },
      });
      if (refundClaim.count === 0) {
        throw new BadRequestException("This payment is no longer refundable");
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
          const onboarding = await tx.applicant.findUnique({
            where: { enrollmentInvoiceId: current.invoice.id },
          });
          if (onboarding?.onboardingStatus === "payment_pending") {
            await syncEnrollmentGateInTransaction(tx, {
              invoiceId: current.invoice.id,
              actorId,
              inFlightRotationPolicy: "preserve",
            });
          } else if (
            onboarding?.onboardingStatus === "enrolled" &&
            onboarding.studentId
          ) {
            const existingHold = await tx.studentHold.findFirst({
              where: {
                studentId: onboarding.studentId,
                active: true,
                type: "payment_reconciliation",
              },
            });
            if (!existingHold) {
              await tx.studentHold.create({
                data: {
                  studentId: onboarding.studentId,
                  type: "payment_reconciliation",
                  reason:
                    "An enrollment payment was refunded after activation; Finance and Registrar review is required",
                },
              });
            }
            await tx.auditLog.create({
              data: {
                entity: "Applicant",
                entityId: onboarding.id,
                action: "post-enrollment-refund-flagged",
                actorId,
                data: {
                  studentId: onboarding.studentId,
                  paymentId: current.id,
                  refundedAmountXof: current.amount,
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
      to: requirePersonEmail(payment.student.person.email, "Student"),
      subject: "Your DAUST payment has been refunded",
      html: `<h2>Refund processed</h2><p>Hi ${payment.student.person.firstName}, a refund of <strong>${payment.amount.toLocaleString("en-US")} XOF</strong> has been recorded${reason ? ` (${reason})` : ""}. Your balance has been updated accordingly.</p>`,
    });

    return {
      ok: true,
      refundedAmount: payment.amount,
      gatewayRefund: false,
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
        submission: { select: { bankReference: true } },
      },
    });
    if (!p) throw new NotFoundException("Payment not found");
    const paymentDate = paymentDateProjection(p);
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
      transactionReference: p.submission?.bankReference ?? null,
      paidAt: p.settledAt,
      recognizedOn: paymentDate.recognizedOn,
      dateBasis: paymentDate.dateBasis,
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
    return { ...link, url: `${loadEnv().PAYMENT_ORIGIN}/pay/${link.token}` };
  }

  async listPaymentLinks() {
    const links = await this.prisma.paymentLink.findMany({
      orderBy: { createdAt: "desc" },
    });
    const now = Date.now();
    return links.map((l) => ({
      ...l,
      url: `${loadEnv().PAYMENT_ORIGIN}/pay/${l.token}`,
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
      include: {
        paymentSubmissions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
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
      submission: link.paymentSubmissions[0]
        ? this.publicWireSummary(link.paymentSubmissions[0])
        : null,
    };
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
    const [invoices, onboarding] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "asc" },
        include: {
          term: true,
          plan: {
            include: { installments: { orderBy: { sequence: "asc" } } },
          },
          paymentSubmissions: {
            where: { status: "submitted" },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      this.prisma.applicant.findUnique({
        where: { studentId: student.id },
        select: {
          onboardingStatus: true,
          enrollmentInvoiceId: true,
          requiredEnrollmentCashXof: true,
        },
      }),
    ]);
    const position = deriveApiAccountPosition(invoices);
    const payableTarget = selectOldestPayableTarget(invoices, position);
    const grossCreditXof = invoices
      .filter((invoice) => invoice.totalAmount < 0)
      .reduce((sum, invoice) => sum - invoice.totalAmount, 0);
    const invoicesById = new Map(
      invoices.map((invoice) => [invoice.id, invoice] as const),
    );
    const enrollmentInvoice = onboarding?.enrollmentInvoiceId
      ? invoicesById.get(onboarding.enrollmentInvoiceId)
      : null;
    const firstEnrollmentInstallment =
      enrollmentInvoice?.plan?.installments[0] ?? null;
    const enrollmentRequiredCashXof =
      firstEnrollmentInstallment?.amountDue ??
      onboarding?.requiredEnrollmentCashXof ??
      0;
    const enrollmentPaidCashXof = enrollmentInvoice
      ? await verifiedEnrollmentCashXof(this.prisma, enrollmentInvoice.id)
      : 0;
    const enrollmentRemainingCashXof = Math.max(
      0,
      enrollmentRequiredCashXof - enrollmentPaidCashXof,
    );
    const enrollmentGate =
      onboarding &&
      (onboarding.onboardingStatus === "payment_pending" ||
        onboarding.onboardingStatus === "enrolled")
        ? {
            status: onboarding.onboardingStatus,
            requiredCashXof: enrollmentRequiredCashXof,
            paidCashXof: enrollmentPaidCashXof,
            remainingCashXof: enrollmentRemainingCashXof,
            dueDate: firstEnrollmentInstallment?.dueDate ?? null,
            pendingProof:
              enrollmentInvoice?.paymentSubmissions.some(
                (submission) => submission.status === "submitted",
              ) ?? false,
          }
        : null;
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
    const hideAnnualAccount = enrollmentGate?.status === "payment_pending";
    const payerFacingBalanceXof = hideAnnualAccount
      ? enrollmentRemainingCashXof
      : position.summary.balanceXof;
    const payerFacingOutstandingXof = hideAnnualAccount
      ? enrollmentRemainingCashXof
      : position.summary.outstandingXof;
    return {
      studentName: `${student.person.firstName} ${student.person.lastName}`
        .replace(/\s+/g, " ")
        .trim(),
      studentNo: student.studentNo,
      program: student.program?.name ?? null,
      term: invoices[0]?.term.name ?? null,
      balanceXof: payerFacingBalanceXof,
      outstandingXof: payerFacingOutstandingXof,
      payableXof:
        enrollmentGate?.status === "payment_pending"
          ? enrollmentGate.remainingCashXof
          : (payableTarget?.invoicePayableXof ?? 0),
      creditXof: hideAnnualAccount ? 0 : grossCreditXof,
      dueDate:
        enrollmentGate?.status === "payment_pending"
          ? enrollmentGate.dueDate
          : (position.summary.oldestOverdueDate ??
            position.summary.nextDueDate),
      ...(hideAnnualAccount ? {} : { summary: position.summary }),
      enrollmentGate,
      charges: hideAnnualAccount ? [] : charges,
      pendingWires: hideAnnualAccount
        ? []
        : invoices.flatMap((invoice) =>
            invoice.paymentSubmissions
              .filter((submission) => submission.source !== "finance_manual")
              .map((submission) => this.publicWireSummary(submission)),
          ),
    };
  }

  /** Resolve the authenticated public-bill payer to the canonical oldest invoice. */
  async publicBillPaymentTarget(
    studentNo: string,
    dob: string,
    amountXof: number,
  ) {
    const student = await this.findStudentForBill(studentNo, dob);
    const onboarding = await this.prisma.applicant.findUnique({
      where: { studentId: student.id },
      include: {
        enrollmentInvoice: {
          include: {
            plan: {
              include: {
                installments: { orderBy: { sequence: "asc" }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (
      onboarding?.onboardingStatus === "payment_pending" &&
      onboarding.enrollmentInvoice
    ) {
      const first = onboarding.enrollmentInvoice.plan?.installments[0];
      const requiredCashXof =
        first?.amountDue ?? onboarding.requiredEnrollmentCashXof ?? 0;
      const paidCashXof = await verifiedEnrollmentCashXof(
        this.prisma,
        onboarding.enrollmentInvoice.id,
      );
      const remainingCashXof = Math.max(0, requiredCashXof - paidCashXof);
      if (remainingCashXof <= 0) {
        throw new BadRequestException(
          "The enrollment payment is already complete",
        );
      }
      if (amountXof > remainingCashXof) {
        throw new BadRequestException(
          "Amount exceeds the remaining first-installment cash requirement",
        );
      }
      if (!Number.isSafeInteger(amountXof) || amountXof <= 0) {
        throw new BadRequestException(
          "Amount must be a positive whole number of XOF",
        );
      }
      if (onboarding.enrollmentInvoice.status === "void") {
        throw new BadRequestException(
          "The enrollment charge is no longer payable",
        );
      }
      return {
        studentId: student.id,
        invoiceId: onboarding.enrollmentInvoice.id,
        amountXof,
        contactEmail: requirePersonEmail(student.person.email, "Student"),
      };
    }
    const account = await this.loadPayableAccount(student.id);
    const { amount, invoice } = this.requirePayableTarget(account, amountXof);
    return {
      studentId: student.id,
      invoiceId: invoice.id,
      amountXof: amount,
      contactEmail: requirePersonEmail(student.person.email, "Student"),
    };
  }

  async publicBillStudentId(studentNo: string, dob: string) {
    return (await this.findStudentForBill(studentNo, dob)).id;
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

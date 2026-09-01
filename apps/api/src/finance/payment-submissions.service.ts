import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import {
  PaymentMethodsConfig as PaymentMethodsConfigSchema,
  type PaymentMethodsConfig,
  type ProofPaymentMethod,
  type PublicProofMethodConfig,
} from "@mydaust/shared";
import { MailService } from "../mail/mail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  assertCurrentEnrollmentInvoicePaymentInTransaction,
  assertCurrentOnboardingPaymentLinkInTransaction,
} from "./admission-payment-gate.js";
import { FinanceService } from "./finance.service.js";
import { PaymentFileStorage } from "./payment-file.storage.js";

const CONFIG_KEY = "payment_method_config";
const LEGACY_CONFIG_KEY = "wire_payment_config";

const DEFAULT_CONFIG: PaymentMethodsConfig = {
  wave: {
    enabled: false,
    phoneNumber: "",
    merchantNumber: "",
    instructions: "",
    qrAsset: null,
  },
  orangeMoney: {
    enabled: false,
    phoneNumber: "",
    merchantNumber: "",
    instructions: "",
    qrAsset: null,
  },
  bank: {
    enabled: false,
    bankName: "",
    beneficiary: "",
    accountNumber: "",
    iban: "",
    swift: "",
    branch: "",
    instructions: "",
  },
  notificationRecipients: ["finance@daust.edu.sn"],
};

const submissionInclude = {
  student: { include: { person: true } },
  invoice: { include: { term: true } },
  paymentLink: true,
  applicant: true,
  diningOrder: {
    include: { items: { include: { menuItem: true } } },
  },
} satisfies Prisma.PaymentSubmissionInclude;

type SubmissionRow = Prisma.PaymentSubmissionGetPayload<{
  include: typeof submissionInclude;
}>;

type CreateTarget = {
  source: string;
  method: ProofPaymentMethod;
  amountXof: number;
  contactEmail: string;
  submittedById?: string;
  submittedByEmail?: string;
  studentId?: string;
  invoiceId?: string;
  paymentLinkId?: string;
  applicantId?: string;
  diningOrderId?: string;
};

type PaymentTargetClient = Pick<
  Prisma.TransactionClient,
  "applicant" | "diningOrder" | "invoice" | "paymentLink"
>;

@Injectable()
export class PaymentSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PaymentFileStorage,
    private readonly finance: FinanceService,
    private readonly mail: MailService,
  ) {}

  async getConfig(): Promise<PaymentMethodsConfig> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: CONFIG_KEY },
    });
    const parsed = PaymentMethodsConfigSchema.safeParse(row?.valueJson);
    if (parsed.success) return parsed.data;

    const legacy = await this.prisma.appSetting.findUnique({
      where: { key: LEGACY_CONFIG_KEY },
    });
    if (legacy?.valueJson && typeof legacy.valueJson === "object") {
      const value = legacy.valueJson as Record<string, unknown>;
      return PaymentMethodsConfigSchema.parse({
        ...DEFAULT_CONFIG,
        bank: {
          ...DEFAULT_CONFIG.bank,
          enabled: value.enabled === true,
          bankName: String(value.bankName ?? ""),
          beneficiary: String(value.beneficiary ?? ""),
          accountNumber: String(value.accountNumber ?? ""),
          iban: String(value.iban ?? ""),
          swift: String(value.swift ?? ""),
          branch: String(value.branch ?? ""),
          instructions: String(value.instructions ?? ""),
        },
        notificationRecipients: Array.isArray(value.notificationRecipients)
          ? value.notificationRecipients
          : DEFAULT_CONFIG.notificationRecipients,
      });
    }
    return DEFAULT_CONFIG;
  }

  async updateConfig(input: PaymentMethodsConfig, actorId: string) {
    const config = PaymentMethodsConfigSchema.parse(input);
    this.validateEnabledConfig(config);
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: CONFIG_KEY },
        create: { key: CONFIG_KEY, valueJson: config as never },
        update: { valueJson: config as never },
      }),
      this.prisma.auditLog.create({
        data: {
          entity: "AppSetting",
          entityId: CONFIG_KEY,
          action: "payment-method-config-updated",
          actorId,
          data: {
            wave: config.wave.enabled,
            orangeMoney: config.orangeMoney.enabled,
            bank: config.bank.enabled,
          },
        },
      }),
    ]);
    return config;
  }

  private validateEnabledConfig(config: PaymentMethodsConfig) {
    if (config.notificationRecipients.length === 0) {
      throw new BadRequestException(
        "Add at least one Finance notification recipient",
      );
    }
    // A mobile-money method only has to tell the payer where to send the money. A number
    // and a QR are two ways of saying the same thing, so either alone is enough and both is
    // fine — requiring all of them meant a real, usable configuration was rejected.
    for (const [key, label] of [
      ["wave", "Wave"],
      ["orangeMoney", "Orange Money"],
    ] as const) {
      const method = config[key];
      if (!method.enabled) continue;
      const hasDestination =
        Boolean(method.phoneNumber) ||
        Boolean(method.merchantNumber) ||
        Boolean(method.qrAsset);
      if (!hasDestination) {
        throw new BadRequestException(
          `Enabled ${label} payments need somewhere to send the money: a phone number, a merchant number, or a QR code`,
        );
      }
    }
    if (
      config.bank.enabled &&
      (!config.bank.bankName ||
        !config.bank.beneficiary ||
        (!config.bank.accountNumber && !config.bank.iban))
    ) {
      throw new BadRequestException(
        "Enabled bank payments require a bank, beneficiary, and account number or IBAN",
      );
    }
  }

  async uploadQr(
    method: "wave" | "orange_money",
    file: Express.Multer.File,
    actorId: string,
  ) {
    const stored = await this.files.put(file, "qr-codes");
    const asset = {
      ...stored,
      mimeType: stored.mimeType as "image/jpeg" | "image/png",
    };
    const config = await this.getConfig();
    if (method === "wave") config.wave.qrAsset = asset;
    else config.orangeMoney.qrAsset = asset;
    await this.updateConfig(config, actorId);
    return asset;
  }

  async getConfiguredQr(method: "wave" | "orange_money") {
    const config = await this.getConfig();
    const asset =
      method === "wave" ? config.wave.qrAsset : config.orangeMoney.qrAsset;
    if (!asset) throw new NotFoundException("QR code not configured");
    return {
      data: await this.files.get(asset.objectKey),
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    };
  }

  async getAttemptQr(id: string, resumeToken: string) {
    const row = await this.prisma.paymentSubmission.findFirst({
      where: { id, resumeToken },
      select: { bankSnapshot: true },
    });
    if (!row) throw new NotFoundException("Payment attempt not found");
    const details = row.bankSnapshot as {
      qrAsset?: {
        objectKey?: string;
        fileName?: string;
        mimeType?: string;
      } | null;
    };
    const asset = details.qrAsset;
    if (!asset?.objectKey || !asset.fileName || !asset.mimeType) {
      throw new NotFoundException("QR code not available for this attempt");
    }
    return {
      data: await this.files.get(asset.objectKey),
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    };
  }

  async publicMethods(): Promise<PublicProofMethodConfig[]> {
    const config = await this.getConfig();
    return (["wave", "orange_money", "wire"] as const)
      .map((method) => this.detailsFor(method, config))
      .filter((method) => method.enabled);
  }

  private detailsFor(
    method: ProofPaymentMethod,
    config: PaymentMethodsConfig,
  ): PublicProofMethodConfig & { qrAsset?: unknown } {
    if (method === "wave") {
      return {
        method,
        enabled: config.wave.enabled,
        label: "Wave",
        phoneNumber: config.wave.phoneNumber,
        merchantNumber: config.wave.merchantNumber || undefined,
        instructions: config.wave.instructions,
        qrUrl: config.wave.qrAsset
          ? "/api/finance/payment-methods/wave/qr"
          : undefined,
        qrAsset: config.wave.qrAsset,
      };
    }
    if (method === "orange_money") {
      return {
        method,
        enabled: config.orangeMoney.enabled,
        label: "Orange Money",
        phoneNumber: config.orangeMoney.phoneNumber,
        merchantNumber: config.orangeMoney.merchantNumber,
        instructions: config.orangeMoney.instructions,
        qrUrl: config.orangeMoney.qrAsset
          ? "/api/finance/payment-methods/orange_money/qr"
          : undefined,
        qrAsset: config.orangeMoney.qrAsset,
      };
    }
    return {
      method,
      enabled: config.bank.enabled,
      label: "Bank transfer",
      bankName: config.bank.bankName,
      beneficiary: config.bank.beneficiary,
      accountNumber: config.bank.accountNumber,
      iban: config.bank.iban,
      swift: config.bank.swift,
      branch: config.bank.branch,
      instructions: config.bank.instructions,
    };
  }

  async create(input: CreateTarget) {
    const amount = Math.floor(input.amountXof);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        "Amount must be a positive whole number of XOF",
      );
    }
    const config = await this.getConfig();
    const details = this.detailsFor(input.method, config);
    if (!details.enabled) {
      throw new BadRequestException(
        `${details.label} is not available right now`,
      );
    }

    const resumeToken = randomBytes(24).toString("hex");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            const target = await this.validateTarget(input, amount, tx);
            if (input.invoiceId && input.source === "public_bill") {
              await assertCurrentEnrollmentInvoicePaymentInTransaction(
                tx,
                input.invoiceId,
                amount,
              );
            }
            if (input.paymentLinkId) {
              await assertCurrentOnboardingPaymentLinkInTransaction(
                tx,
                input.paymentLinkId,
                amount,
              );
            }
            const active = await tx.paymentSubmission.findUnique({
              where: { activeKey: target.activeKey },
              include: submissionInclude,
            });
            if (active) return active;

            const payment = target.invoice
              ? await tx.payment.create({
                  data: {
                    invoiceId: target.invoice.id,
                    studentId: target.invoice.studentId,
                    amount,
                    method: input.method,
                    status: "pending",
                    provider: "manual",
                    providerRef: `MANUAL-${randomUUID()}`,
                    source: input.source,
                    initiatedById: input.submittedById,
                    initiatedByEmail:
                      input.submittedByEmail ?? input.contactEmail,
                  },
                })
              : null;
            const submission = await tx.paymentSubmission.create({
              data: {
                resumeToken,
                activeKey: target.activeKey,
                status: "awaiting_proof",
                method: input.method,
                source: input.source,
                studentId: target.studentId,
                invoiceId: target.invoice?.id,
                paymentId: payment?.id,
                paymentLinkId: input.paymentLinkId,
                applicantId: input.applicantId,
                diningOrderId: input.diningOrderId,
                submittedAmountXof: amount,
                contactEmail: input.contactEmail,
                submittedById: input.submittedById,
                submittedByEmail: input.submittedByEmail,
                bankSnapshot: details as never,
              },
              include: submissionInclude,
            });
            await tx.auditLog.create({
              data: {
                entity: "PaymentSubmission",
                entityId: submission.id,
                action: "draft-created",
                actorId: input.submittedById,
                data: {
                  method: input.method,
                  amountXof: amount,
                  source: input.source,
                  target: target.activeKey,
                },
              },
            });
            return submission;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
        return this.present(created);
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error.code === "P2002" || error.code === "P2034");
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Payment-attempt transaction retry limit exhausted");
  }

  createForStudent(input: {
    studentId: string;
    invoiceId: string;
    amountXof: number;
    method: ProofPaymentMethod;
    source: string;
    actor: { personId: string; email: string };
  }) {
    return this.create({
      ...input,
      contactEmail: input.actor.email,
      submittedById: input.actor.personId,
      submittedByEmail: input.actor.email,
    });
  }

  async createForPaymentLink(
    token: string,
    method: ProofPaymentMethod,
    contactEmail: string,
  ) {
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link) throw new NotFoundException("Payment link not found");
    let studentId = link.studentId ?? undefined;
    if (link.invoiceId && !studentId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: link.invoiceId },
        select: { studentId: true },
      });
      studentId = invoice?.studentId;
    }
    return this.create({
      source: "payment_link",
      method,
      amountXof: link.amountXof,
      contactEmail,
      studentId,
      invoiceId: link.invoiceId ?? undefined,
      paymentLinkId: link.id,
    });
  }

  async createForApplicant(
    applicantId: string,
    method: ProofPaymentMethod,
    amountXof: number,
  ) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      select: { email: true },
    });
    if (!applicant) throw new NotFoundException("Application not found");
    return this.create({
      source: "application_fee",
      method,
      amountXof,
      contactEmail: applicant.email,
      applicantId,
    });
  }

  async createForDining(
    studentId: string,
    orderId: string,
    method: ProofPaymentMethod,
    actor: { personId: string; email: string },
  ) {
    const order = await this.prisma.diningOrder.findUnique({
      where: { id: orderId },
      select: { totalXof: true },
    });
    if (!order) throw new NotFoundException("Dining order not found");
    return this.create({
      source: "dining_order",
      method,
      amountXof: order.totalXof,
      contactEmail: actor.email,
      submittedById: actor.personId,
      submittedByEmail: actor.email,
      studentId,
      diningOrderId: orderId,
    });
  }

  private async validateTarget(
    input: CreateTarget,
    amount: number,
    client: PaymentTargetClient = this.prisma,
  ) {
    let invoice: { id: string; studentId: string } | null = null;
    if (input.invoiceId) {
      const row = await client.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          studentId: true,
          totalAmount: true,
          amountPaid: true,
          status: true,
        },
      });
      if (!row || (input.studentId && row.studentId !== input.studentId)) {
        throw new NotFoundException("Invoice not found");
      }
      if (row.status === "void" || row.totalAmount - row.amountPaid <= 0) {
        throw new BadRequestException("This charge is already settled");
      }
      if (amount > row.totalAmount - row.amountPaid) {
        throw new BadRequestException(
          "Amount exceeds the remaining charge balance",
        );
      }
      invoice = row;
    }
    if (input.paymentLinkId) {
      const link = await client.paymentLink.findUnique({
        where: { id: input.paymentLinkId },
      });
      if (!link || link.status !== "active") {
        throw new BadRequestException("This payment link is not active");
      }
      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException("This payment link has expired");
      }
      if (amount !== link.amountXof) {
        throw new BadRequestException("Payment-link amount must match exactly");
      }
    }
    if (input.applicantId) {
      const applicant = await client.applicant.findUnique({
        where: { id: input.applicantId },
      });
      if (!applicant) throw new NotFoundException("Application not found");
      if (applicant.feePaid)
        throw new BadRequestException("Application fee already paid");
    }
    if (input.diningOrderId) {
      const order = await client.diningOrder.findUnique({
        where: { id: input.diningOrderId },
      });
      if (!order || (input.studentId && order.studentId !== input.studentId)) {
        throw new NotFoundException("Dining order not found");
      }
      if (order.status !== "cart")
        throw new BadRequestException("Dining order is not payable");
      if (amount !== order.totalXof)
        throw new BadRequestException("Dining-order amount must match exactly");
    }
    const activeKey = input.paymentLinkId
      ? `link:${input.paymentLinkId}`
      : input.applicantId
        ? `applicant:${input.applicantId}`
        : input.diningOrderId
          ? `dining:${input.diningOrderId}`
          : input.invoiceId
            ? `invoice:${input.invoiceId}`
            : "";
    if (!activeKey) throw new BadRequestException("Payment target is missing");
    return {
      activeKey,
      invoice,
      studentId: input.studentId ?? invoice?.studentId,
    };
  }

  async getForStudent(id: string, studentId: string) {
    const row = await this.prisma.paymentSubmission.findFirst({
      where: { id, studentId },
      include: submissionInclude,
    });
    if (!row) throw new NotFoundException("Payment attempt not found");
    return this.present(row);
  }

  async getByResumeToken(token: string) {
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { resumeToken: token },
      include: submissionInclude,
    });
    if (!row) throw new NotFoundException("Payment attempt not found");
    return this.present(row);
  }

  async listForStudent(studentId: string) {
    const rows = await this.prisma.paymentSubmission.findMany({
      // Finance-recorded cash/mobile receipts live in the canonical Payment
      // history; they are audit records, not resumable payer proof attempts.
      where: { studentId, source: { not: "finance_manual" } },
      orderBy: { createdAt: "desc" },
      include: submissionInclude,
    });
    return rows.map((row) => this.present(row));
  }

  async listForPaymentLinkToken(token: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { token },
      select: { id: true },
    });
    if (!link) throw new NotFoundException("Payment link not found");
    const rows = await this.prisma.paymentSubmission.findMany({
      where: { paymentLinkId: link.id },
      orderBy: { createdAt: "desc" },
      include: submissionInclude,
    });
    return rows.map((row) => this.present(row));
  }

  async listForApplicant(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      select: { id: true },
    });
    if (!applicant) throw new NotFoundException("Application not found");
    const rows = await this.prisma.paymentSubmission.findMany({
      where: { applicantId },
      orderBy: { createdAt: "desc" },
      include: submissionInclude,
    });
    return rows.map((row) => this.present(row));
  }

  async changeMethod(
    id: string,
    method: ProofPaymentMethod,
    scope: { studentId?: string; resumeToken?: string },
  ) {
    const row = await this.scoped(id, scope);
    if (row.status !== "awaiting_proof") {
      throw new BadRequestException(
        "Method can change only before proof is submitted",
      );
    }
    const config = await this.getConfig();
    const details = this.detailsFor(method, config);
    if (!details.enabled)
      throw new BadRequestException(
        `${details.label} is not available right now`,
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.paymentSubmission.update({
        where: { id },
        data: { method, bankSnapshot: details as never },
        include: submissionInclude,
      });
      if (row.paymentId) {
        await tx.payment.update({
          where: { id: row.paymentId },
          data: { method },
        });
      }
      return submission;
    });
    return this.present(updated);
  }

  async submitProof(
    id: string,
    file: Express.Multer.File,
    scope: { studentId?: string; resumeToken?: string },
  ) {
    const row = await this.scoped(id, scope);
    if (row.status !== "awaiting_proof") {
      throw new BadRequestException(
        "This payment attempt no longer accepts proof",
      );
    }
    const stored = await this.files.put(file, "payer-proofs");
    const claimed = await this.prisma.paymentSubmission.updateMany({
      where: { id, status: "awaiting_proof" },
      data: {
        status: "submitted",
        proofObjectKey: stored.objectKey,
        proofFileName: stored.fileName,
        proofMimeType: stored.mimeType,
        proofSize: stored.size,
        payerProofSubmittedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        "This payment attempt no longer accepts proof",
      );
    }
    const updated = await this.prisma.paymentSubmission.findUniqueOrThrow({
      where: { id },
      include: submissionInclude,
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "PaymentSubmission",
        entityId: id,
        action: "payer-proof-submitted",
        actorId: row.submittedById,
        data: { method: row.method, amountXof: row.submittedAmountXof },
      },
    });
    const config = await this.getConfig();
    await Promise.allSettled([
      ...config.notificationRecipients.map((to) =>
        this.mail.send({
          to,
          subject: `Payment proof awaiting review — ${row.submittedAmountXof.toLocaleString("en-US")} XOF`,
          html: `<h2>Payment proof submitted</h2><p>${this.targetLabel(updated)} submitted ${row.method.replaceAll("_", " ")} proof for <strong>${row.submittedAmountXof.toLocaleString("en-US")} XOF</strong>.</p>`,
        }),
      ),
      this.mail.send({
        to: row.contactEmail,
        subject: "DAUST payment proof received",
        html: `<h2>Proof received</h2><p>Finance will review your ${row.submittedAmountXof.toLocaleString("en-US")} XOF payment. The official balance changes after verification.</p>`,
      }),
    ]);
    return this.present(updated);
  }

  private async scoped(
    id: string,
    scope: { studentId?: string; resumeToken?: string },
  ) {
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Payment attempt not found");
    const allowed =
      (scope.studentId && row.studentId === scope.studentId) ||
      (scope.resumeToken && row.resumeToken === scope.resumeToken);
    if (!allowed)
      throw new ForbiddenException("Payment attempt is not accessible");
    return row;
  }

  async listAdmin(status?: string) {
    const rows = await this.prisma.paymentSubmission.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: submissionInclude,
    });
    return rows.map((row) => ({
      ...this.present(row),
      target: this.targetLabel(row),
      purpose: this.purposeLabel(row),
      hasPayerProof: Boolean(row.proofObjectKey),
      hasVerificationProof: Boolean(row.verificationProofObjectKey),
    }));
  }

  async getFile(id: string, kind: "payer" | "verification") {
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Payment submission not found");
    const key =
      kind === "payer" ? row.proofObjectKey : row.verificationProofObjectKey;
    const fileName =
      kind === "payer" ? row.proofFileName : row.verificationProofFileName;
    const mimeType =
      kind === "payer" ? row.proofMimeType : row.verificationProofMimeType;
    if (!key || !fileName || !mimeType)
      throw new NotFoundException("Payment evidence not found");
    return {
      data: await this.files.get(key),
      fileName: fileName.replace(/[\r\n"]/g, ""),
      mimeType,
    };
  }

  async verify(
    id: string,
    input: { transactionReference: string; note?: string },
    proof: Express.Multer.File,
    reviewer: { personId: string; email: string; name: string },
  ) {
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id },
      include: submissionInclude,
    });
    if (!row) throw new NotFoundException("Payment submission not found");
    if (row.status === "approved") return { ok: true };
    if (row.status !== "submitted" || !row.proofObjectKey) {
      throw new BadRequestException(
        "Only submitted payer proofs can be verified",
      );
    }
    const transactionReference = input.transactionReference.trim();
    if (!transactionReference)
      throw new BadRequestException("Transaction reference is required");
    const verificationProof = await this.files.put(
      proof,
      "verification-proofs",
    );
    if (row.paymentId) {
      await this.finance.settleVerifiedSubmission({
        submissionId: row.id,
        paymentId: row.paymentId,
        paymentLinkId: row.paymentLinkId,
        method: row.method as ProofPaymentMethod,
        amountXof: row.submittedAmountXof,
        transactionReference,
        note: input.note,
        reviewer,
        verificationProof,
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.paymentSubmission.updateMany({
          where: { id, status: "submitted" },
          data: {
            status: "approved",
            activeKey: null,
            confirmedAmountXof: row.submittedAmountXof,
            bankReference: transactionReference,
            confirmationNote: input.note?.trim() || null,
            verificationProofObjectKey: verificationProof.objectKey,
            verificationProofFileName: verificationProof.fileName,
            verificationProofMimeType: verificationProof.mimeType,
            verificationProofSize: verificationProof.size,
            reviewedById: reviewer.personId,
            reviewedByName: reviewer.name,
            reviewedByEmail: reviewer.email,
            reviewedAt: new Date(),
          },
        });
        if (claimed.count === 0)
          throw new BadRequestException(
            "Payment submission was already decided",
          );
        if (row.paymentLinkId) {
          await tx.paymentLink.update({
            where: { id: row.paymentLinkId },
            data: { status: "paid", method: row.method, paidAt: new Date() },
          });
        }
        if (row.applicantId) {
          await tx.applicant.update({
            where: { id: row.applicantId },
            data: { feePaid: true },
          });
        }
        if (row.diningOrderId) {
          await tx.diningOrder.update({
            where: { id: row.diningOrderId },
            data: { status: "paid" },
          });
        }
        await tx.auditLog.create({
          data: {
            entity: "PaymentSubmission",
            entityId: id,
            action: "verified-and-settled",
            actorId: reviewer.personId,
            data: { method: row.method, transactionReference },
          },
        });
      });
    }
    await Promise.allSettled([
      this.mail.send({
        to: row.contactEmail,
        subject: "DAUST payment verified",
        html: `<h2>Payment verified</h2><p>Finance verified your <strong>${row.submittedAmountXof.toLocaleString("en-US")} XOF</strong> payment. The official record is now updated.</p>`,
      }),
    ]);
    return { ok: true };
  }

  async reject(
    id: string,
    reason: string,
    reviewer: { personId: string; email: string; name: string },
  ) {
    const clean = reason.trim();
    if (!clean) throw new BadRequestException("A rejection reason is required");
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Payment submission not found");
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id, status: "submitted" },
        data: {
          status: "rejected",
          activeKey: null,
          rejectionReason: clean,
          reviewedById: reviewer.personId,
          reviewedByName: reviewer.name,
          reviewedByEmail: reviewer.email,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count === 0)
        throw new BadRequestException("Payment submission was already decided");
      if (row.paymentId) {
        await tx.payment.updateMany({
          where: { id: row.paymentId, status: "pending" },
          data: { status: "cancelled" },
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "PaymentSubmission",
          entityId: id,
          action: "rejected",
          actorId: reviewer.personId,
          data: { reason: clean },
        },
      });
    });
    await Promise.allSettled([
      this.mail.send({
        to: row.contactEmail,
        subject: "DAUST payment proof needs attention",
        html: `<h2>Payment proof not approved</h2><p>${clean}</p><p>You can start a replacement payment attempt.</p>`,
      }),
    ]);
    return { ok: true };
  }

  async listDirector() {
    const [manual, piSpi, paytech] = await Promise.all([
      this.listAdmin(),
      this.prisma.piSpiRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          student: { include: { person: true } },
          applicant: true,
          paymentLink: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { provider: "paytech", submission: null },
        orderBy: { createdAt: "desc" },
        take: 500,
        include: { student: { include: { person: true } }, invoice: true },
      }),
    ]);
    return [
      ...manual.map((row) => ({ kind: "manual" as const, ...row })),
      ...piSpi.map((row) => ({
        kind: "system" as const,
        id: row.id,
        method: "pi_spi",
        status: row.status,
        auditStatus: "reviewed",
        amountXof: row.amountXof,
        confirmedAmountXof: row.settledAmountXof,
        target: row.student
          ? `${row.student.person.firstName} ${row.student.person.lastName}`.trim()
          : row.applicant
            ? `${row.applicant.firstName} ${row.applicant.lastName}`.trim()
            : (row.paymentLink?.payeeName ?? "External payer"),
        purpose: row.motif,
        verifiedByName: "PI-SPI",
        verifiedByEmail: null,
        verifiedAt: row.settledAt,
        createdAt: row.createdAt,
      })),
      ...paytech.map((row) => ({
        kind: "legacy" as const,
        id: row.id,
        method: row.method,
        status: row.status,
        auditStatus: "reviewed",
        amountXof: row.amount,
        confirmedAmountXof: row.status === "success" ? row.amount : null,
        target:
          `${row.student.person.firstName} ${row.student.person.lastName}`.trim(),
        purpose: row.invoice.description ?? "Student account payment",
        verifiedByName: "Legacy PayTech",
        verifiedByEmail: null,
        verifiedAt: row.settledAt,
        createdAt: row.createdAt,
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async audit(
    id: string,
    outcome: "reviewed" | "flagged",
    note: string | undefined,
    actor: { personId: string; email: string; name: string },
  ) {
    if (outcome === "flagged" && !note?.trim()) {
      throw new BadRequestException("A flag note is required");
    }
    const row = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Payment submission not found");
    if (row.status !== "approved")
      throw new BadRequestException("Only verified payments can be audited");
    const updated = await this.prisma.paymentSubmission.update({
      where: { id },
      data: {
        auditStatus: outcome,
        auditNote: note?.trim() || null,
        auditedById: actor.personId,
        auditedByName: actor.name,
        auditedByEmail: actor.email,
        auditedAt: new Date(),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "PaymentSubmission",
        entityId: id,
        action: `director-${outcome}`,
        actorId: actor.personId,
        data: { note: note?.trim() || null },
      },
    });
    return { ok: true, auditStatus: updated.auditStatus };
  }

  async unauditedCount() {
    return this.prisma.paymentSubmission.count({
      where: { status: "approved", auditStatus: "unreviewed" },
    });
  }

  private present(row: SubmissionRow) {
    const details = row.bankSnapshot as unknown as PublicProofMethodConfig;
    return {
      id: row.id,
      resumeToken: row.resumeToken,
      status: row.status === "approved" ? "verified" : row.status,
      auditStatus: row.auditStatus,
      method: row.method,
      source: row.source,
      studentId: row.studentId,
      invoiceId: row.invoiceId,
      paymentLinkId: row.paymentLinkId,
      applicantId: row.applicantId,
      diningOrderId: row.diningOrderId,
      amountXof: row.submittedAmountXof,
      confirmedAmountXof: row.confirmedAmountXof,
      contactEmail: row.contactEmail,
      details: {
        ...details,
        qrUrl:
          details.qrUrl && row.resumeToken
            ? `/api/finance/payment-attempts/${row.id}/qr?resumeToken=${encodeURIComponent(row.resumeToken)}`
            : details.qrUrl,
        qrAsset: undefined,
      },
      payerProofFileName: row.proofFileName,
      payerProofSubmittedAt: row.payerProofSubmittedAt,
      transactionReference: row.bankReference,
      verificationNote: row.confirmationNote,
      verifiedByName: row.reviewedByName,
      verifiedByEmail: row.reviewedByEmail,
      verifiedAt: row.reviewedAt,
      rejectionReason: row.rejectionReason,
      auditedByName: row.auditedByName,
      auditedByEmail: row.auditedByEmail,
      auditedAt: row.auditedAt,
      auditNote: row.auditNote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private targetLabel(row: SubmissionRow) {
    if (row.student)
      return `${row.student.person.firstName} ${row.student.person.lastName}`.trim();
    if (row.applicant)
      return `${row.applicant.firstName} ${row.applicant.lastName}`.trim();
    return row.paymentLink?.payeeName ?? "External payer";
  }

  private purposeLabel(row: SubmissionRow) {
    return (
      row.paymentLink?.purpose ??
      row.invoice?.description ??
      row.invoice?.term.name ??
      (row.applicant ? "Application fee" : null) ??
      (row.diningOrder ? "Weekend dining order" : null) ??
      "Payment"
    );
  }
}

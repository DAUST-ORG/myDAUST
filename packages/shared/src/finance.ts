import { z } from "zod";
import { Xof } from "./money.js";

/**
 * Canonical ledger payment methods.
 *
 * `wave` / `orange_money` / `wire` are proof-based payments with Finance review;
 * `card` is retained for historical ledger rows only; `pi_spi` is the BCEAO
 * request-to-pay rail, where
 * the payer approves in their own banking app and settlement arrives asynchronously.
 * `cheque` and `legacy_unknown` are accounting-only values for reviewed
 * historical/manual records and are intentionally not exposed by payer-facing
 * checkout endpoints.
 */
export const PaymentMethod = z.enum([
  "wave",
  "orange_money",
  "card",
  "wire",
  "cheque",
  "pi_spi",
  "legacy_unknown",
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Methods accepted by payer-facing initiation APIs. Accounting-only rails are excluded. */
export const PayerPaymentMethod = z.enum([
  "wave",
  "orange_money",
  "wire",
  "pi_spi",
]);
export type PayerPaymentMethod = z.infer<typeof PayerPaymentMethod>;

export const ProofPaymentMethod = z.enum(["wave", "orange_money", "wire"]);
export type ProofPaymentMethod = z.infer<typeof ProofPaymentMethod>;

export const PaymentSubmissionStatus = z.enum([
  "awaiting_proof",
  "submitted",
  "verified",
  "rejected",
  "cancelled",
]);
export type PaymentSubmissionStatus = z.infer<typeof PaymentSubmissionStatus>;

export const PaymentAuditStatus = z.enum(["unreviewed", "reviewed", "flagged"]);
export type PaymentAuditStatus = z.infer<typeof PaymentAuditStatus>;

/** Lifecycle of a PI-SPI request-to-pay, mirroring the Prisma enum. */
export const PiSpiStatus = z.enum([
  "initiated",
  "sent",
  "settled",
  "cancelled",
  "rejected",
  "expired",
]);
export type PiSpiStatus = z.infer<typeof PiSpiStatus>;

/** A PI-SPI alias is a UUID v4 payment address. */
export const PiSpiAlias = z
  .string()
  .trim()
  .uuid("Enter a valid PI-SPI alias (a UUID from your banking app)");

export const PiSpiAliasInput = z.object({ alias: PiSpiAlias });
export type PiSpiAliasInput = z.infer<typeof PiSpiAliasInput>;

/** What the payer sees before we push a request at them. */
export interface PiSpiAliasLookup {
  alias: string;
  name: string;
  country: string | null;
}

export const PiSpiInitiateInput = z.object({
  alias: PiSpiAlias,
  amountXof: Xof.positive().max(100_000_000),
  /** Persist the alias on the student record for next time. */
  saveAlias: z.boolean().optional(),
});
export type PiSpiInitiateInput = z.infer<typeof PiSpiInitiateInput>;

/** Status of a request-to-pay, as the pay screens poll it. */
export interface PiSpiRequestSummary {
  txId: string;
  status: PiSpiStatus;
  statusReason: string | null;
  payerName: string | null;
  amountXof: number;
  settledAmountXof: number | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Human copy for the rail's ISO 20022 rejection codes. Anything unmapped falls back to a
 * generic message rather than showing the payer a raw code.
 */
export const PI_SPI_REASONS: Record<string, string> = {
  DU03: "A payment request with this reference already exists.",
  BE23: "That payment alias was not recognised. Check it in your banking app.",
  AC04: "The payer's account is closed.",
  AM04: "There are insufficient funds in the payer's account.",
  AB05: "The payer's bank did not respond in time.",
};

export function piSpiReasonText(code: string | null | undefined): string {
  if (!code) return "The payment request was not completed.";
  return (
    PI_SPI_REASONS[code] ?? `The payment request was declined (code ${code}).`
  );
}

export const WireTransferStatus = z.enum(["submitted", "approved", "rejected"]);
export type WireTransferStatus = z.infer<typeof WireTransferStatus>;

export const WirePaymentConfig = z.object({
  enabled: z.boolean().default(false),
  bankName: z.string().trim().max(120).default(""),
  beneficiary: z.string().trim().max(160).default(""),
  accountNumber: z.string().trim().max(120).default(""),
  iban: z.string().trim().max(120).default(""),
  swift: z.string().trim().max(40).default(""),
  branch: z.string().trim().max(120).default(""),
  instructions: z.string().trim().max(1000).default(""),
  notificationRecipients: z.array(z.string().email()).max(20).default([]),
});
export type WirePaymentConfig = z.infer<typeof WirePaymentConfig>;

const StoredQrAsset = z.object({
  objectKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  size: z.number().int().positive(),
});
export type StoredQrAsset = z.infer<typeof StoredQrAsset>;

export const MobileMoneyMethodConfig = z.object({
  enabled: z.boolean().default(false),
  phoneNumber: z.string().trim().max(40).default(""),
  merchantNumber: z.string().trim().max(80).default(""),
  instructions: z.string().trim().max(1000).default(""),
  qrAsset: StoredQrAsset.nullable().default(null),
});
export type MobileMoneyMethodConfig = z.infer<typeof MobileMoneyMethodConfig>;

export const PaymentMethodsConfig = z.object({
  wave: MobileMoneyMethodConfig,
  orangeMoney: MobileMoneyMethodConfig,
  bank: WirePaymentConfig.omit({ notificationRecipients: true }),
  notificationRecipients: z.array(z.string().email()).max(20).default([]),
});
export type PaymentMethodsConfig = z.infer<typeof PaymentMethodsConfig>;

export interface PublicProofMethodConfig {
  method: ProofPaymentMethod;
  enabled: boolean;
  label: string;
  phoneNumber?: string;
  merchantNumber?: string;
  instructions: string;
  qrUrl?: string;
  bankName?: string;
  beneficiary?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  branch?: string;
}

export interface PaymentSubmissionSummary {
  id: string;
  resumeToken?: string | null;
  status: PaymentSubmissionStatus;
  auditStatus: PaymentAuditStatus;
  method: ProofPaymentMethod;
  source: string;
  studentId?: string | null;
  invoiceId?: string | null;
  paymentLinkId?: string | null;
  applicantId?: string | null;
  diningOrderId?: string | null;
  amountXof: number;
  confirmedAmountXof: number | null;
  contactEmail?: string;
  details: PublicProofMethodConfig;
  payerProofFileName: string | null;
  payerProofSubmittedAt: string | null;
  transactionReference: string | null;
  verificationNote: string | null;
  verifiedByName: string | null;
  verifiedByEmail: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  auditedByName: string | null;
  auditedByEmail: string | null;
  auditedAt: string | null;
  auditNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export const WireApprovalInput = z
  .object({
    // Upper bound matches every other Xof input; the service still caps this against the
    // invoice's remaining balance, so this is defence in depth rather than the real gate.
    confirmedAmountXof: Xof.positive().max(100_000_000),
    bankReference: z.string().trim().max(160).optional(),
    confirmationNote: z.string().trim().max(1000).optional(),
  })
  .refine((v) => Boolean(v.bankReference || v.confirmationNote), {
    message: "Enter a bank reference or confirmation note",
  });
export type WireApprovalInput = z.infer<typeof WireApprovalInput>;

export const PaymentStatus = z.enum([
  "pending",
  "success",
  "refund_pending",
  "failed",
  "cancelled",
  "refunded",
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const InstallmentStatus = z.enum([
  "pending",
  "partial",
  "paid",
  "overdue",
]);
export type InstallmentStatus = z.infer<typeof InstallmentStatus>;

export const InvoiceStatus = z.enum(["open", "partial", "paid", "void"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

/** One line of an admin-configured payment schedule: by fixed amount OR percentage of invoice. */
export const PlanInstallmentInput = z
  .object({
    sequence: z.number().int().positive(),
    dueDate: z.string().date(),
    amount: Xof.optional(),
    percent: z.number().min(0).max(100).optional(),
  })
  .refine((v) => (v.amount === undefined) !== (v.percent === undefined), {
    message: "Specify exactly one of amount or percent per installment",
  });
export type PlanInstallmentInput = z.infer<typeof PlanInstallmentInput>;

export const CreatePaymentPlanInput = z.object({
  invoiceId: z.string().uuid(),
  installments: z.array(PlanInstallmentInput).min(1),
});
export type CreatePaymentPlanInput = z.infer<typeof CreatePaymentPlanInput>;

/** Student initiates a payment toward their balance (allocated oldest-due-first server-side). */
export const InitiatePaymentInput = z.object({
  invoiceId: z.string().uuid(),
  amount: Xof.positive(),
  method: PayerPaymentMethod,
});
export type InitiatePaymentInput = z.infer<typeof InitiatePaymentInput>;

/** Management-accounting expense (manual/estimated), tagged to a cost center. */
export const ExpenseCategory = z.enum([
  "Salary",
  "Facilities",
  "Procurement",
  "IT",
  "Operations",
  "Other",
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

export const CreateExpenseInput = z.object({
  costCenterCode: z.string(),
  category: ExpenseCategory,
  description: z.string().optional(),
  payee: z.string().optional(),
  amount: Xof.positive(),
  isEstimate: z.boolean().default(false),
  incurredOn: z.string().date(),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>;

export const SetBudgetInput = z.object({
  costCenterCode: z.string(),
  fiscalYear: z.string(),
  allocated: Xof.positive(),
});
export type SetBudgetInput = z.infer<typeof SetBudgetInput>;

/** Payment-plan templates: even splits over N installments, one month apart. Prefill, editable per student. */
// dueMonthDays: official calendar anchors ("MM-DD"; first entry = at enrolment/today).
export const PLAN_TEMPLATES = [
  { key: "full", label: "Single payment", installments: 1, dueMonthDays: null },
  {
    key: "semester",
    label: "2 installments (per semester)",
    installments: 2,
    dueMonthDays: null,
  },
  {
    key: "quarterly",
    label: "4 installments · official (Inscription, Nov 5, Jan 5, Mar 5)",
    installments: 4,
    dueMonthDays: ["enrolment", "11-05", "01-05", "03-05"],
  },
  {
    key: "monthly",
    label: "Monthly (8 installments)",
    installments: 8,
    dueMonthDays: null,
  },
] as const;

/** Even split of an integer XOF total: earlier installments absorb the remainder. */
export function splitEvenXof(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from(
    { length: parts },
    (_, i) => base + (i < remainder ? 1 : 0),
  );
}

// Canonical account standing, schedule due-state, and Dakar business-date helpers.
export * from "./account-position.js";

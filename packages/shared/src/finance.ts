import { z } from "zod";
import { Xof } from "./money.js";

/**
 * Payment methods a payer can choose.
 *
 * `wave` / `orange_money` / `card` all hand off to PayTech's hosted checkout; `wire` is
 * proof-of-transfer with bursar review; `pi_spi` is the BCEAO request-to-pay rail, where
 * the payer approves in their own banking app and settlement arrives asynchronously.
 */
export const PaymentMethod = z.enum([
  "wave",
  "orange_money",
  "card",
  "wire",
  "pi_spi",
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

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
  method: PaymentMethod,
});
export type InitiatePaymentInput = z.infer<typeof InitiatePaymentInput>;

/** What the create-payment endpoint returns: where to send the student to pay. */
export const InitiatePaymentResult = z.object({
  paymentId: z.string().uuid(),
  redirectUrl: z.string().url(),
});
export type InitiatePaymentResult = z.infer<typeof InitiatePaymentResult>;

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

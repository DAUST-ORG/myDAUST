import { z } from "zod";
import { Xof } from "./money.js";

/** PayTech-backed methods (all enabled now; dedicated Wave/OM providers added later). */
export const PaymentMethod = z.enum(["wave", "orange_money", "card"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const PaymentStatus = z.enum(["pending", "success", "failed", "cancelled"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const InstallmentStatus = z.enum(["pending", "partial", "paid", "overdue"]);
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

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CreatePaymentPlanInput, SetBudgetInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import { OperatingBudgetService } from "./operating-budget.service.js";

const RequestReason = z.string().trim().min(1).max(1000);

// Local zod (api's own instance): keeps the ESM/CJS dual-package hazard away from shared.
const CreatePaymentLinkInput = z.object({
  payeeName: z.string().min(1).max(120),
  payeeMeta: z.string().max(160).optional(),
  // Seed ids are human-readable strings, not uuids; existence is checked in the service.
  studentId: z.string().min(1).max(64).optional(),
  invoiceId: z.string().min(1).max(64).optional(),
  amountXof: z.number().int().positive().max(100_000_000),
  purpose: z.string().min(1).max(160),
  costCenterCode: z.string().max(8).optional(),
  dueDate: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

const CreateStudentInput = z.object({
  fullName: z.string().min(1).max(120),
  dateOfBirth: z.string().min(8).max(10), // YYYY-MM-DD
  studentNo: z.string().min(1).max(64).optional(),
  email: z.string().email().max(160).optional(),
  programCode: z.string().min(1).max(16).optional(),
});

const AddChargeInput = z.object({
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(2000),
  description: z.string().min(1).max(160),
  amountXof: z.number().int().positive().max(100_000_000),
  costCenterCode: z.string().max(8).optional(),
  dueDate: z.string().date().optional(),
  // Optional installment schedule (the design's New Billing); omitted = single charge.
  installments: z
    .array(
      z.object({
        dueDate: z.string().date(),
        amountXof: z.number().int().positive().max(100_000_000),
        label: z.string().max(80).nullish(),
      }),
    )
    .min(1)
    .max(24)
    .optional(),
  requestReason: RequestReason,
});

const ApplyDiscountInput = z.object({
  studentId: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  amountXof: z.number().int().positive().max(100_000_000),
  kind: z.enum(["discount", "scholarship"]).optional(),
  costCenterCode: z.string().max(8).optional(),
  requestReason: RequestReason,
});

const UpdateFeePlanRowInput = z.object({
  label: z.string().min(1).max(80).optional(),
  dueOn: z.string().date().optional(),
  amountFullXof: z.number().int().min(0).max(100_000_000).optional(),
  amountTuitionXof: z.number().int().min(0).max(100_000_000).optional(),
  amountHousingXof: z.number().int().min(0).max(100_000_000).optional(),
  amountCafeteriaXof: z.number().int().min(0).max(100_000_000).optional(),
  requestReason: RequestReason,
});

const FeeComponentKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/);
const GlobalFeeComponentInput = z.object({
  id: z.string().min(1).max(64).optional(),
  key: FeeComponentKey,
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).nullish(),
  costCenterCode: z.string().trim().min(1).max(8),
  annualAmountXof: z.number().int().positive().max(100_000_000),
  defaultSelected: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const ReplaceFeePlanInput = z.object({
  academicYearLabel: z.string().min(4).max(20).optional(),
  reason: z.string().trim().min(1).max(1000),
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().min(1).max(80),
        dueOn: z.string().date(),
        // Compatibility only. New clients edit annual components; row amounts are derived.
        amountFullXof: z.number().int().min(0).max(100_000_000).optional(),
        amountTuitionXof: z.number().int().min(0).max(100_000_000).optional(),
        amountHousingXof: z.number().int().min(0).max(100_000_000).optional(),
        amountCafeteriaXof: z.number().int().min(0).max(100_000_000).optional(),
      }),
    )
    .min(1)
    .max(24),
  components: z.array(GlobalFeeComponentInput).min(1).max(50).optional(),
});

const UpdatePlanInput = z.object({
  installments: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        dueDate: z.string().date(),
        amountDue: z.number().int().min(0).max(100_000_000),
        label: z.string().max(80).nullish(),
        components: z
          .array(
            z.object({
              invoiceComponentId: z.string().min(1).max(64),
              amountXof: z.number().int().min(0).max(100_000_000),
            }),
          )
          .min(1)
          .max(50)
          .optional(),
      }),
    )
    .min(1)
    .max(24),
  requestReason: RequestReason,
});
const ReplacePlanInput = z.object({
  installments: z
    .array(
      z.object({
        id: z.string().min(1).max(64).optional(),
        sequence: z.number().int().positive(),
        dueDate: z.string().date(),
        amountDue: z.number().int().min(0).max(100_000_000),
        label: z.string().max(80).nullish(),
        components: z
          .array(
            z.object({
              invoiceComponentId: z.string().min(1).max(64),
              amountXof: z.number().int().min(0).max(100_000_000),
            }),
          )
          .min(1)
          .max(50)
          .optional(),
      }),
    )
    .min(1)
    .max(24),
  requestReason: RequestReason,
});
const RestoreStandardPlanInput = z.object({ requestReason: RequestReason });
const ChangeInvoiceComponentInput = z.object({
  componentKey: FeeComponentKey,
  requestReason: RequestReason,
});
const RemoveInvoiceComponentInput = z.object({
  requestReason: RequestReason,
});
const CreatePlanRequestInput = CreatePaymentPlanInput.extend({
  requestReason: RequestReason,
});
const RemoveChargeInput = z.object({ reason: RequestReason });

/** Staff-only ledger entry. Payer-facing methods remain a separate contract. */
export const RecordStudentPaymentInput = z
  .object({
    amountXof: z.number().int().positive().max(100_000_000),
    method: z.enum(["cash", "wave", "orange_money"]),
    transactionReference: z.string().trim().max(160).optional(),
    // Retried browser requests must resolve to the same ledger row.
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((input, context) => {
    const reference = input.transactionReference?.trim();
    if (input.method === "cash" && reference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionReference"],
        message: "Cash payments do not use a transaction reference",
      });
    }
    if (
      input.method !== "cash" &&
      (!reference || !/[a-z0-9]/i.test(reference))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionReference"],
        message: "A transaction reference is required for mobile money",
      });
    }
  });

const OperatingBudgetKindInput = z.enum(["income", "expense"]);
const OperatingBudgetCategoryKeyInput = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,63}$/);
const AcademicYearLabelInput = z.string().trim().min(9).max(20);
const WholeXofInput = z.number().int().min(0).max(2_000_000_000);
const PositiveXofInput = z.number().int().positive().max(2_000_000_000);
const SafeWholeXofInput = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SafeSignedXofInput = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const SafePositiveXofInput = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const OperatingBudgetInput = z
  .object({
    academicYear: AcademicYearLabelInput,
    action: z.enum(["save", "submit"]),
    reason: RequestReason,
    openingBalanceXof: SafeSignedXofInput.optional(),
    lines: z
      .array(
        z.object({
          categoryKey: OperatingBudgetCategoryKeyInput,
          month: z.string().regex(/^\d{4}-\d{2}$/),
          amountXof: SafeWholeXofInput,
        }),
      )
      .max(500),
    expectedBudgetId: z.string().min(1).max(64).nullable(),
    expectedContentVersion: z.number().int().nonnegative().nullable(),
  })
  .refine(
    (value) =>
      (value.expectedBudgetId === null) ===
      (value.expectedContentVersion === null),
    "Expected budget id and content version must both be null or both be provided",
  );
const OperatingBudgetForecastInput = z.object({
  academicYear: AcademicYearLabelInput,
  scenario: z.enum(["conservative", "base", "optimistic"]),
  collectionRatePercent: z.number().min(0).max(100).optional(),
  expenseGrowthPercent: z.number().min(-100).max(100).optional(),
});
const ManagementActualInput = z.object({
  academicYear: AcademicYearLabelInput,
  kind: OperatingBudgetKindInput,
  categoryKey: OperatingBudgetCategoryKeyInput,
  costCenterCode: z.string().trim().min(1).max(8),
  amountXof: SafePositiveXofInput,
  occurredOn: z.string().date(),
  description: z.string().trim().max(500).optional(),
  payee: z.string().trim().max(160).optional(),
  isEstimate: z.boolean().optional(),
  reason: RequestReason,
});
const ManagementActualPatchInput = z
  .object({
    academicYear: AcademicYearLabelInput.optional(),
    categoryKey: OperatingBudgetCategoryKeyInput.optional(),
    costCenterCode: z.string().trim().min(1).max(8).optional(),
    amountXof: SafePositiveXofInput.optional(),
    occurredOn: z.string().date().optional(),
    description: z.string().trim().min(1).max(500).optional(),
    payee: z.string().trim().max(160).optional(),
    isEstimate: z.boolean().optional(),
    reason: RequestReason,
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "reason"),
    "Include at least one field to change",
  );
const ManagementAdjustmentInput = z.object({
  academicYear: AcademicYearLabelInput,
  kind: OperatingBudgetKindInput,
  categoryKey: OperatingBudgetCategoryKeyInput,
  costCenterCode: z.string().trim().min(1).max(8),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  requestedActualXof: SafeSignedXofInput,
  description: z.string().trim().max(500).optional(),
  reason: RequestReason,
});
const ApprovalReasonInput = z.object({ reason: RequestReason });
const ActualSourceInput = z.enum([
  "bursar",
  "payment",
  "unallocated_credit",
  "legacy_payment",
  "refund",
  "expense",
  "manual_income",
  "adjustment",
]);
const LegacyProtectedExpenseInput = z.object({
  academicYear: AcademicYearLabelInput.optional(),
  managementCategoryKey: OperatingBudgetCategoryKeyInput,
  costCenterCode: z.string().trim().min(1).max(8),
  category: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  payee: z.string().trim().max(160).optional(),
  amount: PositiveXofInput,
  isEstimate: z.boolean().default(false),
  incurredOn: z.string().date(),
  requestReason: RequestReason,
});
const LegacyProtectedExpensePatchInput = z
  .object({
    academicYear: AcademicYearLabelInput.optional(),
    managementCategoryKey: OperatingBudgetCategoryKeyInput.optional(),
    costCenterCode: z.string().trim().min(1).max(8).optional(),
    description: z.string().trim().max(500).optional(),
    payee: z.string().trim().max(160).optional(),
    amount: PositiveXofInput.optional(),
    isEstimate: z.boolean().optional(),
    incurredOn: z.string().date().optional(),
    requestReason: RequestReason,
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "requestReason"),
    "Include at least one expense field to change",
  );

@Controller("finance/admin")
@Roles("bursar", "admin")
export class AdminFinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly approvals: FinanceApprovalsService,
    private readonly operatingBudget: OperatingBudgetService,
  ) {}

  @Get("summary")
  summary() {
    return this.finance.getCollectionSummary();
  }

  @Get("links")
  links() {
    return this.finance.listPaymentLinks();
  }

  @Post("links")
  createLink(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreatePaymentLinkInput.parse(body);
    return this.finance.createPaymentLink(user.personId, input);
  }

  @Post("links/:id/cancel")
  cancelLink(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.cancelPaymentLink(id, user.personId);
  }

  @Get("payments")
  payments(@Query("status") status?: string) {
    return this.finance.listPayments(status);
  }

  @Get("overdue")
  overdue() {
    return this.finance.listOverdue();
  }

  @Get("aging")
  aging() {
    return this.finance.arAging();
  }

  @Get("reports")
  reports() {
    return this.finance.reports();
  }

  @Get("payments/:id/receipt")
  receipt(@Param("id") id: string) {
    return this.finance.getReceipt(id);
  }

  @Post("payments/:id/refund")
  refund(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.finance.refundPayment(id, body?.reason, user.personId);
  }

  @Get("accounts")
  accounts() {
    return this.finance.listStudentAccounts();
  }

  // The registrar's student profile has a read-only Finance tab (balance + payment
  // history), so this one read overrides the bursar/admin class default. The write
  // endpoints (charges, discounts, plans) stay bursar/admin only.
  @Get("students/:id/account")
  @Roles("bursar", "admin", "registrar")
  account(@Param("id") id: string) {
    return this.finance.getStudentAccount(id);
  }

  /** Record money already received by Finance; Director audit remains post-hoc. */
  @Post("students/:studentId/payments")
  @Roles("bursar")
  recordStudentPayment(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.finance.recordStudentPayment({
      studentId,
      ...RecordStudentPaymentInput.parse(body),
      actor: user,
    });
  }

  @Post("students")
  createStudent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.finance.createStudent(
      user.personId,
      CreateStudentInput.parse(body),
    );
  }

  @Post("students/:studentId/standard-package")
  assignStandardPackage(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.finance.assignStandardPackage(studentId, user.personId);
  }

  @Post("charges")
  addCharge(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { requestReason, ...input } = AddChargeInput.parse(body);
    return this.approvals.request(user, {
      kind: "custom_charge",
      targetType: "Invoice",
      reason: requestReason,
      after: input,
    });
  }

  @Delete("charges/:invoiceId")
  removeCharge(
    @CurrentUser() user: AuthUser,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const { reason } = RemoveChargeInput.parse(body);
    return this.approvals.request(user, {
      kind: "charge_removal",
      targetType: "Invoice",
      targetId: invoiceId,
      reason,
      after: { invoiceId },
    });
  }

  @Get("fee-plan")
  feePlan(@Query("year") year?: string) {
    return this.finance.getFeePlan(year);
  }

  @Patch("fee-plan/:id")
  updateFeePlanRow(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { requestReason, ...input } = UpdateFeePlanRowInput.parse(body);
    return this.finance.getFeePlan().then((schedule) =>
      this.approvals.request(user, {
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: id,
        academicYearLabel: schedule.academicYearLabel ?? undefined,
        reason: requestReason,
        after: { rowId: id, input },
      }),
    );
  }

  /** One approval request for a whole schedule edit session. */
  @Put("fee-plan")
  replaceFeePlan(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = ReplaceFeePlanInput.parse(body);
    return this.finance.getFeePlan(input.academicYearLabel).then((schedule) =>
      this.approvals.request(user, {
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: schedule.scheduleId ?? undefined,
        academicYearLabel: schedule.academicYearLabel ?? undefined,
        reason: input.reason,
        after: { rows: input.rows, components: input.components },
      }),
    );
  }

  @Post("discounts")
  applyDiscount(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { requestReason, ...input } = ApplyDiscountInput.parse(body);
    return this.approvals.request(user, {
      kind: input.kind === "scholarship" ? "scholarship" : "discount",
      targetType: "Student",
      targetId: input.studentId,
      reason: requestReason,
      after: input,
    });
  }

  @Post("plans")
  createPlan(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { requestReason, ...input } = CreatePlanRequestInput.parse(body);
    return this.approvals.request(user, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: input.invoiceId,
      reason: requestReason,
      after: { mode: "create", installments: input.installments },
    });
  }

  @Patch("plans/:invoiceId")
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const input = UpdatePlanInput.parse(body);
    return this.approvals.request(user, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoiceId,
      reason: input.requestReason,
      after: { mode: "update", installments: input.installments },
    });
  }

  @Put("plans/:invoiceId")
  replacePlan(
    @CurrentUser() user: AuthUser,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const input = ReplacePlanInput.parse(body);
    return this.approvals.request(user, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoiceId,
      reason: input.requestReason,
      after: { mode: "replace", installments: input.installments },
    });
  }

  @Post("plans/:invoiceId/restore-standard")
  restoreStandardPlan(
    @CurrentUser() user: AuthUser,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const input = RestoreStandardPlanInput.parse(body);
    return this.approvals.request(user, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoiceId,
      reason: input.requestReason,
      after: { mode: "restore_standard" },
    });
  }

  @Post("plans/:invoiceId/components")
  addPlanComponent(
    @CurrentUser() user: AuthUser,
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown,
  ) {
    const input = ChangeInvoiceComponentInput.parse(body);
    return this.approvals.request(user, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoiceId,
      reason: input.requestReason,
      after: { mode: "add_component", componentKey: input.componentKey },
    });
  }

  @Delete("plans/:invoiceId/components/:componentKey")
  removePlanComponent(
    @CurrentUser() user: AuthUser,
    @Param("invoiceId") invoiceId: string,
    @Param("componentKey") componentKey: string,
    @Body() body: unknown,
  ) {
    const input = RemoveInvoiceComponentInput.parse(body);
    return this.approvals.request(user, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: invoiceId,
      reason: input.requestReason,
      after: {
        mode: "remove_component",
        componentKey: FeeComponentKey.parse(componentKey),
      },
    });
  }

  @Get("collections-timeline")
  collectionsTimeline(@Query("academicYear") academicYear?: string) {
    return this.finance.collectionsTimeline(academicYear);
  }

  @Get("operating-budget")
  operatingBudgetView(@Query("academicYear") academicYear?: string) {
    return this.operatingBudget.getOperatingBudget(
      academicYear ? AcademicYearLabelInput.parse(academicYear) : undefined,
    );
  }

  @Put("operating-budget")
  async updateOperatingBudget(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const input = OperatingBudgetInput.parse(body);
    const saved = await this.operatingBudget.saveDraft(user, input);
    if (input.action === "save") return saved;
    const { budgetId, contentVersion, contentHash } = saved.savedClaim;
    if (!budgetId || !contentHash) {
      throw new Error("Saved operating-budget draft has no revision id");
    }
    return this.approvals.request(user, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: budgetId,
      academicYearLabel: input.academicYear,
      reason: input.reason,
      after: {
        mode: "publish_budget",
        budgetId,
        expectedContentVersion: contentVersion,
        expectedContentHash: contentHash,
      },
    });
  }

  @Post("operating-budget/forecast")
  operatingBudgetForecast(@Body() body: unknown) {
    return this.operatingBudget.forecast(
      OperatingBudgetForecastInput.parse(body),
    );
  }

  @Get("operating-budget/actuals")
  operatingBudgetActuals(
    @Query("academicYear") academicYear?: string,
    @Query("kind") kind?: string,
    @Query("categoryKey") categoryKey?: string,
    @Query("month") month?: string,
    @Query("costCenterCode") costCenterCode?: string,
    @Query("source") source?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.operatingBudget
      .listActuals({
        academicYear: academicYear
          ? AcademicYearLabelInput.parse(academicYear)
          : undefined,
        kind: kind ? OperatingBudgetKindInput.parse(kind) : undefined,
        categoryKey: categoryKey
          ? OperatingBudgetCategoryKeyInput.parse(categoryKey)
          : undefined,
        month,
        costCenterCode,
        source: source ? ActualSourceInput.parse(source) : undefined,
        cursor,
        limit:
          limit === undefined
            ? undefined
            : z.coerce.number().int().parse(limit),
      })
      .then((result) => ({
        ...result,
        items: result.items.map((item) => ({
          ...item,
          source:
            item.source === "payment" ||
            item.source === "legacy_payment" ||
            item.source === "unallocated_credit"
              ? "bursar"
              : item.source,
        })),
      }));
  }

  @Post("operating-budget/manual-income")
  async createOperatingBudgetIncome(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const input = ManagementActualInput.parse({
      ...(body as Record<string, unknown>),
      kind: "income",
    });
    const { reason, ...values } = input;
    const after = await this.operatingBudget.prepareActualCreate(
      values,
      "create_income",
    );
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: input.academicYear,
      reason,
      after,
    });
  }

  @Post("operating-budget/expenses")
  async createOperatingBudgetExpense(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const input = ManagementActualInput.parse({
      ...(body as Record<string, unknown>),
      kind: "expense",
    });
    const { reason, ...values } = input;
    const after = await this.operatingBudget.prepareActualCreate(
      values,
      "create_expense",
    );
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "Expense",
      academicYearLabel: input.academicYear,
      reason,
      after,
    });
  }

  @Patch("operating-budget/expenses/:id")
  async updateOperatingBudgetExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { reason, ...patch } = ManagementActualPatchInput.parse(body);
    const after = await this.operatingBudget.prepareExpenseUpdate(id, patch);
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "Expense",
      targetId: id,
      academicYearLabel: after.academicYear,
      reason,
      after,
    });
  }

  @Delete("operating-budget/expenses/:id")
  voidOperatingBudgetExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { reason } = ApprovalReasonInput.parse(body);
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "Expense",
      targetId: id,
      reason,
      after: { mode: "void_expense" },
    });
  }

  @Post("operating-budget/actual-entries")
  async createOperatingBudgetActual(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const input = ManagementActualInput.parse(body);
    const { reason, ...values } = input;
    const after = await this.operatingBudget.prepareActualCreate(
      values,
      input.kind === "income" ? "create_income" : "create_expense",
    );
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: input.kind === "income" ? "ManagementActualEntry" : "Expense",
      academicYearLabel: input.academicYear,
      reason,
      after,
    });
  }

  @Patch("operating-budget/actual-entries/:id")
  async updateOperatingBudgetActual(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { reason, ...patch } = ManagementActualPatchInput.parse(body);
    const after = await this.operatingBudget.prepareActualEntryUpdate(
      id,
      patch,
    );
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      targetId: id,
      academicYearLabel: after.academicYear,
      reason,
      after,
    });
  }

  @Delete("operating-budget/actual-entries/:id")
  voidOperatingBudgetActual(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { reason } = ApprovalReasonInput.parse(body);
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      targetId: id,
      reason,
      after: { mode: "void_entry" },
    });
  }

  @Post("operating-budget/adjustments")
  async createOperatingBudgetAdjustment(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const { reason, ...input } = ManagementAdjustmentInput.parse(body);
    const after = await this.operatingBudget.adjustmentRequest(input);
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: input.academicYear,
      reason,
      after,
    });
  }

  @Get("director-overview")
  directorOverview(@Query("fy") fy?: string) {
    return this.finance.directorOverview(fy ?? "FY2026");
  }

  @Get("cost-centers")
  costCenters() {
    return this.finance.listCostCenters();
  }

  @Get("expenses")
  expenses() {
    return this.finance.listExpenses();
  }

  @Post("expenses")
  async createExpense(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = LegacyProtectedExpenseInput.parse(body);
    const academicYear = await this.operatingBudget.resolveAcademicYearLabel(
      input.academicYear,
    );
    const after = await this.operatingBudget.prepareActualCreate(
      {
        academicYear,
        kind: "expense",
        categoryKey: input.managementCategoryKey,
        costCenterCode: input.costCenterCode,
        amountXof: input.amount,
        occurredOn: input.incurredOn,
        description: input.description,
        payee: input.payee,
        isEstimate: input.isEstimate,
      },
      "create_expense",
    );
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "Expense",
      academicYearLabel: academicYear,
      reason: input.requestReason,
      after,
    });
  }

  @Patch("expenses/:id")
  async updateExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = LegacyProtectedExpensePatchInput.parse(body);
    const after = await this.operatingBudget.prepareExpenseUpdate(id, {
      academicYear: input.academicYear,
      categoryKey: input.managementCategoryKey,
      costCenterCode: input.costCenterCode,
      amountXof: input.amount,
      occurredOn: input.incurredOn,
      description: input.description,
      payee: input.payee,
      isEstimate: input.isEstimate,
    });
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "Expense",
      targetId: id,
      academicYearLabel: after.academicYear,
      reason: input.requestReason,
      after,
    });
  }

  @Delete("expenses/:id")
  deleteExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = ApprovalReasonInput.parse(body);
    return this.approvals.request(user, {
      kind: "management_actual",
      targetType: "Expense",
      targetId: id,
      reason: parsed.reason,
      after: { mode: "void_expense" },
    });
  }

  @Post("budgets")
  setBudget(@Body() body: unknown) {
    return this.finance.setBudget(SetBudgetInput.parse(body));
  }
}

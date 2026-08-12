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
  StreamableFile,
} from "@nestjs/common";
import { z } from "zod";
import {
  CreateExpenseInput,
  CreatePaymentPlanInput,
  SetBudgetInput,
  WireApprovalInput,
  WirePaymentConfig,
} from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";

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

const ReplaceFeePlanInput = z.object({
  academicYearLabel: z.string().min(4).max(20).optional(),
  reason: z.string().trim().min(1).max(1000),
  rows: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().min(1).max(80),
        dueOn: z.string().date(),
        amountFullXof: z.number().int().min(0).max(100_000_000),
        amountTuitionXof: z.number().int().min(0).max(100_000_000),
        amountHousingXof: z.number().int().min(0).max(100_000_000),
        amountCafeteriaXof: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(24),
});

const UpdatePlanInput = z.object({
  installments: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        dueDate: z.string().date(),
        amountDue: z.number().int().min(0).max(100_000_000),
        label: z.string().max(80).nullish(),
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
      }),
    )
    .min(1)
    .max(24),
  requestReason: RequestReason,
});
const CreatePlanRequestInput = CreatePaymentPlanInput.extend({
  requestReason: RequestReason,
});
const RejectWireInput = z.object({
  reason: z.string().trim().min(1).max(1000),
});
const RemoveChargeInput = z.object({ reason: RequestReason });
const WireStatusInput = z.enum(["submitted", "approved", "rejected"]);

@Controller("finance/admin")
@Roles("bursar", "admin")
export class AdminFinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly approvals: FinanceApprovalsService,
  ) {}

  @Get("summary")
  summary() {
    return this.finance.getCollectionSummary();
  }

  @Get("wire-config")
  wireConfig() {
    return this.finance.getWirePaymentConfig();
  }

  @Patch("wire-config")
  updateWireConfig(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.finance.updateWirePaymentConfig(
      WirePaymentConfig.parse(body),
      user.personId,
    );
  }

  @Get("wire-transfers")
  wireTransfers(@Query("status") status?: string) {
    return this.finance.listWireTransfers(
      status ? WireStatusInput.parse(status) : undefined,
    );
  }

  @Get("wire-transfers/:id/proof")
  async wireProof(@Param("id") id: string) {
    const proof = await this.finance.getWireProof(id);
    return new StreamableFile(proof.data, {
      type: proof.mimeType,
      disposition: `inline; filename="${proof.fileName}"`,
    });
  }

  @Post("wire-transfers/:id/approve")
  approveWire(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.finance.approveWireTransfer(
      id,
      WireApprovalInput.parse(body),
      user,
    );
  }

  @Post("wire-transfers/:id/reject")
  rejectWire(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = RejectWireInput.parse(body);
    return this.finance.rejectWireTransfer(id, input.reason, user);
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

  @Post("links/:id/mark-paid")
  markLinkPaid(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.markPaymentLinkPaid(id, user.personId);
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
        after: { rows: input.rows },
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

  @Get("collections-timeline")
  collectionsTimeline(@Query("academicYear") academicYear?: string) {
    return this.finance.collectionsTimeline(academicYear);
  }

  @Post("reconcile")
  reconcile() {
    return this.finance
      .listStalePendingPayments(60)
      .then((stale) => ({ stale }));
  }

  @Post("payments/:id/confirm")
  confirmPayment(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.confirmPaymentManually(id, user.personId);
  }

  @Post("payments/:id/cancel")
  cancelPayment(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.cancelPaymentManually(id, user.personId);
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
  createExpense(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.finance.createExpense(
      CreateExpenseInput.parse(body),
      user.personId,
    );
  }

  @Patch("expenses/:id")
  updateExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.finance.updateExpense(
      id,
      CreateExpenseInput.partial().parse(body),
      user.personId,
    );
  }

  @Delete("expenses/:id")
  deleteExpense(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.finance.deleteExpense(id, user.personId);
  }

  @Post("budgets")
  setBudget(@Body() body: unknown) {
    return this.finance.setBudget(SetBudgetInput.parse(body));
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CreateExpenseInput, CreatePaymentPlanInput, SetBudgetInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";

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

@Controller("finance/admin")
@Roles("bursar", "admin")
export class AdminFinanceController {
  constructor(private readonly finance: FinanceService) {}

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
  refund(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { reason?: string }) {
    return this.finance.refundPayment(id, body?.reason, user.personId);
  }

  @Get("accounts")
  accounts() {
    return this.finance.listStudentAccounts();
  }

  @Get("students/:id/account")
  account(@Param("id") id: string) {
    return this.finance.getStudentAccount(id);
  }

  @Post("plans")
  createPlan(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreatePaymentPlanInput.parse(body);
    return this.finance.createPaymentPlan(input, user.personId);
  }

  @Post("reconcile")
  reconcile() {
    return this.finance.listStalePendingPayments(60).then((stale) => ({ stale }));
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
    return this.finance.createExpense(CreateExpenseInput.parse(body), user.personId);
  }

  @Patch("expenses/:id")
  updateExpense(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.finance.updateExpense(id, CreateExpenseInput.partial().parse(body), user.personId);
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

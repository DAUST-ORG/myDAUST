import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CreateExpenseInput, CreatePaymentPlanInput, SetBudgetInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";

@Controller("finance/admin")
@Roles("bursar", "admin")
export class AdminFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("summary")
  summary() {
    return this.finance.getCollectionSummary();
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
    return this.finance.reconcileStalePayments(60).then((count) => ({ reconciled: count }));
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

  @Post("budgets")
  setBudget(@Body() body: unknown) {
    return this.finance.setBudget(SetBudgetInput.parse(body));
  }
}

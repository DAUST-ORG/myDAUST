import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import {
  AdjustInventoryInput,
  AdvanceOrderInput,
  ChoosePlanInput,
  CreateInventoryItemInput,
  CreateMenuItemInput,
  CreateOrderInput,
  DiningSettingsInput,
  LiveScansQuery,
  MealPeriod,
  OverrideInput,
  ProofPaymentMethod,
  ScanInput,
  SetMenuImageInput,
  SetMenuScheduleInput,
  UpsertDietaryInput,
  UpsertMealBudgetInput,
} from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { DiningService } from "./dining.service.js";

const BudgetRangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
});
const WeekInput = z.object({
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
});

/**
 * No class-level `@Roles`. `getAllAndOverride([handler, class])` means a class list is
 * *replaced* by any method list rather than intersected with it, so a class-level default
 * would look like a floor and act like a ceiling. `dining-role.test.ts` asserts every
 * handler carries its own.
 */
@Controller("dining")
export class DiningController {
  constructor(private readonly dining: DiningService) {}

  // --- Student ---

  @Get("my/pass")
  @Roles("student")
  myPass(@CurrentUser() user: AuthUser) {
    return this.dining.myPass(user.studentId!);
  }

  @Post("my/plan")
  @Roles("student")
  choosePlan(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.choosePlan(
      user.studentId!,
      user,
      ChoosePlanInput.parse(body).type,
    );
  }

  @Get("my/plan-options")
  @Roles("student")
  myPlanOptions(@CurrentUser() user: AuthUser) {
    return this.dining.myPlanOptions(user.studentId!);
  }

  @Get("menu")
  @Roles("student", "faculty", "dining", "admin")
  menu() {
    return this.dining.menu();
  }

  @Get("my/today")
  @Roles("student")
  myToday(@CurrentUser() user: AuthUser) {
    return this.dining.myToday(user.studentId!);
  }

  /** What the entrance would say right now, so the student is not surprised at the door. */
  @Get("my/eligibility")
  @Roles("student")
  myEligibility(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.dining.myEligibility(
      user.studentId!,
      LiveScansQuery.parse(query ?? {}).period,
    );
  }

  @Get("my/orders")
  @Roles("student")
  myOrders(@CurrentUser() user: AuthUser) {
    return this.dining.myOrders(user.studentId!);
  }

  @Post("my/orders")
  @Roles("student")
  createOrder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.createOrder(
      user.studentId!,
      CreateOrderInput.parse(body).items,
    );
  }

  @Post("my/orders/:id/pay")
  @Roles("student")
  payOrder(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.dining.payOrder(
      user.studentId!,
      id,
      ProofPaymentMethod.parse((body as { method?: unknown })?.method),
      user,
    );
  }

  /** Cancel your own unpaid cart. Paid orders need the Finance refund path. */
  @Post("my/orders/:id/cancel")
  @Roles("student")
  cancelMyOrder(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.dining.cancelOrder(id, user.studentId!, user.personId);
  }

  // --- Scanner station ---

  @Post("scan")
  @Roles("dining", "admin")
  scan(@Body() body: unknown) {
    const input = ScanInput.parse(body);
    return this.dining.scan(input.token, input.period);
  }

  @Post("scan/override")
  @Roles("dining", "admin")
  scanOverride(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = OverrideInput.parse(body);
    return this.dining.scanOverride(
      input.studentNo,
      input.period,
      user.personId,
    );
  }

  @Get("scans")
  @Roles("dining", "admin")
  liveScans(@Query() query: unknown) {
    return this.dining.liveScans(LiveScansQuery.parse(query ?? {}).period);
  }

  // --- Admin console ---

  @Get("admin/overview")
  @Roles("dining", "admin")
  overview() {
    return this.dining.adminOverview();
  }

  @Get("admin/students")
  @Roles("dining", "admin")
  adminStudents() {
    return this.dining.adminStudents();
  }

  @Get("admin/orders")
  @Roles("dining", "admin")
  orders() {
    return this.dining.adminOrders();
  }

  @Post("admin/orders/:id/advance")
  @Roles("dining", "admin")
  advance(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.dining.advanceOrder(
      id,
      AdvanceOrderInput.parse(body).status,
      user.personId,
    );
  }

  /** Staff cancel of an unpaid cart. Anything paid stays on the Finance refund path. */
  @Post("admin/orders/:id/cancel")
  @Roles("dining", "admin")
  cancelOrder(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.dining.cancelOrder(id, null, user.personId);
  }

  @Get("admin/menu")
  @Roles("dining", "admin")
  adminMenu() {
    return this.dining.adminMenu();
  }

  @Post("admin/menu")
  @Roles("dining", "admin")
  createMenuItem(@Body() body: unknown) {
    return this.dining.createMenuItem(CreateMenuItemInput.parse(body));
  }

  @Post("admin/menu/:id/image")
  @Roles("dining", "admin")
  setMenuItemImage(@Param("id") id: string, @Body() body: unknown) {
    return this.dining.setMenuItemImage(
      id,
      SetMenuImageInput.parse(body).imageUrl,
    );
  }

  @Post("admin/menu/:id/toggle")
  @Roles("dining", "admin")
  toggleMenuItem(@Param("id") id: string) {
    return this.dining.toggleMenuItem(id);
  }

  @Get("admin/reports")
  @Roles("dining", "admin")
  adminReports() {
    return this.dining.adminReports();
  }

  // Cost center 3600 is the bursar's, so finance may read these two and nothing else here.
  @Get("admin/settlement")
  @Roles("dining", "admin", "bursar")
  settlement() {
    return this.dining.settlement();
  }

  @Get("admin/finances")
  @Roles("dining", "admin", "bursar")
  finances() {
    return this.dining.diningFinances();
  }

  @Get("admin/transactions")
  @Roles("dining", "admin", "bursar")
  transactions() {
    return this.dining.diningTransactions();
  }

  @Get("admin/settings")
  @Roles("dining", "admin")
  settings() {
    return this.dining.settings();
  }

  @Put("admin/settings")
  @Roles("dining", "admin")
  updateSettings(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.updateSettings(
      DiningSettingsInput.parse(body),
      user.personId,
    );
  }

  // --- Back office: dietary, inventory, budgets, schedule ---
  // Read/write stays inside dining/admin. Approval and money authority never
  // move here: plan changes approve in Finance, proofs verify in Finance.

  @Get("my/dietary")
  @Roles("student")
  myDietary(@CurrentUser() user: AuthUser) {
    return this.dining.myDietary(user.studentId!);
  }

  @Get("admin/dietary")
  @Roles("dining", "admin")
  listDietary() {
    return this.dining.listDietary();
  }

  @Put("admin/dietary")
  @Roles("dining", "admin")
  upsertDietary(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.upsertDietary(
      UpsertDietaryInput.parse(body),
      user.personId,
    );
  }

  @Get("admin/inventory")
  @Roles("dining", "admin")
  listInventory() {
    return this.dining.listInventory();
  }

  @Post("admin/inventory")
  @Roles("dining", "admin")
  createInventoryItem(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.createInventoryItem(
      CreateInventoryItemInput.parse(body),
      user.personId,
    );
  }

  @Post("admin/inventory/:id/adjust")
  @Roles("dining", "admin")
  adjustInventory(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.dining.adjustInventory(
      id,
      AdjustInventoryInput.parse(body),
      user.personId,
    );
  }

  @Post("admin/inventory/:id/toggle")
  @Roles("dining", "admin")
  toggleInventoryItem(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.dining.toggleInventoryItem(id, user.personId);
  }

  @Get("admin/budgets")
  @Roles("dining", "admin")
  listBudgets(@Query() query: unknown) {
    const range = BudgetRangeInput.parse(query ?? {});
    return this.dining.listBudgets(range.from, range.to);
  }

  @Put("admin/budgets")
  @Roles("dining", "admin")
  upsertBudget(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.upsertBudget(
      UpsertMealBudgetInput.parse(body),
      user.personId,
    );
  }

  @Get("admin/schedule")
  @Roles("dining", "admin")
  weekSchedule(@Query() query: unknown) {
    return this.dining.weekSchedule(WeekInput.parse(query ?? {}).week);
  }

  @Put("admin/schedule")
  @Roles("dining", "admin")
  setSchedule(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.setSchedule(
      SetMenuScheduleInput.parse(body),
      user.personId,
    );
  }
}

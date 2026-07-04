import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  AdvanceOrderInput,
  ChoosePlanInput,
  CreateMenuItemInput,
  CreateOrderInput,
  type MealPeriod,
  ScanInput,
} from "@mydaust/shared";
import { z } from "zod";

// Local schemas (shared package is frozen for this change; api has its own zod).
const OverrideInput = z.object({
  studentNo: z.string().min(1).max(40),
  period: z.enum(["breakfast", "lunch", "dinner"]),
});
const MenuImageInput = z.object({ imageUrl: z.string().max(500) });
const OptionalImageInput = z.object({ imageUrl: z.string().max(500).optional() });
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { DiningService } from "./dining.service.js";

@Controller("dining")
export class DiningController {
  constructor(private readonly dining: DiningService) {}

  // Student
  @Get("my/pass")
  @Roles("student")
  myPass(@CurrentUser() user: AuthUser) {
    return this.dining.myPass(user.studentId!);
  }

  @Post("my/plan")
  @Roles("student")
  choosePlan(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.choosePlan(user.studentId!, ChoosePlanInput.parse(body).type);
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

  @Get("my/orders")
  @Roles("student")
  myOrders(@CurrentUser() user: AuthUser) {
    return this.dining.myOrders(user.studentId!);
  }

  @Post("my/orders")
  @Roles("student")
  createOrder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.dining.createOrder(user.studentId!, CreateOrderInput.parse(body).items);
  }

  @Post("my/orders/:id/pay")
  @Roles("student")
  payOrder(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.dining.payOrder(user.studentId!, id);
  }

  // Scanner station
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
    return this.dining.scanOverride(input.studentNo, input.period, user.personId);
  }

  @Get("scans")
  @Roles("dining", "admin")
  liveScans(@Query("period") period: MealPeriod) {
    return this.dining.liveScans(period ?? "lunch");
  }

  // Admin console
  @Get("admin/overview")
  @Roles("dining", "admin")
  overview() {
    return this.dining.adminOverview();
  }

  @Get("admin/orders")
  @Roles("dining", "admin")
  orders() {
    return this.dining.adminOrders();
  }

  @Post("admin/orders/:id/advance")
  @Roles("dining", "admin")
  advance(@Param("id") id: string, @Body() body: unknown) {
    return this.dining.advanceOrder(id, AdvanceOrderInput.parse(body).status);
  }

  @Get("admin/settlement")
  @Roles("dining", "admin")
  settlement() {
    return this.dining.settlement();
  }

  @Get("admin/students")
  @Roles("dining", "admin")
  adminStudents() {
    return this.dining.adminStudents();
  }

  @Get("admin/reports")
  @Roles("dining", "admin")
  adminReports() {
    return this.dining.adminReports();
  }

  @Get("admin/menu")
  @Roles("dining", "admin")
  adminMenu() {
    return this.dining.adminMenu();
  }

  @Post("admin/menu")
  @Roles("dining", "admin")
  createMenuItem(@Body() body: unknown) {
    const input = CreateMenuItemInput.parse(body);
    const { imageUrl } = OptionalImageInput.parse(body);
    return this.dining.createMenuItem({ ...input, imageUrl });
  }

  @Post("admin/menu/:id/image")
  @Roles("dining", "admin")
  setMenuItemImage(@Param("id") id: string, @Body() body: unknown) {
    return this.dining.setMenuItemImage(id, MenuImageInput.parse(body).imageUrl);
  }

  @Post("admin/menu/:id/toggle")
  @Roles("dining", "admin")
  toggleMenuItem(@Param("id") id: string) {
    return this.dining.toggleMenuItem(id);
  }
}

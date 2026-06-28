import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  AdvanceOrderInput,
  ChoosePlanInput,
  CreateMenuItemInput,
  CreateOrderInput,
  type MealPeriod,
  ScanInput,
} from "@mydaust/shared";
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
  @Roles("student", "dining", "admin")
  menu() {
    return this.dining.menu();
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

  @Post("admin/menu/:id/toggle")
  @Roles("dining", "admin")
  toggleMenuItem(@Param("id") id: string) {
    return this.dining.toggleMenuItem(id);
  }
}

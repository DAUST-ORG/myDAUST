import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ChoosePlanInput, CreateOrderInput, type MealPeriod } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { DiningService } from "./dining.service.js";

/**
 * Student-facing dining only. The dining console and scanner station were retired
 * with the SIS redesign, which has no staff dining surface; the meal-plan, pass and
 * weekend-order data they wrote still backs the student Dining screen.
 */
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
  @Roles("student", "faculty", "admin")
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
}

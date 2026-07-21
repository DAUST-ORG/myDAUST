import { Body, Controller, Get, Post } from "@nestjs/common";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { HrService } from "./hr.service.js";

@Controller("hr")
@Roles("faculty", "hr", "admin", "registrar", "bursar", "it_admin")
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get("my/payslips")
  payslips(@CurrentUser() user: AuthUser) {
    return this.hr.payslips(user.personId);
  }

  @Get("my/leave")
  leave(@CurrentUser() user: AuthUser) {
    return this.hr.myLeave(user.personId);
  }

  @Post("my/leave")
  requestLeave(@CurrentUser() user: AuthUser, @Body() body: { type: string; startDate: string; endDate: string; reason?: string }) {
    return this.hr.requestLeave(user.personId, body);
  }

  @Get("my/bookings")
  bookings(@CurrentUser() user: AuthUser) {
    return this.hr.myBookings(user.personId);
  }

  @Post("my/bookings")
  book(@CurrentUser() user: AuthUser, @Body() body: { room: string; date: string; startTime: string; endTime: string; purpose?: string }) {
    return this.hr.book(user.personId, body);
  }
}

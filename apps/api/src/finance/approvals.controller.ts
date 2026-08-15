import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";

const NoteInput = z.object({ note: z.string().trim().max(1000).optional() });
const RejectionInput = z.object({
  reason: z.string().trim().min(1).max(1000),
});
const ViewInput = z.enum(["pending", "history", "mine"]);

@Controller("approvals")
@Roles("bursar", "admin")
export class ApprovalsController {
  constructor(private readonly approvals: FinanceApprovalsService) {}

  @Get()
  @Roles("bursar", "registrar", "admin")
  list(
    @CurrentUser() user: AuthUser,
    @Query("view") view?: string,
    @Query("search") search?: string,
  ) {
    return this.approvals.list(
      user,
      view ? ViewInput.parse(view) : "pending",
      search,
    );
  }

  @Post(":id/approve")
  @Roles("admin")
  approve(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.approvals.approve(id, user, NoteInput.parse(body ?? {}).note);
  }

  @Post(":id/reject")
  @Roles("admin")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.approvals.reject(id, user, RejectionInput.parse(body).reason);
  }

  @Post(":id/cancel")
  @Roles("bursar", "registrar", "admin")
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.approvals.cancel(id, user, NoteInput.parse(body ?? {}).note);
  }
}

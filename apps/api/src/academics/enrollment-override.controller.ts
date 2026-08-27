import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  EnrollmentOverrideApproveInput,
  EnrollmentOverrideRequestInput,
  FacultyOverrideDecideInput,
} from "@mydaust/shared";
import { z } from "zod";
import { CurrentUser, type AuthUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { EnrollmentOverrideService } from "./enrollment-approvals.service.js";
const RejectionInput = z.object({
  reason: z.string().trim().min(1).max(1000),
});
const CancelInput = z.object({
  note: z.string().trim().max(1000).optional(),
});
const OverrideIdParam = z.object({ id: z.string().uuid() });


@Controller("academics/enrollment-overrides")
export class EnrollmentOverrideController {
  constructor(private readonly overrides: EnrollmentOverrideService) {}

  /** Student self-service: submit a request after enroll() rejected them. */
  @Post()
  @Roles("student", "admin")
  request(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = EnrollmentOverrideRequestInput.parse(body);
    return this.overrides.request(user, input);
  }

  /** Student lists their own requests (pending + decided). */
  @Get("mine")
  @Roles("student", "admin")
  myRequests(@CurrentUser() user: AuthUser) {
    return this.overrides.listMine(user);
  }

  /** Faculty list: override requests for sections the caller teaches. */
  @Get("faculty")
  @Roles("faculty", "admin")
  facultyList(@CurrentUser() user: AuthUser) {
    return this.overrides.listForFaculty(user);
  }

  /** Admin approves by picking gates to waive. */
  @Post(":id/approve")
  @Roles("admin")
  approve(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = OverrideIdParam.parse(params);
    const input = EnrollmentOverrideApproveInput.parse(body);
    return this.overrides.approve(id, user, input);
  }

  /** Faculty approve: picks which academic gates to waive. Section ownership enforced. */
  @Post(":id/faculty-decide")
  @Roles("faculty", "admin")
  facultyDecide(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = OverrideIdParam.parse(params);
    const input = FacultyOverrideDecideInput.parse(body);
    if (!input.waive) {
      const reason = input.note?.trim() || "Denied by faculty";
      return this.overrides.facultyReject(id, user, reason);
    }
    if (!input.waivedGates || input.waivedGates.length === 0) {
      return this.overrides.facultyReject(
        id,
        user,
        "No gates selected to waive",
      );
    }
    return this.overrides.facultyApprove(id, user, {
      waivedGates: input.waivedGates,
      note: input.note,
    });
  }

  @Post(":id/reject")
  @Roles("admin")
  reject(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = OverrideIdParam.parse(params);
    const input = RejectionInput.parse(body);
    return this.overrides.reject(id, user, input.reason);
  }

  /** Student cancels their own pending request. Admin can cancel anything. */
  @Post(":id/cancel")
  @Roles("student", "admin")
  cancel(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = OverrideIdParam.parse(params);
    const input = CancelInput.parse(body ?? {});
    return this.overrides.cancel(id, user, input.note);
  }
}

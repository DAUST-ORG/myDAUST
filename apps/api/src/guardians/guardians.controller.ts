import { Body, Controller, Get, Param, Post, Patch } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { GuardiansService } from "./guardians.service.js";

// Local zod (the api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const CreateGuardianInput = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(160),
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  relation: z.string().max(40).optional(),
});

const SetChildrenInput = z.object({
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(20),
});

const RedeemInviteInput = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10).max(200),
});

/** Registrar-side guardian administration. */
@Controller("guardians")
@Roles("admin", "registrar")
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  list() {
    return this.guardians.list();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.guardians.create(user.personId, CreateGuardianInput.parse(body));
  }

  @Post(":id/resend-invite")
  resend(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.guardians.resendInvite(user.personId, id);
  }

  @Patch(":id/children")
  setChildren(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.guardians.setChildren(user.personId, id, SetChildrenInput.parse(body).studentIds);
  }
}

/** Invite redemption — public by necessity: the guardian has no session yet. */
@Controller("guardian-invites")
export class GuardianInvitesController {
  constructor(private readonly guardians: GuardiansService) {}

  @Public()
  @Post("redeem")
  redeem(@Body() body: unknown) {
    const input = RedeemInviteInput.parse(body);
    return this.guardians.redeemInvite(input.token, input.password);
  }
}

/** Parent-facing reads. Every route authorises through the GuardianStudent join. */
@Controller("parent")
@Roles("parent")
export class ParentController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get("children")
  children(@CurrentUser() user: AuthUser) {
    return this.guardians.myChildren(user.personId);
  }

  @Get("children/:studentId/grades")
  grades(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.guardians.childGrades(user.personId, studentId);
  }

  @Get("children/:studentId/attendance")
  attendance(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.guardians.childAttendance(user.personId, studentId);
  }

  @Get("children/:studentId/account")
  account(@CurrentUser() user: AuthUser, @Param("studentId") studentId: string) {
    return this.guardians.childAccount(user.personId, studentId);
  }
}

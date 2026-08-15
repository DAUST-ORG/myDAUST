import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { ProofPaymentMethod } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { GuardiansService } from "./guardians.service.js";

// Local zod (the api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const CreateGuardianInput = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(160),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  relation: z.string().max(40).optional(),
});

const SetChildrenInput = z.object({
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(20),
});

const UpdateGuardianInput = z.object({
  fullName: z.string().min(1).max(120).optional(),
  email: z.string().email().max(160).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

const RedeemInviteInput = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10).max(200),
});

const ParentCheckoutInput = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().int().positive().max(100_000_000),
  method: ProofPaymentMethod,
});

const ParentPiSpiInput = z.object({
  invoiceId: z.string().uuid(),
  alias: z.string().trim().uuid(),
  amountXof: z.coerce.number().int().positive().max(100_000_000),
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
    return this.guardians.create(
      user.personId,
      CreateGuardianInput.parse(body),
    );
  }

  /** Generate logins for guardians who do not have a password yet. */
  @Post("provision-logins")
  provisionLogins(@CurrentUser() user: AuthUser) {
    return this.guardians.provisionAllMissing(user.personId);
  }

  /** Generate or reset one guardian login, returning its password once. */
  @Post(":id/provision-login")
  provisionLogin(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.guardians.provisionLogin(user.personId, id);
  }

  @Post(":id/resend-invite")
  resend(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.guardians.resendInvite(user.personId, id);
  }

  @Patch(":id/children")
  setChildren(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.guardians.setChildren(
      user.personId,
      id,
      SetChildrenInput.parse(body).studentIds,
    );
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.guardians.update(
      user.personId,
      id,
      UpdateGuardianInput.parse(body),
    );
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.guardians.remove(user.personId, id);
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
  attendance(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.guardians.childAttendance(user.personId, studentId);
  }

  @Get("children/:studentId/account")
  account(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.guardians.childAccount(user.personId, studentId);
  }

  @Post("children/:studentId/payments")
  initiatePayment(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.guardians.initiateChildPayment(
      user,
      studentId,
      ParentCheckoutInput.parse(body),
    );
  }

  @Get("children/:studentId/payment-attempts")
  paymentAttempts(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
  ) {
    return this.guardians.childPaymentAttempts(user.personId, studentId);
  }

  @Get("children/:studentId/payments/:paymentId/status")
  paymentStatus(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Param("paymentId") paymentId: string,
  ) {
    return this.guardians.childPaymentStatus(
      user.personId,
      studentId,
      paymentId,
    );
  }

  @Get("children/:studentId/payments/:paymentId/receipt")
  paymentReceipt(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Param("paymentId") paymentId: string,
  ) {
    return this.guardians.childPaymentReceipt(
      user.personId,
      studentId,
      paymentId,
    );
  }

  @Post("children/:studentId/pi-spi")
  submitPiSpi(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.guardians.submitChildPiSpi(
      user,
      studentId,
      ParentPiSpiInput.parse(body),
    );
  }

  @Get("children/:studentId/pi-spi/:txId")
  piSpiStatus(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Param("txId") txId: string,
  ) {
    return this.guardians.childPiSpiStatus(user.personId, studentId, txId);
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";

/** A PI-SPI alias is a UUID v4 payment address, not a phone number. */
const PiSpiAlias = z.string().trim().uuid();
const AliasLookupInput = z.object({ alias: PiSpiAlias });
const StudentPiSpiInput = z.object({
  invoiceId: z.string().uuid(),
  alias: PiSpiAlias,
  amountXof: z.coerce.number().int().positive().max(100_000_000),
  saveAlias: z.boolean().optional(),
});
const LinkPiSpiInput = z.object({ alias: PiSpiAlias });

@Controller("finance")
export class PaymentsController {
  constructor(private readonly finance: FinanceService) {}

  @Get("my/billing")
  @Roles("student")
  myBilling(@CurrentUser() user: AuthUser) {
    return this.finance.getStudentBilling(user.studentId!);
  }

  @Get("my/billing-summary")
  @Roles("student")
  myBillingSummary(@CurrentUser() user: AuthUser) {
    return this.finance.getStudentBillingSummary(user.studentId!);
  }

  @Get("my/billing-profile")
  @Roles("student")
  myBillingProfile(@CurrentUser() user: AuthUser) {
    return this.finance.getBillingProfile(user.studentId!);
  }

  @Get("billing-profile/options")
  @Roles("bursar", "admin", "registrar", "admissions")
  billingProfileOptions(
    @Query("academicYearLabel") academicYearLabel?: string,
  ) {
    return this.finance.getBillingProfileOptions(academicYearLabel);
  }

  /** Public standalone pay page data. The token is the only credential (unguessable). */
  @Get("links/:token")
  @Public()
  publicLink(@Param("token") token: string) {
    return this.finance.getPublicLink(token);
  }

  // --- PI-SPI (request-to-pay) --------------------------------------------

  /** Whether the pay screens should offer instant payment. Static route before `:txId`. */
  @Get("pi-spi/config")
  @Public()
  piSpiConfig() {
    return { enabled: this.finance.piSpiEnabled() };
  }

  /**
   * Resolve an alias to its owner so the payer confirms who is being billed.
   * Throttled on the public path: alias lookups return a real person's name, so this must
   * not become a directory anyone can enumerate.
   */
  @Post("pi-spi/verify-alias")
  @Public()
  @UseGuards(BillThrottleGuard)
  verifyPiSpiAlias(@Body() body: unknown) {
    const { alias } = AliasLookupInput.parse(body);
    return this.finance.verifyPiSpiAlias(alias);
  }

  @Post("my/pi-spi")
  @Roles("student")
  submitStudentPiSpi(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = StudentPiSpiInput.parse(body);
    return this.finance.submitStudentPiSpi(
      user.studentId!,
      user.personId,
      input,
      { source: "student_portal", initiatedByEmail: user.email },
    );
  }

  @Post("links/:token/pi-spi")
  @Public()
  @UseGuards(BillThrottleGuard)
  submitLinkPiSpi(@Param("token") token: string, @Body() body: unknown) {
    const { alias } = LinkPiSpiInput.parse(body);
    return this.finance.submitPaymentLinkPiSpi(token, alias);
  }

  /** Poll a request the caller owns. Students see only their own. */
  @Get("my/pi-spi/:txId")
  @Roles("student")
  myPiSpiStatus(@CurrentUser() user: AuthUser, @Param("txId") txId: string) {
    return this.finance.getPiSpiRequest(txId, { studentId: user.studentId! });
  }

  /** Poll a link-scoped request; the unguessable token is the credential. */
  @Get("links/:token/pi-spi/:txId")
  @Public()
  @UseGuards(BillThrottleGuard)
  linkPiSpiStatus(@Param("token") token: string, @Param("txId") txId: string) {
    return this.finance.getPiSpiRequest(txId, { token });
  }

  /**
   * PI-SPI notification. Public because the rail calls it; authenticity is the HMAC over
   * the raw body. Must answer within 5 seconds, and 204 is the documented success reply.
   */
  @Post("webhook/pi-spi")
  @Public()
  @HttpCode(204)
  async piSpiWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-signature") signature: string | undefined,
  ) {
    const raw =
      request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const { valid } = await this.finance.handlePiSpiWebhook(raw, signature);
    if (!valid) throw new ForbiddenException("Invalid signature");
  }
}

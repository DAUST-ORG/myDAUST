import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { InitiatePaymentInput } from "@mydaust/shared";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";
import { MAX_WIRE_PROOF_BYTES } from "./wire-proof.storage.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";

const StudentWireInput = z.object({
  invoiceId: z.string().uuid(),
  amountXof: z.coerce.number().int().positive().max(100_000_000),
});
const LinkWireInput = z.object({
  contactEmail: z.string().trim().email().max(160),
});

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

  @Post("my/payments")
  @Roles("student")
  initiate(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = InitiatePaymentInput.parse(body);
    return this.finance.initiatePayment(user.studentId!, input);
  }

  @Get("wire/config")
  @Public()
  wireConfig() {
    return this.finance.getPublicWirePaymentConfig();
  }

  @Post("my/wire-transfers")
  @Roles("student")
  @UseInterceptors(
    FileInterceptor("proof", { limits: { fileSize: MAX_WIRE_PROOF_BYTES } }),
  )
  submitStudentWire(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    const input = StudentWireInput.parse(body);
    return this.finance.submitStudentWire(
      user.studentId!,
      user,
      input.invoiceId,
      input.amountXof,
      proof,
    );
  }

  /** Public standalone pay page data. The token is the only credential (unguessable). */
  @Get("links/:token")
  @Public()
  publicLink(@Param("token") token: string) {
    return this.finance.getPublicLink(token);
  }

  @Post("links/:token/checkout")
  @Public()
  checkoutLink(
    @Param("token") token: string,
    @Body() body: { method?: string },
  ) {
    if (
      !body?.method ||
      !["wave", "orange_money", "card"].includes(body.method)
    ) {
      throw new BadRequestException(
        "method must be wave, orange_money or card",
      );
    }
    return this.finance.checkoutLink(token, body.method);
  }

  @Post("links/:token/wire-transfers")
  @Public()
  @UseGuards(BillThrottleGuard)
  @UseInterceptors(
    FileInterceptor("proof", { limits: { fileSize: MAX_WIRE_PROOF_BYTES } }),
  )
  submitLinkWire(
    @Param("token") token: string,
    @Body() body: unknown,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    const input = LinkWireInput.parse(body);
    return this.finance.submitPaymentLinkWire(token, input.contactEmail, proof);
  }

  /** PayTech IPN. Public (PayTech calls it); authenticity is verified inside the service. */
  @Post("webhook/paytech")
  @Public()
  @HttpCode(200)
  async webhook(@Body() payload: Record<string, unknown>) {
    const { valid } = await this.finance.handleIpn(payload);
    if (!valid) throw new ForbiddenException("IPN KO");
    return "IPN OK";
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
    return this.finance.submitStudentPiSpi(user.studentId!, user.personId, input);
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
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const { valid } = await this.finance.handlePiSpiWebhook(raw, signature);
    if (!valid) throw new ForbiddenException("Invalid signature");
  }
}

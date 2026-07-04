import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post } from "@nestjs/common";
import { InitiatePaymentInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { FinanceService } from "./finance.service.js";

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

  /** Public standalone pay page data. The token is the only credential (unguessable). */
  @Get("links/:token")
  @Public()
  publicLink(@Param("token") token: string) {
    return this.finance.getPublicLink(token);
  }

  @Post("links/:token/checkout")
  @Public()
  checkoutLink(@Param("token") token: string, @Body() body: { method?: string }) {
    if (!body?.method || !["wave", "orange_money", "card"].includes(body.method)) {
      throw new BadRequestException("method must be wave, orange_money or card");
    }
    return this.finance.checkoutLink(token, body.method);
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
}

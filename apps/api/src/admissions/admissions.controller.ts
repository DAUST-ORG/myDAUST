import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApplicationInput, ProofPaymentMethod } from "@mydaust/shared";
import { z } from "zod";
import { Public } from "../auth/decorators.js";
import { BillThrottleGuard } from "../finance/bill-throttle.guard.js";
import { FinanceService } from "../finance/finance.service.js";
import { AdmissionsService } from "./admissions.service.js";

const FeePiSpiInput = z.object({ alias: z.string().trim().uuid() });
const FeeProofInput = z.object({ method: ProofPaymentMethod });

@Controller("applications")
export class AdmissionsController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly finance: FinanceService,
  ) {}

  /** Public anonymous application submission from the vitrine Apply flow. */
  @Public()
  @Post()
  apply(@Body() body: unknown) {
    const input = ApplicationInput.parse(body);
    return this.admissions.apply(input);
  }

  /** Public capability page for an accepted applicant; never accepts a raw id. */
  @Public()
  @Get("status/:token")
  @UseGuards(BillThrottleGuard)
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Expires", "0")
  @Header("Referrer-Policy", "no-referrer")
  @Header("X-Robots-Tag", "noindex, nofollow")
  onboardingStatus(@Param("token") token: string) {
    return this.admissions.publicOnboardingStatus(token);
  }

  /** Public: start/resume proof-based application-fee payment. */
  @Public()
  @Post(":id/fee-checkout")
  feeCheckout(@Param("id") id: string, @Body() body: unknown) {
    return this.admissions.feeCheckout(id, FeeProofInput.parse(body).method);
  }

  /** Public: pay the application fee over PI-SPI instead of the hosted checkout. */
  @Public()
  @Post(":id/fee-pi-spi")
  @UseGuards(BillThrottleGuard)
  async feePiSpi(@Param("id") id: string, @Body() body: unknown) {
    const { alias } = FeePiSpiInput.parse(body);
    const fee = await this.admissions.applicationFeeXof();
    return this.finance.submitApplicantPiSpi(id, alias, fee);
  }

  @Public()
  @Get(":id/fee-pi-spi/:txId")
  @UseGuards(BillThrottleGuard)
  feePiSpiStatus(@Param("id") id: string, @Param("txId") txId: string) {
    return this.finance.getApplicantPiSpiStatus(id, txId);
  }
}

import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApplicationInput } from "@mydaust/shared";
import { Public } from "../auth/decorators.js";
import { AdmissionsService } from "./admissions.service.js";

@Controller("applications")
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  /** Public anonymous application submission from the vitrine Apply flow. */
  @Public()
  @Post()
  apply(@Body() body: unknown) {
    const input = ApplicationInput.parse(body);
    return this.admissions.apply(input);
  }

  /** Public: PayTech checkout for the application fee (applicant id = capability). */
  @Public()
  @Post(":id/fee-checkout")
  feeCheckout(@Param("id") id: string) {
    return this.admissions.feeCheckout(id);
  }
}

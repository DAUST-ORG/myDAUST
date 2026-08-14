import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ProofPaymentMethod } from "@mydaust/shared";
import { Public } from "../auth/decorators.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";
import { PaymentSubmissionsService } from "./payment-submissions.service.js";

// Local zod (api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const LookupInput = z.object({
  studentNo: z.string().trim().min(3).max(64),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
});
const CheckoutInput = LookupInput.extend({
  amountXof: z.number().int().positive().max(100_000_000),
  method: ProofPaymentMethod,
});
const PiSpiInput = LookupInput.extend({
  amountXof: z.coerce.number().int().positive().max(100_000_000),
  alias: z.string().trim().uuid(),
});

/** payment.daust.net — anonymous bill lookup + checkout. Rate-limited; exposes minimal PII. */
@Controller("finance/public/bill")
@UseGuards(BillThrottleGuard)
export class PublicBillingController {
  constructor(
    private readonly finance: FinanceService,
    private readonly submissions: PaymentSubmissionsService,
  ) {}

  @Post("lookup")
  @Public()
  lookup(@Body() body: unknown) {
    const input = LookupInput.parse(body);
    return this.finance.lookupBill(input.studentNo, input.dob);
  }

  @Post("checkout")
  @Public()
  checkout(@Body() body: unknown) {
    const input = CheckoutInput.parse(body);
    return this.finance
      .publicBillPaymentTarget(input.studentNo, input.dob, input.amountXof)
      .then((target) =>
        this.submissions.create({
          source: "public_bill",
          method: input.method,
          amountXof: target.amountXof,
          contactEmail: target.contactEmail,
          studentId: target.studentId,
          invoiceId: target.invoiceId,
        }),
      );
  }

  /** Instant payment from the public bill portal (studentNo + DOB already proven). */
  @Post("pi-spi")
  @Public()
  submitPiSpi(@Body() body: unknown) {
    const input = PiSpiInput.parse(body);
    return this.finance.submitPublicBillPiSpi({
      studentNo: input.studentNo,
      dob: input.dob,
      alias: input.alias,
      amountXof: input.amountXof,
    });
  }

  /** Poll a public-bill request. Scoped by the same studentNo + DOB proof. */
  @Post("pi-spi/status")
  @Public()
  piSpiStatus(@Body() body: unknown) {
    const input = LookupInput.extend({ txId: z.string().trim().max(64) }).parse(
      body,
    );
    return this.finance.getPublicBillPiSpiStatus(
      input.studentNo,
      input.dob,
      input.txId,
    );
  }
}

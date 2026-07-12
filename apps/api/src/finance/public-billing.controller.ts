import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { Public } from "../auth/decorators.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";

// Local zod (api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const LookupInput = z.object({
  studentNo: z.string().trim().min(3).max(64),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
});
const CheckoutInput = LookupInput.extend({
  amountXof: z.number().int().positive().max(100_000_000),
  method: z.enum(["wave", "orange_money", "card"]),
});

/** payment.daust.net — anonymous bill lookup + checkout. Rate-limited; exposes minimal PII. */
@Controller("finance/public/bill")
@UseGuards(BillThrottleGuard)
export class PublicBillingController {
  constructor(private readonly finance: FinanceService) {}

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
    return this.finance.checkoutBill(input.studentNo, input.dob, input.amountXof, input.method);
  }
}

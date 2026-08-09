import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { Public } from "../auth/decorators.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";
import { MAX_WIRE_PROOF_BYTES } from "./wire-proof.storage.js";

// Local zod (api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const LookupInput = z.object({
  studentNo: z.string().trim().min(3).max(64),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
});
const CheckoutInput = LookupInput.extend({
  amountXof: z.number().int().positive().max(100_000_000),
  method: z.enum(["wave", "orange_money", "card"]),
});
const WireInput = LookupInput.extend({
  amountXof: z.coerce.number().int().positive().max(100_000_000),
  contactEmail: z.string().trim().email().max(160),
});
const PiSpiInput = LookupInput.extend({
  amountXof: z.coerce.number().int().positive().max(100_000_000),
  alias: z.string().trim().uuid(),
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
    return this.finance.checkoutBill(
      input.studentNo,
      input.dob,
      input.amountXof,
      input.method,
    );
  }

  @Post("wire-transfers")
  @Public()
  @UseInterceptors(
    FileInterceptor("proof", { limits: { fileSize: MAX_WIRE_PROOF_BYTES } }),
  )
  submitWire(
    @Body() body: unknown,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    const input = WireInput.parse(body);
    return this.finance.submitPublicBillWire(
      input.studentNo,
      input.dob,
      input.amountXof,
      input.contactEmail,
      proof,
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
    const input = LookupInput.extend({ txId: z.string().trim().max(64) }).parse(body);
    return this.finance.getPublicBillPiSpiStatus(
      input.studentNo,
      input.dob,
      input.txId,
    );
  }
}

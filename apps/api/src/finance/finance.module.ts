import { Module } from "@nestjs/common";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";
import { FinanceTasks } from "./finance.tasks.js";
import { PaymentsController } from "./payments.controller.js";
import { PublicBillingController } from "./public-billing.controller.js";
import { PAYMENT_PROVIDER } from "./payment-provider.js";
import { PaytechProvider } from "./paytech.provider.js";
import { PiSpiProvider } from "./pi-spi.provider.js";
import {
  REQUEST_TO_PAY_PROVIDERS,
  RequestToPayRegistry,
} from "./request-to-pay.provider.js";
import { WireProofStorage } from "./wire-proof.storage.js";
import { ApprovalsController } from "./approvals.controller.js";
import { DirectorController } from "./director.controller.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";

@Module({
  controllers: [
    PaymentsController,
    AdminFinanceController,
    PublicBillingController,
    ApprovalsController,
    DirectorController,
  ],
  providers: [
    FinanceService,
    FinanceTasks,
    BillThrottleGuard,
    WireProofStorage,
    FinanceApprovalsService,
    { provide: PAYMENT_PROVIDER, useClass: PaytechProvider },
    // Request-to-pay rails are registered separately from the redirect-checkout seam so
    // PayTech's call sites stay untouched. Settlement resolves the rail by
    // Payment.provider, which is what lets a second rail slot in later.
    PiSpiProvider,
    {
      provide: REQUEST_TO_PAY_PROVIDERS,
      useFactory: (piSpi: PiSpiProvider) => new RequestToPayRegistry([piSpi]),
      inject: [PiSpiProvider],
    },
  ],
  // Dining orders and application fees ride the same PayTech rail.
  // FinanceService is exported so the parent portal reads a child's account
  // through the same code the bursar uses — one source of truth for money.
  exports: [PAYMENT_PROVIDER, REQUEST_TO_PAY_PROVIDERS, FinanceService],
})
export class FinanceModule {}

import { Module } from "@nestjs/common";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";
import { FinanceTasks } from "./finance.tasks.js";
import { PaymentsController } from "./payments.controller.js";
import { PublicBillingController } from "./public-billing.controller.js";
import { PiSpiProvider } from "./pi-spi.provider.js";
import {
  REQUEST_TO_PAY_PROVIDERS,
  RequestToPayRegistry,
} from "./request-to-pay.provider.js";
import { WireProofStorage } from "./wire-proof.storage.js";
import { PaymentFileStorage } from "./payment-file.storage.js";
import { PaymentSubmissionsService } from "./payment-submissions.service.js";
import {
  DirectorPaymentVerificationsController,
  PaymentSubmissionsController,
} from "./payment-submissions.controller.js";
import { ApprovalsController } from "./approvals.controller.js";
import { DirectorController } from "./director.controller.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import { OperatingBudgetService } from "./operating-budget.service.js";

@Module({
  controllers: [
    PaymentsController,
    AdminFinanceController,
    PublicBillingController,
    ApprovalsController,
    DirectorController,
    PaymentSubmissionsController,
    DirectorPaymentVerificationsController,
  ],
  providers: [
    FinanceService,
    FinanceTasks,
    BillThrottleGuard,
    WireProofStorage,
    PaymentFileStorage,
    PaymentSubmissionsService,
    FinanceApprovalsService,
    OperatingBudgetService,
    // PI-SPI remains the automatic request-to-pay rail.
    PiSpiProvider,
    {
      provide: REQUEST_TO_PAY_PROVIDERS,
      useFactory: (piSpi: PiSpiProvider) => new RequestToPayRegistry([piSpi]),
      inject: [PiSpiProvider],
    },
  ],
  // FinanceService is exported so the parent portal reads a child's account
  // through the same code the bursar uses — one source of truth for money.
  exports: [
    REQUEST_TO_PAY_PROVIDERS,
    FinanceService,
    OperatingBudgetService,
    PaymentSubmissionsService,
  ],
})
export class FinanceModule {}

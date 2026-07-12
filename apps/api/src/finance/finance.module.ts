import { Module } from "@nestjs/common";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { BillThrottleGuard } from "./bill-throttle.guard.js";
import { FinanceService } from "./finance.service.js";
import { FinanceTasks } from "./finance.tasks.js";
import { PaymentsController } from "./payments.controller.js";
import { PublicBillingController } from "./public-billing.controller.js";
import { PAYMENT_PROVIDER } from "./payment-provider.js";
import { PaytechProvider } from "./paytech.provider.js";

@Module({
  controllers: [PaymentsController, AdminFinanceController, PublicBillingController],
  providers: [
    FinanceService,
    FinanceTasks,
    BillThrottleGuard,
    { provide: PAYMENT_PROVIDER, useClass: PaytechProvider },
  ],
  // Dining orders and application fees ride the same PayTech rail.
  exports: [PAYMENT_PROVIDER],
})
export class FinanceModule {}

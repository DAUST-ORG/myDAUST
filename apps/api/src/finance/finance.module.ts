import { Module } from "@nestjs/common";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { FinanceTasks } from "./finance.tasks.js";
import { PaymentsController } from "./payments.controller.js";
import { PAYMENT_PROVIDER } from "./payment-provider.js";
import { PaytechProvider } from "./paytech.provider.js";

@Module({
  controllers: [PaymentsController, AdminFinanceController],
  providers: [
    FinanceService,
    FinanceTasks,
    { provide: PAYMENT_PROVIDER, useClass: PaytechProvider },
  ],
})
export class FinanceModule {}

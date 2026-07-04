import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module.js";
import { DiningController } from "./dining.controller.js";
import { DiningService } from "./dining.service.js";

@Module({
  imports: [FinanceModule],
  controllers: [DiningController],
  providers: [DiningService],
})
export class DiningModule {}

import { Module } from "@nestjs/common";
import { AcademicsModule } from "../academics/academics.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import { DiningController } from "./dining.controller.js";
import { DiningService } from "./dining.service.js";

@Module({
  imports: [AcademicsModule, FinanceModule],
  controllers: [DiningController],
  providers: [DiningService],
})
export class DiningModule {}

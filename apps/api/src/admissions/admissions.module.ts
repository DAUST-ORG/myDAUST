import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module.js";
import { AdmissionsController } from "./admissions.controller.js";
import { AdmissionsService } from "./admissions.service.js";

@Module({
  imports: [FinanceModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}

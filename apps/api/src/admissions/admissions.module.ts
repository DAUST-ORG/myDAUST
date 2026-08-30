import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module.js";
import { AdminAdmissionsController } from "./admin-admissions.controller.js";
import { AdmissionsController } from "./admissions.controller.js";
import { AdmissionsService } from "./admissions.service.js";
import { ApplicantNotesController } from "./applicant-notes.controller.js";
import { ApplicantNotesService } from "./applicant-notes.service.js";

@Module({
  imports: [FinanceModule],
  controllers: [
    AdmissionsController,
    AdminAdmissionsController,
    ApplicantNotesController,
  ],
  providers: [AdmissionsService, ApplicantNotesService],
})
export class AdmissionsModule {}

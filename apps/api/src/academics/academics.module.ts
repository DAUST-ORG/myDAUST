import { Module } from "@nestjs/common";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";
import { EnrollmentOverrideService } from "./enrollment-approvals.service.js";
import { EnrollmentOverrideController } from "./enrollment-override.controller.js";

@Module({
  controllers: [AcademicsController, EnrollmentOverrideController],
  providers: [AcademicsService, EnrollmentOverrideService],
  exports: [AcademicsService, EnrollmentOverrideService],
})
export class AcademicsModule {}

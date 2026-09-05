import { Module } from "@nestjs/common";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";
import { EnrollmentOverrideService } from "./enrollment-approvals.service.js";
import { EnrollmentOverrideController } from "./enrollment-override.controller.js";
import { RegistrarEnrollmentService } from "./registrar-enrollment.service.js";

@Module({
  controllers: [AcademicsController, EnrollmentOverrideController],
  providers: [
    AcademicsService,
    EnrollmentOverrideService,
    RegistrarEnrollmentService,
  ],
  exports: [
    AcademicsService,
    EnrollmentOverrideService,
    RegistrarEnrollmentService,
  ],
})
export class AcademicsModule {}

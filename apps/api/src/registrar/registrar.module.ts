import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RegistrarController } from "./registrar.controller.js";
import { RegistrarService } from "./registrar.service.js";
import {
  StudentActivationPublicController,
  StudentActivationStaffController,
} from "./student-activation.controller.js";
import { StudentActivationService } from "./student-activation.service.js";
import {
  StudentActivationStaffThrottleGuard,
  StudentActivationStartThrottleGuard,
  StudentActivationStatusThrottleGuard,
} from "./student-activation-throttle.guard.js";

@Module({
  imports: [PrismaModule],
  controllers: [
    RegistrarController,
    StudentActivationPublicController,
    StudentActivationStaffController,
  ],
  providers: [
    RegistrarService,
    StudentActivationService,
    StudentActivationStartThrottleGuard,
    StudentActivationStatusThrottleGuard,
    StudentActivationStaffThrottleGuard,
  ],
  // UsersModule delegates student creation and login provisioning here.
  exports: [RegistrarService],
})
export class RegistrarModule {}

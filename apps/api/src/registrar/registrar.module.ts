import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RegistrarController } from "./registrar.controller.js";
import { RegistrarService } from "./registrar.service.js";
import { HousingOperationsController } from "./housing-operations.controller.js";
import { HousingOperationsService } from "./housing-operations.service.js";
import { StudentActivationPublicController } from "./student-activation.controller.js";
import { StudentActivationService } from "./student-activation.service.js";
import { StudentActivationStartThrottleGuard } from "./student-activation-throttle.guard.js";

@Module({
  imports: [PrismaModule],
  controllers: [
    RegistrarController,
    HousingOperationsController,
    StudentActivationPublicController,
  ],
  providers: [
    RegistrarService,
    HousingOperationsService,
    StudentActivationService,
    StudentActivationStartThrottleGuard,
  ],
  // UsersModule delegates student creation and login provisioning here.
  exports: [RegistrarService],
})
export class RegistrarModule {}

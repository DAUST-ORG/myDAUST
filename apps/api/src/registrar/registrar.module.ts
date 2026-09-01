import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RegistrarController } from "./registrar.controller.js";
import { RegistrarService } from "./registrar.service.js";
import { StudentActivationPublicController } from "./student-activation.controller.js";
import { StudentActivationService } from "./student-activation.service.js";
import { StudentActivationStartThrottleGuard } from "./student-activation-throttle.guard.js";

@Module({
  imports: [PrismaModule],
  controllers: [RegistrarController, StudentActivationPublicController],
  providers: [
    RegistrarService,
    StudentActivationService,
    StudentActivationStartThrottleGuard,
  ],
  // UsersModule delegates student creation and login provisioning here.
  exports: [RegistrarService],
})
export class RegistrarModule {}

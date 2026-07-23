import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RegistrarController } from "./registrar.controller.js";
import { RegistrarService } from "./registrar.service.js";

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [RegistrarController],
  providers: [RegistrarService],
})
export class RegistrarModule {}

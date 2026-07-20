import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RegistrarController } from "./registrar.controller.js";
import { RegistrarService } from "./registrar.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [RegistrarController],
  providers: [RegistrarService],
})
export class RegistrarModule {}

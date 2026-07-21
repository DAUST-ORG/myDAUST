import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { NavController } from "./nav.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [NavController],
})
export class NavModule {}

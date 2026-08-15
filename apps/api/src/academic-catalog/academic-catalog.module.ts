import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AcademicCatalogController } from "./academic-catalog.controller.js";
import { AcademicCatalogService } from "./academic-catalog.service.js";
import { AcademicStandingService } from "./academic-standing.service.js";

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AcademicCatalogController],
  providers: [AcademicCatalogService, AcademicStandingService],
  exports: [AcademicCatalogService, AcademicStandingService],
})
export class AcademicCatalogModule {}

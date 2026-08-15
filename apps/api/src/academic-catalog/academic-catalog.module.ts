import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AcademicCatalogController } from "./academic-catalog.controller.js";
import { AcademicCatalogService } from "./academic-catalog.service.js";

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AcademicCatalogController],
  providers: [AcademicCatalogService],
  exports: [AcademicCatalogService],
})
export class AcademicCatalogModule {}

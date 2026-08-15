import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import type { AuthUser } from "../auth/current-user.js";
import { CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { AcademicCatalogService } from "./academic-catalog.service.js";

@Controller("registrar/academic-catalogs")
@Roles("admin", "registrar")
export class AcademicCatalogController {
  constructor(private readonly catalogs: AcademicCatalogService) {}

  @Get(":academicYearId")
  workspace(@Param("academicYearId") academicYearId: string) {
    return this.catalogs.workspace(academicYearId);
  }

  @Put(":academicYearId/draft")
  saveDraft(
    @CurrentUser() user: AuthUser,
    @Param("academicYearId") academicYearId: string,
    @Body() body: unknown,
  ) {
    return this.catalogs.saveDraft(academicYearId, user.personId, body);
  }

  @Post(":academicYearId/submit")
  submit(
    @CurrentUser() user: AuthUser,
    @Param("academicYearId") academicYearId: string,
  ) {
    return this.catalogs.submit(academicYearId, user);
  }
}

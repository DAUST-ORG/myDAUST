import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { FacultyProfileInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { FacultyService } from "./faculty.service.js";

@Controller("faculty")
export class FacultyController {
  constructor(private readonly faculty: FacultyService) {}

  /** Public: professors toggled visible on the site (drives the vitrine Faculty page). */
  @Public()
  @Get("public")
  publicList() {
    return this.faculty.publicList();
  }

  /** Comms: every platform faculty member with their profile + visibility flag. */
  @Get()
  @Roles("communications", "admin")
  adminList() {
    return this.faculty.adminList();
  }

  @Put(":id/profile")
  @Roles("communications", "admin")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.faculty.update(id, FacultyProfileInput.parse(body), user.personId);
  }

  @Put(":id/visibility")
  @Roles("communications", "admin")
  visibility(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { visible } = body as { visible?: unknown };
    return this.faculty.setVisibility(id, visible === true, user.personId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { FacultyCreateInput, FacultyProfileInput } from "@mydaust/shared";
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

  /** Registrar Directory: every platform faculty member with their profile + visibility flag. */
  @Get()
  @Roles("registrar", "admin")
  adminList() {
    return this.faculty.adminList();
  }

  /** Registrar Directory: create a faculty member, optionally provisioning a login. */
  @Post()
  @Roles("registrar", "admin")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.faculty.createFaculty(
      FacultyCreateInput.parse(body),
      user.personId,
    );
  }

  @Put(":id/profile")
  @Roles("registrar", "admin")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.faculty.update(
      id,
      FacultyProfileInput.parse(body),
      user.personId,
    );
  }

  @Put(":id/visibility")
  @Roles("registrar", "admin")
  visibility(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { visible } = body as { visible?: unknown };
    return this.faculty.setVisibility(id, visible === true, user.personId);
  }

  /** Registrar Directory: permanently remove an unused faculty record. */
  @Delete(":id")
  @Roles("registrar", "admin")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.faculty.remove(id, user.personId);
  }
}

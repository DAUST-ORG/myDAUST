import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ScholarshipTierInput, UpdateFeeInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { AppConfigService } from "./app-config.service.js";

@Controller("config")
export class AppConfigController {
  constructor(private readonly config: AppConfigService) {}

  /** Public: the vitrine cost grid + tier cards read these without auth. */
  @Public()
  @Get("fees")
  fees() {
    return this.config.fees();
  }

  @Public()
  @Get("scholarships")
  scholarships() {
    return this.config.scholarships();
  }

  // Director-level writes (admin), every change audit-logged.
  @Patch("fees/:key")
  @Roles("admin")
  updateFee(@CurrentUser() user: AuthUser, @Param("key") key: string, @Body() body: unknown) {
    return this.config.updateFee(key, UpdateFeeInput.parse(body), user.personId);
  }

  @Post("scholarships")
  @Roles("admin")
  createTier(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.config.createTier(ScholarshipTierInput.parse(body), user.personId);
  }

  @Patch("scholarships/:id")
  @Roles("admin")
  updateTier(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.config.updateTier(id, ScholarshipTierInput.parse(body), user.personId);
  }

  @Delete("scholarships/:id")
  @Roles("admin")
  deleteTier(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.config.deleteTier(id, user.personId);
  }
}

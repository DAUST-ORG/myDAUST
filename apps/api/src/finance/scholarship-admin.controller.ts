import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { ScholarshipCatalogRevisionInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { ScholarshipAdminService } from "./scholarship-admin.service.js";

/**
 * The scholarship catalog is fee configuration, so it carries the same roles as
 * the fee plan it hangs off: Finance staff propose, an administrator approves
 * through the approvals rail. Both routes name their roles explicitly — an
 * undecorated route in this codebase is reachable by every authenticated
 * session, students included.
 */
@Controller("finance/admin/scholarships")
@Roles("bursar", "admin")
export class ScholarshipAdminController {
  constructor(private readonly scholarships: ScholarshipAdminService) {}

  @Get()
  @Roles("bursar", "admin")
  list(@Query("year") year?: string) {
    return this.scholarships.listScholarships(year);
  }

  /** One approval request for a whole catalog edit session. */
  @Put()
  @Roles("bursar", "admin")
  propose(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = ScholarshipCatalogRevisionInput.parse(body);
    return this.scholarships.proposeCatalog(user, input);
  }
}

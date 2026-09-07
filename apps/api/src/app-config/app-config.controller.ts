import { Body, Controller, ForbiddenException, Get, Param, Patch } from "@nestjs/common";
import { ADMISSIONS_FEE_KEYS, NotificationRecipientsInput, PlanPickingConfigInput, UpdateFeeInput, EmailTemplatesInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Public, Roles } from "../auth/decorators.js";
import { AppConfigService } from "./app-config.service.js";

@Controller("config")
export class AppConfigController {
  constructor(private readonly config: AppConfigService) {}

  /** Public: the vitrine cost grid reads these without auth. */
  @Public()
  @Get("fees")
  fees() {
    return this.config.fees();
  }

  @Public()
  @Get("programs")
  programs() {
    return this.config.programs();
  }

  // Director-level writes (admin), except the two admissions-owned fees below.
  // An admissions officer may edit application_fee + insurance only; every other
  // key still requires admin, and the finance approval workflow owns the package.
  @Patch("fees/:key")
  @Roles("admin", "admissions")
  updateFee(@CurrentUser() user: AuthUser, @Param("key") key: string, @Body() body: unknown) {
    const admissionsOwned = (ADMISSIONS_FEE_KEYS as readonly string[]).includes(key);
    if (!user.roles.includes("admin") && !admissionsOwned) {
      throw new ForbiddenException("Only an admin can edit this fee");
    }
    return this.config.updateFee(key, UpdateFeeInput.parse(body), user.personId);
  }

  // New-application notification recipients (registrar dashboard).
  @Get("notification-recipients")
  @Roles("admin", "registrar")
  async notificationRecipients() {
    return { recipients: await this.config.applicationNotificationRecipients() };
  }

  @Patch("notification-recipients")
  @Roles("admin", "registrar")
  setNotificationRecipients(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { recipients } = NotificationRecipientsInput.parse(body);
    return this.config.setNotificationRecipients(recipients, user.personId);
  }

  // Email templates are owned by the admissions office (admissions + admin).
  // Registrar keeps read access so the old settings screen still loads, but can
  // no longer save: the editor moved to /admissions/templates.
  @Get("email-templates")
  @Roles("admin", "registrar", "admissions")
  emailTemplates() {
    return this.config.emailTemplates();
  }

  @Patch("email-templates")
  @Roles("admin", "admissions")
  setEmailTemplates(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const templates = EmailTemplatesInput.parse(body);
    return this.config.setEmailTemplates(templates, user.personId);
  }

  // Applicant plan-picking window (admissions office owns it).
  @Get("plan-picking")
  @Roles("admin", "admissions")
  planPicking() {
    return this.config.planPicking();
  }

  @Patch("plan-picking")
  @Roles("admin", "admissions")
  setPlanPicking(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { enabled, deadline } = PlanPickingConfigInput.parse(body);
    return this.config.setPlanPicking(
      { enabled, deadline: deadline ?? null },
      user.personId,
    );
  }
}

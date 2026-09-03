import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { NotificationRecipientsInput, UpdateFeeInput, EmailTemplatesInput } from "@mydaust/shared";
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

  // Director-level writes (admin), every change audit-logged.
  @Patch("fees/:key")
  @Roles("admin")
  updateFee(@CurrentUser() user: AuthUser, @Param("key") key: string, @Body() body: unknown) {
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

  @Get("email-templates")
  @Roles("admin", "registrar")
  emailTemplates() {
    return this.config.emailTemplates();
  }

  @Patch("email-templates")
  @Roles("admin", "registrar")
  setEmailTemplates(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const templates = EmailTemplatesInput.parse(body);
    return this.config.setEmailTemplates(templates, user.personId);
  }
}

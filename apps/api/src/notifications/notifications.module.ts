import { Global, Module } from "@nestjs/common";
import { MailDelivery } from "./mail-delivery.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

// Global so academics and registrar can emit without an imports entry, matching how
// mail and app-config are wired.
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, MailDelivery],
  exports: [NotificationsService, MailDelivery],
})
export class NotificationsModule {}

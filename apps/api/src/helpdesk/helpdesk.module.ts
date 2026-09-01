// Helpdesk module wiring.
//
// The module brings together the controller, the service that owns the
// workflow, the GitHub sync seam (optional — no-op when env is not set), and
// the existing UploadsStorage for attachment byte handling. Notifications and
// Prisma are global; the service takes them as `@Optional` so the module can
// also load without the NotificationsModule in a partial test boot.

import { Module } from "@nestjs/common";
import { HelpdeskController } from "./helpdesk.controller.js";
import { HelpdeskGithubSync } from "./helpdesk.github.js";
import { HelpdeskService } from "./helpdesk.service.js";
import { UploadsModule } from "../uploads/uploads.module.js";

@Module({
  imports: [UploadsModule],
  controllers: [HelpdeskController],
  providers: [HelpdeskService, HelpdeskGithubSync],
})
export class HelpdeskModule {}

import { Controller, Get, Param, Post } from "@nestjs/common";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { NotificationsService } from "./notifications.service.js";

/**
 * Every route is scoped to the caller's own person id, so there is no role gate to get
 * wrong: a session can only ever read or clear its own notifications.
 */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.personId);
  }

  @Post("read-all")
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.personId);
  }

  @Post(":id/read")
  read(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(id, user.personId);
  }
}

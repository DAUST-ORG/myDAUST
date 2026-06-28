import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { SendMessageInput, StartThreadInput } from "@mydaust/shared";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { CommsService } from "./comms.service.js";

@Controller("comms")
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get("announcements")
  announcements(@CurrentUser() user: AuthUser) {
    return this.comms.announcements(user);
  }

  @Get("threads")
  myThreads(@CurrentUser() user: AuthUser) {
    return this.comms.myThreads(user.personId);
  }

  @Get("contacts")
  contacts(@CurrentUser() user: AuthUser) {
    return this.comms.contacts(user.personId);
  }

  @Get("threads/:id")
  getThread(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.comms.getThread(id, user.personId);
  }

  @Post("threads/:id/messages")
  sendMessage(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = SendMessageInput.parse(body);
    return this.comms.sendMessage(id, user.personId, input.body);
  }

  @Post("threads")
  startThread(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = StartThreadInput.parse(body);
    return this.comms.startThread(user.personId, input.recipientId, input.subject, input.body);
  }
}

import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CreateAnnouncementInput, SendMessageInput, StartThreadInput } from "@mydaust/shared";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { CommsService } from "./comms.service.js";

// Local zod (the api's own instance) — keeps the ESM/CJS dual-package hazard away from shared.
const BroadcastInput = z.object({
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000),
});

const AudienceBroadcastInput = z.object({
  audienceType: z.enum(["individual", "year", "program", "all"]),
  audienceValue: z.string().max(64).optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

@Controller("comms")
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get("announcements")
  announcements(@CurrentUser() user: AuthUser) {
    return this.comms.announcements(user);
  }

  @Post("announcements")
  @Roles("admin", "registrar", "bursar", "hr", "faculty")
  createAnnouncement(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateAnnouncementInput.parse(body);
    return this.comms.createAnnouncement(input, user.name);
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

  @Post("sections/:id/broadcast")
  @Roles("faculty", "admin", "registrar")
  broadcast(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = BroadcastInput.parse(body);
    return this.comms.broadcastToSection(user.personId, id, input.subject, input.body);
  }

  @Post("broadcasts")
  @Roles("admin", "registrar")
  sendBroadcast(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.comms.broadcastToAudience(user.personId, AudienceBroadcastInput.parse(body));
  }

  @Get("broadcasts")
  @Roles("admin", "registrar")
  listBroadcasts(@CurrentUser() user: AuthUser) {
    return this.comms.listBroadcasts(user.personId);
  }

  @Get("broadcasts/preview")
  @Roles("admin", "registrar")
  previewBroadcast(
    @Query("audienceType") audienceType: "individual" | "year" | "program" | "all",
    @Query("audienceValue") audienceValue?: string,
  ) {
    return this.comms.previewAudience(audienceType, audienceValue);
  }
}

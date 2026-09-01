// Helpdesk REST controller.
//
// All request bodies arrive as `unknown` and are parsed at the boundary
// through the API-local Zod schemas; the helpdesk service consumes only the
// validated shape. Auth is the global JwtAuthGuard plus the per-handler Roles
// decorator so requesters can hit `/helpdesk/mine` without a staff role.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { MAX_UPLOAD_BYTES } from "../uploads/uploads.constants.js";
import { HelpdeskService } from "./helpdesk.service.js";
import {
  CreateHelpdeskAttachmentInput,
  CreateHelpdeskCommentInput,
  CreateHelpdeskTicketInput,
  HelpdeskQueueFilter,
  IdParam,
  UpdateHelpdeskTicketInput,
} from "./helpdesk.schemas.js";
import {
  HELPDESK_QUEUE_ROLES,
  HELPDESK_STAFF_ROLES,
} from "./helpdesk.constants.js";

@Controller("helpdesk")
export class HelpdeskController {
  constructor(private readonly helpdesk: HelpdeskService) {}

  /** Requester-facing: tickets the caller is on. */
  @Get("mine")
  listMine(@CurrentUser() user: AuthUser) {
    return this.helpdesk.listMine(user);
  }

  /** Open a ticket. Any authenticated user may POST. */
  @Post("tickets")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.helpdesk.createTicket(
      user,
      CreateHelpdeskTicketInput.parse(body),
    );
  }

  /** Single ticket — owner, parent of the linked student, or staff. */
  @Get("tickets/:id")
  async get(@CurrentUser() user: AuthUser, @Param() params: unknown) {
    const { id } = IdParam.parse(params);
    const detail = await this.helpdesk.getTicket(user, id);
    if (!detail) {
      // Service throws 403 for forbidden reads; this branch is the genuine
      // "no such ticket" path. Stable string for the portal's i18n.
      throw new NotFoundException("Ticket not found");
    }
    return detail;
  }

  /** Add a comment. `isInternal` is honored only when the caller is staff. */
  @Post("tickets/:id/comments")
  comment(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = IdParam.parse(params);
    const input = CreateHelpdeskCommentInput.parse(body);
    return this.helpdesk.addComment(user, id, input);
  }

  /** Staff queue — narrowed by `?status=…&category=…&mineOnly=true`. */
  @Get("queue")
  @Roles(...HELPDESK_QUEUE_ROLES)
  queue(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    const filter = HelpdeskQueueFilter.parse(query ?? {});
    return this.helpdesk.listQueue(user, filter);
  }

  /** Staff patch — optimistic `version` check via `baseRevision`. */
  @Patch("tickets/:id")
  @Roles(...HELPDESK_STAFF_ROLES)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = IdParam.parse(params);
    const input = UpdateHelpdeskTicketInput.parse(body);
    return this.helpdesk.updateTicket(user, id, input);
  }

  /** Trigger a GitHub sync for an `engineering`-routed ticket. */
  @Post("tickets/:id/github-sync")
  @Roles(...HELPDESK_STAFF_ROLES)
  sync(@CurrentUser() user: AuthUser, @Param() params: unknown) {
    const { id } = IdParam.parse(params);
    return this.helpdesk.syncTicketToGithub(user, id);
  }

  /**
   * Upload an attachment. Multipart: `file` (binary part), `data` (JSON part
   * with `{ ticketId, name? }`). `data` arrives as either a JSON-encoded
   * string (the canonical FormData shape used by the portal) or, less
   * commonly, as a structured object — the schema accepts both. Magic-byte
   * validation lives in `UploadsStorage.putHelpdeskImage`, which writes
   * outside the `uploads/` prefix the public download route serves.
   */
  @Post("attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    // Multer parses multipart fields into a plain object — `data` is one of
    // those fields, not the body root. Pull it out before validating so the
    // schema sees `{ticketId,…}` rather than `{data:{ticketId,…}}`.
    let rawData: unknown = undefined;
    if (body && typeof body === "object" && !Array.isArray(body) && "data" in body) {
      rawData = body.data;
    }
    const input = CreateHelpdeskAttachmentInput.parse(rawData);
    return this.helpdesk.createAttachment(user, input.ticketId, file, input.name);
  }

  /** Stream an attachment back to an authorized reader. */
  @Get("attachments/:id")
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param() params: unknown,
    @Res() response: Response,
  ) {
    const { id } = IdParam.parse(params);
    const file = await this.helpdesk.streamAttachment(user, id);
    if (!file) throw new NotFoundException("Attachment not found");
    response.set({
      "Cache-Control": "private, no-store",
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${file.name.replace(/[\r\n";\\]/g, "")}"`,
    });
  }
}

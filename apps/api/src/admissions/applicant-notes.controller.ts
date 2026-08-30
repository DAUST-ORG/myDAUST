import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { ApplicantNotesService } from "./applicant-notes.service.js";

const NOTE_KINDS = ["general", "financial", "academic", "followup"] as const;

const CreateInput = z.object({
  kind: z.enum(NOTE_KINDS).optional(),
  body: z.string().trim().min(1).max(8000),
});

const UpdateInput = z
  .object({
    body: z.string().trim().min(1).max(8000).optional(),
    kind: z.enum(NOTE_KINDS).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.kind !== undefined || v.pinned !== undefined, {
    message: "At least one of body, kind, pinned is required",
  });

@Roles("admin", "admissions")
@Controller("admissions/applicants/:applicantId/notes")
/**
 * Per-applicant notes thread. Authored by admissions officers (or admins) and
 * scoped to the pre-acceptance pipeline. Body is plain text, rendered only
 * inside the authenticated portal shell.
 *
 * Per the user's scoping decisions, registrars are not granted access — notes
 * are admissions-only. An admin can edit or delete any note; an admissions
 * officer can edit or delete only their own.
 */
export class ApplicantNotesController {
  constructor(private readonly notes: ApplicantNotesService) {}

  @Get()
  list(
    @Param("applicantId") applicantId: string,
    @Query("limit") limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    return this.notes.list(applicantId, Number.isFinite(limit) ? limit : 50);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("applicantId") applicantId: string,
    @Body() body: unknown,
  ) {
    return this.notes.create(user.personId, applicantId, CreateInput.parse(body));
  }

  @Patch(":noteId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("applicantId") applicantId: string,
    @Param("noteId") noteId: string,
    @Body() body: unknown,
  ) {
    return this.notes.update(
      user.personId,
      user.roles.includes("admin"),
      applicantId,
      noteId,
      UpdateInput.parse(body),
    );
  }

  @Delete(":noteId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("applicantId") applicantId: string,
    @Param("noteId") noteId: string,
  ) {
    return this.notes.remove(
      user.personId,
      user.roles.includes("admin"),
      applicantId,
      noteId,
    );
  }
}

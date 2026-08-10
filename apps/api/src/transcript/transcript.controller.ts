import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { TranscriptService } from "./transcript.service.js";

const OptionalId = z.string().uuid().nullable().optional();
const EntryInput = z.object({
  courseId: OptionalId,
  termId: OptionalId,
  courseCode: z.string().trim().min(1).max(30),
  courseTitle: z.string().trim().min(1).max(200),
  termLabel: z.string().trim().min(1).max(100),
  termSortKey: z.string().trim().max(100).nullish(),
  grade: z.string().trim().min(1).max(20),
  credits: z.number().int().min(0).max(40),
  earnedCredits: z.number().int().min(0).max(40).optional(),
  gradePoints: z.number().min(0).max(5).nullable().optional(),
  countsTowardGpa: z.boolean().optional(),
  countsTowardCredits: z.boolean().optional(),
  requirementCategory: z.string().trim().max(100).nullish(),
  note: z.string().trim().max(1000).nullish(),
});
const EntryPatch = EntryInput.partial().extend({
  reason: z.string().trim().min(3).max(500),
});
const ReasonInput = z.object({ reason: z.string().trim().min(3).max(500) });

@Controller("academics")
export class StudentTranscriptController {
  constructor(private readonly transcript: TranscriptService) {}

  @Get("my/transcript")
  @Roles("student")
  transcriptForStudent(@CurrentUser() user: AuthUser) {
    return this.transcript.list(user.studentId!);
  }
}

@Controller("registrar")
@Roles("admin", "registrar")
export class RegistrarTranscriptController {
  constructor(private readonly transcript: TranscriptService) {}

  @Get("students/:studentId/transcript")
  list(
    @Param("studentId") studentId: string,
    @Query("includeVoided") includeVoided?: string,
  ) {
    return this.transcript.list(studentId, includeVoided === "true", true);
  }

  @Post("students/:studentId/transcript")
  create(
    @CurrentUser() user: AuthUser,
    @Param("studentId") studentId: string,
    @Body() body: unknown,
  ) {
    return this.transcript.create(
      user.personId,
      studentId,
      EntryInput.parse(body),
    );
  }

  @Patch("transcript/:entryId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @Body() body: unknown,
  ) {
    return this.transcript.update(
      user.personId,
      entryId,
      EntryPatch.parse(body),
    );
  }

  @Post("transcript/:entryId/void")
  void(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @Body() body: unknown,
  ) {
    return this.transcript.void(
      user.personId,
      entryId,
      ReasonInput.parse(body).reason,
    );
  }

  @Post("transcript/:entryId/restore")
  restore(
    @CurrentUser() user: AuthUser,
    @Param("entryId") entryId: string,
    @Body() body: unknown,
  ) {
    return this.transcript.restore(
      user.personId,
      entryId,
      ReasonInput.parse(body).reason,
    );
  }

  @Get("transcript/:entryId/history")
  history(@Param("entryId") entryId: string) {
    return this.transcript.history(entryId);
  }
}

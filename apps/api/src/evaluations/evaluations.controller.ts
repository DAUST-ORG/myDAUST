import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { EvaluationsService } from "./evaluations.service.js";

const WindowInput = z.object({
  termId: z.string().min(1),
  kind: z.enum(["midterm", "final"]),
  status: z.enum(["draft", "open", "closed"]).optional(),
  boundsOpenAt: z.string().datetime({ offset: true }),
  boundsCloseAt: z.string().datetime({ offset: true }),
  minResponsesToRelease: z.number().int().min(1).max(100).optional(),
});

const ScheduleInput = z.object({
  windowId: z.string().min(1),
  opensAt: z.string().datetime({ offset: true }),
  closesAt: z.string().datetime({ offset: true }),
});

const ResponseInput = z.object({
  windowId: z.string().min(1),
  overall: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  workload: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const ReleaseInput = z.object({ released: z.boolean() });

@Controller("evaluations")
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  // --- Director (the Director Portal is the admin role viewing /director) ---

  @Get("windows")
  @Roles("admin", "registrar")
  listWindows() {
    return this.evaluations.listWindows();
  }

  @Put("windows")
  @Roles("admin")
  upsertWindow(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.evaluations.upsertWindow(WindowInput.parse(body), user.personId);
  }

  @Get("windows/:id/results")
  @Roles("admin")
  windowResults(@Param("id") id: string) {
    return this.evaluations.windowResults(id);
  }

  @Post("windows/:id/release")
  @Roles("admin")
  release(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = ReleaseInput.parse(body);
    return this.evaluations.setReleased(id, input.released, user.personId);
  }

  // --- Faculty ---

  @Put("sections/:id/schedule")
  @Roles("faculty", "admin")
  setSchedule(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = ScheduleInput.parse(body);
    return this.evaluations.setSectionSchedule(
      id,
      input.windowId,
      input,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  @Get("sections/:id/results")
  @Roles("faculty", "admin")
  sectionResults(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.evaluations.sectionResults(
      id,
      user.personId,
      user.roles.includes("admin"),
    );
  }

  // --- Student ---

  @Get("my/pending")
  @Roles("student")
  pending(@CurrentUser() user: AuthUser) {
    return this.evaluations.pending(user.studentId!);
  }

  @Post("my/sections/:id")
  @Roles("student")
  submit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = ResponseInput.parse(body);
    return this.evaluations.submit(user.studentId!, input.windowId, id, input);
  }
}

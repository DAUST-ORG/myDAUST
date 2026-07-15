import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { AdmissionsService } from "./admissions.service.js";

const CreateApplicantInput = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  programCode: z.string().max(20).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  score: z.number().min(0).max(20).nullable().optional(),
});

const SetStageInput = z.object({
  stage: z.enum(["submitted", "review", "interview", "offer", "accepted", "rejected"]),
});

@Controller("admissions")
@Roles("admin", "registrar")
export class AdminAdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Post("applicants")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = CreateApplicantInput.parse(body);
    return this.admissions.adminCreateApplicant(user.personId, input);
  }

  @Patch("applicants/:id/stage")
  setStage(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { stage } = SetStageInput.parse(body);
    return this.admissions.adminSetStage(user.personId, id, stage);
  }
}

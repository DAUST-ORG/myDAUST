import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { AdmissionsService } from "./admissions.service.js";

// The full application form; only name + email are required to create an entry.
const ApplicantFields = {
  programCode: z.string().max(20).nullish(),
  country: z.string().max(80).nullish(),
  score: z.number().min(0).max(20).nullish(),
  phone: z.string().max(40).nullish(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  gender: z.string().max(20).nullish(),
  nationality: z.string().max(80).nullish(),
  city: z.string().max(80).nullish(),
  origin: z.enum(["high-school", "transfer"]).nullish(),
  school: z.string().max(160).nullish(),
  priorGpa: z.string().max(40).nullish(),
  parentName: z.string().max(120).nullish(),
  parentPhone: z.string().max(40).nullish(),
  parentEmail: z.string().email().nullish(),
  allergies: z.string().max(300).nullish(),
  source: z.string().max(80).nullish(),
  essay: z.string().max(4000).nullish(),
  term: z.string().max(40).nullish(),
};

const CreateApplicantInput = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  ...ApplicantFields,
});

const UpdateApplicantInput = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  ...ApplicantFields,
});

const SetStageInput = z.object({
  stage: z.enum(["submitted", "review", "interview", "offer", "rejected"]),
});

const AcceptApplicantInput = z.object({
  academicYearId: z.string().uuid().optional(),
});

const CancelOnboardingInput = z.object({
  reason: z.string().trim().min(10).max(500),
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

  @Get("applicants/:id")
  detail(@Param("id") id: string) {
    return this.admissions.applicantDetail(id);
  }

  @Patch("applicants/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.admissions.adminUpdateApplicant(
      user.personId,
      id,
      UpdateApplicantInput.parse(body),
    );
  }

  @Patch("applicants/:id/stage")
  setStage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { stage } = SetStageInput.parse(body);
    return this.admissions.adminSetStage(user.personId, id, stage);
  }

  @Post("applicants/:id/accept")
  @Roles("admin")
  accept(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.admissions.adminAcceptApplicant(
      user.personId,
      id,
      AcceptApplicantInput.parse(body ?? {}),
    );
  }

  @Post("applicants/:id/acceptance-email/resend")
  resendAcceptance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admissions.adminResendAcceptance(user.personId, id);
  }

  @Post("applicants/:id/onboarding-link/rotate")
  rotateOnboardingLinks(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.admissions.adminRotateOnboardingLink(user.personId, id);
  }

  @Post("applicants/:id/onboarding/cancel")
  @Roles("admin")
  cancelOnboarding(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { reason } = CancelOnboardingInput.parse(body);
    return this.admissions.adminCancelOnboarding(user.personId, id, reason);
  }

  @Post("applicants/:id/student-invite/resend")
  resendStudentInvite(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admissions.adminResendStudentInvite(user.personId, id);
  }
}

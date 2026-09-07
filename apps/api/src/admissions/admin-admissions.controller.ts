import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { AdmissionsService } from "./admissions.service.js";

// The full application form; only name + email are required to create an entry.
// Emails are trimmed + lowercased at the boundary; phones must carry an explicit
// country code so staff never guess the dial prefix. (Local zod instance: the api
// imports zod's CJS build while shared is ESM, so shared schemas can't be reused here.)
const sanitizedEmail = z.string().trim().toLowerCase().email();
const phoneWithCountryCode = z
  .string()
  .trim()
  .max(40)
  .refine((v) => /^\+\d[\d\s\-.()]{5,38}$/.test(v), {
    message: "Include the country code, e.g. +221 77 123 45 67",
  });
const ApplicantFields = {
  programCode: z.string().max(20).nullish(),
  country: z.string().max(80).nullish(),
  score: z.number().min(0).max(20).nullish(),
  phone: phoneWithCountryCode.nullish(),
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
  parentPhone: phoneWithCountryCode.nullish(),
  parentEmail: z.string().trim().toLowerCase().email().nullish(),
  allergies: z.string().max(300).nullish(),
  source: z.string().max(80).nullish(),
  sourceDetail: z.string().trim().max(120).nullish(),
  essay: z.string().max(4000).nullish(),
  term: z.string().max(40).nullish(),
};

const CreateApplicantInput = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: sanitizedEmail,
  ...ApplicantFields,
});

const UpdateApplicantInput = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: sanitizedEmail.optional(),
  ...ApplicantFields,
});

const SetStageInput = z.object({
  stage: z.enum(["submitted", "review", "interview", "offer", "rejected"]),
});

const AcceptApplicantInput = z.object({
  academicYearId: z.string().uuid(),
  academicYearLabel: z.string().trim().min(1).max(80),
  billingProfile: z.object({
    feeScheduleId: z.string().uuid(),
    feeScheduleRevision: z.number().int().positive(),
    feeScheduleFingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/),
    billingCatalogFingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/),
    housingOptionCode: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/),
    cafeteriaOptionCode: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/),
    insuranceSelected: z.boolean(),
    cautionSelected: z.boolean(),
    awardDefinitionIds: z.array(z.string().uuid()).max(20).default([]),
  }),
});

const CancelOnboardingInput = z.object({
  reason: z.string().trim().min(10).max(500),
});

@Controller("admissions")
/**
 * `admissions` holds the applicant pipeline: intake, edits, and stage moves up to "offer".
 *
 * A METHOD-level @Roles REPLACES this list rather than intersecting it, so every narrower
 * decorator below is deliberate and load-bearing -- accept, cancel, link rotation and invite
 * resend all create identity, money or a working credential, and stay with admin/registrar.
 * Adding a route here without thinking grants it to admissions by default.
 */
@Roles("admin", "registrar", "admissions")
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

  @Get("applicants/:id/billing-profile-options")
  billingProfileOptions(@Param("id") id: string) {
    return this.admissions.acceptanceBillingProfileOptions(id);
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

  @Post("applicants/:id/stale-nudge")
  staleNudge(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admissions.sendStaleNudge(user.personId, id);
  }

  @Post("applicants/:id/onboarding-link/rotate")
  // Mints a bearer payment link for the outstanding balance and cancels the previous one.
  @Roles("admin", "registrar")
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

}

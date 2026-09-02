import { NotFoundException } from "@nestjs/common";

export const ACTIVE_APPLICANT_PAYMENT_STAGES = [
  "submitted",
  "review",
  "interview",
  "offer",
] as const;

/**
 * Applicant UUIDs are public bearer capabilities for application-fee flows.
 * Removed/cancelled applications must therefore fail exactly like an unknown
 * capability on both create and read paths.
 */
export function assertActiveApplicantPaymentCapability(
  applicant: {
    stage: string;
    onboardingStatus: string;
    feePaid?: boolean;
  } | null,
): asserts applicant is {
  stage: string;
  onboardingStatus: string;
  feePaid?: boolean;
} {
  if (
    !applicant ||
    !ACTIVE_APPLICANT_PAYMENT_STAGES.includes(
      applicant.stage as (typeof ACTIVE_APPLICANT_PAYMENT_STAGES)[number],
    ) ||
    applicant.onboardingStatus === "cancelled"
  ) {
    throw new NotFoundException("Application not found");
  }
}

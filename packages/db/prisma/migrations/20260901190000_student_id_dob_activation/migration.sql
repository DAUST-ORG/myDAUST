-- The permanent self-service flow intentionally accepts only student ID and
-- date of birth. It has no approval code or issued-card relation. Keep the
-- method explicit so redemption can revalidate the correct proof lifecycle.
ALTER TABLE "StudentActivationRequest"
  DROP CONSTRAINT "StudentActivationRequest_verification_method_check",
  ALTER COLUMN "approvalCodeHash" DROP NOT NULL,
  ADD CONSTRAINT "StudentActivationRequest_verification_method_check" CHECK (
    (
      "verificationMethod" IS NULL
      AND "studentActivationCardId" IS NULL
      AND "approvalCodeHash" IS NOT NULL
    )
    OR (
      "verificationMethod" = 'issued_code'
      AND "approvalCodeHash" IS NOT NULL
      AND "studentActivationCardId" IS NOT NULL
    )
    OR (
      "verificationMethod" = 'student_id_dob'
      AND "approvalCodeHash" IS NULL
      AND "studentActivationCardId" IS NULL
      AND "approvedAt" IS NOT NULL
      AND "approvedById" IS NULL
    )
  );

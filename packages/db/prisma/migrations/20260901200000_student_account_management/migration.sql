-- Registrar-managed student credentials remain compatible with every existing
-- first-time activation row. Existing invites are explicitly classified as
-- first-time; no password or identity value is rewritten.
CREATE TYPE "StudentInvitePurpose" AS ENUM ('first_time', 'password_reset');

ALTER TABLE "Person"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

ALTER TABLE "StudentInvite"
  ADD COLUMN "purpose" "StudentInvitePurpose" NOT NULL DEFAULT 'first_time';

-- A registrar-issued capability is initially approved by a named staff
-- identity, has no activation card/code, and remains bound to the same hashed
-- browser token as all other setup links. approvedById stays nullable because
-- its existing foreign key is ON DELETE SET NULL; redemption separately fails
-- closed when the named approver no longer exists.
ALTER TABLE "StudentActivationRequest"
  DROP CONSTRAINT "StudentActivationRequest_verification_method_check",
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
    OR (
      "verificationMethod" = 'registrar_issued'
      AND "approvalCodeHash" IS NULL
      AND "studentActivationCardId" IS NULL
      AND "approvedAt" IS NOT NULL
    )
  );

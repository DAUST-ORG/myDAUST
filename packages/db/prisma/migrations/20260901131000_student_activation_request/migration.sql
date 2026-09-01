-- Durable public student-activation request. The public request token and the
-- registrar approval code are one-way hashes; no DOB or plaintext capability is
-- persisted. This migration is additive and does not rewrite existing people,
-- students, or invites.
ALTER TABLE "StudentInvite"
    ADD COLUMN "boundEmailSha256" TEXT;

CREATE TABLE "StudentActivationRequest" (
    "id" TEXT NOT NULL,
    "studentPersonId" TEXT,
    "accountKeyHash" TEXT NOT NULL,
    "requestTokenHash" TEXT NOT NULL,
    "approvalCodeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "studentInviteId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentActivationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentActivationRequest_requestTokenHash_key"
    ON "StudentActivationRequest"("requestTokenHash");

CREATE UNIQUE INDEX "StudentActivationRequest_studentInviteId_key"
    ON "StudentActivationRequest"("studentInviteId");

CREATE INDEX "StudentActivationRequest_accountKeyHash_idx"
    ON "StudentActivationRequest"("accountKeyHash");

-- Prisma cannot express partial indexes. These load-bearing constraints make a
-- concurrent replay lose at the database boundary for both real and decoy rows.
CREATE UNIQUE INDEX "StudentActivationRequest_unresolved_account_key"
    ON "StudentActivationRequest"("accountKeyHash")
    WHERE "approvedAt" IS NULL
      AND "consumedAt" IS NULL
      AND "invalidatedAt" IS NULL;

CREATE UNIQUE INDEX "StudentActivationRequest_unresolved_student_person_key"
    ON "StudentActivationRequest"("studentPersonId")
    WHERE "studentPersonId" IS NOT NULL
      AND "approvedAt" IS NULL
      AND "consumedAt" IS NULL
      AND "invalidatedAt" IS NULL;

CREATE UNIQUE INDEX "StudentActivationRequest_unresolved_code_key"
    ON "StudentActivationRequest"("approvalCodeHash")
    WHERE "approvedAt" IS NULL
      AND "consumedAt" IS NULL
      AND "invalidatedAt" IS NULL;

CREATE INDEX "StudentActivationRequest_active_idx"
    ON "StudentActivationRequest"(
        "studentPersonId",
        "consumedAt",
        "invalidatedAt",
        "expiresAt"
    );

CREATE INDEX "StudentActivationRequest_approval_idx"
    ON "StudentActivationRequest"(
        "studentPersonId",
        "approvedAt",
        "expiresAt"
    );

CREATE INDEX "StudentActivationRequest_approvedById_idx"
    ON "StudentActivationRequest"("approvedById");

CREATE INDEX "StudentActivationRequest_expiresAt_idx"
    ON "StudentActivationRequest"("expiresAt");

ALTER TABLE "StudentActivationRequest"
    ADD CONSTRAINT "StudentActivationRequest_studentPersonId_fkey"
    FOREIGN KEY ("studentPersonId") REFERENCES "Person"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentActivationRequest"
    ADD CONSTRAINT "StudentActivationRequest_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentActivationRequest"
    ADD CONSTRAINT "StudentActivationRequest_studentInviteId_fkey"
    FOREIGN KEY ("studentInviteId") REFERENCES "StudentInvite"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

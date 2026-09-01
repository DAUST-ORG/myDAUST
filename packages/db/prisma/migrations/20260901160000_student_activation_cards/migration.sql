-- Universal student activation cards are generated only by the guarded
-- operator CLI. The database retains HMACs and artifact provenance, never the
-- recoverable 80-bit codes printed for students.
CREATE TABLE "StudentActivationCardBatch" (
  "id" TEXT NOT NULL,
  "confirmationPlanSha256" TEXT NOT NULL,
  "eligibilitySnapshotSha256" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "eligibleCount" INTEGER NOT NULL,
  "generatedCount" INTEGER NOT NULL,
  "outputSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentActivationCardBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentActivationCardBatch_digest_check" CHECK (
    "confirmationPlanSha256" ~ '^[0-9a-f]{64}$'
    AND "eligibilitySnapshotSha256" ~ '^[0-9a-f]{64}$'
    AND "outputSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "StudentActivationCardBatch_counts_check" CHECK (
    "eligibleCount" >= 0
    AND "generatedCount" >= 0
    AND "generatedCount" <= "eligibleCount"
  ),
  CONSTRAINT "StudentActivationCardBatch_expiry_check" CHECK (
    "expiresAt" > "createdAt"
  ),
  CONSTRAINT "StudentActivationCardBatch_status_check" CHECK (
    (
      "status" = 'active'
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revokeReason" IS NULL
    )
    OR (
      "status" = 'revoked'
      AND "revokedAt" IS NOT NULL
      AND "revokedById" IS NOT NULL
      AND "revokeReason" IN (
        'lost_artifact',
        'misprint',
        'operator_error',
        'suspected_disclosure',
        'superseded',
        'security_response'
      )
    )
  )
);

CREATE TABLE "StudentActivationCard" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "studentPersonId" TEXT NOT NULL,
  "codeHmacSha256" TEXT NOT NULL,
  "boundEmailSha256" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentActivationCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentActivationCard_digest_check" CHECK (
    "codeHmacSha256" ~ '^[0-9a-f]{64}$'
    AND "boundEmailSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "StudentActivationCard_attempts_check" CHECK (
    "failedAttempts" BETWEEN 0 AND 5
    AND ("failedAttempts" < 5 OR "revokedAt" IS NOT NULL OR "usedAt" IS NOT NULL)
  ),
  CONSTRAINT "StudentActivationCard_terminal_state_check" CHECK (
    ("usedAt" IS NULL OR "revokedAt" IS NULL)
    AND ("usedAt" IS NULL OR "claimedAt" IS NOT NULL)
  ),
  CONSTRAINT "StudentActivationCard_expiry_check" CHECK (
    "expiresAt" > "createdAt"
  )
);

ALTER TABLE "StudentActivationRequest"
  ADD COLUMN "verificationMethod" TEXT,
  ADD COLUMN "studentActivationCardId" TEXT,
  ADD CONSTRAINT "StudentActivationRequest_verification_method_check" CHECK (
    "verificationMethod" IS NULL OR "verificationMethod" = 'issued_code'
  );

-- Cut over fail-closed: burn only unresolved rows from the superseded paired
-- registrar flow. Approved historical requests and their setup invites remain
-- valid until their existing expiry/consumption rules complete.
UPDATE "StudentActivationRequest"
SET "invalidatedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "approvedAt" IS NULL
  AND "consumedAt" IS NULL
  AND "invalidatedAt" IS NULL;

CREATE UNIQUE INDEX "StudentActivationCardBatch_confirmationPlanSha256_key"
  ON "StudentActivationCardBatch"("confirmationPlanSha256");
CREATE UNIQUE INDEX "StudentActivationCardBatch_outputSha256_key"
  ON "StudentActivationCardBatch"("outputSha256");
CREATE INDEX "StudentActivationCardBatch_expiresAt_revokedAt_idx"
  ON "StudentActivationCardBatch"("expiresAt", "revokedAt");
CREATE INDEX "StudentActivationCardBatch_createdById_createdAt_idx"
  ON "StudentActivationCardBatch"("createdById", "createdAt");
CREATE INDEX "StudentActivationCardBatch_revokedById_revokedAt_idx"
  ON "StudentActivationCardBatch"("revokedById", "revokedAt");

CREATE UNIQUE INDEX "StudentActivationCard_codeHmacSha256_key"
  ON "StudentActivationCard"("codeHmacSha256");
CREATE INDEX "StudentActivationCard_batchId_expiresAt_idx"
  ON "StudentActivationCard"("batchId", "expiresAt");
CREATE INDEX "StudentActivationCard_studentPersonId_expiresAt_idx"
  ON "StudentActivationCard"("studentPersonId", "expiresAt");
-- PostgreSQL cannot put now() in an index predicate. Expired unresolved rows
-- are revoked by the operator CLI before replacement, so this stronger index
-- still guarantees at most one live-capable code per student under races.
CREATE UNIQUE INDEX "StudentActivationCard_unresolved_student_key"
  ON "StudentActivationCard"("studentPersonId")
  WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "StudentActivationRequest_studentActivationCardId_key"
  ON "StudentActivationRequest"("studentActivationCardId");

ALTER TABLE "StudentActivationCardBatch"
  ADD CONSTRAINT "StudentActivationCardBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentActivationCardBatch_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentActivationCard"
  ADD CONSTRAINT "StudentActivationCard_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "StudentActivationCardBatch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentActivationCard_studentPersonId_fkey"
  FOREIGN KEY ("studentPersonId") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentActivationRequest"
  ADD CONSTRAINT "StudentActivationRequest_studentActivationCardId_fkey"
  FOREIGN KEY ("studentActivationCardId") REFERENCES "StudentActivationCard"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

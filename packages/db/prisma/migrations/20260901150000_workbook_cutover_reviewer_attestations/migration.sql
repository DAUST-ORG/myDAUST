-- Durable, authenticated adoption of offline workbook-cutover review decisions.
-- Attestations are created before a cutover batch exists, so the exact canonical
-- manifest digest is the parent identity rather than WorkbookCutoverBatch.id.
CREATE TABLE "WorkbookCutoverReviewerAttestation" (
    "id" TEXT NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerEmailNormalized" TEXT NOT NULL,
    "authorizedRoles" TEXT[] NOT NULL,
    "statementSha256" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revocationReason" TEXT,

    CONSTRAINT "WorkbookCutoverReviewerAttestation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkbookCutoverReviewerAttestation_hashes_check" CHECK (
      "manifestSha256" ~ '^[0-9a-f]{64}$'
      AND "statementSha256" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "WorkbookCutoverReviewerAttestation_email_check" CHECK (
      length("reviewerEmailNormalized") BETWEEN 3 AND 320
      AND "reviewerEmailNormalized" = lower(btrim("reviewerEmailNormalized"))
      AND position('@' IN "reviewerEmailNormalized") > 1
    ),
    CONSTRAINT "WorkbookCutoverReviewerAttestation_roles_check" CHECK (
      cardinality("authorizedRoles") > 0
      AND "authorizedRoles" <@ ARRAY['admin', 'bursar', 'registrar', 'admissions']::TEXT[]
    ),
    CONSTRAINT "WorkbookCutoverReviewerAttestation_revocation_check" CHECK (
      (
        "revokedAt" IS NULL
        AND "revokedById" IS NULL
        AND "revocationReason" IS NULL
      )
      OR (
        "revokedAt" IS NOT NULL
        AND "revokedById" IS NOT NULL
        AND "revocationReason" IS NOT NULL
        AND "revocationReason" IN (
          'decisions_changed',
          'attested_in_error',
          'identity_compromised'
        )
      )
    )
);

CREATE UNIQUE INDEX "WorkbookCutoverReviewerAttestation_manifestSha256_reviewerId_key"
  ON "WorkbookCutoverReviewerAttestation"("manifestSha256", "reviewerId");
CREATE INDEX "WorkbookCutoverReviewerAttestation_manifestSha256_revokedAt_idx"
  ON "WorkbookCutoverReviewerAttestation"("manifestSha256", "revokedAt");
CREATE INDEX "WorkbookCutoverReviewerAttestation_reviewerId_attestedAt_idx"
  ON "WorkbookCutoverReviewerAttestation"("reviewerId", "attestedAt");
CREATE INDEX "WorkbookCutoverReviewerAttestation_revokedById_idx"
  ON "WorkbookCutoverReviewerAttestation"("revokedById");

ALTER TABLE "WorkbookCutoverReviewerAttestation"
  ADD CONSTRAINT "WorkbookCutoverReviewerAttestation_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkbookCutoverReviewerAttestation_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DB-enforced append-only evidence: identity, digest, statement, roles and
-- attestation time never change. Revocation is a single null -> complete-state
-- transition and can never be undone or rewritten. Deletes are always refused.
CREATE FUNCTION "enforce_workbook_cutover_attestation_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Workbook cutover reviewer attestations cannot be deleted';
  END IF;

  IF OLD."manifestSha256" IS DISTINCT FROM NEW."manifestSha256"
    OR OLD."reviewerId" IS DISTINCT FROM NEW."reviewerId"
    OR OLD."reviewerEmailNormalized" IS DISTINCT FROM NEW."reviewerEmailNormalized"
    OR OLD."authorizedRoles" IS DISTINCT FROM NEW."authorizedRoles"
    OR OLD."statementSha256" IS DISTINCT FROM NEW."statementSha256"
    OR OLD."attestedAt" IS DISTINCT FROM NEW."attestedAt"
  THEN
    RAISE EXCEPTION 'Workbook cutover reviewer attestation evidence is immutable';
  END IF;

  IF OLD."revokedAt" IS NOT NULL AND (
    OLD."revokedAt" IS DISTINCT FROM NEW."revokedAt"
    OR OLD."revokedById" IS DISTINCT FROM NEW."revokedById"
    OR OLD."revocationReason" IS DISTINCT FROM NEW."revocationReason"
  ) THEN
    RAISE EXCEPTION 'Workbook cutover reviewer attestation revocation is terminal';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "WorkbookCutoverReviewerAttestation_immutable"
BEFORE UPDATE OR DELETE ON "WorkbookCutoverReviewerAttestation"
FOR EACH ROW
EXECUTE FUNCTION "enforce_workbook_cutover_attestation_immutability"();

-- Per-applicant notes thread. Authored by admissions officers (or admins) and
-- scoped to the pre-acceptance pipeline. Body is plain text. Hard-deletable.
-- Additive only: one new table, one new index on Applicant.notes via the model.

CREATE TABLE "AdmissionNote" (
    "id"          TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "authorId"    TEXT NOT NULL,
    "kind"        TEXT NOT NULL DEFAULT 'general',
    "body"        TEXT NOT NULL,
    "pinned"      BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "editedAt"    TIMESTAMP(3),
    CONSTRAINT "AdmissionNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdmissionNote" ADD CONSTRAINT "AdmissionNote_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdmissionNote" ADD CONSTRAINT "AdmissionNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdmissionNote" ADD CONSTRAINT "AdmissionNote_kind_check"
    CHECK ("kind" IN ('general', 'financial', 'academic', 'followup'));

CREATE INDEX "AdmissionNote_applicantId_createdAt_idx"
    ON "AdmissionNote"("applicantId", "createdAt");

CREATE INDEX "AdmissionNote_applicantId_pinned_idx"
    ON "AdmissionNote"("applicantId", "pinned");

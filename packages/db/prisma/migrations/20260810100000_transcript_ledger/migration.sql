-- CreateEnum
CREATE TYPE "StudentRecordStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "TranscriptEntrySource" AS ENUM ('legacy_import', 'approved_enrollment', 'manual');

-- CreateEnum
CREATE TYPE "TranscriptImportBatchStatus" AS ENUM ('pending', 'validated', 'imported', 'failed');

-- AlterTable: additive defaults preserve all existing rows.
ALTER TABLE "Student"
ADD COLUMN "recordStatus" "StudentRecordStatus" NOT NULL DEFAULT 'active';

ALTER TABLE "GradeScaleRow"
ADD COLUMN "countsTowardGpa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "countsTowardCredits" BOOLEAN NOT NULL DEFAULT true;

-- A numeric grade participates in GPA. F is GPA-bearing but earns no credit;
-- incomplete and withdrawal marks are neither GPA-bearing nor credit-bearing.
UPDATE "GradeScaleRow"
SET
  "countsTowardGpa" = ("points" IS NOT NULL),
  "countsTowardCredits" = (
    COALESCE("points", 0) > 0
    OR UPPER(BTRIM("grade")) IN ('P', 'P — PASS', 'PASS')
  );

ALTER TABLE "GradeSubmission"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GradeSubmissionItem" (
    "id" TEXT NOT NULL,
    "gradeSubmissionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT,
    "termId" TEXT,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "termLabel" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "grade" TEXT,
    "gradePoints" DOUBLE PRECISION,
    "countsTowardGpa" BOOLEAN NOT NULL DEFAULT false,
    "countsTowardCredits" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeSubmissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptImportBatch" (
    "id" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "sourceObjectKey" TEXT,
    "status" "TranscriptImportBatchStatus" NOT NULL DEFAULT 'pending',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "TranscriptImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "source" "TranscriptEntrySource" NOT NULL,
    "sourceKey" TEXT,
    "importBatchId" TEXT,
    "importRowNumber" INTEGER,
    "gradeSubmissionItemId" TEXT,
    "enrollmentId" TEXT,
    "courseId" TEXT,
    "termId" TEXT,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "termLabel" TEXT NOT NULL,
    "termSortKey" TEXT,
    "grade" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "earnedCredits" INTEGER NOT NULL,
    "gradePoints" DOUBLE PRECISION,
    "countsTowardGpa" BOOLEAN NOT NULL DEFAULT true,
    "countsTowardCredits" BOOLEAN NOT NULL DEFAULT true,
    "requirementCategory" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "TranscriptEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GradeSubmissionItem" ADD CONSTRAINT "GradeSubmissionItem_gradeSubmissionId_fkey" FOREIGN KEY ("gradeSubmissionId") REFERENCES "GradeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GradeSubmissionItem" ADD CONSTRAINT "GradeSubmissionItem_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeSubmissionItem" ADD CONSTRAINT "GradeSubmissionItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeSubmissionItem" ADD CONSTRAINT "GradeSubmissionItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GradeSubmissionItem" ADD CONSTRAINT "GradeSubmissionItem_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TranscriptImportBatch" ADD CONSTRAINT "TranscriptImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "TranscriptImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_gradeSubmissionItemId_fkey" FOREIGN KEY ("gradeSubmissionItemId") REFERENCES "GradeSubmissionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TranscriptEntry" ADD CONSTRAINT "TranscriptEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the current review snapshot for grade submissions created before
-- versioned items existed. Drafts remain at version zero until first submission.
UPDATE "GradeSubmission"
SET "version" = 1
WHERE "status" <> 'draft' OR "submittedAt" IS NOT NULL;

INSERT INTO "GradeSubmissionItem" (
  "id",
  "gradeSubmissionId",
  "version",
  "enrollmentId",
  "studentId",
  "courseId",
  "termId",
  "courseCode",
  "courseTitle",
  "termLabel",
  "credits",
  "grade",
  "gradePoints",
  "countsTowardGpa",
  "countsTowardCredits",
  "createdAt"
)
SELECT
  'migration-gsi-' || MD5(gs."id" || ':' || e."id" || ':' || gs."version"::TEXT),
  gs."id",
  gs."version",
  e."id",
  e."studentId",
  c."id",
  t."id",
  c."code",
  c."title",
  t."name",
  c."credits",
  e."grade",
  CASE
    WHEN policy."id" IS NOT NULL THEN policy."points"
    WHEN UPPER(BTRIM(e."grade")) = 'A'  THEN 4.0
    WHEN UPPER(BTRIM(e."grade")) = 'A-' THEN 3.7
    WHEN UPPER(BTRIM(e."grade")) = 'B+' THEN 3.3
    WHEN UPPER(BTRIM(e."grade")) = 'B'  THEN 3.0
    WHEN UPPER(BTRIM(e."grade")) = 'B-' THEN 2.7
    WHEN UPPER(BTRIM(e."grade")) = 'C+' THEN 2.3
    WHEN UPPER(BTRIM(e."grade")) = 'C'  THEN 2.0
    WHEN UPPER(BTRIM(e."grade")) = 'C-' THEN 1.7
    WHEN UPPER(BTRIM(e."grade")) = 'D'  THEN 1.0
    WHEN UPPER(BTRIM(e."grade")) = 'F'  THEN 0.0
    ELSE NULL
  END,
  CASE
    WHEN e."grade" IS NULL THEN false
    WHEN policy."id" IS NOT NULL THEN policy."countsTowardGpa"
    ELSE UPPER(BTRIM(e."grade")) IN ('A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F')
  END,
  CASE
    WHEN e."grade" IS NULL THEN false
    WHEN policy."id" IS NOT NULL THEN policy."countsTowardCredits"
    ELSE UPPER(BTRIM(e."grade")) NOT IN ('F', 'I', 'W')
  END,
  COALESCE(gs."submittedAt", CURRENT_TIMESTAMP)
FROM "GradeSubmission" gs
JOIN "Section" s ON s."id" = gs."sectionId"
JOIN "Course" c ON c."id" = s."courseId"
JOIN "Term" t ON t."id" = s."termId"
JOIN "Enrollment" e ON e."sectionId" = s."id" AND e."status" IN ('enrolled', 'completed')
LEFT JOIN LATERAL (
  SELECT gsr.*
  FROM "GradeScaleRow" gsr
  WHERE gsr."schemeId" = COALESCE(
      s."gradingSchemeId",
      (SELECT d."id" FROM "GradingScheme" d WHERE d."isDefault" = true ORDER BY d."id" LIMIT 1)
    )
    AND UPPER(BTRIM(gsr."grade")) = UPPER(BTRIM(e."grade"))
  ORDER BY gsr."position", gsr."id"
  LIMIT 1
) policy ON true
WHERE gs."version" > 0;

-- Backfill the canonical ledger from records that were already official before
-- this migration: an approved section submission, or a completed legacy
-- enrollment created before the approval workflow existed. Submitted/returned
-- rows are intentionally excluded despite the old code marking them completed.
INSERT INTO "TranscriptEntry" (
  "id",
  "studentId",
  "source",
  "sourceKey",
  "gradeSubmissionItemId",
  "enrollmentId",
  "courseId",
  "termId",
  "courseCode",
  "courseTitle",
  "termLabel",
  "termSortKey",
  "grade",
  "credits",
  "earnedCredits",
  "gradePoints",
  "countsTowardGpa",
  "countsTowardCredits",
  "requirementCategory",
  "createdById",
  "updatedById",
  "createdAt",
  "updatedAt"
)
SELECT
  'migration-transcript-' || MD5(e."id"),
  e."studentId",
  'approved_enrollment'::"TranscriptEntrySource",
  'enrollment:' || e."id",
  gsi."id",
  e."id",
  c."id",
  t."id",
  c."code",
  c."title",
  t."name",
  TO_CHAR(t."startDate", 'YYYY-MM-DD') || ':' || t."name",
  e."grade",
  c."credits",
  CASE
    WHEN policy."id" IS NOT NULL AND policy."countsTowardCredits" THEN c."credits"
    WHEN policy."id" IS NOT NULL THEN 0
    WHEN UPPER(BTRIM(e."grade")) IN ('F', 'I', 'W') THEN 0
    ELSE c."credits"
  END,
  CASE
    WHEN policy."id" IS NOT NULL THEN policy."points"
    WHEN UPPER(BTRIM(e."grade")) = 'A'  THEN 4.0
    WHEN UPPER(BTRIM(e."grade")) = 'A-' THEN 3.7
    WHEN UPPER(BTRIM(e."grade")) = 'B+' THEN 3.3
    WHEN UPPER(BTRIM(e."grade")) = 'B'  THEN 3.0
    WHEN UPPER(BTRIM(e."grade")) = 'B-' THEN 2.7
    WHEN UPPER(BTRIM(e."grade")) = 'C+' THEN 2.3
    WHEN UPPER(BTRIM(e."grade")) = 'C'  THEN 2.0
    WHEN UPPER(BTRIM(e."grade")) = 'C-' THEN 1.7
    WHEN UPPER(BTRIM(e."grade")) = 'D'  THEN 1.0
    WHEN UPPER(BTRIM(e."grade")) = 'F'  THEN 0.0
    ELSE NULL
  END,
  CASE
    WHEN policy."id" IS NOT NULL THEN policy."countsTowardGpa"
    ELSE UPPER(BTRIM(e."grade")) IN ('A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F')
  END,
  CASE
    WHEN policy."id" IS NOT NULL THEN policy."countsTowardCredits"
    ELSE UPPER(BTRIM(e."grade")) NOT IN ('F', 'I', 'W')
  END,
  c."requirementCategory",
  approver."id",
  approver."id",
  COALESCE(gs."approvedAt", e."enrolledAt", CURRENT_TIMESTAMP),
  COALESCE(gs."approvedAt", e."enrolledAt", CURRENT_TIMESTAMP)
FROM "Enrollment" e
JOIN "Section" s ON s."id" = e."sectionId"
JOIN "Course" c ON c."id" = s."courseId"
JOIN "Term" t ON t."id" = s."termId"
LEFT JOIN "GradeSubmission" gs ON gs."sectionId" = s."id"
LEFT JOIN "GradeSubmissionItem" gsi
  ON gsi."gradeSubmissionId" = gs."id"
  AND gsi."version" = gs."version"
  AND gsi."enrollmentId" = e."id"
LEFT JOIN "Person" approver ON approver."id" = gs."approvedById"
LEFT JOIN LATERAL (
  SELECT gsr.*
  FROM "GradeScaleRow" gsr
  WHERE gsr."schemeId" = COALESCE(
      s."gradingSchemeId",
      (SELECT d."id" FROM "GradingScheme" d WHERE d."isDefault" = true ORDER BY d."id" LIMIT 1)
    )
    AND UPPER(BTRIM(gsr."grade")) = UPPER(BTRIM(e."grade"))
  ORDER BY gsr."position", gsr."id"
  LIMIT 1
) policy ON true
WHERE e."status" = 'completed'
  AND e."grade" IS NOT NULL
  AND (gs."id" IS NULL OR gs."status" = 'approved');

-- Repair the previous workflow's premature completion: a faculty submission
-- used to mark graded enrollments completed before the registrar decided it.
-- Approved and pre-workflow (no submission) records remain untouched.
UPDATE "Enrollment" e
SET "status" = 'enrolled'
FROM "Section" s
JOIN "GradeSubmission" gs ON gs."sectionId" = s."id"
WHERE e."sectionId" = s."id"
  AND e."status" = 'completed'
  AND gs."status" IN ('submitted', 'returned');

-- CreateIndex
CREATE INDEX "Student_recordStatus_idx" ON "Student"("recordStatus");

CREATE UNIQUE INDEX "GradeSubmissionItem_gradeSubmissionId_version_enrollmentId_key" ON "GradeSubmissionItem"("gradeSubmissionId", "version", "enrollmentId");
CREATE INDEX "GradeSubmissionItem_gradeSubmissionId_version_idx" ON "GradeSubmissionItem"("gradeSubmissionId", "version");
CREATE INDEX "GradeSubmissionItem_studentId_idx" ON "GradeSubmissionItem"("studentId");
CREATE INDEX "GradeSubmissionItem_enrollmentId_idx" ON "GradeSubmissionItem"("enrollmentId");
CREATE INDEX "GradeSubmissionItem_courseId_idx" ON "GradeSubmissionItem"("courseId");
CREATE INDEX "GradeSubmissionItem_termId_idx" ON "GradeSubmissionItem"("termId");

CREATE UNIQUE INDEX "TranscriptImportBatch_sourceSha256_key" ON "TranscriptImportBatch"("sourceSha256");
CREATE INDEX "TranscriptImportBatch_status_createdAt_idx" ON "TranscriptImportBatch"("status", "createdAt");

CREATE UNIQUE INDEX "TranscriptEntry_sourceKey_key" ON "TranscriptEntry"("sourceKey");
CREATE UNIQUE INDEX "TranscriptEntry_gradeSubmissionItemId_key" ON "TranscriptEntry"("gradeSubmissionItemId");
CREATE UNIQUE INDEX "TranscriptEntry_enrollmentId_key" ON "TranscriptEntry"("enrollmentId");
CREATE INDEX "TranscriptEntry_studentId_voidedAt_termSortKey_idx" ON "TranscriptEntry"("studentId", "voidedAt", "termSortKey");
CREATE INDEX "TranscriptEntry_studentId_voidedAt_courseCode_idx" ON "TranscriptEntry"("studentId", "voidedAt", "courseCode");
CREATE INDEX "TranscriptEntry_importBatchId_idx" ON "TranscriptEntry"("importBatchId");
CREATE UNIQUE INDEX "TranscriptEntry_importBatchId_importRowNumber_key" ON "TranscriptEntry"("importBatchId", "importRowNumber");
CREATE INDEX "TranscriptEntry_courseId_idx" ON "TranscriptEntry"("courseId");
CREATE INDEX "TranscriptEntry_termId_idx" ON "TranscriptEntry"("termId");

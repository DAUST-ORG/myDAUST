ALTER TYPE "ApprovalRequestKind" ADD VALUE IF NOT EXISTS 'academic_catalog';

CREATE TYPE "AcademicCatalogStatus" AS ENUM (
  'draft',
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'superseded'
);

ALTER TABLE "Student" ADD COLUMN "catalogYearId" TEXT;

-- Preserve legacy free-text catalog assignments by materialising any missing
-- labels as archived academic years before normalising the student relation.
INSERT INTO "AcademicYear" ("id", "label", "status", "createdAt")
SELECT gen_random_uuid()::text, labels.label, 'archived'::"AcademicYearStatus", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "catalogYear" AS label FROM "Student" WHERE "catalogYear" IS NOT NULL
  UNION
  SELECT DISTINCT "catalogYear" AS label FROM "ProgramRequirement"
) labels
WHERE NOT EXISTS (
  SELECT 1 FROM "AcademicYear" existing WHERE existing."label" = labels.label
);

UPDATE "Student" student
SET "catalogYearId" = year."id"
FROM "AcademicYear" year
WHERE student."catalogYear" = year."label";

CREATE TABLE "AcademicCatalogRevision" (
  "id" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "AcademicCatalogStatus" NOT NULL DEFAULT 'draft',
  "yearLabel" TEXT NOT NULL,
  "startsOn" TIMESTAMP(3),
  "endsOn" TIMESTAMP(3),
  "defaultLevels" JSONB NOT NULL,
  "programConfigurations" JSONB NOT NULL,
  "reason" TEXT,
  "activateYear" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvalRequestId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicCatalogRevision_pkey" PRIMARY KEY ("id")
);

-- Create one approved baseline per known catalog. Requirement category totals
-- are copied exactly; the default S-level ladder grows only as far as needed by
-- the largest configured programme in that catalog.
INSERT INTO "AcademicCatalogRevision" (
  "id",
  "academicYearId",
  "revision",
  "status",
  "yearLabel",
  "startsOn",
  "endsOn",
  "defaultLevels",
  "programConfigurations",
  "reason",
  "approvedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  year."id",
  1,
  'approved'::"AcademicCatalogStatus",
  year."label",
  year."startsOn",
  year."endsOn",
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', 'S' || level_no,
        'name', 'Semester ' || level_no,
        'creditCeiling', level_no * 30
      ) ORDER BY level_no
    )
    FROM generate_series(
      1,
      GREATEST(
        1,
        CEIL(
          COALESCE((
            SELECT MAX(program_total)
            FROM (
              SELECT SUM(requirement."requiredCredits") AS program_total
              FROM "ProgramRequirement" requirement
              WHERE requirement."catalogYear" = year."label"
              GROUP BY requirement."programId"
            ) totals
          ), 30)::numeric / 30
        )::integer
      )
    ) AS level_no
  ),
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'programId', program."id",
        'programCode', program."code",
        'programName', program."name",
        'progressionMode', 'default',
        'customLevels', '[]'::jsonb,
        'requirements', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'category', requirement."category",
              'requiredCredits', requirement."requiredCredits"
            ) ORDER BY requirement."position", requirement."category"
          ), '[]'::jsonb)
          FROM "ProgramRequirement" requirement
          WHERE requirement."programId" = program."id"
            AND requirement."catalogYear" = year."label"
        )
      ) ORDER BY program."code"
    )
    FROM "Program" program
    WHERE EXISTS (
      SELECT 1
      FROM "ProgramRequirement" requirement
      WHERE requirement."programId" = program."id"
        AND requirement."catalogYear" = year."label"
    )
  ), '[]'::jsonb),
  'Migrated from programme requirements',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AcademicYear" year;

CREATE UNIQUE INDEX "AcademicCatalogRevision_academicYearId_revision_key"
  ON "AcademicCatalogRevision"("academicYearId", "revision");
CREATE UNIQUE INDEX "AcademicCatalogRevision_approvalRequestId_key"
  ON "AcademicCatalogRevision"("approvalRequestId");
CREATE INDEX "AcademicCatalogRevision_academicYearId_status_revision_idx"
  ON "AcademicCatalogRevision"("academicYearId", "status", "revision");
CREATE INDEX "AcademicCatalogRevision_createdById_idx"
  ON "AcademicCatalogRevision"("createdById");
CREATE INDEX "AcademicCatalogRevision_approvedById_idx"
  ON "AcademicCatalogRevision"("approvedById");
CREATE INDEX "Student_catalogYearId_idx" ON "Student"("catalogYearId");

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_catalogYearId_fkey"
  FOREIGN KEY ("catalogYearId") REFERENCES "AcademicYear"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AcademicCatalogRevision"
  ADD CONSTRAINT "AcademicCatalogRevision_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicCatalogRevision"
  ADD CONSTRAINT "AcademicCatalogRevision_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicCatalogRevision"
  ADD CONSTRAINT "AcademicCatalogRevision_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "Person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Version academic-standing policy with the catalog and preserve reasoned
-- per-student exceptions without overwriting computed academic history.
ALTER TABLE "AcademicCatalogRevision"
ADD COLUMN "defaultStandingRules" JSONB NOT NULL DEFAULT '[
  {"code":"academic_probation","label":"Academic Probation","minimumGpa":0,"order":0,"tone":"warning"},
  {"code":"good_standing","label":"Good Standing","minimumGpa":2,"order":1,"tone":"success"},
  {"code":"deans_list","label":"Dean''s List","minimumGpa":3.7,"order":2,"tone":"honor"}
]'::jsonb,
ADD COLUMN "notYetGradedStanding" JSONB NOT NULL DEFAULT
  '{"code":"not_yet_graded","label":"Not yet graded","tone":"neutral"}'::jsonb;

CREATE TABLE "StudentStandingOverride" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "standingCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "clearedById" TEXT,
  "clearedAt" TIMESTAMP(3),
  "clearReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentStandingOverride_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudentStandingOverride" ADD CONSTRAINT "StudentStandingOverride_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentStandingOverride" ADD CONSTRAINT "StudentStandingOverride_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentStandingOverride" ADD CONSTRAINT "StudentStandingOverride_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentStandingOverride" ADD CONSTRAINT "StudentStandingOverride_clearedById_fkey"
  FOREIGN KEY ("clearedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StudentStandingOverride_studentId_clearedAt_expiresAt_idx"
  ON "StudentStandingOverride"("studentId", "clearedAt", "expiresAt");
CREATE INDEX "StudentStandingOverride_createdById_idx"
  ON "StudentStandingOverride"("createdById");
CREATE INDEX "StudentStandingOverride_clearedById_idx"
  ON "StudentStandingOverride"("clearedById");

INSERT INTO "StudentStandingOverride" (
  "id", "studentId", "standingCode", "reason", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  student."id",
  CASE LOWER(BTRIM(student."standing"))
    WHEN 'academic probation' THEN 'academic_probation'
    WHEN 'probation' THEN 'academic_probation'
    WHEN 'dean''s list' THEN 'deans_list'
    WHEN 'good' THEN 'good_standing'
    WHEN 'good standing' THEN 'good_standing'
    ELSE 'good_standing'
  END,
  'Migrated legacy standing override: ' || student."standing",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Student" student
WHERE student."standing" IS NOT NULL
  AND BTRIM(student."standing") <> '';

-- Correct every recognized engineering programme in the latest system-generated
-- approved snapshot. Previous revisions remain immutable and readable.
CREATE TEMP TABLE "_CompleteEngineeringCatalogCorrection" AS
SELECT revision.*
FROM "AcademicCatalogRevision" revision
WHERE revision."status" = 'approved'::"AcademicCatalogStatus"
  AND NOT EXISTS (
    SELECT 1 FROM "AcademicCatalogRevision" newer
    WHERE newer."academicYearId" = revision."academicYearId"
      AND newer."revision" > revision."revision"
      AND newer."status" = 'approved'::"AcademicCatalogStatus"
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(revision."programConfigurations") programme
    WHERE (
      programme->>'programName' ILIKE ANY (ARRAY['%computer%', '%electrical%', '%mechanical%', '%chemical%'])
      OR UPPER(programme->>'programCode') IN ('BSCE','BSCS','CS','BSEE','EE','BSME','ME','BSCHEM','BSCHE','CHE')
    )
    AND (
      SELECT COALESCE(SUM((requirement->>'requiredCredits')::integer), 0)
      FROM jsonb_array_elements(programme->'requirements') requirement
    ) <> 300
  );

INSERT INTO "AcademicCatalogRevision" (
  "id", "academicYearId", "revision", "status", "yearLabel", "startsOn", "endsOn",
  "defaultLevels", "defaultStandingRules", "notYetGradedStanding",
  "programConfigurations", "reason", "activateYear", "approvedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  correction."academicYearId",
  (
    SELECT COALESCE(MAX(existing."revision"), 0) + 1
    FROM "AcademicCatalogRevision" existing
    WHERE existing."academicYearId" = correction."academicYearId"
  ),
  'approved'::"AcademicCatalogStatus",
  correction."yearLabel",
  correction."startsOn",
  correction."endsOn",
  (
    SELECT jsonb_agg(jsonb_build_object(
      'code', 'S' || level_no,
      'name', 'Semester ' || level_no,
      'creditCeiling', level_no * 30
    ) ORDER BY level_no)
    FROM generate_series(1, 10) level_no
  ),
  correction."defaultStandingRules",
  correction."notYetGradedStanding",
  (
    SELECT jsonb_agg(
      (
        CASE
          WHEN programme->>'programName' ILIKE '%chemical%'
            OR UPPER(programme->>'programCode') IN ('BSCHEM','BSCHE','CHE')
          THEN jsonb_set(programme, '{requirements}', '[
            {"category":"Core Engineering","requiredCredits":90},
            {"category":"Chemical Engineering","requiredCredits":102},
            {"category":"Chemistry","requiredCredits":36},
            {"category":"Computer Science","requiredCredits":12},
            {"category":"Mathematics","requiredCredits":36},
            {"category":"Sciences","requiredCredits":12},
            {"category":"Humanities & English","requiredCredits":12}
          ]'::jsonb, true)
          WHEN programme->>'programName' ILIKE '%mechanical%'
            OR UPPER(programme->>'programCode') IN ('BSME','ME')
          THEN jsonb_set(programme, '{requirements}', '[
            {"category":"Core Engineering","requiredCredits":90},
            {"category":"Mechanical Engineering","requiredCredits":120},
            {"category":"Electrical Engineering","requiredCredits":12},
            {"category":"Computer Science","requiredCredits":12},
            {"category":"Mathematics","requiredCredits":36},
            {"category":"Sciences","requiredCredits":18},
            {"category":"Humanities & English","requiredCredits":12}
          ]'::jsonb, true)
          WHEN programme->>'programName' ILIKE '%electrical%'
            OR UPPER(programme->>'programCode') IN ('BSEE','EE')
          THEN jsonb_set(programme, '{requirements}', '[
            {"category":"Core Engineering","requiredCredits":90},
            {"category":"Electrical Engineering","requiredCredits":132},
            {"category":"Computer Science","requiredCredits":12},
            {"category":"Mathematics","requiredCredits":36},
            {"category":"Sciences","requiredCredits":18},
            {"category":"Humanities & English","requiredCredits":12}
          ]'::jsonb, true)
          WHEN programme->>'programName' ILIKE '%computer%'
            OR UPPER(programme->>'programCode') IN ('BSCE','BSCS','CS')
          THEN jsonb_set(programme, '{requirements}', '[
            {"category":"Core Engineering","requiredCredits":102},
            {"category":"Computer Science","requiredCredits":132},
            {"category":"Mathematics","requiredCredits":36},
            {"category":"Sciences","requiredCredits":18},
            {"category":"Humanities & English","requiredCredits":12}
          ]'::jsonb, true)
          ELSE programme
        END
      ) || '{"standingMode":"default","customStandingRules":[]}'::jsonb
      ORDER BY programme->>'programCode'
    )
    FROM jsonb_array_elements(correction."programConfigurations") programme
  ),
  'Completed 300-credit requirements for all engineering disciplines and seeded standing policy',
  correction."activateYear",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_CompleteEngineeringCatalogCorrection" correction;

UPDATE "AcademicCatalogRevision" revision
SET "status" = 'superseded'::"AcademicCatalogStatus", "updatedAt" = CURRENT_TIMESTAMP
FROM "_CompleteEngineeringCatalogCorrection" correction
WHERE revision."id" = correction."id";

-- Synchronize the legacy mirror from the new immutable approved snapshot. No
-- Student or TranscriptEntry row participates in this correction.
DELETE FROM "ProgramRequirement" requirement
USING "_CompleteEngineeringCatalogCorrection" correction, "Program" programme
WHERE requirement."programId" = programme."id"
  AND requirement."catalogYear" = correction."yearLabel"
  AND (
    programme."name" ILIKE ANY (ARRAY['%computer%', '%electrical%', '%mechanical%', '%chemical%'])
    OR UPPER(programme."code") IN ('BSCE','BSCS','CS','BSEE','EE','BSME','ME','BSCHEM','BSCHE','CHE')
  );

INSERT INTO "ProgramRequirement" (
  "id", "programId", "catalogYear", "category", "requiredCredits", "position"
)
SELECT
  gen_random_uuid()::text,
  programme->>'programId',
  correction."yearLabel",
  requirement->>'category',
  (requirement->>'requiredCredits')::integer,
  requirement_position - 1
FROM "_CompleteEngineeringCatalogCorrection" correction
JOIN "AcademicCatalogRevision" revised
  ON revised."academicYearId" = correction."academicYearId"
 AND revised."reason" = 'Completed 300-credit requirements for all engineering disciplines and seeded standing policy'
CROSS JOIN LATERAL jsonb_array_elements(revised."programConfigurations") programme
CROSS JOIN LATERAL jsonb_array_elements(programme->'requirements')
  WITH ORDINALITY AS requirement(requirement, requirement_position)
WHERE (
  programme->>'programName' ILIKE ANY (ARRAY['%computer%', '%electrical%', '%mechanical%', '%chemical%'])
  OR UPPER(programme->>'programCode') IN ('BSCE','BSCS','CS','BSEE','EE','BSME','ME','BSCHEM','BSCHE','CHE')
);

DROP TABLE "_CompleteEngineeringCatalogCorrection";

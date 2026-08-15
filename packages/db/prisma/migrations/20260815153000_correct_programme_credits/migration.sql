-- The legacy SIS reference categories totalled 132 credits, but the approved
-- computer-science curriculum contains 300 credits across S1-S10. Preserve the
-- immutable system-generated baseline and publish a narrowly scoped correction
-- revision. Director-reviewed catalogs and years with later revisions are never
-- changed by this migration.
CREATE TEMP TABLE "_AcademicCatalogCreditCorrection" AS
SELECT
  revision."id" AS "sourceRevisionId",
  revision."academicYearId",
  revision."revision" AS "sourceRevision",
  revision."yearLabel",
  revision."startsOn",
  revision."endsOn",
  revision."programConfigurations",
  revision."activateYear"
FROM "AcademicCatalogRevision" revision
WHERE revision."status" = 'approved'::"AcademicCatalogStatus"
  AND revision."approvedById" IS NULL
  AND revision."reason" IN (
    'Migrated from programme requirements',
    'Bootstrap fallback — replace through Director approval'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "AcademicCatalogRevision" newer
    WHERE newer."academicYearId" = revision."academicYearId"
      AND newer."revision" > revision."revision"
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(revision."programConfigurations") programme
    WHERE (
      programme->>'programName' ILIKE '%computer%'
      OR programme->>'programCode' IN ('BSCE', 'BSCS', 'CS')
    )
      AND (
        SELECT COALESCE(SUM((requirement->>'requiredCredits')::integer), 0)
        FROM jsonb_array_elements(programme->'requirements') requirement
      ) = 132
  );

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
  "activateYear",
  "approvedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  correction."academicYearId",
  correction."sourceRevision" + 1,
  'approved'::"AcademicCatalogStatus",
  correction."yearLabel",
  correction."startsOn",
  correction."endsOn",
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', 'S' || level_no,
        'name', 'Semester ' || level_no,
        'creditCeiling', level_no * 30
      ) ORDER BY level_no
    )
    FROM generate_series(1, 10) level_no
  ),
  (
    SELECT jsonb_agg(
      CASE
        WHEN programme->>'programName' ILIKE '%computer%'
          OR programme->>'programCode' IN ('BSCE', 'BSCS', 'CS')
        THEN jsonb_set(
          programme,
          '{requirements}',
          '[
            {"category":"Core Engineering","requiredCredits":102},
            {"category":"Computer Science","requiredCredits":132},
            {"category":"Mathematics","requiredCredits":36},
            {"category":"Sciences","requiredCredits":18},
            {"category":"Humanities & English","requiredCredits":12}
          ]'::jsonb,
          true
        )
        ELSE programme
      END
      ORDER BY programme->>'programCode'
    )
    FROM jsonb_array_elements(correction."programConfigurations") programme
  ),
  'Corrected legacy requirement total to the approved 300-credit curriculum',
  correction."activateYear",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_AcademicCatalogCreditCorrection" correction;

UPDATE "AcademicCatalogRevision" revision
SET
  "status" = 'superseded'::"AcademicCatalogStatus",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_AcademicCatalogCreditCorrection" correction
WHERE revision."id" = correction."sourceRevisionId";

DELETE FROM "ProgramRequirement" requirement
USING "_AcademicCatalogCreditCorrection" correction
WHERE requirement."catalogYear" = correction."yearLabel"
  AND requirement."programId" IN (
    SELECT programme->>'programId'
    FROM jsonb_array_elements(correction."programConfigurations") programme
    WHERE programme->>'programName' ILIKE '%computer%'
      OR programme->>'programCode' IN ('BSCE', 'BSCS', 'CS')
  );

INSERT INTO "ProgramRequirement" (
  "id",
  "programId",
  "catalogYear",
  "category",
  "requiredCredits",
  "position"
)
SELECT
  gen_random_uuid()::text,
  programme->>'programId',
  correction."yearLabel",
  requirement."category",
  requirement."requiredCredits",
  requirement."position"
FROM "_AcademicCatalogCreditCorrection" correction
CROSS JOIN LATERAL jsonb_array_elements(correction."programConfigurations") programme
CROSS JOIN (
  VALUES
    ('Core Engineering', 102, 0),
    ('Computer Science', 132, 1),
    ('Mathematics', 36, 2),
    ('Sciences', 18, 3),
    ('Humanities & English', 12, 4)
) requirement("category", "requiredCredits", "position")
WHERE programme->>'programName' ILIKE '%computer%'
  OR programme->>'programCode' IN ('BSCE', 'BSCS', 'CS');

DROP TABLE "_AcademicCatalogCreditCorrection";

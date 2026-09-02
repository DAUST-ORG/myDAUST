-- A MealPlan is an annual access entitlement, not a lifetime Student flag.
-- Backfill existing rows before replacing the legacy one-row-per-Student key.
BEGIN;

ALTER TABLE "MealPlan" ADD COLUMN "academicYearLabel" TEXT;

-- The workbook cutover year has an explicit annual billing term. Use that
-- audited boundary when the AcademicYear row was created without dates.
UPDATE "AcademicYear" year
SET
  "startsOn" = COALESCE(year."startsOn", term."startDate"),
  "endsOn" = COALESCE(year."endsOn", term."endDate")
FROM "Term" term
WHERE year."label" = '2026–2027'
  AND term."name" = '2026–2027 annual workbook billing'
  AND term."academicYearId" = year."id"
  AND (year."startsOn" IS NULL OR year."endsOn" IS NULL);

-- Profiles already carry the exact annual authority.
UPDATE "MealPlan" plan
SET "academicYearLabel" = profile."academicYearLabel"
FROM "AnnualBillingProfile" profile
WHERE plan."billingProfileId" = profile."id"
  AND plan."academicYearLabel" IS NULL;

-- Preserve legacy term text, but use an exact AcademicYear label when one was
-- historically stored there.
UPDATE "MealPlan" plan
SET "academicYearLabel" = year."label"
FROM "AcademicYear" year
WHERE plan."academicYearLabel" IS NULL
  AND btrim(plan."term") = year."label";

-- Legacy values such as "Fall 2026" can be resolved only when exactly one
-- AcademicYear shares that start year. Ambiguous labels deliberately remain
-- null and stop the migration rather than granting access to the wrong year.
WITH candidate AS (
  SELECT plan."id", min(year."label") AS "academicYearLabel"
  FROM "MealPlan" plan
  JOIN "AcademicYear" year
    ON substring(plan."term" from '([12][0-9]{3})') =
       substring(year."label" from '([12][0-9]{3})')
  WHERE plan."academicYearLabel" IS NULL
  GROUP BY plan."id"
  HAVING count(*) = 1
)
UPDATE "MealPlan" plan
SET "academicYearLabel" = candidate."academicYearLabel"
FROM candidate
WHERE plan."id" = candidate."id";

-- Date-bounded history is a second exact resolver for legacy free-text terms.
WITH candidate AS (
  SELECT plan."id", min(year."label") AS "academicYearLabel"
  FROM "MealPlan" plan
  JOIN "AcademicYear" year
    ON year."startsOn" IS NOT NULL
   AND year."endsOn" IS NOT NULL
   AND plan."createdAt"::date BETWEEN year."startsOn"::date AND year."endsOn"::date
  WHERE plan."academicYearLabel" IS NULL
  GROUP BY plan."id"
  HAVING count(*) = 1
)
UPDATE "MealPlan" plan
SET "academicYearLabel" = candidate."academicYearLabel"
FROM candidate
WHERE plan."id" = candidate."id";

DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM "MealPlan"
  WHERE "academicYearLabel" IS NULL;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION
      'MealPlan annual backfill is ambiguous for % row(s); review legacy term/year evidence before deployment',
      unresolved_count;
  END IF;
END $$;

ALTER TABLE "MealPlan"
  ALTER COLUMN "academicYearLabel" SET NOT NULL;

DROP INDEX "MealPlan_studentId_key";
DROP INDEX "MealPlan_billingProfileId_key";
ALTER TABLE "MealPlan" DROP CONSTRAINT "MealPlan_billingProfileId_fkey";

CREATE UNIQUE INDEX "AnnualBillingProfile_id_studentId_academicYearLabel_key"
  ON "AnnualBillingProfile"("id", "studentId", "academicYearLabel");
CREATE UNIQUE INDEX "MealPlan_studentId_academicYearLabel_key"
  ON "MealPlan"("studentId", "academicYearLabel");
CREATE UNIQUE INDEX "MealPlan_billingProfileId_studentId_academicYearLabel_key"
  ON "MealPlan"("billingProfileId", "studentId", "academicYearLabel");
CREATE INDEX "MealPlan_academicYearLabel_active_type_idx"
  ON "MealPlan"("academicYearLabel", "active", "type");

ALTER TABLE "MealPlan"
  ADD CONSTRAINT "MealPlan_academicYearLabel_fkey"
  FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealPlan"
  ADD CONSTRAINT "MealPlan_billing_profile_student_year_fkey"
  FOREIGN KEY ("billingProfileId", "studentId", "academicYearLabel")
  REFERENCES "AnnualBillingProfile"("id", "studentId", "academicYearLabel")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

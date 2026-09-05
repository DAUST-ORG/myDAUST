-- Scholarship catalog: the awards half of a versioned fee schedule.
-- Additive only. Creates two enums and one table; no existing row is touched.

CREATE TYPE "ScholarshipBasis" AS ENUM ('tuition', 'package');
CREATE TYPE "ScholarshipRateMode" AS ENUM ('fixed', 'per_student');

CREATE TABLE "ScholarshipDefinition" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "basis" "ScholarshipBasis" NOT NULL,
    "rateMode" "ScholarshipRateMode" NOT NULL DEFAULT 'fixed',
    "pctBps" INTEGER,
    "flatXof" INTEGER,
    "costCenterCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScholarshipDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScholarshipDefinition_scheduleId_key_key"
    ON "ScholarshipDefinition"("scheduleId", "key");
CREATE INDEX "ScholarshipDefinition_costCenterCode_idx"
    ON "ScholarshipDefinition"("costCenterCode");

ALTER TABLE "ScholarshipDefinition"
    ADD CONSTRAINT "ScholarshipDefinition_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "FeeSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScholarshipDefinition"
    ADD CONSTRAINT "ScholarshipDefinition_costCenterCode_fkey"
    FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A fixed award carries exactly one rate; a per-student award carries none.
ALTER TABLE "ScholarshipDefinition" ADD CONSTRAINT "ScholarshipDefinition_rate_check"
  CHECK (
    ("rateMode" = 'fixed' AND (("pctBps" IS NULL) <> ("flatXof" IS NULL)))
    OR ("rateMode" = 'per_student' AND "pctBps" IS NULL AND "flatXof" IS NULL)
  );
ALTER TABLE "ScholarshipDefinition" ADD CONSTRAINT "ScholarshipDefinition_pct_range_check"
  CHECK ("pctBps" IS NULL OR ("pctBps" >= 1 AND "pctBps" <= 10000));
ALTER TABLE "ScholarshipDefinition" ADD CONSTRAINT "ScholarshipDefinition_flat_positive_check"
  CHECK ("flatXof" IS NULL OR "flatXof" > 0);

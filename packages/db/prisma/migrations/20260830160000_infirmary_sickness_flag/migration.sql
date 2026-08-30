-- Sick-flag flow: flag a Consultation so the student is marked absent for today's
-- sections, faculty-of-today and the admin role are notified, and (optionally)
-- the AppSetting-driven emergency paging list is also notified. Additive only:
-- new columns on Consultation and AttendanceRecord, two CHECK constraints, an
-- inverse FK on Person, and a partial index. Existing rows get sensible defaults.

-- 1. Consultation sick-flag columns.
ALTER TABLE "Consultation"
    ADD COLUMN "sickFlagged" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "sickFlaggedAt" TIMESTAMP(3),
    ADD COLUMN "sickFlaggedById" TEXT;

ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_sickFlaggedById_fkey"
    FOREIGN KEY ("sickFlaggedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Consultation_sickFlagged_idx" ON "Consultation"("sickFlagged")
    WHERE "sickFlagged" = TRUE;

-- 2. AttendanceRecord reason / source / notedById columns. Default `source = 'faculty'`
--    keeps existing rows consistent.
ALTER TABLE "AttendanceRecord"
    ADD COLUMN "reason" TEXT,
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'faculty',
    ADD COLUMN "notedById" TEXT;

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_notedById_fkey"
    FOREIGN KEY ("notedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_reason_check"
    CHECK ("reason" IS NULL OR "reason" IN ('sick', 'infirmary_emergency', 'admin_override'));

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_source_check"
    CHECK ("source" IN ('faculty', 'infirmary', 'admin'));

CREATE INDEX "AttendanceRecord_source_date_idx" ON "AttendanceRecord"("source", "date");

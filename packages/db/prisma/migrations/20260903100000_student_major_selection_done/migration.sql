-- AlterTable: add majorSelectionDone flag for the first-login program selection prompt.
ALTER TABLE "Student" ADD COLUMN "majorSelectionDone" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: students who already have an assigned program are considered done.
UPDATE "Student" SET "majorSelectionDone" = true WHERE "programId" IS NOT NULL;

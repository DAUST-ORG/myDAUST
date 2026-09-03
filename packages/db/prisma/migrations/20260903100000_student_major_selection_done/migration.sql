-- AlterTable: add majorSelectionDone flag for the first-login program selection prompt.
ALTER TABLE "Student" ADD COLUMN "majorSelectionDone" BOOLEAN NOT NULL DEFAULT false;

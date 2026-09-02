-- Extend the one-time cutover with a terminal, audited Applicant disposition.
-- Rows are retained as immutable evidence; "remove" means they leave every
-- active Admissions surface and all payer bearer capabilities are revoked.
ALTER TYPE "WorkbookCutoverDisposition" ADD VALUE 'remove_applicant';

ALTER TABLE "WorkbookCutoverBatch"
ADD COLUMN "removedApplicants" INTEGER NOT NULL DEFAULT 0;

-- Follow-up to the "how did you hear about DAUST" answer: the referring
-- person's name, or the site/page for online sources. Nullable with no
-- backfill, so existing rows (including the ~298 live students' applicant
-- history) are untouched and keep validating.
ALTER TABLE "Applicant" ADD COLUMN IF NOT EXISTS "sourceDetail" TEXT;

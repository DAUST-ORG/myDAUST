-- Self-picked housing/cafeteria plan. Nullable preference columns only: staff
-- apply the pick into the billing profile at accept, so no invoice, payment or
-- approval row is touched by this migration. Existing rows keep NULL (no pick).
ALTER TABLE "Applicant" ADD COLUMN IF NOT EXISTS "housingPreference" TEXT;
ALTER TABLE "Applicant" ADD COLUMN IF NOT EXISTS "cafeteriaPreference" TEXT;

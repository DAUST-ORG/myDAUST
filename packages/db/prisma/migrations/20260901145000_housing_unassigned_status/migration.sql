-- Releasing housing through an approved billing profile must retain the prior
-- hall/room as audit evidence without presenting the student as housed.
ALTER TYPE "HousingStatus" ADD VALUE IF NOT EXISTS 'unassigned';

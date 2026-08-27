/*
  Adds updatedAt columns to mutable infirmary tables and missing FK indexes.
  Existing rows get updated_at = NOW() since there's no prior timestamp to reuse.
*/

-- Add updatedAt as nullable first, backfill, then make NOT NULL

ALTER TABLE "Consultation" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Consultation" SET "updatedAt" = NOW();
ALTER TABLE "Consultation" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "FollowUp" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "FollowUp" SET "updatedAt" = NOW();
ALTER TABLE "FollowUp" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "InfirmaryAppointment" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "InfirmaryAppointment" SET "updatedAt" = NOW();
ALTER TABLE "InfirmaryAppointment" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "InfirmaryDocument" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "InfirmaryDocument" SET "updatedAt" = NOW();
ALTER TABLE "InfirmaryDocument" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Medication" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Medication" SET "updatedAt" = NOW();
ALTER TABLE "Medication" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Prescription" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Prescription" SET "updatedAt" = NOW();
ALTER TABLE "Prescription" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Missing FK indexes

CREATE INDEX "Consultation_clinicianId_idx" ON "Consultation"("clinicianId");
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");
CREATE INDEX "InfirmaryAppointment_status_idx" ON "InfirmaryAppointment"("status");
CREATE INDEX "InfirmaryDocument_uploaderId_idx" ON "InfirmaryDocument"("uploaderId");
CREATE INDEX "Medication_status_idx" ON "Medication"("status");
CREATE INDEX "Prescription_consultationId_idx" ON "Prescription"("consultationId");
CREATE INDEX "Prescription_authorId_idx" ON "Prescription"("authorId");

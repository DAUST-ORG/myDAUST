-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "feePaid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "addDeadline" TIMESTAMP(3),
ADD COLUMN     "dropDeadline" TIMESTAMP(3);

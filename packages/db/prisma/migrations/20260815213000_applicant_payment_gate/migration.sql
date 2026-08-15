-- Accepted applicants keep an admissions record while their first approved
-- installment is pending. Existing records intentionally remain not_started;
-- there is no automatic production backfill.
CREATE TYPE "ApplicantOnboardingStatus" AS ENUM (
  'not_started',
  'payment_pending',
  'enrolled',
  'cancelled'
);

ALTER TYPE "StudentRecordStatus" ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'active';

ALTER TABLE "Applicant"
  ADD COLUMN "onboardingStatus" "ApplicantOnboardingStatus" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "studentId" TEXT,
  ADD COLUMN "admissionAcademicYearId" TEXT,
  ADD COLUMN "enrollmentInvoiceId" TEXT,
  ADD COLUMN "requiredEnrollmentCashXof" INTEGER,
  ADD COLUMN "activeOnboardingPaymentLinkId" TEXT,
  ADD COLUMN "activatedByPaymentId" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "paymentPendingAt" TIMESTAMP(3),
  ADD COLUMN "enrolledAt" TIMESTAMP(3),
  ADD COLUMN "onboardingCancelledAt" TIMESTAMP(3),
  ADD COLUMN "statusTokenHash" TEXT,
  ADD COLUMN "statusTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "statusTokenRevokedAt" TIMESTAMP(3),
  ADD COLUMN "acceptanceEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "studentInviteSentAt" TIMESTAMP(3);

ALTER TABLE "PaymentLink"
  ADD COLUMN "onboardingApplicantId" TEXT;

CREATE TABLE "StudentNumberSequence" (
  "academicYearStart" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentNumberSequence_pkey" PRIMARY KEY ("academicYearStart")
);

CREATE UNIQUE INDEX "Applicant_studentId_key" ON "Applicant"("studentId");
CREATE UNIQUE INDEX "Applicant_enrollmentInvoiceId_key" ON "Applicant"("enrollmentInvoiceId");
CREATE UNIQUE INDEX "Applicant_activeOnboardingPaymentLinkId_key" ON "Applicant"("activeOnboardingPaymentLinkId");
CREATE UNIQUE INDEX "Applicant_activatedByPaymentId_key" ON "Applicant"("activatedByPaymentId");
CREATE UNIQUE INDEX "Applicant_statusTokenHash_key" ON "Applicant"("statusTokenHash");
CREATE INDEX "Applicant_onboardingStatus_idx" ON "Applicant"("onboardingStatus");
CREATE INDEX "Applicant_admissionAcademicYearId_idx" ON "Applicant"("admissionAcademicYearId");
CREATE INDEX "PaymentLink_onboardingApplicantId_idx" ON "PaymentLink"("onboardingApplicantId");

ALTER TABLE "Applicant"
  ADD CONSTRAINT "Applicant_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Applicant_admissionAcademicYearId_fkey"
  FOREIGN KEY ("admissionAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Applicant_enrollmentInvoiceId_fkey"
  FOREIGN KEY ("enrollmentInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Applicant_activeOnboardingPaymentLinkId_fkey"
  FOREIGN KEY ("activeOnboardingPaymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Applicant_activatedByPaymentId_fkey"
  FOREIGN KEY ("activatedByPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentLink"
  ADD CONSTRAINT "PaymentLink_onboardingApplicantId_fkey"
  FOREIGN KEY ("onboardingApplicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

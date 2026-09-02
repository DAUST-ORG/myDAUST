-- CreateEnum
CREATE TYPE "WorkbookCutoverBatchStatus" AS ENUM ('planned', 'imported', 'failed');

-- CreateEnum
CREATE TYPE "WorkbookCutoverSourceKind" AS ENUM ('workbook_row', 'production_student', 'applicant');

-- CreateEnum
CREATE TYPE "WorkbookCutoverDisposition" AS ENUM ('link_existing_student', 'create_student', 'reviewed_duplicate', 'link_workbook_row', 'keep_exception', 'archive_student', 'preserve_applicant');

-- CreateEnum
CREATE TYPE "WorkbookCutoverFinancialEventKind" AS ENUM ('invoice_void', 'payment_superseded', 'new_invoice', 'reconstruction_payment', 'account_credit');

-- CreateEnum
CREATE TYPE "BillingServiceKind" AS ENUM ('housing', 'cafeteria', 'insurance', 'housing_caution');

-- CreateEnum
CREATE TYPE "BillingServiceCalculation" AS ENUM ('fixed', 'percentage_of_service');

-- CreateEnum
CREATE TYPE "BillingProfileStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "BillingProfileSourceKind" AS ENUM ('workbook', 'admissions', 'staff');

-- CreateEnum
CREATE TYPE "BillingAdjustmentBasis" AS ENUM ('tuition', 'housing', 'cafeteria', 'insurance', 'housing_caution', 'gross_charges', 'manual');

-- CreateEnum
CREATE TYPE "BillingAdjustmentCalculation" AS ENUM ('percentage', 'fixed', 'manual');

-- CreateEnum
CREATE TYPE "BillingAdjustmentStacking" AS ENUM ('additive', 'sequential', 'exclusive');

-- CreateEnum
CREATE TYPE "BillingAdjustmentEffect" AS ENUM ('discount', 'charge');

-- CreateEnum
CREATE TYPE "BillingAdjustmentSource" AS ENUM ('scholarship', 'manual_reconciliation', 'workbook', 'admissions');

-- AlterEnum
ALTER TYPE "ApprovalRequestKind" ADD VALUE 'billing_profile';
ALTER TYPE "ApprovalRequestKind" ADD VALUE 'billing_catalog';

-- AlterTable
ALTER TABLE "HousingAssignment" ADD COLUMN     "academicYearLabel" TEXT,
ADD COLUMN     "billedServiceOptionId" TEXT,
ADD COLUMN     "billedServiceKind" "BillingServiceKind" NOT NULL DEFAULT 'housing';

-- Existing housing rows predate academic-year ownership. Attach them to the
-- cutover year when present, otherwise to the active/latest configured year.
-- Refuse to guess when live assignments exist without any AcademicYear row.
DO $$
DECLARE
  backfill_year TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM "HousingAssignment" WHERE "academicYearLabel" IS NULL
  ) THEN
    SELECT year."label"
    INTO backfill_year
    FROM "AcademicYear" year
    ORDER BY
      (year."label" = '2026–2027') DESC,
      (year."status" = 'active'::"AcademicYearStatus") DESC,
      year."startsOn" DESC NULLS LAST,
      year."label" DESC
    LIMIT 1;

    IF backfill_year IS NULL THEN
      RAISE EXCEPTION 'Cannot backfill HousingAssignment academic year: no AcademicYear exists';
    END IF;

    UPDATE "HousingAssignment"
    SET "academicYearLabel" = backfill_year
    WHERE "academicYearLabel" IS NULL;
  END IF;
END $$;

ALTER TABLE "HousingAssignment"
  ALTER COLUMN "academicYearLabel" SET NOT NULL;

DROP INDEX "HousingAssignment_studentId_key";

-- AlterTable
ALTER TABLE "InvoiceComponent" ADD COLUMN     "grossAmountXof" INTEGER;

-- Backfill every existing component before new code starts reading the gross
-- snapshot. The column deliberately remains nullable for a rolling deploy.
UPDATE "InvoiceComponent"
SET "grossAmountXof" = "amountXof"
WHERE "grossAmountXof" IS NULL;

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "billingProfileId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "recognizedOn" DATE;

-- CreateTable
CREATE TABLE "WorkbookCutoverBatch" (
    "id" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceWorkbookSha256" TEXT NOT NULL,
    "sourceExtractionSha256" TEXT NOT NULL,
    "identityManifestSha256" TEXT NOT NULL,
    "rosterSnapshotSha256" TEXT NOT NULL,
    "confirmationPlanSha256" TEXT NOT NULL,
    "status" "WorkbookCutoverBatchStatus" NOT NULL DEFAULT 'planned',
    "academicYearLabel" TEXT NOT NULL,
    "sourceAsOfDate" DATE NOT NULL,
    "workbookRowCount" INTEGER NOT NULL,
    "productionStudentCount" INTEGER NOT NULL,
    "applicantCount" INTEGER NOT NULL,
    "workbookLinkedRows" INTEGER NOT NULL DEFAULT 0,
    "workbookCreatedRows" INTEGER NOT NULL DEFAULT 0,
    "workbookDuplicateRows" INTEGER NOT NULL DEFAULT 0,
    "productionLinkedStudents" INTEGER NOT NULL DEFAULT 0,
    "productionKeptStudents" INTEGER NOT NULL DEFAULT 0,
    "productionArchivedStudents" INTEGER NOT NULL DEFAULT 0,
    "preservedApplicants" INTEGER NOT NULL DEFAULT 0,
    "sourceBilledXof" BIGINT NOT NULL,
    "sourcePaidXof" BIGINT NOT NULL,
    "includedBilledXof" BIGINT NOT NULL DEFAULT 0,
    "includedPaidXof" BIGINT NOT NULL DEFAULT 0,
    "excludedBilledXof" BIGINT NOT NULL DEFAULT 0,
    "excludedPaidXof" BIGINT NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3),
    "errorSummary" JSONB,

    CONSTRAINT "WorkbookCutoverBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkbookCutoverSourceRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceKind" "WorkbookCutoverSourceKind" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceKeySha256" TEXT NOT NULL,
    "sourceFingerprintSha256" TEXT NOT NULL,
    "sourceClaimSha256" TEXT,
    "sourceSheet" TEXT,
    "sourceRowNumber" INTEGER,
    "sourceStudentClaim" TEXT,
    "sourceBilledXof" BIGINT,
    "sourcePaidXof" BIGINT,
    "disposition" "WorkbookCutoverDisposition",
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "reviewSignatureSha256" TEXT,
    "studentId" TEXT,
    "applicantId" TEXT,
    "linkedWorkbookRecordId" TEXT,
    "duplicateOfRecordId" TEXT,
    "priorRecordId" TEXT,
    "billingProfileId" TEXT,
    "canonicalInvoiceId" TEXT,
    "reconstructionPaymentId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkbookCutoverSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkbookCutoverFinancialProvenance" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "kind" "WorkbookCutoverFinancialEventKind" NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "replacementInvoiceId" TEXT,
    "replacementPaymentId" TEXT,
    "originalStatus" TEXT,
    "originalAmountXof" BIGINT,
    "originalPaidXof" BIGINT,
    "recognizedOn" DATE,
    "snapshotJson" JSONB NOT NULL,
    "snapshotSha256" TEXT NOT NULL,
    "eventClaimSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkbookCutoverFinancialProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingServiceOption" (
    "id" TEXT NOT NULL,
    "academicYearLabel" TEXT NOT NULL,
    "kind" "BillingServiceKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "calculation" "BillingServiceCalculation" NOT NULL DEFAULT 'fixed',
    "amountXof" INTEGER,
    "percentageBasisPoints" INTEGER,
    "basisServiceKind" "BillingServiceKind",
    "costCenterCode" TEXT NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "defaultSelected" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingServiceOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAdjustmentDefinition" (
    "id" TEXT NOT NULL,
    "academicYearLabel" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "basis" "BillingAdjustmentBasis" NOT NULL,
    "calculation" "BillingAdjustmentCalculation" NOT NULL,
    "stacking" "BillingAdjustmentStacking" NOT NULL,
    "effect" "BillingAdjustmentEffect" NOT NULL DEFAULT 'discount',
    "percentageBasisPoints" INTEGER,
    "fixedAmountXof" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAdjustmentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualBillingProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearLabel" TEXT NOT NULL,
    "status" "BillingProfileStatus" NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "sourceKind" "BillingProfileSourceKind" NOT NULL,
    "sourceWorkbookSha256" TEXT,
    "sourceSheet" TEXT,
    "sourceRowNumber" INTEGER,
    "sourceRowFingerprintSha256" TEXT,
    "sourceAsOfDate" DATE,
    "feeScheduleId" TEXT,
    "canonicalInvoiceId" TEXT,
    "grossChargesXof" INTEGER NOT NULL DEFAULT 0,
    "netBilledXof" INTEGER NOT NULL DEFAULT 0,
    "mismatchWarnings" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfileSelection" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "academicYearLabel" TEXT NOT NULL,
    "kind" "BillingServiceKind" NOT NULL,
    "serviceOptionId" TEXT NOT NULL,
    "optionCode" TEXT NOT NULL,
    "percentageBasisOptionId" TEXT,
    "percentageBasisOptionCode" TEXT,
    "percentageBasisServiceKind" "BillingServiceKind",
    "label" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfileSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfileAward" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "definitionId" TEXT,
    "definitionKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" "BillingAdjustmentSource" NOT NULL,
    "basis" "BillingAdjustmentBasis" NOT NULL,
    "calculation" "BillingAdjustmentCalculation" NOT NULL,
    "stacking" "BillingAdjustmentStacking" NOT NULL,
    "effect" "BillingAdjustmentEffect" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "basisAmountXof" INTEGER,
    "percentageBasisPoints" INTEGER,
    "amountXof" INTEGER NOT NULL,
    "reason" TEXT,
    "approvalRequestId" TEXT,
    "invoiceAdjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingProfileAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAdjustment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceComponentId" TEXT,
    "billingProfileId" TEXT,
    "definitionId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" "BillingAdjustmentSource" NOT NULL,
    "basis" "BillingAdjustmentBasis" NOT NULL,
    "calculation" "BillingAdjustmentCalculation" NOT NULL,
    "stacking" "BillingAdjustmentStacking" NOT NULL,
    "effect" "BillingAdjustmentEffect" NOT NULL,
    "basisAmountXof" INTEGER,
    "percentageBasisPoints" INTEGER,
    "amountXof" INTEGER NOT NULL,
    "reason" TEXT,
    "sourceReference" TEXT,
    "approvalRequestId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverBatch_identityManifestSha256_key" ON "WorkbookCutoverBatch"("identityManifestSha256");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverBatch_confirmationPlanSha256_key" ON "WorkbookCutoverBatch"("confirmationPlanSha256");

-- CreateIndex
CREATE INDEX "WorkbookCutoverBatch_sourceWorkbookSha256_createdAt_idx" ON "WorkbookCutoverBatch"("sourceWorkbookSha256", "createdAt");

-- CreateIndex
CREATE INDEX "WorkbookCutoverBatch_rosterSnapshotSha256_idx" ON "WorkbookCutoverBatch"("rosterSnapshotSha256");

-- CreateIndex
CREATE INDEX "WorkbookCutoverBatch_academicYearLabel_status_idx" ON "WorkbookCutoverBatch"("academicYearLabel", "status");

-- CreateIndex
CREATE INDEX "WorkbookCutoverBatch_createdById_createdAt_idx" ON "WorkbookCutoverBatch"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverSourceRecord_sourceClaimSha256_key" ON "WorkbookCutoverSourceRecord"("sourceClaimSha256");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverSourceRecord_billingProfileId_key" ON "WorkbookCutoverSourceRecord"("billingProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverSourceRecord_canonicalInvoiceId_key" ON "WorkbookCutoverSourceRecord"("canonicalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverSourceRecord_reconstructionPaymentId_key" ON "WorkbookCutoverSourceRecord"("reconstructionPaymentId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverSourceRecord_batchId_sourceKind_disposition_idx" ON "WorkbookCutoverSourceRecord"("batchId", "sourceKind", "disposition");

-- CreateIndex
CREATE INDEX "WorkbookCutoverSourceRecord_studentId_idx" ON "WorkbookCutoverSourceRecord"("studentId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverSourceRecord_applicantId_idx" ON "WorkbookCutoverSourceRecord"("applicantId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverSourceRecord_linkedWorkbookRecordId_idx" ON "WorkbookCutoverSourceRecord"("linkedWorkbookRecordId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverSourceRecord_duplicateOfRecordId_idx" ON "WorkbookCutoverSourceRecord"("duplicateOfRecordId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverSourceRecord_priorRecordId_idx" ON "WorkbookCutoverSourceRecord"("priorRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverSourceRecord_batchId_sourceKind_sourceKey_key" ON "WorkbookCutoverSourceRecord"("batchId", "sourceKind", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverSourceRecord_batchId_sourceKind_sourceFinger_key" ON "WorkbookCutoverSourceRecord"("batchId", "sourceKind", "sourceFingerprintSha256");

-- CreateIndex
CREATE UNIQUE INDEX "WorkbookCutoverFinancialProvenance_eventClaimSha256_key" ON "WorkbookCutoverFinancialProvenance"("eventClaimSha256");

-- CreateIndex
CREATE INDEX "WorkbookCutoverFinancialProvenance_batchId_kind_idx" ON "WorkbookCutoverFinancialProvenance"("batchId", "kind");

-- CreateIndex
CREATE INDEX "WorkbookCutoverFinancialProvenance_sourceRecordId_kind_idx" ON "WorkbookCutoverFinancialProvenance"("sourceRecordId", "kind");

-- CreateIndex
CREATE INDEX "WorkbookCutoverFinancialProvenance_invoiceId_idx" ON "WorkbookCutoverFinancialProvenance"("invoiceId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverFinancialProvenance_paymentId_idx" ON "WorkbookCutoverFinancialProvenance"("paymentId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverFinancialProvenance_replacementInvoiceId_idx" ON "WorkbookCutoverFinancialProvenance"("replacementInvoiceId");

-- CreateIndex
CREATE INDEX "WorkbookCutoverFinancialProvenance_replacementPaymentId_idx" ON "WorkbookCutoverFinancialProvenance"("replacementPaymentId");

-- CreateIndex
CREATE INDEX "BillingServiceOption_academicYearLabel_kind_active_sortOrde_idx" ON "BillingServiceOption"("academicYearLabel", "kind", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "BillingServiceOption_costCenterCode_idx" ON "BillingServiceOption"("costCenterCode");

-- CreateIndex
CREATE UNIQUE INDEX "BillingServiceOption_academicYearLabel_kind_code_key" ON "BillingServiceOption"("academicYearLabel", "kind", "code");

-- CreateIndex
CREATE INDEX "BillingAdjustmentDefinition_academicYearLabel_active_sortOr_idx" ON "BillingAdjustmentDefinition"("academicYearLabel", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAdjustmentDefinition_academicYearLabel_key_key" ON "BillingAdjustmentDefinition"("academicYearLabel", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualBillingProfile_invoice_student_year_key" ON "AnnualBillingProfile"("canonicalInvoiceId", "studentId", "academicYearLabel");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_studentId_academicYearLabel_key" ON "Invoice"("id", "studentId", "academicYearLabel");

-- CreateIndex
CREATE UNIQUE INDEX "FeeSchedule_id_academicYearLabel_key" ON "FeeSchedule"("id", "academicYearLabel");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualBillingProfile_id_academicYearLabel_key" ON "AnnualBillingProfile"("id", "academicYearLabel");

-- CreateIndex
CREATE UNIQUE INDEX "BillingServiceOption_id_academicYearLabel_kind_key" ON "BillingServiceOption"("id", "academicYearLabel", "kind");

-- CreateIndex
CREATE INDEX "AnnualBillingProfile_academicYearLabel_status_idx" ON "AnnualBillingProfile"("academicYearLabel", "status");

-- CreateIndex
CREATE INDEX "AnnualBillingProfile_feeScheduleId_idx" ON "AnnualBillingProfile"("feeScheduleId");

-- CreateIndex
CREATE INDEX "AnnualBillingProfile_createdById_idx" ON "AnnualBillingProfile"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualBillingProfile_studentId_academicYearLabel_key" ON "AnnualBillingProfile"("studentId", "academicYearLabel");

-- CreateIndex
CREATE INDEX "BillingProfileSelection_serviceOptionId_idx" ON "BillingProfileSelection"("serviceOptionId");

-- CreateIndex
CREATE INDEX "BillingProfileSelection_percentageBasisOptionId_idx" ON "BillingProfileSelection"("percentageBasisOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfileSelection_profileId_kind_key" ON "BillingProfileSelection"("profileId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfileAward_invoiceAdjustmentId_key" ON "BillingProfileAward"("invoiceAdjustmentId");

-- CreateIndex
CREATE INDEX "BillingProfileAward_profileId_createdAt_idx" ON "BillingProfileAward"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingProfileAward_definitionId_idx" ON "BillingProfileAward"("definitionId");

-- CreateIndex
CREATE INDEX "BillingProfileAward_approvalRequestId_idx" ON "BillingProfileAward"("approvalRequestId");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_invoiceId_createdAt_idx" ON "InvoiceAdjustment"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_invoiceComponentId_idx" ON "InvoiceAdjustment"("invoiceComponentId");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_billingProfileId_idx" ON "InvoiceAdjustment"("billingProfileId");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_definitionId_idx" ON "InvoiceAdjustment"("definitionId");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_approvalRequestId_idx" ON "InvoiceAdjustment"("approvalRequestId");

-- CreateIndex
CREATE INDEX "InvoiceAdjustment_createdById_idx" ON "InvoiceAdjustment"("createdById");

-- CreateIndex
CREATE INDEX "Payment_recognizedOn_idx" ON "Payment"("recognizedOn");

-- CreateIndex
CREATE INDEX "HousingAssignment_academicYearLabel_idx" ON "HousingAssignment"("academicYearLabel");

-- CreateIndex
CREATE INDEX "HousingAssignment_billedServiceOptionId_idx" ON "HousingAssignment"("billedServiceOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "HousingAssignment_studentId_academicYearLabel_key" ON "HousingAssignment"("studentId", "academicYearLabel");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_billingProfileId_key" ON "MealPlan"("billingProfileId");

-- AddForeignKey
ALTER TABLE "WorkbookCutoverBatch" ADD CONSTRAINT "WorkbookCutoverBatch_academicYearLabel_fkey" FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverBatch" ADD CONSTRAINT "WorkbookCutoverBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WorkbookCutoverBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_linkedWorkbookRecordId_fkey" FOREIGN KEY ("linkedWorkbookRecordId") REFERENCES "WorkbookCutoverSourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_duplicateOfRecordId_fkey" FOREIGN KEY ("duplicateOfRecordId") REFERENCES "WorkbookCutoverSourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_priorRecordId_fkey" FOREIGN KEY ("priorRecordId") REFERENCES "WorkbookCutoverSourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "AnnualBillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_canonicalInvoiceId_fkey" FOREIGN KEY ("canonicalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverSourceRecord" ADD CONSTRAINT "WorkbookCutoverSourceRecord_reconstructionPaymentId_fkey" FOREIGN KEY ("reconstructionPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverFinancialProvenance" ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WorkbookCutoverBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverFinancialProvenance" ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "WorkbookCutoverSourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverFinancialProvenance" ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverFinancialProvenance" ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverFinancialProvenance" ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_replacementInvoiceId_fkey" FOREIGN KEY ("replacementInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkbookCutoverFinancialProvenance" ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_replacementPaymentId_fkey" FOREIGN KEY ("replacementPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "AnnualBillingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousingAssignment" ADD CONSTRAINT "HousingAssignment_academicYearLabel_fkey" FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousingAssignment" ADD CONSTRAINT "HousingAssignment_billed_option_year_kind_fkey" FOREIGN KEY ("billedServiceOptionId", "academicYearLabel", "billedServiceKind") REFERENCES "BillingServiceOption"("id", "academicYearLabel", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingServiceOption" ADD CONSTRAINT "BillingServiceOption_academicYearLabel_fkey" FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingServiceOption" ADD CONSTRAINT "BillingServiceOption_costCenterCode_fkey" FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustmentDefinition" ADD CONSTRAINT "BillingAdjustmentDefinition_academicYearLabel_fkey" FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualBillingProfile" ADD CONSTRAINT "AnnualBillingProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualBillingProfile" ADD CONSTRAINT "AnnualBillingProfile_academicYearLabel_fkey" FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualBillingProfile" ADD CONSTRAINT "AnnualBillingProfile_fee_schedule_year_fkey" FOREIGN KEY ("feeScheduleId", "academicYearLabel") REFERENCES "FeeSchedule"("id", "academicYearLabel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualBillingProfile" ADD CONSTRAINT "AnnualBillingProfile_invoice_student_year_fkey" FOREIGN KEY ("canonicalInvoiceId", "studentId", "academicYearLabel") REFERENCES "Invoice"("id", "studentId", "academicYearLabel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualBillingProfile" ADD CONSTRAINT "AnnualBillingProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileSelection" ADD CONSTRAINT "BillingProfileSelection_profile_year_fkey" FOREIGN KEY ("profileId", "academicYearLabel") REFERENCES "AnnualBillingProfile"("id", "academicYearLabel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileSelection" ADD CONSTRAINT "BillingProfileSelection_option_year_kind_fkey" FOREIGN KEY ("serviceOptionId", "academicYearLabel", "kind") REFERENCES "BillingServiceOption"("id", "academicYearLabel", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileSelection" ADD CONSTRAINT "BillingProfileSelection_basis_option_year_kind_fkey" FOREIGN KEY ("percentageBasisOptionId", "academicYearLabel", "percentageBasisServiceKind") REFERENCES "BillingServiceOption"("id", "academicYearLabel", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileAward" ADD CONSTRAINT "BillingProfileAward_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AnnualBillingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileAward" ADD CONSTRAINT "BillingProfileAward_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "BillingAdjustmentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileAward" ADD CONSTRAINT "BillingProfileAward_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfileAward" ADD CONSTRAINT "BillingProfileAward_invoiceAdjustmentId_fkey" FOREIGN KEY ("invoiceAdjustmentId") REFERENCES "InvoiceAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_invoiceComponentId_fkey" FOREIGN KEY ("invoiceComponentId") REFERENCES "InvoiceComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_billingProfileId_fkey" FOREIGN KEY ("billingProfileId") REFERENCES "AnnualBillingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "BillingAdjustmentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAdjustment" ADD CONSTRAINT "InvoiceAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

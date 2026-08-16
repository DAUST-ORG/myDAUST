-- Accounting-only rail for reviewed historical cash when the source workbook
-- no longer contains the original payment method.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'legacy_unknown';

ALTER TABLE "Payment"
  ADD COLUMN "externalReferenceFingerprintSha256" TEXT;

CREATE UNIQUE INDEX "Payment_externalReferenceFingerprintSha256_key"
  ON "Payment"("externalReferenceFingerprintSha256");

-- Student IDs are identities, not presentation text. Fail closed if production
-- already contains a casing collision; do not rewrite any existing identifier.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Student"
    GROUP BY lower("studentNo")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'case-insensitive Student.studentNo collision; reconcile before migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "Student_studentNo_lower_key"
  ON "Student" (lower("studentNo"));

-- Legacy cohort workbooks contain unpaid/duplicate physical rows and can carry
-- an explicitly reviewed source-control adjustment. Preserve the stricter
-- historical-import invariants while making those dispositions truthful.
ALTER TABLE "PaymentImportBatch"
  ADD COLUMN "reviewedAdjustmentXof" BIGINT NOT NULL DEFAULT 0,
  DROP CONSTRAINT "PaymentImportBatch_counters_check",
  DROP CONSTRAINT "PaymentImportBatch_amounts_check",
  DROP CONSTRAINT "PaymentImportBatch_imported_reconciliation_check",
  ADD CONSTRAINT "PaymentImportBatch_counters_check" CHECK (
    "sourceGroupCount" >= 0
    AND "totalRows" >= 0
    AND "importedRows" >= 0
    AND "alreadyRecordedRows" >= 0
    AND "excludedSourceGroups" >= 0
    AND "skippedRows" >= "alreadyRecordedRows"
    AND "errorRows" >= 0
    AND "importedRows" + "skippedRows" + "errorRows" <= "totalRows"
    AND "excludedSourceGroups" <= "sourceGroupCount"
  ),
  ADD CONSTRAINT "PaymentImportBatch_amounts_check" CHECK (
    "sourceTotalXof" >= 0
    AND "importedXof" >= 0
    AND "alreadyRecordedXof" >= 0
    AND "excludedXof" >= 0
    AND "sourceTotalXof" + "reviewedAdjustmentXof" >= 0
    AND "importedXof" + "alreadyRecordedXof" + "excludedXof"
      <= "sourceTotalXof" + "reviewedAdjustmentXof"
  ),
  ADD CONSTRAINT "PaymentImportBatch_imported_reconciliation_check" CHECK (
    "status" <> 'imported'
    OR (
      "importedAt" IS NOT NULL
      AND "errorRows" = 0
      AND "importedRows" + "skippedRows" = "totalRows"
      AND "importedXof" + "alreadyRecordedXof" + "excludedXof"
        = "sourceTotalXof" + "reviewedAdjustmentXof"
    )
  );

CREATE TABLE "LegacyCohortImportBatch" (
  "id" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceExtractionSha256" TEXT NOT NULL,
  "manifestSha256" TEXT NOT NULL,
  "confirmationPlanSha256" TEXT NOT NULL,
  "status" "PaymentImportBatchStatus" NOT NULL DEFAULT 'pending',
  "academicYearId" TEXT NOT NULL,
  "sourceRowCount" INTEGER NOT NULL,
  "personCount" INTEGER NOT NULL,
  "paymentCount" INTEGER NOT NULL,
  "sourcePaidTotalXof" BIGINT NOT NULL DEFAULT 0,
  "importedPaymentXof" BIGINT NOT NULL DEFAULT 0,
  "notificationPolicy" TEXT NOT NULL,
  "paymentImportBatchId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "importedAt" TIMESTAMP(3),
  CONSTRAINT "LegacyCohortImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyCohortImportPerson" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "personKey" TEXT NOT NULL,
  "groupDigestSha256" TEXT NOT NULL,
  "legacyStudentNo" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "onboardingStatusAtImport" "ApplicantOnboardingStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyCohortImportPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyCohortImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "personRecordId" TEXT NOT NULL,
  "sourceSheet" TEXT NOT NULL,
  "sourceRowNumber" INTEGER NOT NULL,
  "rowFingerprintSha256" TEXT NOT NULL,
  "sourceLegacyStudentNo" TEXT,
  "sourceLabel" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "paymentId" TEXT,
  "duplicateOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyCohortImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyCohortImportBatch_sourceSha256_key"
  ON "LegacyCohortImportBatch"("sourceSha256");
CREATE UNIQUE INDEX "LegacyCohortImportBatch_manifestSha256_key"
  ON "LegacyCohortImportBatch"("manifestSha256");
CREATE UNIQUE INDEX "LegacyCohortImportBatch_paymentImportBatchId_key"
  ON "LegacyCohortImportBatch"("paymentImportBatchId");
CREATE INDEX "LegacyCohortImportBatch_academicYearId_status_idx"
  ON "LegacyCohortImportBatch"("academicYearId", "status");
CREATE INDEX "LegacyCohortImportBatch_createdById_createdAt_idx"
  ON "LegacyCohortImportBatch"("createdById", "createdAt");

CREATE UNIQUE INDEX "LegacyCohortImportPerson_applicantId_key"
  ON "LegacyCohortImportPerson"("applicantId");
CREATE UNIQUE INDEX "LegacyCohortImportPerson_studentId_key"
  ON "LegacyCohortImportPerson"("studentId");
CREATE UNIQUE INDEX "LegacyCohortImportPerson_invoiceId_key"
  ON "LegacyCohortImportPerson"("invoiceId");
CREATE UNIQUE INDEX "LegacyCohortImportPerson_batchId_personKey_key"
  ON "LegacyCohortImportPerson"("batchId", "personKey");
CREATE UNIQUE INDEX "LegacyCohortImportPerson_batchId_legacyStudentNo_key"
  ON "LegacyCohortImportPerson"("batchId", "legacyStudentNo");
CREATE INDEX "LegacyCohortImportPerson_legacyStudentNo_idx"
  ON "LegacyCohortImportPerson"("legacyStudentNo");

CREATE UNIQUE INDEX "LegacyCohortImportRow_batchId_sourceSheet_sourceRowNumber_key"
  ON "LegacyCohortImportRow"("batchId", "sourceSheet", "sourceRowNumber");
CREATE UNIQUE INDEX "LegacyCohortImportRow_batchId_rowFingerprintSha256_key"
  ON "LegacyCohortImportRow"("batchId", "rowFingerprintSha256");
CREATE INDEX "LegacyCohortImportRow_personRecordId_idx"
  ON "LegacyCohortImportRow"("personRecordId");
CREATE INDEX "LegacyCohortImportRow_paymentId_idx"
  ON "LegacyCohortImportRow"("paymentId");
CREATE INDEX "LegacyCohortImportRow_sourceLegacyStudentNo_idx"
  ON "LegacyCohortImportRow"("sourceLegacyStudentNo");

ALTER TABLE "LegacyCohortImportBatch"
  ADD CONSTRAINT "LegacyCohortImportBatch_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportBatch_paymentImportBatchId_fkey"
  FOREIGN KEY ("paymentImportBatchId") REFERENCES "PaymentImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegacyCohortImportPerson"
  ADD CONSTRAINT "LegacyCohortImportPerson_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "LegacyCohortImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportPerson_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportPerson_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportPerson_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegacyCohortImportRow"
  ADD CONSTRAINT "LegacyCohortImportRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "LegacyCohortImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportRow_personRecordId_fkey"
  FOREIGN KEY ("personRecordId") REFERENCES "LegacyCohortImportPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportRow_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LegacyCohortImportRow_duplicateOfId_fkey"
  FOREIGN KEY ("duplicateOfId") REFERENCES "LegacyCohortImportRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

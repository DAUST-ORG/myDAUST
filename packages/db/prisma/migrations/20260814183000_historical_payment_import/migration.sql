-- Additive, audited provenance for reviewed historical-payment workbooks.
-- Checkout endpoints continue to restrict payer-selectable methods; `cheque`
-- exists so imported accounting history is not mislabeled as a wire/card.
ALTER TYPE "PaymentMethod" ADD VALUE 'cheque';

CREATE TYPE "PaymentImportBatchStatus" AS ENUM ('pending', 'imported', 'failed');

CREATE TABLE "PaymentImportBatch" (
  "id" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceExtractionSha256" TEXT NOT NULL,
  "manifestSha256" TEXT NOT NULL,
  "status" "PaymentImportBatchStatus" NOT NULL DEFAULT 'pending',
  "academicYear" TEXT NOT NULL,
  "sourceGroupCount" INTEGER NOT NULL DEFAULT 0,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "alreadyRecordedRows" INTEGER NOT NULL DEFAULT 0,
  "excludedSourceGroups" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "sourceTotalXof" BIGINT NOT NULL DEFAULT 0,
  "importedXof" BIGINT NOT NULL DEFAULT 0,
  "alreadyRecordedXof" BIGINT NOT NULL DEFAULT 0,
  "excludedXof" BIGINT NOT NULL DEFAULT 0,
  "errorSummary" JSONB,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "importedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentImportBatch_sha256_check" CHECK (
    "sourceSha256" ~ '^[0-9a-f]{64}$'
    AND "sourceExtractionSha256" ~ '^[0-9a-f]{64}$'
    AND "manifestSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "PaymentImportBatch_labels_check" CHECK (
    length(btrim("sourceFileName")) > 0
    AND length(btrim("academicYear")) > 0
  ),
  CONSTRAINT "PaymentImportBatch_counters_check" CHECK (
    "sourceGroupCount" >= 0
    AND "totalRows" >= 0
    AND "importedRows" >= 0
    AND "alreadyRecordedRows" >= 0
    AND "excludedSourceGroups" >= 0
    AND "skippedRows" = "alreadyRecordedRows"
    AND "errorRows" >= 0
    AND "importedRows" + "alreadyRecordedRows" + "errorRows" <= "totalRows"
    AND "excludedSourceGroups" <= "sourceGroupCount"
  ),
  CONSTRAINT "PaymentImportBatch_amounts_check" CHECK (
    "sourceTotalXof" >= 0
    AND "importedXof" >= 0
    AND "alreadyRecordedXof" >= 0
    AND "excludedXof" >= 0
    AND "importedXof" + "alreadyRecordedXof" + "excludedXof" <= "sourceTotalXof"
  ),
  CONSTRAINT "PaymentImportBatch_imported_reconciliation_check" CHECK (
    "status" <> 'imported'
    OR (
      "importedAt" IS NOT NULL
      AND "errorRows" = 0
      AND "importedRows" + "alreadyRecordedRows" = "totalRows"
      AND "importedXof" + "alreadyRecordedXof" + "excludedXof" = "sourceTotalXof"
    )
  )
);

ALTER TABLE "Payment"
  ADD COLUMN "importBatchId" TEXT,
  ADD COLUMN "importRowKey" TEXT,
  ADD COLUMN "importSheetName" TEXT,
  ADD COLUMN "importRowNumber" INTEGER;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_import_provenance_check" CHECK (
    (
      "importBatchId" IS NULL
      AND "importRowKey" IS NULL
      AND "importSheetName" IS NULL
      AND "importRowNumber" IS NULL
    )
    OR (
      "importBatchId" IS NOT NULL
      AND "importRowKey" IS NOT NULL
      AND "importSheetName" IS NOT NULL
      AND "importRowNumber" IS NOT NULL
      AND length(btrim("importRowKey")) > 0
      AND length(btrim("importSheetName")) > 0
      AND "importRowNumber" > 0
    )
  );

CREATE UNIQUE INDEX "PaymentImportBatch_sourceSha256_key"
  ON "PaymentImportBatch"("sourceSha256");
CREATE INDEX "PaymentImportBatch_status_createdAt_idx"
  ON "PaymentImportBatch"("status", "createdAt");
CREATE INDEX "PaymentImportBatch_createdById_createdAt_idx"
  ON "PaymentImportBatch"("createdById", "createdAt");
CREATE INDEX "Payment_importBatchId_idx" ON "Payment"("importBatchId");
CREATE UNIQUE INDEX "Payment_importBatchId_importRowKey_key"
  ON "Payment"("importBatchId", "importRowKey");

ALTER TABLE "PaymentImportBatch"
  ADD CONSTRAINT "PaymentImportBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "PaymentImportBatch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive provenance rail for authoritative paid-to-date workbook
-- reconciliation. It is intentionally separate from PaymentImportBatch so a
-- later reviewed manifest can resolve rows held by an earlier pass.
CREATE TYPE "PaymentBalanceImportDisposition" AS ENUM (
  'post_delta',
  'already_reconciled',
  'previously_imported',
  'held'
);

CREATE TABLE "PaymentBalanceImportBatch" (
  "id" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "sourceExtractionSha256" TEXT NOT NULL,
  "manifestSha256" TEXT NOT NULL,
  "confirmationPlanSha256" TEXT NOT NULL,
  "status" "PaymentImportBatchStatus" NOT NULL DEFAULT 'pending',
  "academicYearLabel" TEXT NOT NULL,
  "sourceAsOfDate" DATE NOT NULL,
  "sourceSheet" TEXT NOT NULL,
  "sourceRowCount" INTEGER NOT NULL,
  "sourcePaidTotalXof" BIGINT NOT NULL,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "alreadyReconciledRows" INTEGER NOT NULL DEFAULT 0,
  "previouslyImportedRows" INTEGER NOT NULL DEFAULT 0,
  "heldRows" INTEGER NOT NULL DEFAULT 0,
  "resolvedSourcePaidXof" BIGINT NOT NULL DEFAULT 0,
  "heldSourcePaidXof" BIGINT NOT NULL DEFAULT 0,
  "baselineLedgerPaidXof" BIGINT NOT NULL DEFAULT 0,
  "importedDeltaXof" BIGINT NOT NULL DEFAULT 0,
  "errorSummary" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "importedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentBalanceImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentBalanceImportBatch_sha256_check" CHECK (
    "sourceSha256" ~ '^[0-9a-f]{64}$'
    AND "sourceExtractionSha256" ~ '^[0-9a-f]{64}$'
    AND "manifestSha256" ~ '^[0-9a-f]{64}$'
    AND "confirmationPlanSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "PaymentBalanceImportBatch_labels_check" CHECK (
    length(btrim("sourceFileName")) > 0
    AND length(btrim("academicYearLabel")) > 0
    AND length(btrim("sourceSheet")) > 0
  ),
  CONSTRAINT "PaymentBalanceImportBatch_counters_check" CHECK (
    "sourceRowCount" > 0
    AND "importedRows" >= 0
    AND "alreadyReconciledRows" >= 0
    AND "previouslyImportedRows" >= 0
    AND "heldRows" >= 0
    AND "importedRows" + "alreadyReconciledRows" + "previouslyImportedRows" + "heldRows"
      <= "sourceRowCount"
  ),
  CONSTRAINT "PaymentBalanceImportBatch_amounts_check" CHECK (
    "sourcePaidTotalXof" >= 0
    AND "resolvedSourcePaidXof" >= 0
    AND "heldSourcePaidXof" >= 0
    AND "baselineLedgerPaidXof" >= 0
    AND "importedDeltaXof" >= 0
    AND "resolvedSourcePaidXof" + "heldSourcePaidXof" <= "sourcePaidTotalXof"
    AND "baselineLedgerPaidXof" + "importedDeltaXof" <= "resolvedSourcePaidXof"
  ),
  CONSTRAINT "PaymentBalanceImportBatch_imported_reconciliation_check" CHECK (
    "status" <> 'imported'
    OR (
      "importedAt" IS NOT NULL
      AND "importedRows" + "alreadyReconciledRows" + "previouslyImportedRows" + "heldRows"
        = "sourceRowCount"
      AND "resolvedSourcePaidXof" + "heldSourcePaidXof" = "sourcePaidTotalXof"
      AND "baselineLedgerPaidXof" + "importedDeltaXof" = "resolvedSourcePaidXof"
    )
  )
);

CREATE TABLE "PaymentBalanceImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceSheet" TEXT NOT NULL,
  "sourceRowNumber" INTEGER NOT NULL,
  "sourceRowKey" TEXT NOT NULL,
  "sourceRowKeySha256" TEXT NOT NULL,
  "rowFingerprintSha256" TEXT NOT NULL,
  "sourcePaidToDateXof" BIGINT NOT NULL,
  "disposition" "PaymentBalanceImportDisposition" NOT NULL,
  "identityDecision" TEXT NOT NULL,
  "matchMethod" TEXT,
  "holdCode" TEXT,
  "holdReason" TEXT,
  "studentId" TEXT,
  "invoiceId" TEXT,
  "invoiceRevision" INTEGER,
  "baselineLedgerPaidXof" BIGINT,
  "deltaXof" BIGINT,
  "paymentId" TEXT,
  "sourceClaimSha256" TEXT,
  "priorImportedRowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentBalanceImportRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentBalanceImportRow_sha256_check" CHECK (
    "sourceRowKeySha256" ~ '^[0-9a-f]{64}$'
    AND "rowFingerprintSha256" ~ '^[0-9a-f]{64}$'
    AND (
      "sourceClaimSha256" IS NULL
      OR "sourceClaimSha256" ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT "PaymentBalanceImportRow_source_check" CHECK (
    "sourceRowNumber" > 0
    AND length(btrim("sourceSheet")) > 0
    AND length(btrim("sourceRowKey")) > 0
    AND "sourcePaidToDateXof" >= 0
    AND length(btrim("identityDecision")) > 0
  ),
  CONSTRAINT "PaymentBalanceImportRow_values_check" CHECK (
    ("invoiceRevision" IS NULL OR "invoiceRevision" >= 0)
    AND ("baselineLedgerPaidXof" IS NULL OR "baselineLedgerPaidXof" >= 0)
    AND ("deltaXof" IS NULL OR "deltaXof" >= 0)
  ),
  CONSTRAINT "PaymentBalanceImportRow_disposition_check" CHECK (
    (
      "disposition" = 'post_delta'
      AND "studentId" IS NOT NULL
      AND "invoiceId" IS NOT NULL
      AND "invoiceRevision" IS NOT NULL
      AND "baselineLedgerPaidXof" IS NOT NULL
      AND "deltaXof" IS NOT NULL
      AND "deltaXof" > 0
      AND "baselineLedgerPaidXof" + "deltaXof" = "sourcePaidToDateXof"
      AND "paymentId" IS NOT NULL
      AND "sourceClaimSha256" = "sourceRowKeySha256"
      AND "priorImportedRowId" IS NULL
      AND "holdCode" IS NULL
      AND "holdReason" IS NULL
    )
    OR (
      "disposition" = 'already_reconciled'
      AND "studentId" IS NOT NULL
      AND "invoiceId" IS NOT NULL
      AND "invoiceRevision" IS NOT NULL
      AND "baselineLedgerPaidXof" IS NOT NULL
      AND "baselineLedgerPaidXof" = "sourcePaidToDateXof"
      AND "deltaXof" IS NOT NULL
      AND "deltaXof" = 0
      AND "paymentId" IS NULL
      AND "sourceClaimSha256" = "sourceRowKeySha256"
      AND "priorImportedRowId" IS NULL
      AND "holdCode" IS NULL
      AND "holdReason" IS NULL
    )
    OR (
      "disposition" = 'previously_imported'
      AND "studentId" IS NOT NULL
      AND "invoiceId" IS NOT NULL
      AND "invoiceRevision" IS NOT NULL
      AND "baselineLedgerPaidXof" IS NOT NULL
      AND "baselineLedgerPaidXof" = "sourcePaidToDateXof"
      AND "deltaXof" IS NOT NULL
      AND "deltaXof" = 0
      AND "paymentId" IS NULL
      AND "sourceClaimSha256" IS NULL
      AND "priorImportedRowId" IS NOT NULL
      AND "holdCode" IS NULL
      AND "holdReason" IS NULL
    )
    OR (
      "disposition" = 'held'
      AND "holdCode" IS NOT NULL
      AND length(btrim("holdCode")) > 0
      AND "holdReason" IS NOT NULL
      AND length(btrim("holdReason")) > 0
      AND "deltaXof" IS NULL
      AND "paymentId" IS NULL
      AND "sourceClaimSha256" IS NULL
      AND "priorImportedRowId" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "PaymentBalanceImportBatch_manifestSha256_key"
  ON "PaymentBalanceImportBatch"("manifestSha256");
CREATE INDEX "PaymentBalanceImportBatch_sourceSha256_createdAt_idx"
  ON "PaymentBalanceImportBatch"("sourceSha256", "createdAt");
CREATE INDEX "PaymentBalanceImportBatch_sourceAsOfDate_idx"
  ON "PaymentBalanceImportBatch"("sourceAsOfDate");
CREATE INDEX "PaymentBalanceImportBatch_status_createdAt_idx"
  ON "PaymentBalanceImportBatch"("status", "createdAt");
CREATE INDEX "PaymentBalanceImportBatch_createdById_createdAt_idx"
  ON "PaymentBalanceImportBatch"("createdById", "createdAt");

CREATE UNIQUE INDEX "PaymentBalanceImportRow_batchId_sourceSheet_sourceRowNumber_key"
  ON "PaymentBalanceImportRow"("batchId", "sourceSheet", "sourceRowNumber");
CREATE UNIQUE INDEX "PaymentBalanceImportRow_batchId_sourceRowKey_key"
  ON "PaymentBalanceImportRow"("batchId", "sourceRowKey");
CREATE UNIQUE INDEX "PaymentBalanceImportRow_paymentId_key"
  ON "PaymentBalanceImportRow"("paymentId");
CREATE UNIQUE INDEX "PaymentBalanceImportRow_sourceClaimSha256_key"
  ON "PaymentBalanceImportRow"("sourceClaimSha256");
CREATE INDEX "PaymentBalanceImportRow_studentId_idx"
  ON "PaymentBalanceImportRow"("studentId");
CREATE INDEX "PaymentBalanceImportRow_invoiceId_idx"
  ON "PaymentBalanceImportRow"("invoiceId");
CREATE INDEX "PaymentBalanceImportRow_disposition_idx"
  ON "PaymentBalanceImportRow"("disposition");
CREATE INDEX "PaymentBalanceImportRow_priorImportedRowId_idx"
  ON "PaymentBalanceImportRow"("priorImportedRowId");

ALTER TABLE "PaymentBalanceImportBatch"
  ADD CONSTRAINT "PaymentBalanceImportBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Person"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentBalanceImportRow"
  ADD CONSTRAINT "PaymentBalanceImportRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "PaymentBalanceImportBatch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentBalanceImportRow_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentBalanceImportRow_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentBalanceImportRow_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentBalanceImportRow_priorImportedRowId_fkey"
  FOREIGN KEY ("priorImportedRowId") REFERENCES "PaymentBalanceImportRow"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

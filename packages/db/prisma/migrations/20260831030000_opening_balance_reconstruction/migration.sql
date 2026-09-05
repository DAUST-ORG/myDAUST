-- Opening-balance reconstruction: a distinct rail from the workbook payment importer,
-- for collections recorded in a finance workbook that carries amounts but no
-- settlement dates, methods or references. Additive only.

CREATE TYPE "OpeningBalanceBatchStatus" AS ENUM ('pending', 'posted', 'failed');

CREATE TABLE "OpeningBalanceBatch" (
    "id" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "academicYearLabel" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "status" "OpeningBalanceBatchStatus" NOT NULL DEFAULT 'pending',
    "hasSettlementDates" BOOLEAN NOT NULL DEFAULT false,
    "hasPaymentMethods" BOOLEAN NOT NULL DEFAULT false,
    "hasExternalRefs" BOOLEAN NOT NULL DEFAULT false,
    "reconstructionNote" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "postedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "sourceTotalXof" BIGINT NOT NULL DEFAULT 0,
    "postedXof" BIGINT NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "OpeningBalanceBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpeningBalanceBatch_sourceSha256_key" ON "OpeningBalanceBatch"("sourceSha256");
CREATE INDEX "OpeningBalanceBatch_status_createdAt_idx" ON "OpeningBalanceBatch"("status", "createdAt");

ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "openingBalanceBatchId" TEXT;

CREATE UNIQUE INDEX "Payment_openingBalanceBatchId_importRowKey_key"
    ON "Payment"("openingBalanceBatchId", "importRowKey");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_openingBalanceBatchId_fkey"
    FOREIGN KEY ("openingBalanceBatchId") REFERENCES "OpeningBalanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A payment belongs to at most one import rail.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_single_import_rail_check"
  CHECK ("importBatchId" IS NULL OR "openingBalanceBatchId" IS NULL);

-- Reconstructed cash is undated by construction; it must not claim a settlement time.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_opening_balance_undated_check"
  CHECK ("openingBalanceBatchId" IS NULL OR "settledAt" IS NULL);

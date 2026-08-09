-- CreateEnum
CREATE TYPE "PiSpiRequestStatus" AS ENUM ('initiated', 'sent', 'settled', 'cancelled', 'rejected', 'expired');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'pi_spi';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "piSpiAlias" TEXT;

-- CreateTable
CREATE TABLE "PiSpiRequest" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "end2endId" TEXT,
    "status" "PiSpiRequestStatus" NOT NULL DEFAULT 'initiated',
    "statusReason" TEXT,
    "source" TEXT NOT NULL,
    "payerAlias" TEXT NOT NULL,
    "payerName" TEXT,
    "payerCountry" TEXT,
    "amountXof" INTEGER NOT NULL,
    "settledAmountXof" INTEGER,
    "motif" TEXT NOT NULL,
    "studentId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "paymentLinkId" TEXT,
    "applicantId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PiSpiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PiSpiRequest_txId_key" ON "PiSpiRequest"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "PiSpiRequest_end2endId_key" ON "PiSpiRequest"("end2endId");

-- CreateIndex
CREATE UNIQUE INDEX "PiSpiRequest_paymentId_key" ON "PiSpiRequest"("paymentId");

-- CreateIndex
CREATE INDEX "PiSpiRequest_status_createdAt_idx" ON "PiSpiRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PiSpiRequest_studentId_idx" ON "PiSpiRequest"("studentId");

-- CreateIndex
CREATE INDEX "PiSpiRequest_invoiceId_idx" ON "PiSpiRequest"("invoiceId");

-- CreateIndex
CREATE INDEX "PiSpiRequest_paymentLinkId_idx" ON "PiSpiRequest"("paymentLinkId");

-- CreateIndex
CREATE INDEX "PiSpiRequest_applicantId_idx" ON "PiSpiRequest"("applicantId");

-- AddForeignKey
ALTER TABLE "PiSpiRequest" ADD CONSTRAINT "PiSpiRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiSpiRequest" ADD CONSTRAINT "PiSpiRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiSpiRequest" ADD CONSTRAINT "PiSpiRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiSpiRequest" ADD CONSTRAINT "PiSpiRequest_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiSpiRequest" ADD CONSTRAINT "PiSpiRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Only one live request-to-pay may target an invoice / link / applicant at a time, so a
-- payer cannot stack duplicate requests for the same debt. Partial unique indexes are not
-- expressible in the Prisma schema, so they are declared here (mirrors the wire-transfer
-- migration). "initiated" and "sent" are the states in which a request is still payable.
CREATE UNIQUE INDEX "PiSpiRequest_active_invoice_key"
  ON "PiSpiRequest"("invoiceId") WHERE "status" IN ('initiated', 'sent') AND "invoiceId" IS NOT NULL;
CREATE UNIQUE INDEX "PiSpiRequest_active_link_key"
  ON "PiSpiRequest"("paymentLinkId") WHERE "status" IN ('initiated', 'sent') AND "paymentLinkId" IS NOT NULL;
CREATE UNIQUE INDEX "PiSpiRequest_active_applicant_key"
  ON "PiSpiRequest"("applicantId") WHERE "status" IN ('initiated', 'sent') AND "applicantId" IS NOT NULL;

-- A request must always name exactly one target.
ALTER TABLE "PiSpiRequest" ADD CONSTRAINT "PiSpiRequest_one_target"
  CHECK (("invoiceId" IS NOT NULL)::int + ("paymentLinkId" IS NOT NULL)::int + ("applicantId" IS NOT NULL)::int = 1);

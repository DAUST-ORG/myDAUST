ALTER TYPE "PaymentMethod" ADD VALUE 'wire';

CREATE TYPE "WireTransferStatus" AS ENUM ('submitted', 'approved', 'rejected');

CREATE TABLE "WireTransferSubmission" (
    "id" TEXT NOT NULL,
    "status" "WireTransferStatus" NOT NULL DEFAULT 'submitted',
    "source" TEXT NOT NULL,
    "studentId" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "paymentLinkId" TEXT,
    "submittedAmountXof" INTEGER NOT NULL,
    "confirmedAmountXof" INTEGER,
    "contactEmail" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedByEmail" TEXT,
    "proofObjectKey" TEXT NOT NULL,
    "proofFileName" TEXT NOT NULL,
    "proofMimeType" TEXT NOT NULL,
    "proofSize" INTEGER NOT NULL,
    "bankSnapshot" JSONB NOT NULL,
    "bankReference" TEXT,
    "confirmationNote" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WireTransferSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WireTransferSubmission_paymentId_key" ON "WireTransferSubmission"("paymentId");
CREATE INDEX "WireTransferSubmission_status_createdAt_idx" ON "WireTransferSubmission"("status", "createdAt");
CREATE INDEX "WireTransferSubmission_studentId_idx" ON "WireTransferSubmission"("studentId");
CREATE INDEX "WireTransferSubmission_invoiceId_idx" ON "WireTransferSubmission"("invoiceId");
CREATE INDEX "WireTransferSubmission_paymentLinkId_idx" ON "WireTransferSubmission"("paymentLinkId");
CREATE UNIQUE INDEX "WireTransferSubmission_active_invoice_key"
  ON "WireTransferSubmission"("invoiceId") WHERE "status" = 'submitted' AND "invoiceId" IS NOT NULL;
CREATE UNIQUE INDEX "WireTransferSubmission_active_link_key"
  ON "WireTransferSubmission"("paymentLinkId") WHERE "status" = 'submitted' AND "paymentLinkId" IS NOT NULL;

ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_paymentLinkId_fkey"
  FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_target_check"
  CHECK ("invoiceId" IS NOT NULL OR "paymentLinkId" IS NOT NULL);

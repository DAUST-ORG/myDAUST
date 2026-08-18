-- Per-student payment plans can split every installment across the invoice's
-- tuition, cafeteria, housing, and other configured charge components.
CREATE TABLE "InstallmentComponent" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "invoiceComponentId" TEXT NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstallmentComponent_installmentId_invoiceComponentId_key"
ON "InstallmentComponent"("installmentId", "invoiceComponentId");

CREATE INDEX "InstallmentComponent_invoiceComponentId_idx"
ON "InstallmentComponent"("invoiceComponentId");

ALTER TABLE "InstallmentComponent"
ADD CONSTRAINT "InstallmentComponent_installmentId_fkey"
FOREIGN KEY ("installmentId") REFERENCES "Installment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstallmentComponent"
ADD CONSTRAINT "InstallmentComponent_invoiceComponentId_fkey"
FOREIGN KEY ("invoiceComponentId") REFERENCES "InvoiceComponent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

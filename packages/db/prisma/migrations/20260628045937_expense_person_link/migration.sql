-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "personId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_personId_idx" ON "Expense"("personId");

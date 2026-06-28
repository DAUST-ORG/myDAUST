-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "costCenterCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "payee" TEXT,
    "amount" INTEGER NOT NULL,
    "isEstimate" BOOLEAN NOT NULL DEFAULT false,
    "incurredOn" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "costCenterCode" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "allocated" INTEGER NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "programCode" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'submitted',
    "score" INTEGER,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_costCenterCode_idx" ON "Expense"("costCenterCode");

-- CreateIndex
CREATE INDEX "Expense_incurredOn_idx" ON "Expense"("incurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_costCenterCode_fiscalYear_key" ON "Budget"("costCenterCode", "fiscalYear");

-- CreateIndex
CREATE INDEX "Applicant_stage_idx" ON "Applicant"("stage");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_costCenterCode_fkey" FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_costCenterCode_fkey" FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

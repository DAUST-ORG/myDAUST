-- Versioned August-July operating budgets and approval-backed management actuals.
-- This migration is additive: legacy cost-center budgets and expense values remain
-- untouched, and no example amounts from the standalone prototype are imported.

ALTER TYPE "ApprovalRequestKind" ADD VALUE IF NOT EXISTS 'operating_budget';
ALTER TYPE "ApprovalRequestKind" ADD VALUE IF NOT EXISTS 'management_actual';

CREATE TYPE "OperatingBudgetStatus" AS ENUM (
  'draft',
  'pending',
  'approved',
  'rejected',
  'superseded'
);

CREATE TYPE "ManagementCategoryKind" AS ENUM ('income', 'expense');

CREATE TYPE "ManagementRecordStatus" AS ENUM (
  'pending',
  'approved',
  'rejected',
  'void',
  'corrected'
);

CREATE TYPE "ManagementActualEntryType" AS ENUM ('manual_income', 'adjustment');

CREATE TABLE "ManagementCategory" (
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" "ManagementCategoryKind" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ManagementCategory_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "ManagementCategory_key_kind_check" CHECK (
    ("kind" = 'expense' AND "key" IN (
      'taxes', 'debts', 'rent', 'permanent_staff_salaries',
      'cafeteria_restaurant', 'capital_other_expenses',
      'contract_vacataire_salaries', 'service_providers', 'utilities',
      'facilities_it_maintenance', 'departments_events', 'insurance',
      'travel_transportation'
    ))
    OR
    ("kind" = 'income' AND "key" IN (
      'bursar', 'research_grants', 'service_contracts',
      'donations_sponsorships', 'scholarships', 'others'
    ))
  )
);

INSERT INTO "ManagementCategory" ("key", "label", "kind", "sortOrder") VALUES
  ('taxes', 'Taxes', 'expense', 0),
  ('debts', 'Debts', 'expense', 1),
  ('rent', 'Rent', 'expense', 2),
  ('permanent_staff_salaries', 'Permanent Staff Salaries', 'expense', 3),
  ('cafeteria_restaurant', 'Cafeteria & Restaurant', 'expense', 4),
  ('capital_other_expenses', 'Capital & Other Expenses', 'expense', 5),
  ('contract_vacataire_salaries', 'Contract (Vacataire) Salaries', 'expense', 6),
  ('service_providers', 'Service Providers', 'expense', 7),
  ('utilities', 'Utilities', 'expense', 8),
  ('facilities_it_maintenance', 'Facilities, IT & Maintenance', 'expense', 9),
  ('departments_events', 'Departments & Events', 'expense', 10),
  ('insurance', 'Insurance', 'expense', 11),
  ('travel_transportation', 'Travel & Transportation', 'expense', 12),
  ('bursar', 'Tuition, dining & housing (Bursar)', 'income', 0),
  ('research_grants', 'Research Grants', 'income', 1),
  ('service_contracts', 'Service Contracts', 'income', 2),
  ('donations_sponsorships', 'Donations & Sponsorships', 'income', 3),
  ('scholarships', 'Scholarships', 'income', 4),
  ('others', 'Others', 'income', 5);

CREATE UNIQUE INDEX "ManagementCategory_kind_label_key"
  ON "ManagementCategory"("kind", "label");
CREATE INDEX "ManagementCategory_kind_sortOrder_idx"
  ON "ManagementCategory"("kind", "sortOrder");

CREATE TABLE "OperatingBudget" (
  "id" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "contentVersion" INTEGER NOT NULL DEFAULT 0,
  "status" "OperatingBudgetStatus" NOT NULL DEFAULT 'draft',
  "openingBalanceXof" BIGINT NOT NULL DEFAULT 0,
  "reason" TEXT,
  "baseRevision" INTEGER NOT NULL DEFAULT 0,
  "approvalRequestId" TEXT,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatingBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperatingBudget_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "OperatingBudget_contentVersion_check" CHECK ("contentVersion" >= 0),
  CONSTRAINT "OperatingBudget_baseRevision_check" CHECK ("baseRevision" >= 0)
);

CREATE UNIQUE INDEX "OperatingBudget_academicYearId_revision_key"
  ON "OperatingBudget"("academicYearId", "revision");
CREATE UNIQUE INDEX "OperatingBudget_approvalRequestId_key"
  ON "OperatingBudget"("approvalRequestId");
CREATE INDEX "OperatingBudget_academicYearId_status_createdAt_idx"
  ON "OperatingBudget"("academicYearId", "status", "createdAt");
CREATE INDEX "OperatingBudget_createdById_createdAt_idx"
  ON "OperatingBudget"("createdById", "createdAt");
CREATE INDEX "OperatingBudget_reviewedById_idx"
  ON "OperatingBudget"("reviewedById");
CREATE UNIQUE INDEX "OperatingBudget_one_approved_per_year_key"
  ON "OperatingBudget"("academicYearId")
  WHERE "status" = 'approved';

CREATE TABLE "OperatingBudgetLine" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "categoryKey" TEXT NOT NULL,
  "monthIndex" INTEGER NOT NULL,
  "amountXof" BIGINT NOT NULL,
  CONSTRAINT "OperatingBudgetLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperatingBudgetLine_monthIndex_check" CHECK ("monthIndex" BETWEEN 0 AND 11),
  CONSTRAINT "OperatingBudgetLine_amountXof_check" CHECK ("amountXof" >= 0)
);

CREATE UNIQUE INDEX "OperatingBudgetLine_budgetId_categoryKey_monthIndex_key"
  ON "OperatingBudgetLine"("budgetId", "categoryKey", "monthIndex");
CREATE INDEX "OperatingBudgetLine_categoryKey_idx"
  ON "OperatingBudgetLine"("categoryKey");

CREATE TABLE "ManagementActualEntry" (
  "id" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "categoryKey" TEXT NOT NULL,
  "costCenterCode" TEXT NOT NULL,
  "type" "ManagementActualEntryType" NOT NULL,
  "status" "ManagementRecordStatus" NOT NULL DEFAULT 'pending',
  "amountXof" BIGINT NOT NULL,
  "baseActualXof" BIGINT,
  "targetActualXof" BIGINT,
  "occurredOn" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "correctionOfId" TEXT,
  "approvalRequestId" TEXT,
  "voidApprovalRequestId" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagementActualEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagementActualEntry_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "ManagementActualEntry_amount_check" CHECK (
    ("type" = 'manual_income' AND "amountXof" > 0 AND "baseActualXof" IS NULL AND "targetActualXof" IS NULL)
    OR
    ("type" = 'adjustment' AND "amountXof" <> 0 AND "baseActualXof" IS NOT NULL AND "targetActualXof" IS NOT NULL AND "targetActualXof" - "baseActualXof" = "amountXof")
  )
);

CREATE UNIQUE INDEX "ManagementActualEntry_approvalRequestId_key"
  ON "ManagementActualEntry"("approvalRequestId");
CREATE UNIQUE INDEX "ManagementActualEntry_voidApprovalRequestId_key"
  ON "ManagementActualEntry"("voidApprovalRequestId");
CREATE INDEX "ManagementActualEntry_academicYearId_status_occurredOn_idx"
  ON "ManagementActualEntry"("academicYearId", "status", "occurredOn");
CREATE INDEX "ManagementActualEntry_categoryKey_status_occurredOn_idx"
  ON "ManagementActualEntry"("categoryKey", "status", "occurredOn");
CREATE INDEX "ManagementActualEntry_costCenterCode_status_occurredOn_idx"
  ON "ManagementActualEntry"("costCenterCode", "status", "occurredOn");
CREATE INDEX "ManagementActualEntry_correctionOfId_idx"
  ON "ManagementActualEntry"("correctionOfId");
CREATE INDEX "ManagementActualEntry_createdById_createdAt_idx"
  ON "ManagementActualEntry"("createdById", "createdAt");
CREATE INDEX "ManagementActualEntry_approvedById_idx"
  ON "ManagementActualEntry"("approvedById");
CREATE INDEX "ManagementActualEntry_voidedById_idx"
  ON "ManagementActualEntry"("voidedById");

ALTER TABLE "Expense"
  ADD COLUMN "managementCategoryKey" TEXT,
  ADD COLUMN "academicYearId" TEXT,
  ADD COLUMN "status" "ManagementRecordStatus" NOT NULL DEFAULT 'approved',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "correctionOfId" TEXT,
  ADD COLUMN "approvalRequestId" TEXT,
  ADD COLUMN "voidApprovalRequestId" TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "Expense_revision_check" CHECK ("revision" >= 0);

ALTER TABLE "Expense" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Link only exact institution labels. Unknown legacy labels intentionally remain
-- null so the Budgeting screen can report them as unclassified for staff review.
UPDATE "Expense" AS expense
SET "managementCategoryKey" = category."key"
FROM "ManagementCategory" AS category
WHERE category."kind" = 'expense'
  AND expense."category" = category."label";

CREATE UNIQUE INDEX "Expense_approvalRequestId_key"
  ON "Expense"("approvalRequestId");
CREATE UNIQUE INDEX "Expense_voidApprovalRequestId_key"
  ON "Expense"("voidApprovalRequestId");
CREATE INDEX "Expense_academicYearId_status_incurredOn_idx"
  ON "Expense"("academicYearId", "status", "incurredOn");
CREATE INDEX "Expense_managementCategoryKey_status_incurredOn_idx"
  ON "Expense"("managementCategoryKey", "status", "incurredOn");
CREATE INDEX "Expense_correctionOfId_idx"
  ON "Expense"("correctionOfId");
CREATE INDEX "Expense_approvedById_idx"
  ON "Expense"("approvedById");
CREATE INDEX "Expense_voidedById_idx"
  ON "Expense"("voidedById");

ALTER TABLE "OperatingBudget"
  ADD CONSTRAINT "OperatingBudget_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperatingBudget_approvalRequestId_fkey"
    FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OperatingBudget_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperatingBudget_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperatingBudgetLine"
  ADD CONSTRAINT "OperatingBudgetLine_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "OperatingBudget"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OperatingBudgetLine_categoryKey_fkey"
    FOREIGN KEY ("categoryKey") REFERENCES "ManagementCategory"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManagementActualEntry"
  ADD CONSTRAINT "ManagementActualEntry_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_categoryKey_fkey"
    FOREIGN KEY ("categoryKey") REFERENCES "ManagementCategory"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_costCenterCode_fkey"
    FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_correctionOfId_fkey"
    FOREIGN KEY ("correctionOfId") REFERENCES "ManagementActualEntry"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_approvalRequestId_fkey"
    FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_voidApprovalRequestId_fkey"
    FOREIGN KEY ("voidApprovalRequestId") REFERENCES "ApprovalRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ManagementActualEntry_voidedById_fkey"
    FOREIGN KEY ("voidedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_managementCategoryKey_fkey"
    FOREIGN KEY ("managementCategoryKey") REFERENCES "ManagementCategory"("key")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_correctionOfId_fkey"
    FOREIGN KEY ("correctionOfId") REFERENCES "Expense"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_approvalRequestId_fkey"
    FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_voidApprovalRequestId_fkey"
    FOREIGN KEY ("voidApprovalRequestId") REFERENCES "ApprovalRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Expense_voidedById_fkey"
    FOREIGN KEY ("voidedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

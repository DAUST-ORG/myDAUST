-- Full-package billing, versioned fee schedules, payment provenance and protected approvals.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refund_pending';

CREATE TYPE "InvoicePackageType" AS ENUM ('standard_full', 'standard_tuition_legacy', 'custom', 'credit');
CREATE TYPE "FeeScheduleStatus" AS ENUM ('draft', 'approved', 'superseded');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'stale');
CREATE TYPE "ApprovalRequestKind" AS ENUM ('global_fee_schedule', 'custom_charge', 'charge_removal', 'payment_plan', 'discount', 'scholarship');

ALTER TABLE "Invoice"
  ADD COLUMN "packageType" "InvoicePackageType" NOT NULL DEFAULT 'custom',
  ADD COLUMN "academicYearLabel" TEXT,
  ADD COLUMN "feeScheduleId" TEXT,
  ADD COLUMN "feeScheduleRevision" INTEGER,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Payment"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "initiatedById" TEXT,
  ADD COLUMN "initiatedByEmail" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE TABLE "FeeSchedule" (
  "id" TEXT NOT NULL,
  "academicYearLabel" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "FeeScheduleStatus" NOT NULL DEFAULT 'draft',
  "reason" TEXT,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeSchedule_pkey" PRIMARY KEY ("id")
);

INSERT INTO "FeeSchedule" (
  "id", "academicYearLabel", "revision", "status", "reason", "approvedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || f."academicYearLabel"),
  f."academicYearLabel",
  1,
  'approved'::"FeeScheduleStatus",
  'Migrated from the approved institution fee plan',
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "academicYearLabel" FROM "FeePlanInstallment") f
JOIN "AcademicYear" ay ON ay."label" = f."academicYearLabel";

ALTER TABLE "FeePlanInstallment"
  ADD COLUMN "scheduleId" TEXT,
  ADD COLUMN "amountHousingXof" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "amountCafeteriaXof" INTEGER NOT NULL DEFAULT 0;

UPDATE "FeePlanInstallment" row
SET
  "scheduleId" = schedule."id",
  "amountHousingXof" = ROUND(
    GREATEST(0, row."amountFullXof" - row."amountTuitionXof")::numeric * 680000 / 1310000
  )::integer
FROM "FeeSchedule" schedule
WHERE schedule."academicYearLabel" = row."academicYearLabel"
  AND schedule."revision" = 1;

UPDATE "FeePlanInstallment"
SET "amountCafeteriaXof" = GREATEST(
  0,
  "amountFullXof" - "amountTuitionXof" - "amountHousingXof"
);

ALTER TABLE "FeePlanInstallment" ALTER COLUMN "scheduleId" SET NOT NULL;
DROP INDEX "FeePlanInstallment_academicYearLabel_sequence_key";
CREATE UNIQUE INDEX "FeePlanInstallment_scheduleId_sequence_key" ON "FeePlanInstallment"("scheduleId", "sequence");
CREATE INDEX "FeePlanInstallment_academicYearLabel_sequence_idx" ON "FeePlanInstallment"("academicYearLabel", "sequence");

-- Identify existing standard plans conservatively: exactly four installments and
-- one of the two published annual totals. Conversion to full package is a separate,
-- dry-run-first command so this additive migration never changes what a student owes.
UPDATE "Invoice" invoice
SET
  "packageType" = CASE
    WHEN invoice."totalAmount" = 4285000 THEN 'standard_full'::"InvoicePackageType"
    ELSE 'standard_tuition_legacy'::"InvoicePackageType"
  END,
  "academicYearLabel" = ay."label",
  "feeScheduleId" = schedule."id",
  "feeScheduleRevision" = schedule."revision"
FROM "Term" term
JOIN "AcademicYear" ay ON ay."id" = term."academicYearId"
JOIN "FeeSchedule" schedule
  ON schedule."academicYearLabel" = ay."label"
 AND schedule."status" = 'approved'
WHERE invoice."termId" = term."id"
  AND invoice."status" <> 'void'
  AND invoice."totalAmount" IN (2975000, 4285000)
  AND (
    invoice."description" IS NULL
    OR invoice."description" ILIKE '%tuition%'
    OR invoice."description" ILIKE '%package%'
    OR invoice."description" ILIKE '%scolarité%'
  )
  AND (
    SELECT COUNT(*)
    FROM "PaymentPlan" plan
    JOIN "Installment" installment ON installment."planId" = plan."id"
    WHERE plan."invoiceId" = invoice."id"
  ) = 4
  AND NOT EXISTS (
    SELECT 1
    FROM "PaymentPlan" plan
    JOIN "Installment" installment ON installment."planId" = plan."id"
    WHERE plan."invoiceId" = invoice."id"
      AND installment."amountDue" <> CASE
        WHEN invoice."totalAmount" = 2975000 THEN 743750
        ELSE 1071250
      END
  );

UPDATE "Invoice"
SET "packageType" = 'credit'
WHERE "totalAmount" < 0;

-- Do not let historical duplicate standard-looking invoices abort this additive
-- migration. Leave every duplicate conservatively unclassified so the dry-run
-- conversion reports the account for explicit Finance resolution.
WITH duplicate_standard AS (
  SELECT "studentId", "academicYearLabel"
  FROM "Invoice"
  WHERE "packageType" IN ('standard_full', 'standard_tuition_legacy')
    AND "status" <> 'void'
    AND "academicYearLabel" IS NOT NULL
  GROUP BY "studentId", "academicYearLabel"
  HAVING COUNT(*) > 1
)
UPDATE "Invoice" invoice
SET
  "packageType" = 'custom',
  "feeScheduleId" = NULL,
  "feeScheduleRevision" = NULL
FROM duplicate_standard duplicate
WHERE invoice."studentId" = duplicate."studentId"
  AND invoice."academicYearLabel" = duplicate."academicYearLabel"
  AND invoice."packageType" IN ('standard_full', 'standard_tuition_legacy');

-- These package components are institutional dimensions. Older databases may
-- not have run the reference loader yet, so establish the FK targets before
-- backfilling component rows.
INSERT INTO "CostCenter" ("code", "name", "type") VALUES
  ('9100', 'Tuition & Academic Fees', 'revenue'::"CostCenterType"),
  ('3700', 'Housing', 'auxiliary'::"CostCenterType"),
  ('3600', 'Dining / Cafeteria', 'auxiliary'::"CostCenterType")
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "InvoiceComponent" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "costCenterCode" TEXT NOT NULL,
  "amountXof" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceComponent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InvoiceComponent" ("id", "invoiceId", "kind", "costCenterCode", "amountXof")
SELECT md5(random()::text || invoice."id" || 'tuition'), invoice."id", 'tuition', '9100',
  CASE WHEN invoice."packageType" = 'standard_full' THEN 2975000 ELSE invoice."totalAmount" END
FROM "Invoice" invoice
WHERE invoice."totalAmount" > 0
  AND invoice."packageType" IN ('standard_full', 'standard_tuition_legacy');

INSERT INTO "InvoiceComponent" ("id", "invoiceId", "kind", "costCenterCode", "amountXof")
SELECT md5(random()::text || invoice."id" || 'housing'), invoice."id", 'housing', '3700', 680000
FROM "Invoice" invoice
WHERE invoice."packageType" = 'standard_full';

INSERT INTO "InvoiceComponent" ("id", "invoiceId", "kind", "costCenterCode", "amountXof")
SELECT md5(random()::text || invoice."id" || 'cafeteria'), invoice."id", 'cafeteria', '3600', 630000
FROM "Invoice" invoice
WHERE invoice."packageType" = 'standard_full';

INSERT INTO "InvoiceComponent" ("id", "invoiceId", "kind", "costCenterCode", "amountXof")
SELECT
  md5(random()::text || invoice."id" || 'custom'),
  invoice."id",
  CASE invoice."costCenterCode" WHEN '9100' THEN 'tuition' WHEN '3700' THEN 'housing' WHEN '3600' THEN 'cafeteria' ELSE 'other' END,
  invoice."costCenterCode",
  invoice."totalAmount"
FROM "Invoice" invoice
WHERE invoice."totalAmount" > 0
  AND invoice."packageType" = 'custom';

CREATE TABLE "PaymentComponentAllocation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "invoiceComponentId" TEXT NOT NULL,
  "amountXof" INTEGER NOT NULL,
  "refundedAmountXof" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentComponentAllocation_pkey" PRIMARY KEY ("id")
);

-- Backfill an exact deterministic split for already-settled payments. The base
-- allocation is floor(proportion); leftover XOF goes to the largest fractional
-- remainder and then stable component id order.
WITH payment_direct AS (
  SELECT
    payment."id" AS "paymentId",
    payment."status",
    payment."invoiceId",
    GREATEST(0, payment."amount" + COALESCE(credit."totalAmount", 0))::integer AS "directXof"
  FROM "Payment" payment
  LEFT JOIN "Invoice" credit ON credit."number" = ('CR-PAY-' || payment."id") AND credit."status" <> 'void'
  WHERE payment."status" IN ('success', 'refunded')
), weighted AS (
  SELECT
    pd."paymentId",
    pd."status",
    component."id" AS "componentId",
    pd."directXof",
    component."amountXof",
    invoice."totalAmount",
    FLOOR(pd."directXof"::numeric * component."amountXof" / NULLIF(invoice."totalAmount", 0))::integer AS base,
    MOD(pd."directXof"::numeric * component."amountXof", NULLIF(invoice."totalAmount", 0)) AS remainder
  FROM payment_direct pd
  JOIN "Invoice" invoice ON invoice."id" = pd."invoiceId"
  JOIN "InvoiceComponent" component ON component."invoiceId" = invoice."id"
  WHERE pd."directXof" > 0 AND invoice."totalAmount" > 0
), ranked AS (
  SELECT
    weighted.*,
    ROW_NUMBER() OVER (PARTITION BY "paymentId" ORDER BY remainder DESC, "componentId") AS rn,
    SUM(base) OVER (PARTITION BY "paymentId") AS base_sum
  FROM weighted
)
INSERT INTO "PaymentComponentAllocation" (
  "id", "paymentId", "invoiceComponentId", "amountXof", "refundedAmountXof"
)
SELECT
  md5(random()::text || "paymentId" || "componentId"),
  "paymentId",
  "componentId",
  base + CASE WHEN rn <= ("directXof" - base_sum) THEN 1 ELSE 0 END,
  CASE WHEN "status" = 'refunded' THEN base + CASE WHEN rn <= ("directXof" - base_sum) THEN 1 ELSE 0 END ELSE 0 END
FROM ranked;

UPDATE "Payment"
SET
  "source" = CASE
    WHEN "provider" = 'wire' THEN 'wire_transfer'
    WHEN "provider" = 'pi_spi' THEN 'pi_spi'
    WHEN "providerRef" LIKE 'BILL-%' THEN 'public_bill'
    WHEN "providerRef" LIKE 'PLINK-%' THEN 'payment_link'
    ELSE 'legacy'
  END,
  "settledAt" = CASE WHEN "status" IN ('success', 'refunded') THEN "updatedAt" ELSE NULL END,
  "refundedAt" = CASE WHEN "status" = 'refunded' THEN "updatedAt" ELSE NULL END;

CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "kind" "ApprovalRequestKind" NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'pending',
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "academicYearLabel" TEXT,
  "reason" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB NOT NULL,
  "baseRevision" INTEGER NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorWidgetPreference" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "widgetKeys" TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorWidgetPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeeSchedule_academicYearLabel_revision_key" ON "FeeSchedule"("academicYearLabel", "revision");
CREATE INDEX "FeeSchedule_academicYearLabel_status_idx" ON "FeeSchedule"("academicYearLabel", "status");
CREATE INDEX "Invoice_feeScheduleId_idx" ON "Invoice"("feeScheduleId");
CREATE INDEX "Invoice_packageType_academicYearLabel_idx" ON "Invoice"("packageType", "academicYearLabel");
CREATE UNIQUE INDEX "Invoice_one_live_standard_package_per_student_year_key"
  ON "Invoice"("studentId", "academicYearLabel")
  WHERE "packageType" = 'standard_full' AND "status" <> 'void' AND "academicYearLabel" IS NOT NULL;
CREATE INDEX "Payment_settledAt_idx" ON "Payment"("settledAt");
CREATE INDEX "Payment_initiatedById_idx" ON "Payment"("initiatedById");
CREATE UNIQUE INDEX "InvoiceComponent_invoiceId_kind_key" ON "InvoiceComponent"("invoiceId", "kind");
CREATE INDEX "InvoiceComponent_costCenterCode_idx" ON "InvoiceComponent"("costCenterCode");
CREATE UNIQUE INDEX "PaymentComponentAllocation_paymentId_invoiceComponentId_key" ON "PaymentComponentAllocation"("paymentId", "invoiceComponentId");
CREATE INDEX "PaymentComponentAllocation_invoiceComponentId_idx" ON "PaymentComponentAllocation"("invoiceComponentId");
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");
CREATE INDEX "ApprovalRequest_requestedById_createdAt_idx" ON "ApprovalRequest"("requestedById", "createdAt");
CREATE INDEX "ApprovalRequest_kind_targetId_idx" ON "ApprovalRequest"("kind", "targetId");
CREATE INDEX "ApprovalEvent_requestId_createdAt_idx" ON "ApprovalEvent"("requestId", "createdAt");
CREATE UNIQUE INDEX "DirectorWidgetPreference_personId_key" ON "DirectorWidgetPreference"("personId");

ALTER TABLE "FeeSchedule" ADD CONSTRAINT "FeeSchedule_academicYearLabel_fkey" FOREIGN KEY ("academicYearLabel") REFERENCES "AcademicYear"("label") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeeSchedule" ADD CONSTRAINT "FeeSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeSchedule" ADD CONSTRAINT "FeeSchedule_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeePlanInstallment" ADD CONSTRAINT "FeePlanInstallment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FeeSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_feeScheduleId_fkey" FOREIGN KEY ("feeScheduleId") REFERENCES "FeeSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceComponent" ADD CONSTRAINT "InvoiceComponent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceComponent" ADD CONSTRAINT "InvoiceComponent_costCenterCode_fkey" FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentComponentAllocation" ADD CONSTRAINT "PaymentComponentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentComponentAllocation" ADD CONSTRAINT "PaymentComponentAllocation_invoiceComponentId_fkey" FOREIGN KEY ("invoiceComponentId") REFERENCES "InvoiceComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DirectorWidgetPreference" ADD CONSTRAINT "DirectorWidgetPreference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma's `@updatedAt` is populated by the client and does not declare a
-- database default. Keep the temporary defaults above for the migration's
-- backfill inserts, then align the final database shape with schema.prisma.
ALTER TABLE "FeeSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "InvoiceComponent" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ApprovalRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "DirectorWidgetPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Guardian accounts may be removed without deleting immutable finance evidence.
ALTER TABLE "WireTransferSubmission" DROP CONSTRAINT "WireTransferSubmission_submittedById_fkey";
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WireTransferSubmission" DROP CONSTRAINT "WireTransferSubmission_reviewedById_fkey";
ALTER TABLE "WireTransferSubmission" ADD CONSTRAINT "WireTransferSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

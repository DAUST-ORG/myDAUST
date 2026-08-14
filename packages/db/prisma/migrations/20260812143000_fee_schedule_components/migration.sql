-- Make annual fee components authoritative and extensible. Installment rows remain
-- date/allocation snapshots for compatibility, while component totals own the bill.

CREATE TABLE "FeeScheduleComponent" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "costCenterCode" TEXT NOT NULL,
  "annualAmountXof" INTEGER NOT NULL,
  "defaultSelected" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeeScheduleComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeeScheduleComponent_annualAmountXof_check" CHECK ("annualAmountXof" > 0)
);

ALTER TABLE "Invoice" ADD COLUMN "paymentPlanOverride" BOOLEAN NOT NULL DEFAULT false;
-- Preserve the meaning of previously unlinked standard invoices as custom-date plans.
UPDATE "Invoice"
SET "paymentPlanOverride" = true
WHERE "packageType" = 'standard_full' AND "feeScheduleId" IS NULL;

INSERT INTO "FeeScheduleComponent" (
  "id", "scheduleId", "key", "label", "description", "costCenterCode",
  "annualAmountXof", "defaultSelected", "sortOrder"
)
SELECT
  md5(schedule."id" || ':tuition'), schedule."id", 'tuition', 'Tuition',
  'Annual tuition', '9100', COALESCE(SUM(row."amountTuitionXof"), 0), true, 0
FROM "FeeSchedule" schedule
JOIN "FeePlanInstallment" row ON row."scheduleId" = schedule."id"
GROUP BY schedule."id"
HAVING COALESCE(SUM(row."amountTuitionXof"), 0) > 0
UNION ALL
SELECT
  md5(schedule."id" || ':housing'), schedule."id", 'housing', 'Housing',
  'Annual student housing', '3700', COALESCE(SUM(row."amountHousingXof"), 0), true, 1
FROM "FeeSchedule" schedule
JOIN "FeePlanInstallment" row ON row."scheduleId" = schedule."id"
GROUP BY schedule."id"
HAVING COALESCE(SUM(row."amountHousingXof"), 0) > 0
UNION ALL
SELECT
  md5(schedule."id" || ':cafeteria'), schedule."id", 'cafeteria', 'Cafeteria',
  'Annual cafeteria plan', '3600', COALESCE(SUM(row."amountCafeteriaXof"), 0), true, 2
FROM "FeeSchedule" schedule
JOIN "FeePlanInstallment" row ON row."scheduleId" = schedule."id"
GROUP BY schedule."id"
HAVING COALESCE(SUM(row."amountCafeteriaXof"), 0) > 0;

CREATE UNIQUE INDEX "FeeScheduleComponent_scheduleId_key_key"
  ON "FeeScheduleComponent"("scheduleId", "key");
CREATE INDEX "FeeScheduleComponent_costCenterCode_idx"
  ON "FeeScheduleComponent"("costCenterCode");

ALTER TABLE "InvoiceComponent"
  ADD COLUMN "scheduleComponentId" TEXT,
  ADD COLUMN "label" TEXT NOT NULL DEFAULT '';

ALTER TABLE "InvoiceComponent"
  ADD CONSTRAINT "InvoiceComponent_amountXof_check" CHECK ("amountXof" >= 0);

UPDATE "InvoiceComponent"
SET "label" = CASE "kind"
  WHEN 'tuition' THEN 'Tuition'
  WHEN 'housing' THEN 'Housing'
  WHEN 'cafeteria' THEN 'Cafeteria'
  ELSE INITCAP(REPLACE("kind", '_', ' '))
END;

UPDATE "InvoiceComponent" component
SET "scheduleComponentId" = catalog."id"
FROM "Invoice" invoice
JOIN "FeeScheduleComponent" catalog
  ON catalog."scheduleId" = invoice."feeScheduleId"
WHERE component."invoiceId" = invoice."id"
  AND catalog."key" = component."kind";

CREATE INDEX "InvoiceComponent_scheduleComponentId_idx"
  ON "InvoiceComponent"("scheduleComponentId");

ALTER TABLE "FeeScheduleComponent"
  ADD CONSTRAINT "FeeScheduleComponent_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "FeeSchedule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FeeScheduleComponent_costCenterCode_fkey"
    FOREIGN KEY ("costCenterCode") REFERENCES "CostCenter"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceComponent"
  ADD CONSTRAINT "InvoiceComponent_scheduleComponentId_fkey"
    FOREIGN KEY ("scheduleComponentId") REFERENCES "FeeScheduleComponent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InvoiceComponentOverride" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "componentKey" TEXT NOT NULL,
  "included" BOOLEAN NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceComponentOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceComponentOverride_invoiceId_componentKey_key"
  ON "InvoiceComponentOverride"("invoiceId", "componentKey");
CREATE INDEX "InvoiceComponentOverride_componentKey_idx"
  ON "InvoiceComponentOverride"("componentKey");
ALTER TABLE "InvoiceComponentOverride"
  ADD CONSTRAINT "InvoiceComponentOverride_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy individual date plans were represented by a null schedule relation. Relink
-- only accounts whose component keys and amounts exactly match the latest approved
-- default package; ambiguous custom totals remain unlinked for finance review.
WITH latest AS (
  SELECT DISTINCT ON ("academicYearLabel") "id", "academicYearLabel"
  FROM "FeeSchedule"
  WHERE "status" = 'approved'
  ORDER BY "academicYearLabel", "revision" DESC
), exact_invoices AS (
  SELECT invoice."id" AS "invoiceId", latest."id" AS "scheduleId"
  FROM "Invoice" invoice
  JOIN latest ON latest."academicYearLabel" = invoice."academicYearLabel"
  WHERE invoice."packageType" = 'standard_full'
    AND invoice."feeScheduleId" IS NULL
    AND invoice."totalAmount" = (
      SELECT COALESCE(SUM(catalog."annualAmountXof"), 0)
      FROM "FeeScheduleComponent" catalog
      WHERE catalog."scheduleId" = latest."id"
        AND catalog."defaultSelected" = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "FeeScheduleComponent" catalog
      WHERE catalog."scheduleId" = latest."id"
        AND catalog."defaultSelected" = true
        AND NOT EXISTS (
          SELECT 1 FROM "InvoiceComponent" component
          WHERE component."invoiceId" = invoice."id"
            AND component."kind" = catalog."key"
            AND component."amountXof" = catalog."annualAmountXof"
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "InvoiceComponent" component
      WHERE component."invoiceId" = invoice."id"
        AND component."amountXof" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "FeeScheduleComponent" catalog
          WHERE catalog."scheduleId" = latest."id"
            AND catalog."defaultSelected" = true
            AND catalog."key" = component."kind"
            AND catalog."annualAmountXof" = component."amountXof"
        )
    )
)
UPDATE "Invoice" invoice
SET
  "feeScheduleId" = exact_invoices."scheduleId",
  "feeScheduleRevision" = schedule."revision",
  "paymentPlanOverride" = true
FROM exact_invoices
JOIN "FeeSchedule" schedule ON schedule."id" = exact_invoices."scheduleId"
WHERE invoice."id" = exact_invoices."invoiceId";

-- The first provenance backfill ran before safe legacy invoices were relinked.
-- Repair those newly linked component snapshots now that feeScheduleId is known.
UPDATE "InvoiceComponent" component
SET "scheduleComponentId" = catalog."id"
FROM "Invoice" invoice
JOIN "FeeScheduleComponent" catalog
  ON catalog."scheduleId" = invoice."feeScheduleId"
WHERE component."invoiceId" = invoice."id"
  AND component."scheduleComponentId" IS NULL
  AND catalog."key" = component."kind"
  AND catalog."annualAmountXof" = component."amountXof";

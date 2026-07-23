-- Additive only: a human-readable billing handle on Invoice and a staff-facing
-- label on Installment. Both nullable, so existing rows stay valid.
ALTER TABLE "Invoice" ADD COLUMN "number" TEXT;
ALTER TABLE "Installment" ADD COLUMN "label" TEXT;

-- Backfill deterministic BILL-<year>-<seq> handles for invoices raised before the
-- column existed, numbered per calendar year in creation order. Touches only the
-- new column; amounts, status and settlement data are untouched.
WITH numbered AS (
  SELECT
    id,
    'BILL-' || to_char("createdAt", 'YYYY') || '-' ||
      lpad(
        (row_number() OVER (
          PARTITION BY date_part('year', "createdAt")
          ORDER BY "createdAt", id
        ))::text,
        3, '0'
      ) AS num
  FROM "Invoice"
  WHERE "number" IS NULL
)
UPDATE "Invoice" AS i
SET "number" = n.num
FROM numbered AS n
WHERE i.id = n.id;

CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

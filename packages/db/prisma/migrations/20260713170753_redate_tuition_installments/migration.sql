-- Align existing standard-tuition schedules to the official DAUST payment sheet:
-- installments due Aug 5 / Nov 5 / Jan 5 / Mar 5 (previously #1 was each student's
-- enrolment date). Scoped to the 4-installment, full-annual-tuition (2,975,000 XOF)
-- plans so ad-hoc single-installment charges are never touched.

WITH tuition_plans AS (
  SELECT p.id AS plan_id
  FROM "PaymentPlan" p
  JOIN "Invoice" inv ON inv.id = p."invoiceId"
  JOIN "Installment" i ON i."planId" = p.id
  WHERE inv."totalAmount" = 2975000
  GROUP BY p.id
  HAVING COUNT(i.id) = 4
)
UPDATE "Installment" i
SET "dueDate" = CASE i."sequence"
  WHEN 1 THEN TIMESTAMPTZ '2026-08-05 00:00:00+00'
  WHEN 2 THEN TIMESTAMPTZ '2026-11-05 00:00:00+00'
  WHEN 3 THEN TIMESTAMPTZ '2027-01-05 00:00:00+00'
  WHEN 4 THEN TIMESTAMPTZ '2027-03-05 00:00:00+00'
  ELSE i."dueDate"
END
FROM tuition_plans tp
WHERE i."planId" = tp.plan_id;

-- Clear any stale 'overdue' flag on those unpaid installments: none of the new dates
-- are in the past, so the dynamic overdue check will re-derive correctly from here.
UPDATE "Installment" i
SET "status" = 'pending'
FROM "PaymentPlan" p
JOIN "Invoice" inv ON inv.id = p."invoiceId"
WHERE i."planId" = p.id
  AND inv."totalAmount" = 2975000
  AND i."amountPaid" = 0
  AND i."status" = 'overdue';

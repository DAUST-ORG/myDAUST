-- Payment-plan deadlines are Senegal business dates, not instants. Interpret the legacy
-- timestamp as UTC (Prisma's storage convention), take the calendar date seen in Dakar,
-- then persist the result using PostgreSQL's date type. The USING expressions are safe for
-- existing nullable template dates and do not depend on the database session timezone.
ALTER TABLE "Installment"
  ALTER COLUMN "dueDate" TYPE DATE
  USING ((("dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dakar')::date);

ALTER TABLE "FeePlanInstallment"
  ALTER COLUMN "dueOn" TYPE DATE
  USING (
    CASE
      WHEN "dueOn" IS NULL THEN NULL
      ELSE (("dueOn" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Dakar')::date
    END
  );

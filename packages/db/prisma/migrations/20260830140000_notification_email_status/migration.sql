-- Mail-delivery outcome for the existing in-app Notification table. Additive only:
-- new enum, three new columns, one partial index. Existing rows get emailStatus =
-- 'not_attempted' by default, preserving current behaviour.

CREATE TYPE "NotificationEmailStatus" AS ENUM (
    'not_attempted',
    'sent',
    'deferred',
    'failed'
);

ALTER TABLE "Notification"
    ADD COLUMN "emailStatus" "NotificationEmailStatus" NOT NULL DEFAULT 'not_attempted',
    ADD COLUMN "emailAttemptedAt" TIMESTAMP(3),
    ADD COLUMN "emailError" TEXT;

CREATE INDEX "Notification_emailStatus_idx" ON "Notification"("emailStatus")
    WHERE "emailStatus" IN ('deferred', 'failed');

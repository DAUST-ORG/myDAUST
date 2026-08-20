-- In-app notifications. Additive only: one new table, no changes to existing tables
-- and no backfill, so applying this against production creates and touches nothing else.
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_personId_readAt_idx" ON "Notification"("personId", "readAt");
CREATE INDEX "Notification_personId_createdAt_idx" ON "Notification"("personId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Person account lifecycle: suspension and session invalidation. Additive only: one enum,
-- four new columns on Person, no changes to any other table and no backfill. Every existing
-- row defaults to 'active' with sessionVersion 0, which is the pre-migration behaviour.
--
-- sessionVersion exists because roles and account state live inside a 7-day JWT cookie.
-- It is signed into the token at login and compared on every authenticated request, so
-- bumping it ends that person's live sessions immediately. Suspending without bumping it
-- would leave a suspended account fully privileged until its cookie expired -- which is
-- precisely the case where revocation has to work.

CREATE TYPE "PersonStatus" AS ENUM ('active', 'suspended');

ALTER TABLE "Person" ADD COLUMN "status" "PersonStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "Person" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Person" ADD COLUMN "suspendedById" TEXT;
ALTER TABLE "Person" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- A suspension always carries its timestamp, so "when was this account disabled" is
-- answerable from the row itself rather than only from the audit log.
ALTER TABLE "Person" ADD CONSTRAINT "Person_suspended_has_timestamp"
    CHECK (("status" = 'active' AND "suspendedAt" IS NULL)
        OR ("status" = 'suspended' AND "suspendedAt" IS NOT NULL));

CREATE INDEX "Person_status_idx" ON "Person"("status");

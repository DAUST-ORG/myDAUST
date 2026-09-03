-- Unblock: all students with active logins can access the portal again.
-- Only truly new students (no password set yet) will see the major-selection prompt.
UPDATE "Student" SET "majorSelectionDone" = true WHERE "passwordHash" IS NOT NULL;

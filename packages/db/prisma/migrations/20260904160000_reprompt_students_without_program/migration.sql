-- Re-prompt the students that 20260903140000_unblock_all_students over-reached on.
--
-- That migration set majorSelectionDone = true for every student holding a
-- password. It was the right call at the time: the major-selection modal is
-- undismissable and PortalShell rendered nothing behind it, so every prompted
-- student was staring at a blank page.
--
-- Both halves of that have since changed. The blank-page gate is gone, so the
-- modal now overlays a working page, and a registration-readiness audit showed
-- the cost of the blanket unblock: recommendations key off Student.programId,
-- and 386 of 400 active students have none. 44 of those hold a password, so
-- they were marked done and can no longer be asked for the programme that their
-- recommendations depend on.
--
-- Scope is deliberately narrow. A student is re-prompted only if all three hold:
--   * their record is active,
--   * they have NO programme on file,
--   * they have a password (a student without one is prompted at first login
--     anyway, so touching them would be a no-op).
-- Anyone who already has a programme keeps majorSelectionDone = true and is
-- never re-prompted.
--
-- Expected: 44 rows on production at the time of writing.
UPDATE "Student" s
   SET "majorSelectionDone" = false
  FROM "Person" p
 WHERE p.id = s."personId"
   AND s."recordStatus" = 'active'
   AND s."programId" IS NULL
   AND p."passwordHash" IS NOT NULL;

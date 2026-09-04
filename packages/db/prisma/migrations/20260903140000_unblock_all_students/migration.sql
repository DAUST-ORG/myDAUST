-- Unblock: every student with a password keeps working. Only genuinely new
-- accounts (no password set) see the major-selection prompt.
--
-- passwordHash lives on Person, not Student, so this joins rather than
-- filtering on a column Student does not have.
UPDATE "Student" s
   SET "majorSelectionDone" = true
  FROM "Person" p
 WHERE p.id = s."personId"
   AND p."passwordHash" IS NOT NULL;

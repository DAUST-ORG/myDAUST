-- Reset: force every student to re-confirm their major/program on next login.
UPDATE "Student" SET "majorSelectionDone" = false;

-- A parent may be retained as an authoritative contact before an email address
-- is known. Every other Person remains an email-backed identity, and a
-- contact-only parent cannot receive password credentials.
ALTER TABLE "Person"
  ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "Person"
  ADD CONSTRAINT "Person_email_nonblank_check"
    CHECK ("email" IS NULL OR length(btrim("email")) > 0),
  ADD CONSTRAINT "Person_null_email_parent_only_check"
    CHECK ("email" IS NOT NULL OR "kind" = 'parent'),
  ADD CONSTRAINT "Person_null_email_no_password_check"
    CHECK ("email" IS NOT NULL OR "passwordHash" IS NULL),
  ADD CONSTRAINT "Person_null_email_no_forced_change_check"
    CHECK ("email" IS NOT NULL OR "mustChangePassword" = false);

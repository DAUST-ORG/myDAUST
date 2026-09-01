-- Helpdesk attachments: add a dedicated private storage key.
--
-- The public /uploads/:filename route serves every object stored under the
-- `uploads/` S3 prefix and any file in the local `uploads/` directory, which
-- would expose helpdesk attachments to anyone who guesses the random UUID
-- filename. The fix is to require an authorized read path: attachments now
-- live under `helpdesk/` (local disk) or the dedicated S3 key stored in
-- `storageKey`, and the bytes only leave the API through the ticket-scoped
-- `GET /helpdesk/attachments/:id` route.
--
-- Existing rows are back-filled with a placeholder. Anything created before
-- this migration is unreadable through the new authorized endpoint (it never
-- had a private key), but the row stays so the audit history is preserved;
-- the previous `/uploads/...` URLs, if exposed, stop working the moment the
-- old public bucket entries are swept. The CHECK below caps the length so
-- the field can never store an unbounded user-controlled string.
ALTER TABLE "HelpdeskAttachment"
    ADD COLUMN "storageKey" TEXT NOT NULL DEFAULT '';

ALTER TABLE "HelpdeskAttachment"
    ADD CONSTRAINT "HelpdeskAttachment_storageKey_length_check"
    CHECK (char_length("storageKey") BETWEEN 0 AND 255);

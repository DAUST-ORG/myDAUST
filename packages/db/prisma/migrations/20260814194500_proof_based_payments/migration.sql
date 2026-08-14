-- Expand the existing wire-proof table in place so historical evidence and reviewer
-- provenance remain attached to the same durable records.
CREATE TYPE "PaymentAuditStatus" AS ENUM ('unreviewed', 'reviewed', 'flagged');

ALTER TABLE "WireTransferSubmission"
  ADD COLUMN "resumeToken" TEXT,
  ADD COLUMN "activeKey" TEXT,
  ADD COLUMN "auditStatus" "PaymentAuditStatus" NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'wire',
  ADD COLUMN "applicantId" TEXT,
  ADD COLUMN "diningOrderId" TEXT,
  ADD COLUMN "payerProofSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "verificationProofObjectKey" TEXT,
  ADD COLUMN "verificationProofFileName" TEXT,
  ADD COLUMN "verificationProofMimeType" TEXT,
  ADD COLUMN "verificationProofSize" INTEGER,
  ADD COLUMN "auditedById" TEXT,
  ADD COLUMN "auditedByName" TEXT,
  ADD COLUMN "auditedByEmail" TEXT,
  ADD COLUMN "auditedAt" TIMESTAMP(3),
  ADD COLUMN "auditNote" TEXT;

ALTER TABLE "WireTransferSubmission"
  ALTER COLUMN "status" SET DEFAULT 'awaiting_proof',
  ALTER COLUMN "proofObjectKey" DROP NOT NULL,
  ALTER COLUMN "proofFileName" DROP NOT NULL,
  ALTER COLUMN "proofMimeType" DROP NOT NULL,
  ALTER COLUMN "proofSize" DROP NOT NULL;

UPDATE "WireTransferSubmission"
SET "payerProofSubmittedAt" = COALESCE("payerProofSubmittedAt", "createdAt")
WHERE "proofObjectKey" IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE('invoice:' || "invoiceId", 'link:' || "paymentLinkId", id)
      ORDER BY "createdAt" DESC, id DESC
    ) AS rn
  FROM "WireTransferSubmission"
  WHERE "status" = 'submitted'
)
UPDATE "WireTransferSubmission" submission
SET
  "activeKey" = CASE
    WHEN ranked.rn = 1 AND submission."invoiceId" IS NOT NULL THEN 'invoice:' || submission."invoiceId"
    WHEN ranked.rn = 1 AND submission."paymentLinkId" IS NOT NULL THEN 'link:' || submission."paymentLinkId"
    ELSE NULL
  END
FROM ranked
WHERE ranked.id = submission.id;

-- Preserve the old global bank settings as the bank branch of the generalized config.
INSERT INTO "AppSetting" (key, "valueJson", "updatedAt")
SELECT
  'payment_method_config',
  jsonb_build_object(
    'wave', jsonb_build_object(
      'enabled', false, 'phoneNumber', '', 'merchantNumber', '',
      'instructions', '', 'qrAsset', NULL
    ),
    'orangeMoney', jsonb_build_object(
      'enabled', false, 'phoneNumber', '', 'merchantNumber', '',
      'instructions', '', 'qrAsset', NULL
    ),
    'bank', jsonb_build_object(
      'enabled', COALESCE(("valueJson"->>'enabled')::boolean, false),
      'bankName', COALESCE("valueJson"->>'bankName', ''),
      'beneficiary', COALESCE("valueJson"->>'beneficiary', ''),
      'accountNumber', COALESCE("valueJson"->>'accountNumber', ''),
      'iban', COALESCE("valueJson"->>'iban', ''),
      'swift', COALESCE("valueJson"->>'swift', ''),
      'branch', COALESCE("valueJson"->>'branch', ''),
      'instructions', COALESCE("valueJson"->>'instructions', '')
    ),
    'notificationRecipients', COALESCE("valueJson"->'notificationRecipients', '["finance@daust.edu.sn"]'::jsonb)
  ),
  NOW()
FROM "AppSetting"
WHERE key = 'wire_payment_config'
ON CONFLICT (key) DO NOTHING;

ALTER TABLE "Payment" ALTER COLUMN "provider" SET DEFAULT 'manual';

CREATE UNIQUE INDEX "WireTransferSubmission_resumeToken_key"
  ON "WireTransferSubmission"("resumeToken");
CREATE UNIQUE INDEX "WireTransferSubmission_activeKey_key"
  ON "WireTransferSubmission"("activeKey");
CREATE INDEX "WireTransferSubmission_auditStatus_reviewedAt_idx"
  ON "WireTransferSubmission"("auditStatus", "reviewedAt");
CREATE INDEX "WireTransferSubmission_applicantId_idx"
  ON "WireTransferSubmission"("applicantId");
CREATE INDEX "WireTransferSubmission_diningOrderId_idx"
  ON "WireTransferSubmission"("diningOrderId");

ALTER TABLE "WireTransferSubmission"
  ADD CONSTRAINT "WireTransferSubmission_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WireTransferSubmission_diningOrderId_fkey"
    FOREIGN KEY ("diningOrderId") REFERENCES "DiningOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WireTransferSubmission_auditedById_fkey"
    FOREIGN KEY ("auditedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The deployment preflight expects this set to be empty. If it is not, preserve the
-- attempt as a resumable proof draft instead of silently cancelling money the payer may
-- already have sent. Only one draft per invoice is active; older duplicates remain visible.
WITH pending AS (
  SELECT
    p.*,
    person.email AS "studentEmail",
    ROW_NUMBER() OVER (PARTITION BY p."invoiceId" ORDER BY p."createdAt" DESC, p.id DESC) AS rn
  FROM "Payment" p
  JOIN "Student" student ON student.id = p."studentId"
  JOIN "Person" person ON person.id = student."personId"
  WHERE p.status = 'pending'
    AND p.provider = 'paytech'
    AND NOT EXISTS (
      SELECT 1 FROM "WireTransferSubmission" submission
      WHERE submission."paymentId" = p.id
    )
)
INSERT INTO "WireTransferSubmission" (
  id, "resumeToken", status, source, "studentId", "invoiceId", "paymentId", "submittedAmountXof",
  "contactEmail", "submittedById", "submittedByEmail", "bankSnapshot", method,
  "activeKey", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'awaiting_proof', source, "studentId", "invoiceId", id, amount,
  COALESCE("initiatedByEmail", "studentEmail"), "initiatedById", "initiatedByEmail",
  jsonb_build_object(
    'method', CASE WHEN method IN ('wave', 'orange_money') THEN method::text ELSE 'wire' END,
    'enabled', true,
    'label', 'Legacy payment',
    'instructions', 'Upload the original transaction screenshot for Finance review.',
    'legacyProvider', 'paytech',
    'legacyReference', "providerRef"
  ),
  CASE WHEN method IN ('wave', 'orange_money') THEN method ELSE 'wire'::"PaymentMethod" END,
  CASE
    WHEN rn = 1 AND NOT EXISTS (
      SELECT 1
      FROM "WireTransferSubmission" existing
      WHERE existing."activeKey" = 'invoice:' || pending."invoiceId"
    ) THEN 'invoice:' || "invoiceId"
    ELSE NULL
  END,
  "createdAt", NOW()
FROM pending;

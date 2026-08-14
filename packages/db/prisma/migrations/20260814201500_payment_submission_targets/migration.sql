-- The generalized submission table preserves the legacy physical table name. Expand
-- its original invoice-or-link check so application fees and dining orders can use the
-- same proof workflow without weakening the requirement that every row has a target.
ALTER TABLE "WireTransferSubmission"
  DROP CONSTRAINT "WireTransferSubmission_target_check";

ALTER TABLE "WireTransferSubmission"
  ADD CONSTRAINT "WireTransferSubmission_target_check"
  CHECK (
    "invoiceId" IS NOT NULL
    OR "paymentLinkId" IS NOT NULL
    OR "applicantId" IS NOT NULL
    OR "diningOrderId" IS NOT NULL
  );

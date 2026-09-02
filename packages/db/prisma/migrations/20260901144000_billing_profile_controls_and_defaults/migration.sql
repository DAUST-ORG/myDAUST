-- This second phase adds database-level controls after the additive tables and
-- nullable rollout columns exist. It also seeds the approved initial catalog for
-- the 2026–2027 cutover year only; other years are configured explicitly
-- through the application approval workflow.

ALTER TABLE "WorkbookCutoverBatch"
  ADD CONSTRAINT "WorkbookCutoverBatch_hashes_check" CHECK (
    "sourceWorkbookSha256" ~ '^[0-9a-f]{64}$'
    AND "sourceExtractionSha256" ~ '^[0-9a-f]{64}$'
    AND "identityManifestSha256" ~ '^[0-9a-f]{64}$'
    AND "rosterSnapshotSha256" ~ '^[0-9a-f]{64}$'
    AND "confirmationPlanSha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "WorkbookCutoverBatch_labels_check" CHECK (
    length(btrim("sourceFileName")) > 0
    AND length(btrim("academicYearLabel")) > 0
  ),
  ADD CONSTRAINT "WorkbookCutoverBatch_counts_check" CHECK (
    "workbookRowCount" > 0
    AND "productionStudentCount" >= 0
    AND "applicantCount" >= 0
    AND "workbookLinkedRows" >= 0
    AND "workbookCreatedRows" >= 0
    AND "workbookDuplicateRows" >= 0
    AND "productionLinkedStudents" >= 0
    AND "productionKeptStudents" >= 0
    AND "productionArchivedStudents" >= 0
    AND "preservedApplicants" >= 0
    AND "workbookLinkedRows" + "workbookCreatedRows" + "workbookDuplicateRows" <= "workbookRowCount"
    AND "productionLinkedStudents" + "productionKeptStudents" + "productionArchivedStudents" <= "productionStudentCount"
    AND "preservedApplicants" <= "applicantCount"
  ),
  ADD CONSTRAINT "WorkbookCutoverBatch_money_check" CHECK (
    "sourceBilledXof" >= 0
    AND "sourcePaidXof" >= 0
    AND "includedBilledXof" >= 0
    AND "includedPaidXof" >= 0
    AND "excludedBilledXof" >= 0
    AND "excludedPaidXof" >= 0
    AND "includedBilledXof" + "excludedBilledXof" <= "sourceBilledXof"
    AND "includedPaidXof" + "excludedPaidXof" <= "sourcePaidXof"
  ),
  ADD CONSTRAINT "WorkbookCutoverBatch_imported_reconciliation_check" CHECK (
    "status" <> 'imported'::"WorkbookCutoverBatchStatus"
    OR (
      "importedAt" IS NOT NULL
      AND "workbookLinkedRows" + "workbookCreatedRows" + "workbookDuplicateRows" = "workbookRowCount"
      AND "productionLinkedStudents" + "productionKeptStudents" + "productionArchivedStudents" = "productionStudentCount"
      AND "preservedApplicants" = "applicantCount"
      AND "includedBilledXof" + "excludedBilledXof" = "sourceBilledXof"
      AND "includedPaidXof" + "excludedPaidXof" = "sourcePaidXof"
    )
  );

ALTER TABLE "WorkbookCutoverSourceRecord"
  ADD CONSTRAINT "WorkbookCutoverSourceRecord_hashes_check" CHECK (
    "sourceKeySha256" ~ '^[0-9a-f]{64}$'
    AND "sourceFingerprintSha256" ~ '^[0-9a-f]{64}$'
    AND ("sourceClaimSha256" IS NULL OR "sourceClaimSha256" ~ '^[0-9a-f]{64}$')
    AND ("reviewSignatureSha256" IS NULL OR "reviewSignatureSha256" ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "WorkbookCutoverSourceRecord_key_check" CHECK (
    length(btrim("sourceKey")) > 0
    AND ("sourceRowNumber" IS NULL OR "sourceRowNumber" > 0)
    AND ("sourceBilledXof" IS NULL OR "sourceBilledXof" >= 0)
    AND ("sourcePaidXof" IS NULL OR "sourcePaidXof" >= 0)
    AND ("linkedWorkbookRecordId" IS NULL OR "linkedWorkbookRecordId" <> "id")
    AND ("duplicateOfRecordId" IS NULL OR "duplicateOfRecordId" <> "id")
    AND ("priorRecordId" IS NULL OR "priorRecordId" <> "id")
  ),
  ADD CONSTRAINT "WorkbookCutoverSourceRecord_signed_review_check" CHECK (
    (
      "disposition" IS NULL
      AND "reviewedById" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewReason" IS NULL
      AND "reviewSignatureSha256" IS NULL
    )
    OR (
      "disposition" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND "reviewReason" IS NOT NULL
      AND length(btrim("reviewReason")) > 0
      AND "reviewSignatureSha256" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "WorkbookCutoverSourceRecord_source_kind_check" CHECK (
    (
      "sourceKind" = 'workbook_row'::"WorkbookCutoverSourceKind"
      AND "sourceSheet" IS NOT NULL
      AND length(btrim("sourceSheet")) > 0
      AND "sourceRowNumber" IS NOT NULL
      AND "sourceStudentClaim" IS NOT NULL
      AND length(btrim("sourceStudentClaim")) > 0
      AND "sourceBilledXof" IS NOT NULL
      AND "sourcePaidXof" IS NOT NULL
      AND "sourceClaimSha256" IS NOT NULL
    )
    OR (
      "sourceKind" = 'production_student'::"WorkbookCutoverSourceKind"
      AND "studentId" IS NOT NULL
      AND "sourceSheet" IS NULL
      AND "sourceRowNumber" IS NULL
      AND "sourceBilledXof" IS NULL
      AND "sourcePaidXof" IS NULL
    )
    OR (
      "sourceKind" = 'applicant'::"WorkbookCutoverSourceKind"
      AND "applicantId" IS NOT NULL
      AND "sourceSheet" IS NULL
      AND "sourceRowNumber" IS NULL
      AND "sourceBilledXof" IS NULL
      AND "sourcePaidXof" IS NULL
    )
  ),
  ADD CONSTRAINT "WorkbookCutoverSourceRecord_disposition_check" CHECK (
    "disposition" IS NULL
    OR (
      "sourceKind" = 'workbook_row'::"WorkbookCutoverSourceKind"
      AND "disposition" = 'link_existing_student'::"WorkbookCutoverDisposition"
      AND "studentId" IS NOT NULL
      AND "duplicateOfRecordId" IS NULL
    )
    OR (
      "sourceKind" = 'workbook_row'::"WorkbookCutoverSourceKind"
      AND "disposition" = 'create_student'::"WorkbookCutoverDisposition"
      AND "duplicateOfRecordId" IS NULL
      AND ("appliedAt" IS NULL OR "studentId" IS NOT NULL)
    )
    OR (
      "sourceKind" = 'workbook_row'::"WorkbookCutoverSourceKind"
      AND "disposition" = 'reviewed_duplicate'::"WorkbookCutoverDisposition"
      AND "duplicateOfRecordId" IS NOT NULL
      AND "billingProfileId" IS NULL
      AND "canonicalInvoiceId" IS NULL
      AND "reconstructionPaymentId" IS NULL
    )
    OR (
      "sourceKind" = 'production_student'::"WorkbookCutoverSourceKind"
      AND "disposition" = 'link_workbook_row'::"WorkbookCutoverDisposition"
      AND "studentId" IS NOT NULL
      AND "linkedWorkbookRecordId" IS NOT NULL
    )
    OR (
      "sourceKind" = 'production_student'::"WorkbookCutoverSourceKind"
      AND "disposition" IN (
        'keep_exception'::"WorkbookCutoverDisposition",
        'archive_student'::"WorkbookCutoverDisposition"
      )
      AND "studentId" IS NOT NULL
    )
    OR (
      "sourceKind" = 'applicant'::"WorkbookCutoverSourceKind"
      AND "disposition" = 'preserve_applicant'::"WorkbookCutoverDisposition"
      AND "applicantId" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "WorkbookCutoverSourceRecord_applied_workbook_check" CHECK (
    "appliedAt" IS NULL
    OR "sourceKind" <> 'workbook_row'::"WorkbookCutoverSourceKind"
    OR "disposition" = 'reviewed_duplicate'::"WorkbookCutoverDisposition"
    OR (
      "studentId" IS NOT NULL
      AND "billingProfileId" IS NOT NULL
      AND "canonicalInvoiceId" IS NOT NULL
      AND (
        "sourcePaidXof" = 0
        OR "reconstructionPaymentId" IS NOT NULL
      )
    )
  );

ALTER TABLE "WorkbookCutoverFinancialProvenance"
  ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_hashes_check" CHECK (
    "snapshotSha256" ~ '^[0-9a-f]{64}$'
    AND "eventClaimSha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_amounts_check" CHECK (
    -- Invoice amounts are signed: historical account-credit invoices are
    -- negative and must remain representable when the cutover voids them.
    ("originalPaidXof" IS NULL OR "originalPaidXof" >= 0)
    AND (
      "kind" <> 'payment_superseded'::"WorkbookCutoverFinancialEventKind"
      OR "originalAmountXof" >= 0
    )
  ),
  ADD CONSTRAINT "WorkbookCutoverFinancialProvenance_kind_check" CHECK (
    (
      "kind" = 'invoice_void'::"WorkbookCutoverFinancialEventKind"
      AND "invoiceId" IS NOT NULL
      AND "originalStatus" IS NOT NULL
      AND "originalAmountXof" IS NOT NULL
      AND "originalPaidXof" IS NOT NULL
    )
    OR (
      "kind" = 'payment_superseded'::"WorkbookCutoverFinancialEventKind"
      AND "paymentId" IS NOT NULL
      AND "originalStatus" IS NOT NULL
      AND "originalAmountXof" IS NOT NULL
    )
    OR (
      "kind" = 'new_invoice'::"WorkbookCutoverFinancialEventKind"
      AND "invoiceId" IS NOT NULL
    )
    OR (
      "kind" = 'reconstruction_payment'::"WorkbookCutoverFinancialEventKind"
      AND "paymentId" IS NOT NULL
      AND "recognizedOn" IS NOT NULL
    )
    OR (
      "kind" = 'account_credit'::"WorkbookCutoverFinancialEventKind"
      AND "invoiceId" IS NOT NULL
      AND "recognizedOn" IS NOT NULL
    )
  );

ALTER TABLE "BillingServiceOption"
  ADD CONSTRAINT "BillingServiceOption_values_check" CHECK (
    length(btrim("code")) > 0
    AND length(btrim("label")) > 0
    AND "sortOrder" >= 0
    AND (
      (
        "calculation" = 'fixed'::"BillingServiceCalculation"
        AND "amountXof" IS NOT NULL
        AND "amountXof" >= 0
        AND "percentageBasisPoints" IS NULL
        AND "basisServiceKind" IS NULL
      )
      OR (
        "calculation" = 'percentage_of_service'::"BillingServiceCalculation"
        AND "amountXof" IS NULL
        AND "percentageBasisPoints" BETWEEN 1 AND 10000
        AND "kind" = 'housing_caution'::"BillingServiceKind"
        AND "basisServiceKind" = 'housing'::"BillingServiceKind"
      )
    )
    AND (
      "code" <> 'none'
      OR (
        "calculation" = 'fixed'::"BillingServiceCalculation"
        AND "amountXof" = 0
      )
    )
  );

ALTER TABLE "BillingAdjustmentDefinition"
  ADD CONSTRAINT "BillingAdjustmentDefinition_values_check" CHECK (
    length(btrim("key")) > 0
    AND length(btrim("label")) > 0
    AND "sortOrder" >= 0
    AND (
      (
        "calculation" = 'percentage'::"BillingAdjustmentCalculation"
        AND "percentageBasisPoints" BETWEEN 1 AND 10000
        AND "fixedAmountXof" IS NULL
        AND "basis" <> 'manual'::"BillingAdjustmentBasis"
      )
      OR (
        "calculation" = 'fixed'::"BillingAdjustmentCalculation"
        AND "fixedAmountXof" IS NOT NULL
        AND "fixedAmountXof" > 0
        AND "percentageBasisPoints" IS NULL
      )
      OR (
        "calculation" = 'manual'::"BillingAdjustmentCalculation"
        AND "percentageBasisPoints" IS NULL
        AND "fixedAmountXof" IS NULL
        AND "requiresApproval" = true
      )
    )
  );

ALTER TABLE "AnnualBillingProfile"
  ADD CONSTRAINT "AnnualBillingProfile_values_check" CHECK (
    "revision" >= 0
    AND "grossChargesXof" >= 0
    AND "netBilledXof" >= 0
    AND ("sourceRowNumber" IS NULL OR "sourceRowNumber" > 0)
    AND ("sourceWorkbookSha256" IS NULL OR "sourceWorkbookSha256" ~ '^[0-9a-f]{64}$')
    AND ("sourceRowFingerprintSha256" IS NULL OR "sourceRowFingerprintSha256" ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "AnnualBillingProfile_workbook_source_check" CHECK (
    "sourceKind" <> 'workbook'::"BillingProfileSourceKind"
    OR (
      "sourceWorkbookSha256" IS NOT NULL
      AND "sourceSheet" IS NOT NULL
      AND length(btrim("sourceSheet")) > 0
      AND "sourceRowNumber" IS NOT NULL
      AND "sourceRowFingerprintSha256" IS NOT NULL
      AND "sourceAsOfDate" IS NOT NULL
    )
  );

ALTER TABLE "BillingProfileSelection"
  ADD CONSTRAINT "BillingProfileSelection_values_check" CHECK (
    length(btrim("academicYearLabel")) > 0
    AND length(btrim("optionCode")) > 0
    AND length(btrim("label")) > 0
    AND "amountXof" >= 0
    AND (
      (
        "percentageBasisOptionId" IS NULL
        AND "percentageBasisOptionCode" IS NULL
        AND "percentageBasisServiceKind" IS NULL
      )
      OR (
        "percentageBasisOptionId" IS NOT NULL
        AND "percentageBasisOptionCode" IS NOT NULL
        AND length(btrim("percentageBasisOptionCode")) > 0
        AND "percentageBasisOptionCode" <> 'none'
        AND "kind" = 'housing_caution'::"BillingServiceKind"
        AND "percentageBasisServiceKind" = 'housing'::"BillingServiceKind"
      )
    )
  );

ALTER TABLE "HousingAssignment"
  ADD CONSTRAINT "HousingAssignment_billed_service_kind_check" CHECK (
    "billedServiceKind" = 'housing'::"BillingServiceKind"
  );

ALTER TABLE "BillingProfileAward"
  ADD CONSTRAINT "BillingProfileAward_values_check" CHECK (
    length(btrim("definitionKey")) > 0
    AND length(btrim("label")) > 0
    AND "amountXof" >= 0
    AND ("basisAmountXof" IS NULL OR "basisAmountXof" >= 0)
    AND ("percentageBasisPoints" IS NULL OR "percentageBasisPoints" BETWEEN 0 AND 10000)
  );

ALTER TABLE "InvoiceAdjustment"
  ADD CONSTRAINT "InvoiceAdjustment_values_check" CHECK (
    length(btrim("code")) > 0
    AND length(btrim("label")) > 0
    AND "amountXof" >= 0
    AND ("basisAmountXof" IS NULL OR "basisAmountXof" >= 0)
    AND ("percentageBasisPoints" IS NULL OR "percentageBasisPoints" BETWEEN 0 AND 10000)
  );

-- The cutover uses one annual invoice term. It is separate from teaching
-- semesters so all four workbook installments can share a single canonical
-- annual invoice while retaining their own due dates.
INSERT INTO "Term" (
  "id", "name", "startDate", "endDate", "addDeadline", "dropDeadline",
  "academicYearId", "semester", "status"
)
SELECT
  gen_random_uuid()::text,
  '2026–2027 annual workbook billing',
  TIMESTAMP '2026-08-25 00:00:00',
  TIMESTAMP '2027-03-05 00:00:00',
  NULL,
  NULL,
  year."id",
  'Annual',
  'planning'
FROM "AcademicYear" year
WHERE year."label" = '2026–2027'
ON CONFLICT ("name") DO UPDATE SET
  "startDate" = EXCLUDED."startDate",
  "endDate" = EXCLUDED."endDate",
  "addDeadline" = NULL,
  "dropDeadline" = NULL,
  "academicYearId" = EXCLUDED."academicYearId",
  "semester" = EXCLUDED."semester",
  "status" = EXCLUDED."status";

-- Initial service catalog. No half cafeteria plan is inserted: it remains
-- unavailable until Finance approves a price.
INSERT INTO "BillingServiceOption" (
  "id", "academicYearLabel", "kind", "code", "label", "description",
  "calculation", "amountXof", "percentageBasisPoints", "basisServiceKind",
  "costCenterCode", "refundable", "defaultSelected", "active", "sortOrder",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  year."label",
  option.kind::"BillingServiceKind",
  option.code,
  option.label,
  option.description,
  option.calculation::"BillingServiceCalculation",
  option.amount_xof,
  option.percentage_basis_points,
  option.basis_kind::"BillingServiceKind",
  option.cost_center,
  option.refundable,
  option.default_selected,
  true,
  option.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AcademicYear" year
CROSS JOIN (VALUES
  ('housing', 'none', 'No housing', 'No DAUST housing charge.', 'fixed', 0, NULL::integer, NULL, '3700', false, true, 0),
  ('housing', 'double', 'Double room', 'Shared double room.', 'fixed', 680000, NULL::integer, NULL, '3700', false, false, 10),
  ('housing', 'individual', 'Individual room', 'Private individual room.', 'fixed', 1360000, NULL::integer, NULL, '3700', false, false, 20),
  ('housing', 'double_ac', 'Double room with AC', 'Shared double room with air conditioning.', 'fixed', 800000, NULL::integer, NULL, '3700', false, false, 30),
  ('housing', 'individual_ac', 'Individual room with AC', 'Private individual room with air conditioning.', 'fixed', 1600000, NULL::integer, NULL, '3700', false, false, 40),
  ('cafeteria', 'none', 'No cafeteria plan', 'No annual cafeteria charge.', 'fixed', 0, NULL::integer, NULL, '3600', false, true, 0),
  ('cafeteria', 'full', 'Full cafeteria plan', 'Full annual cafeteria plan.', 'fixed', 630000, NULL::integer, NULL, '3600', false, false, 10),
  ('insurance', 'none', 'No insurance', 'No annual insurance charge.', 'fixed', 0, NULL::integer, NULL, '9100', false, false, 0),
  ('insurance', 'annual', 'Annual insurance', 'Annual student insurance.', 'fixed', 10000, NULL::integer, NULL, '9100', false, true, 10),
  ('housing_caution', 'none', 'No housing caution', 'No refundable housing caution.', 'fixed', 0, NULL::integer, NULL, '3700', true, true, 0),
  ('housing_caution', 'housing_10_percent', 'Housing caution (10%)', 'Refundable caution equal to 10% of the selected housing option.', 'percentage_of_service', NULL::integer, 1000, 'housing', '3700', true, false, 10)
) AS option(kind, code, label, description, calculation, amount_xof, percentage_basis_points, basis_kind, cost_center, refundable, default_selected, sort_order)
WHERE year."label" = '2026–2027'
ON CONFLICT ("academicYearLabel", "kind", "code") DO NOTHING;

INSERT INTO "BillingAdjustmentDefinition" (
  "id", "academicYearLabel", "key", "label", "description", "basis",
  "calculation", "stacking", "effect", "percentageBasisPoints",
  "fixedAmountXof", "requiresApproval", "active", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  year."label",
  definition.key,
  definition.label,
  definition.description,
  definition.basis::"BillingAdjustmentBasis",
  definition.calculation::"BillingAdjustmentCalculation",
  definition.stacking::"BillingAdjustmentStacking",
  definition.effect::"BillingAdjustmentEffect",
  definition.percentage_basis_points,
  definition.fixed_amount_xof,
  definition.requires_approval,
  true,
  definition.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AcademicYear" year
CROSS JOIN (VALUES
  ('merit_10', 'BAC merit 10%', 'Automatic BAC merit award.', 'tuition', 'percentage', 'exclusive', 'discount', 1000, NULL::integer, false, 10),
  ('merit_15', 'BAC merit 15%', 'Automatic BAC merit award.', 'tuition', 'percentage', 'exclusive', 'discount', 1500, NULL::integer, false, 20),
  ('merit_20', 'BAC merit 20%', 'Automatic BAC merit award.', 'tuition', 'percentage', 'exclusive', 'discount', 2000, NULL::integer, false, 30),
  ('family', 'Family award', 'Reviewed family award; amount is entered during approval.', 'tuition', 'manual', 'additive', 'discount', NULL::integer, NULL::integer, true, 40),
  ('somone_resident', 'Somone resident award', 'Reviewed Somone resident award.', 'tuition', 'manual', 'additive', 'discount', NULL::integer, NULL::integer, true, 50),
  ('full_scholarship', 'Full tuition scholarship', 'Full annual tuition scholarship; services remain billable.', 'tuition', 'percentage', 'exclusive', 'discount', 10000, NULL::integer, true, 60),
  ('s10', 'S10 award', 'Reviewed S10 award.', 'tuition', 'manual', 'additive', 'discount', NULL::integer, NULL::integer, true, 70),
  ('three_fpt', '3FPT award', 'Reviewed 3FPT award.', 'gross_charges', 'manual', 'exclusive', 'discount', NULL::integer, NULL::integer, true, 80),
  ('social_help', 'Social help', 'Reviewed social-help award.', 'tuition', 'manual', 'additive', 'discount', NULL::integer, NULL::integer, true, 90),
  ('january_enrollment', 'January enrollment adjustment', 'Reviewed January-enrollment adjustment.', 'tuition', 'manual', 'additive', 'discount', NULL::integer, NULL::integer, true, 100),
  ('manual_adjustment', 'Manual reconciliation adjustment', 'Reviewed manual reduction used only with explicit provenance.', 'manual', 'manual', 'additive', 'discount', NULL::integer, NULL::integer, true, 110),
  ('manual_charge', 'Manual reconciliation charge', 'Reviewed manual charge used only with explicit reconciliation provenance.', 'manual', 'manual', 'additive', 'charge', NULL::integer, NULL::integer, true, 120)
) AS definition(key, label, description, basis, calculation, stacking, effect, percentage_basis_points, fixed_amount_xof, requires_approval, sort_order)
WHERE year."label" = '2026–2027'
ON CONFLICT ("academicYearLabel", "key") DO NOTHING;

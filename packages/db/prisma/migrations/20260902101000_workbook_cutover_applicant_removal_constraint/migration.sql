-- PostgreSQL requires a newly added enum value to commit before a constraint
-- may reference it, so this check intentionally follows the enum migration.
ALTER TABLE "WorkbookCutoverSourceRecord"
DROP CONSTRAINT "WorkbookCutoverSourceRecord_disposition_check",
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
    AND "disposition" IN (
      'preserve_applicant'::"WorkbookCutoverDisposition",
      'remove_applicant'::"WorkbookCutoverDisposition"
    )
    AND "applicantId" IS NOT NULL
  )
);

ALTER TABLE "WorkbookCutoverBatch"
DROP CONSTRAINT "WorkbookCutoverBatch_imported_reconciliation_check",
ADD CONSTRAINT "WorkbookCutoverBatch_imported_reconciliation_check" CHECK (
  "removedApplicants" >= 0
  AND (
    "status" <> 'imported'::"WorkbookCutoverBatchStatus"
    OR (
      "importedAt" IS NOT NULL
      AND "workbookLinkedRows" + "workbookCreatedRows" + "workbookDuplicateRows" = "workbookRowCount"
      AND "productionLinkedStudents" + "productionKeptStudents" + "productionArchivedStudents" = "productionStudentCount"
      AND "preservedApplicants" + "removedApplicants" = "applicantCount"
      AND "includedBilledXof" + "excludedBilledXof" = "sourceBilledXof"
      AND "includedPaidXof" + "excludedPaidXof" = "sourcePaidXof"
    )
  )
);

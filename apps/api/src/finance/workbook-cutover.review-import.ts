import ExcelJS from "exceljs";
import JSZip from "jszip";
import { z } from "zod";
import { paymentBalanceExtractionRowDigest } from "./payment-balance-import.extraction.js";
import {
  WorkbookCutoverProductionSnapshotSchema,
  deriveWorkbookCutoverAdjustmentKeys,
  deriveWorkbookCutoverHousingOption,
  verifyWorkbookCutoverManifestExtraction,
  verifyWorkbookCutoverManifestProductionSnapshot,
  type WorkbookCutoverProductionSnapshot,
  type WorkbookCutoverProductionStudentSnapshot,
  type WorkbookCutoverTrustedExtraction,
} from "./workbook-cutover.extraction.js";
import {
  WORKBOOK_CUTOVER_BASELINE,
  WORKBOOK_CUTOVER_CAUTION_BPS,
  WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES,
  WORKBOOK_CUTOVER_REFERENCE_PACKAGE_XOF,
  WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF,
  WorkbookCutoverManifestSchema,
  canonicalWorkbookCutoverJson,
  workbookCutoverBillingTermLabel,
  workbookCutoverApplicantKey,
  workbookCutoverProductionStudentKey,
  workbookCutoverWorkbookRowKey,
  workbookCutoverReviewSignature,
  type WorkbookCutoverReviewSignatureContext,
  type WorkbookCutoverFinancialSnapshot,
  type WorkbookCutoverManifest,
  type WorkbookCutoverSignedReviewSchema,
} from "./workbook-cutover.manifest.js";

type SignedReview = z.infer<typeof WorkbookCutoverSignedReviewSchema>;
type ExtractionRow = WorkbookCutoverTrustedExtraction["rows"][number];
type Adjustment = WorkbookCutoverFinancialSnapshot["adjustments"][number];
type Component = WorkbookCutoverFinancialSnapshot["components"][number];

export const WORKBOOK_DECISION_HEADERS = [
  "Source Key",
  "Excel Row",
  "N/O",
  "Workbook Student Name",
  "Amount Billed",
  "Amount Paid",
  "Installment 1 Due",
  "Installment 2 Due",
  "Installment 3 Due",
  "Installment 4 Due",
  "Housing",
  "Cafeteria",
  "Insurance",
  "Caution",
  "Scholarship %",
  "Workbook Note",
  "Current Confirmed Student No",
  "Decision",
  "Official Student No",
  "New First Name",
  "New Last Name",
  "Duplicate Canonical Row",
  "Evidence / Reason",
  "Reviewer",
  "Review Date",
  "Completion",
  "Proposed Candidate / Warning",
] as const;

export const PRODUCTION_STUDENT_DECISION_HEADERS = [
  "Student ID",
  "Official Student No",
  "Production Name",
  "Record Status",
  "Person Status",
  "SIS Email",
  "Program",
  "Invoice Count",
  "Production Billed",
  "Production Paid",
  "Production Outstanding",
  "Confirmed Workbook Row",
  "Decision",
  "Workbook Row",
  "Evidence / Reason",
  "Reviewer",
  "Review Date",
  "Completion",
  "Warning",
] as const;

export const APPLICANT_DECISION_HEADERS = [
  "Applicant Source Key",
  "Applicant ID",
  "Applicant Name",
  "Email",
  "Program",
  "Stage",
  "Onboarding Status",
  "Linked Student ID",
  "Created At",
  "Cutover Disposition",
  "Source Fingerprint SHA-256",
  "Evidence / Reason",
  "Reviewer",
  "Review Date",
  "Completion",
] as const;

const EMAIL = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const NONEMPTY = z.string().trim().min(1);
const REASON = z.string().trim().min(10).max(2_000);

export interface WorkbookCutoverReviewWorkbookData {
  workbookRows: Array<{
    sourceKey: string;
    sourceRowNumber: number;
    category: string;
    sourceStudentName: string;
    amountBilledXof: number;
    amountPaidXof: number;
    installmentDueXof: [number, number, number, number];
    housing: string;
    cafeteria: string;
    insurance: string;
    caution: string;
    scholarshipOnTuition: number | null;
    sourceNote: string;
    decision: string;
    officialStudentNo: string;
    newFirstName: string;
    newLastName: string;
    duplicateCanonicalRow: string;
    reason: string;
    reviewer: string;
    reviewDate: string;
  }>;
  productionStudents: Array<{
    studentId: string;
    studentNo: string;
    productionName: string;
    recordStatus: string;
    personStatus: string;
    loginEmail: string;
    decision: string;
    workbookRow: string;
    reason: string;
    reviewer: string;
    reviewDate: string;
  }>;
  applicants: Array<{
    sourceKey: string;
    applicantId: string;
    applicantName: string;
    email: string;
    stage: string;
    sourceRecordSha256: string;
    disposition: string;
    reason: string;
    reviewer: string;
    reviewDate: string;
  }>;
}

export interface WorkbookCutoverReviewImportInput {
  reviewWorkbookBytes: Buffer;
  reviewWorkbookSha256: string;
  reviewWorkbookFileName: string;
  extraction: WorkbookCutoverTrustedExtraction;
  extractionSha256: string;
  extractionFileName: string;
  productionSnapshot: WorkbookCutoverProductionSnapshot;
  productionSnapshotSha256: string;
  productionSnapshotFileName: string;
}

/**
 * Reads only the three bounded decision tables. It never evaluates formulas:
 * review inputs must be literal values, while the display-only Completion
 * formula is ignored and recomputed by the importer.
 */
export async function readWorkbookCutoverReviewWorkbook(
  bytes: Buffer,
): Promise<WorkbookCutoverReviewWorkbookData> {
  const workbook = new ExcelJS.Workbook();
  // artifact-tool emits standards-compliant SpreadsheetML with an `x:`
  // element prefix, while ExcelJS 4 only recognizes the same namespace when
  // it is the default namespace. Normalize that prefix in memory; the signed
  // source bytes and their SHA-256 remain unchanged on disk and in signatures.
  const excelBytes = await excelJsCompatibleWorkbook(bytes);
  await workbook.xlsx.load(excelBytes);
  const expectedSheetNames = [
    "Summary & Controls",
    "Master List",
    "Workbook Decisions",
    "Production Students",
    "Pending Applications",
    "Source Crosswalk",
    "Decision Lists",
  ];
  const actualSheetNames = workbook.worksheets.map((sheet) => sheet.name);
  if (
    canonicalWorkbookCutoverJson([...actualSheetNames].sort()) !==
    canonicalWorkbookCutoverJson([...expectedSheetNames].sort())
  ) {
    throw new Error(
      "Review workbook sheet set does not match the signed-review contract",
    );
  }
  const requiredSheets = [
    "Workbook Decisions",
    "Production Students",
    "Pending Applications",
  ] as const;
  for (const name of requiredSheets) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet || sheet.state !== "visible") {
      throw new Error(`Required visible review sheet is missing: ${name}`);
    }
  }

  const workbookSheet = workbook.getWorksheet("Workbook Decisions")!;
  const productionSheet = workbook.getWorksheet("Production Students")!;
  const applicantSheet = workbook.getWorksheet("Pending Applications")!;
  assertHeaders(workbookSheet, WORKBOOK_DECISION_HEADERS);
  assertHeaders(productionSheet, PRODUCTION_STUDENT_DECISION_HEADERS);
  assertHeaders(applicantSheet, APPLICANT_DECISION_HEADERS);
  assertTableExtent(
    workbookSheet,
    WORKBOOK_CUTOVER_BASELINE.workbookRows,
    WORKBOOK_DECISION_HEADERS.length,
  );

  const workbookRows = Array.from(
    { length: WORKBOOK_CUTOVER_BASELINE.workbookRows },
    (_, index) => {
      const rowNumber = 6 + index;
      assertVisibleRow(workbookSheet, rowNumber);
      return {
        sourceKey: literalText(workbookSheet, rowNumber, 1, true),
        sourceRowNumber: literalNumber(workbookSheet, rowNumber, 2),
        category: literalText(workbookSheet, rowNumber, 3, false),
        sourceStudentName: literalText(workbookSheet, rowNumber, 4, false),
        amountBilledXof: literalNumber(workbookSheet, rowNumber, 5),
        amountPaidXof: literalNumber(workbookSheet, rowNumber, 6),
        installmentDueXof: [7, 8, 9, 10].map((column) =>
          literalNumber(workbookSheet, rowNumber, column),
        ) as [number, number, number, number],
        housing: literalText(workbookSheet, rowNumber, 11, false),
        cafeteria: literalText(workbookSheet, rowNumber, 12, false),
        insurance: literalText(workbookSheet, rowNumber, 13, false),
        caution: literalText(workbookSheet, rowNumber, 14, false),
        scholarshipOnTuition: literalNullableNumber(
          workbookSheet,
          rowNumber,
          15,
        ),
        sourceNote: literalText(workbookSheet, rowNumber, 16, true),
        decision: literalText(workbookSheet, rowNumber, 18, true),
        officialStudentNo: literalText(workbookSheet, rowNumber, 19, true),
        newFirstName: literalText(workbookSheet, rowNumber, 20, true),
        newLastName: literalText(workbookSheet, rowNumber, 21, true),
        duplicateCanonicalRow: literalText(workbookSheet, rowNumber, 22, true),
        reason: literalText(workbookSheet, rowNumber, 23, true),
        reviewer: literalText(workbookSheet, rowNumber, 24, true),
        reviewDate: literalDate(workbookSheet, rowNumber, 25),
      };
    },
  );

  const productionRows = dataRows(productionSheet, 1);
  const productionStudents = productionRows.map((rowNumber) => {
    assertVisibleRow(productionSheet, rowNumber);
    return {
      studentId: literalText(productionSheet, rowNumber, 1, false),
      studentNo: literalText(productionSheet, rowNumber, 2, false),
      productionName: literalText(productionSheet, rowNumber, 3, false),
      recordStatus: literalText(productionSheet, rowNumber, 4, false),
      personStatus: literalText(productionSheet, rowNumber, 5, false),
      loginEmail: literalText(productionSheet, rowNumber, 6, true),
      decision: literalText(productionSheet, rowNumber, 13, true),
      workbookRow: literalText(productionSheet, rowNumber, 14, true),
      reason: literalText(productionSheet, rowNumber, 15, true),
      reviewer: literalText(productionSheet, rowNumber, 16, true),
      reviewDate: literalDate(productionSheet, rowNumber, 17),
    };
  });
  const applicantRows = dataRows(applicantSheet, 2);
  const applicants = applicantRows.map((rowNumber) => {
    assertVisibleRow(applicantSheet, rowNumber);
    return {
      sourceKey: literalText(applicantSheet, rowNumber, 1, false),
      applicantId: literalText(applicantSheet, rowNumber, 2, false),
      applicantName: literalText(applicantSheet, rowNumber, 3, false),
      email: literalText(applicantSheet, rowNumber, 4, false),
      stage: literalText(applicantSheet, rowNumber, 6, false),
      sourceRecordSha256: literalText(applicantSheet, rowNumber, 11, false),
      disposition: literalText(applicantSheet, rowNumber, 10, false),
      reason: literalText(applicantSheet, rowNumber, 12, true),
      reviewer: literalText(applicantSheet, rowNumber, 13, true),
      reviewDate: literalDate(applicantSheet, rowNumber, 14),
    };
  });
  return { workbookRows, productionStudents, applicants };
}

async function excelJsCompatibleWorkbook(bytes: Buffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: true,
    createFolders: false,
  });
  const entries = Object.values(zip.files);
  if (entries.length > 500) {
    throw new Error("Review workbook contains too many OOXML parts");
  }
  let expandedXmlBytes = 0;
  let normalized = false;
  for (const entry of entries) {
    if (
      entry.name.startsWith("/") ||
      entry.name.includes("\\") ||
      entry.name.split("/").includes("..")
    ) {
      throw new Error("Review workbook contains an unsafe OOXML part path");
    }
    if (entry.dir || !entry.name.endsWith(".xml")) continue;
    const xml = await entry.async("string");
    expandedXmlBytes += Buffer.byteLength(xml);
    if (expandedXmlBytes > 250 * 1024 * 1024) {
      throw new Error("Review workbook expanded XML exceeds the safety limit");
    }
    if (/<\/?x:/.test(xml)) {
      // Tables are presentation-only here. artifact-tool emits absolute table
      // relationship targets that ExcelJS cannot hydrate, so omit tableParts
      // from the in-memory reader copy; cells, formulas, validation, and the
      // signed source workbook remain untouched.
      const withoutTableParts = entry.name.startsWith("xl/worksheets/")
        ? xml.replace(/<x:tableParts\b[\s\S]*?<\/x:tableParts>/g, "")
        : xml;
      zip.file(
        entry.name,
        withoutTableParts
          .replace(/<(\/?)x:/g, "<$1")
          .replace(/xmlns:x=/g, "xmlns="),
      );
      normalized = true;
    }
  }
  if (!normalized) {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

export async function buildWorkbookCutoverManifestFromReview(
  input: WorkbookCutoverReviewImportInput,
): Promise<WorkbookCutoverManifest> {
  const review = await readWorkbookCutoverReviewWorkbook(
    input.reviewWorkbookBytes,
  );
  return buildWorkbookCutoverManifestFromReviewData(input, review);
}

export function buildWorkbookCutoverManifestFromReviewData(
  input: Omit<WorkbookCutoverReviewImportInput, "reviewWorkbookBytes">,
  review: WorkbookCutoverReviewWorkbookData,
): WorkbookCutoverManifest {
  const productionSnapshot = WorkbookCutoverProductionSnapshotSchema.parse(
    input.productionSnapshot,
  );
  if (review.workbookRows.length !== input.extraction.rows.length) {
    throw new Error(
      `Review workbook has ${review.workbookRows.length} workbook decisions; expected ${input.extraction.rows.length}`,
    );
  }
  if (review.productionStudents.length !== productionSnapshot.students.length) {
    throw new Error(
      `Review workbook has ${review.productionStudents.length} Student decisions; expected ${productionSnapshot.students.length}`,
    );
  }
  if (review.applicants.length !== productionSnapshot.applicants.length) {
    throw new Error(
      `Review workbook has ${review.applicants.length} Applicant decisions; expected ${productionSnapshot.applicants.length}`,
    );
  }
  const context: WorkbookCutoverReviewSignatureContext = {
    reviewWorkbookSha256: input.reviewWorkbookSha256,
    sourceWorkbookSha256: input.extraction.sourceWorkbookSha256,
    extractionSha256: input.extractionSha256,
    productionSnapshotSha256: input.productionSnapshotSha256,
  };
  const studentsByNo = new Map(
    productionSnapshot.students.map((student) => [student.studentNo, student]),
  );
  const studentsById = new Map(
    productionSnapshot.students.map((student) => [student.studentId, student]),
  );
  const workbookDecisionByKey = uniqueMap(
    review.workbookRows,
    (row) => manifestWorkbookKey(row.sourceKey),
    "review workbook source key",
  );

  const workbookRows = input.extraction.rows.map((source) => {
    const sourceKey = workbookCutoverWorkbookRowKey(
      source.sourceSheet,
      source.sourceRowNumber,
    );
    const decision = workbookDecisionByKey.get(sourceKey);
    if (!decision) {
      throw new Error(`Review workbook does not contain ${sourceKey}`);
    }
    assertWorkbookSourceAnchor(source, decision);
    const reviewValues = reviewFields(decision);
    let identityWithoutReview: Record<string, unknown>;
    if (decision.decision === "Link existing") {
      const studentNo = canonicalStudentNo(decision.officialStudentNo);
      const student = studentsByNo.get(studentNo);
      if (!student) {
        throw new Error(
          `${sourceKey} links official Student ${studentNo}, which is absent from the frozen production snapshot`,
        );
      }
      identityWithoutReview = {
        decision: "link_existing",
        ...officialIdentity(student),
        matchEvidence: "official_student_number",
      };
    } else if (decision.decision === "Create new") {
      identityWithoutReview = {
        decision: "create_new",
        firstName: NONEMPTY.parse(decision.newFirstName),
        lastName: NONEMPTY.parse(decision.newLastName),
        personalEmail: null,
      };
    } else if (decision.decision === "Reviewed duplicate") {
      identityWithoutReview = {
        decision: "reviewed_duplicate",
        canonicalWorkbookRowKey: manifestWorkbookKey(
          NONEMPTY.parse(decision.duplicateCanonicalRow),
        ),
        duplicateStudentClaim: source.sourceStudentName,
      };
    } else {
      throw new Error(
        `${sourceKey} has an incomplete or unsupported workbook decision`,
      );
    }
    const identity = {
      ...identityWithoutReview,
      review: signedReview(
        "workbook_identity",
        sourceKey,
        identityWithoutReview,
        reviewValues,
        context,
      ),
    } as WorkbookCutoverManifest["workbookRows"][number]["identity"];
    return {
      sourceKey,
      sourceSheet: source.sourceSheet,
      sourceRowNumber: source.sourceRowNumber,
      sourceRecordSha256: paymentBalanceExtractionRowDigest(source),
      sourceStudentClaim: source.sourceStudentName,
      identity,
      financial: deriveWorkbookCutoverFinancialSnapshot(
        source,
        reviewValues,
        context,
      ),
    };
  });

  const productionReviewById = uniqueMap(
    review.productionStudents,
    (row) => row.studentId,
    "review Student ID",
  );
  const productionStudents = productionSnapshot.students.map((student) => {
    const decision = productionReviewById.get(student.studentId);
    if (!decision) {
      throw new Error(
        `Review workbook does not contain production Student ${student.sourceKey}`,
      );
    }
    assertProductionSourceAnchor(student, decision);
    const reviewValues = reviewFields(decision);
    let decisionWithoutReview: Record<string, unknown>;
    if (decision.decision === "Link workbook row") {
      decisionWithoutReview = {
        decision: "link_workbook",
        sourceKey: workbookCutoverProductionStudentKey(student.studentId),
        sourceRecordSha256: student.sourceRecordSha256,
        ...officialIdentity(student),
        workbookRowKey: manifestWorkbookKey(
          NONEMPTY.parse(decision.workbookRow),
        ),
      };
    } else if (decision.decision === "Keep exception") {
      decisionWithoutReview = {
        decision: "keep_exception",
        sourceKey: workbookCutoverProductionStudentKey(student.studentId),
        sourceRecordSha256: student.sourceRecordSha256,
        ...officialIdentity(student),
        exceptionCode: "reviewed_production_exception",
      };
    } else if (decision.decision === "Archive and revoke") {
      decisionWithoutReview = {
        decision: "archive",
        sourceKey: workbookCutoverProductionStudentKey(student.studentId),
        sourceRecordSha256: student.sourceRecordSha256,
        ...officialIdentity(student),
        revokeStudentRole: true,
        bumpSessionVersion: true,
        suspendPersonOnlyWhenNoOtherInstitutionalRole: true,
      };
    } else {
      throw new Error(
        `${student.sourceKey} has an incomplete or unsupported production decision`,
      );
    }
    return {
      ...decisionWithoutReview,
      review: signedReview(
        "production_student",
        student.sourceKey,
        decisionWithoutReview,
        reviewValues,
        context,
      ),
    } as WorkbookCutoverManifest["productionStudents"][number];
  });
  if (studentsById.size !== productionStudents.length) {
    throw new Error("Frozen production Student IDs are not unique");
  }

  const applicantReviewById = uniqueMap(
    review.applicants,
    (row) => row.applicantId,
    "review Applicant ID",
  );
  const applicants = productionSnapshot.applicants.map((applicant) => {
    const decision = applicantReviewById.get(applicant.applicantId);
    if (!decision) {
      throw new Error(
        `Review workbook does not contain ${applicant.sourceKey}`,
      );
    }
    assertApplicantSourceAnchor(applicant, decision);
    if (decision.disposition !== "Remove from active pipeline") {
      throw new Error(
        `${applicant.sourceKey} must be removed from the active Admissions pipeline`,
      );
    }
    const decisionWithoutReview = {
      decision: "remove" as const,
      sourceKey: workbookCutoverApplicantKey(applicant.applicantId),
      sourceRecordSha256: applicant.sourceRecordSha256,
      applicantId: applicant.applicantId,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      email: applicant.email,
      stage: applicant.stage,
      removeFromActivePipeline: true as const,
      retainAuditEvidence: true as const,
      revokeBearerCapabilities: true as const,
    };
    return {
      ...decisionWithoutReview,
      review: signedReview(
        "applicant_removal",
        applicant.sourceKey,
        decisionWithoutReview,
        reviewFields(decision),
        context,
      ),
    };
  });

  const included = workbookRows.filter(
    (row) =>
      row.identity.decision === "link_existing" ||
      row.identity.decision === "create_new",
  );
  const excluded = workbookRows.filter(
    (row) => row.identity.decision === "reviewed_duplicate",
  );
  const held: typeof workbookRows = [];
  const manifest = WorkbookCutoverManifestSchema.parse({
    schemaVersion: 1,
    importName: "workbook-roster-billing-cutover-2026-08-29",
    academicYearLabel: productionSnapshot.academicYearLabel,
    academicYearStart: academicYearStart(productionSnapshot.academicYearLabel),
    sourceAsOfDate: WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate,
    currency: "XOF",
    sourceWorkbook: {
      fileName: input.extraction.sourceFileName,
      sha256: input.extraction.sourceWorkbookSha256,
    },
    trustedExtraction: {
      fileName: input.extractionFileName,
      sha256: input.extractionSha256,
    },
    productionSnapshot: {
      fileName: input.productionSnapshotFileName,
      sha256: input.productionSnapshotSha256,
    },
    reviewWorkbook: {
      fileName: input.reviewWorkbookFileName,
      sha256: input.reviewWorkbookSha256,
    },
    billingTermLabel: workbookCutoverBillingTermLabel(
      productionSnapshot.academicYearLabel,
    ),
    installmentDueDates: WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES,
    controls: {
      workbookRows: WORKBOOK_CUTOVER_BASELINE.workbookRows,
      ...productionSnapshot.controls,
      billedXof: WORKBOOK_CUTOVER_BASELINE.billedXof,
      paidXof: WORKBOOK_CUTOVER_BASELINE.paidXof,
      installmentPaidXof: WORKBOOK_CUTOVER_BASELINE.installmentPaidXof,
      positivePaymentRows: WORKBOOK_CUTOVER_BASELINE.positivePaymentRows,
      zeroPaymentRows: WORKBOOK_CUTOVER_BASELINE.zeroPaymentRows,
      housingRows: WORKBOOK_CUTOVER_BASELINE.housingRows,
      housingNoneRows: WORKBOOK_CUTOVER_BASELINE.housingNoneRows,
      housingDoubleRows: WORKBOOK_CUTOVER_BASELINE.housingDoubleRows,
      housingDoubleAcRows: WORKBOOK_CUTOVER_BASELINE.housingDoubleAcRows,
      housingIndividualRows: WORKBOOK_CUTOVER_BASELINE.housingIndividualRows,
      housingIndividualAcRows:
        WORKBOOK_CUTOVER_BASELINE.housingIndividualAcRows,
      cafeteriaRows: WORKBOOK_CUTOVER_BASELINE.cafeteriaRows,
      cafeteriaNoneRows: WORKBOOK_CUTOVER_BASELINE.cafeteriaNoneRows,
      insuranceRows: WORKBOOK_CUTOVER_BASELINE.insuranceRows,
      insuranceNoneRows: WORKBOOK_CUTOVER_BASELINE.insuranceNoneRows,
      cautionRows: WORKBOOK_CUTOVER_BASELINE.cautionRows,
      explicitPercentageScholarshipRows:
        WORKBOOK_CUTOVER_BASELINE.explicitPercentageScholarshipRows,
    },
    dispositionControls: {
      includedWorkbookRows: included.length,
      includedBilledXof: total(
        included,
        (row) => row.financial.amountBilledXof,
      ),
      includedPaidXof: total(included, (row) => row.financial.amountPaidXof),
      reviewedExclusionRows: excluded.length,
      reviewedExclusionBilledXof: total(
        excluded,
        (row) => row.financial.amountBilledXof,
      ),
      reviewedExclusionPaidXof: total(
        excluded,
        (row) => row.financial.amountPaidXof,
      ),
      heldWorkbookRows: held.length,
      heldBilledXof: 0,
      heldPaidXof: 0,
      linkedProductionStudents: productionStudents.filter(
        (row) => row.decision === "link_workbook",
      ).length,
      keptProductionExceptions: productionStudents.filter(
        (row) => row.decision === "keep_exception",
      ).length,
      archivedProductionStudents: productionStudents.filter(
        (row) => row.decision === "archive",
      ).length,
      heldProductionStudents: 0,
      preservedApplicants: 0,
      removedApplicants: applicants.length,
    },
    workbookRows,
    productionStudents,
    applicants,
    reviewNote: `All workbook rows, frozen production Students, and current Applicants were signed in ${input.reviewWorkbookFileName}; review workbook SHA-256 ${input.reviewWorkbookSha256}. Current Applicants carry reviewed terminal removal dispositions while their rows remain retained audit evidence. The importer derived finance snapshots only from the trusted extraction and made no production connection.`,
  });
  verifyWorkbookCutoverManifestExtraction(manifest, input.extraction);
  verifyWorkbookCutoverManifestProductionSnapshot(manifest, productionSnapshot);
  return manifest;
}

export function deriveWorkbookCutoverFinancialSnapshot(
  source: ExtractionRow,
  reviewer: ReviewFields,
  context: WorkbookCutoverReviewSignatureContext,
): WorkbookCutoverFinancialSnapshot {
  const housing = deriveWorkbookCutoverHousingOption(source);
  const housingAmount =
    WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF[`housing_${housing}`];
  const services: WorkbookCutoverFinancialSnapshot["services"] = {
    housing: { option: housing, annualAmountXof: housingAmount },
    cafeteria: {
      plan: source.cafeteria ? "full" : "none",
      annualAmountXof: source.cafeteria
        ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.cafeteria_full
        : 0,
    },
    insurance: {
      selected: source.insurance,
      annualAmountXof: source.insurance
        ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.insurance_selected
        : 0,
    },
    caution: {
      selected: source.caution,
      basisHousingOption: source.caution
        ? housing === "none"
          ? "double"
          : housing
        : "none",
      percentageBps: source.caution ? WORKBOOK_CUTOVER_CAUTION_BPS : 0,
      amountXof: source.caution
        ? Math.round(
            ((housing === "none"
              ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.housing_double
              : housingAmount) *
              WORKBOOK_CUTOVER_CAUTION_BPS) /
              10_000,
          )
        : 0,
      refundable: true,
    },
  };
  const gross = grossComponents(services);
  const grossTotal = total(gross, (component) => component.grossAmountXof);
  const signedAdjustmentXof = source.amountBilledXof - grossTotal;
  const adjustments = deriveAdjustments(
    source,
    signedAdjustmentXof,
    reviewer,
    context,
  );
  const components = allocateComponentNet(gross, signedAdjustmentXof);
  const paidDetail = total(source.installmentPaidXof, (value) => value);
  return {
    sourceCategory: source.category,
    amountBilledXof: source.amountBilledXof,
    amountPaidXof: source.amountPaidXof,
    installments: source.installmentDueXof.map((dueXof, index) => ({
      sequence: index + 1,
      dueXof,
      paidDetailXof: source.installmentPaidXof[index]!,
    })) as WorkbookCutoverFinancialSnapshot["installments"],
    services,
    components,
    adjustments,
    sourceScholarshipOnTuition: source.scholarshipOnTuition,
    sourceNote: source.note,
    accountCreditXof: source.amountPaidXof - paidDetail,
  };
}

interface ReviewFields {
  reason: string;
  reviewer: string;
  reviewDate: string;
}

function signedReview(
  scope: string,
  sourceKey: string,
  payload: unknown,
  values: ReviewFields,
  context: WorkbookCutoverReviewSignatureContext,
): SignedReview {
  const reviewedBy = EMAIL.parse(values.reviewer);
  const reviewedAt = `${parseDateOnly(values.reviewDate)}T00:00:00.000Z`;
  const reason = REASON.parse(values.reason);
  return {
    reviewedBy,
    reviewedAt,
    reason,
    signedOff: true,
    signatureSha256: workbookCutoverReviewSignature({
      scope,
      sourceKey,
      payload,
      reviewedBy,
      reviewedAt,
      reason,
      context,
    }),
  };
}

function officialIdentity(student: WorkbookCutoverProductionStudentSnapshot) {
  return {
    studentId: student.studentId,
    personId: student.personId,
    studentNo: student.studentNo,
    firstName: student.firstName,
    lastName: student.lastName,
    loginEmail: student.loginEmail,
    recordStatus: student.recordStatus,
    personStatus: student.personStatus,
    roles: student.roles,
    academicFingerprint: student.academicFingerprint,
    academicFingerprintSha256: student.academicFingerprintSha256,
  };
}

function grossComponents(
  services: WorkbookCutoverFinancialSnapshot["services"],
): Array<Omit<Component, "adjustmentXof" | "netAmountXof">> {
  return [
    {
      key: "tuition",
      optionCode: "annual_tuition",
      grossAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
      refundable: false,
    },
    ...(services.housing.option === "none"
      ? []
      : [
          {
            key: "housing" as const,
            optionCode: services.housing.option,
            grossAmountXof: services.housing.annualAmountXof,
            refundable: false,
          },
        ]),
    ...(services.cafeteria.plan === "none"
      ? []
      : [
          {
            key: "cafeteria" as const,
            optionCode: "full",
            grossAmountXof: services.cafeteria.annualAmountXof,
            refundable: false,
          },
        ]),
    ...(services.insurance.selected
      ? [
          {
            key: "insurance" as const,
            optionCode: "annual",
            grossAmountXof: services.insurance.annualAmountXof,
            refundable: false,
          },
        ]
      : []),
    ...(services.caution.selected
      ? [
          {
            key: "housing_caution" as const,
            optionCode: services.caution.basisHousingOption,
            grossAmountXof: services.caution.amountXof,
            refundable: true,
          },
        ]
      : []),
  ];
}

function allocateComponentNet(
  gross: Array<Omit<Component, "adjustmentXof" | "netAmountXof">>,
  signedAdjustmentXof: number,
): Component[] {
  const adjustments = gross.map(() => 0);
  if (signedAdjustmentXof >= 0) {
    adjustments[0] = signedAdjustmentXof;
  } else {
    let reduction = -signedAdjustmentXof;
    for (let index = 0; index < gross.length && reduction > 0; index += 1) {
      const applied = Math.min(gross[index]!.grossAmountXof, reduction);
      adjustments[index] = -applied;
      reduction -= applied;
    }
    if (reduction !== 0) {
      throw new Error(
        "Authoritative bill cannot allocate to non-negative components",
      );
    }
  }
  return gross.map((component, index) => ({
    ...component,
    adjustmentXof: adjustments[index]!,
    netAmountXof: component.grossAmountXof + adjustments[index]!,
  }));
}

function deriveAdjustments(
  source: ExtractionRow,
  signedAdjustmentXof: number,
  reviewer: ReviewFields,
  context: WorkbookCutoverReviewSignatureContext,
): Adjustment[] {
  const expectedKeys = new Set(
    deriveWorkbookCutoverAdjustmentKeys(source.note),
  );
  const adjustments: Adjustment[] = [];
  let knownTuitionBps = 0;
  const rowKey = workbookCutoverWorkbookRowKey(
    source.sourceSheet,
    source.sourceRowNumber,
  );
  const note = normalizeNote(source.note);
  let serial = 0;
  const add = (
    value: Omit<Adjustment, "instanceKey" | "review">,
    suffix: string,
  ) => {
    serial += 1;
    const instanceKey =
      `${value.definitionKey}_${source.sourceRowNumber}_${serial}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, 80);
    const payload = { ...value, instanceKey };
    adjustments.push({
      ...payload,
      review: signedReview(
        `financial_adjustment:${suffix}`,
        rowKey,
        payload,
        reviewer,
        context,
      ),
    });
  };
  const tuitionPercentage = (
    definitionKey: Adjustment["definitionKey"],
    label: string,
    bps: number,
  ) => {
    add(
      {
        definitionKey,
        label,
        targetComponentKey: "tuition",
        direction: "reduction",
        calculation: "percentage",
        basis: "tuition",
        basisAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
        percentageBps: bps,
        amountXof: Math.round(
          (WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition * bps) / 10_000,
        ),
        stacking: [
          "merit_10",
          "merit_15",
          "merit_20",
          "full_scholarship",
        ].includes(definitionKey)
          ? "exclusive"
          : "additive",
        approvalRequired: !["merit_10", "merit_15", "merit_20"].includes(
          definitionKey,
        ),
      },
      definitionKey,
    );
    knownTuitionBps += bps;
  };
  const standard: Array<[Adjustment["definitionKey"], string, number]> = [
    ["merit_10", "Mention Assez Bien", 1_000],
    ["merit_15", "Mention Bien", 1_500],
    ["merit_20", "Mention Très Bien", 2_000],
    ["family", "Family discount", 1_000],
    ["somone_resident", "Somone resident", 1_000],
    ["full_scholarship", "Full scholarship", 10_000],
    ["s10", "S10 half tuition", 5_000],
  ];
  for (const [key, label, bps] of standard) {
    if (expectedKeys.has(key)) tuitionPercentage(key, label, bps);
  }
  if (expectedKeys.has("january_enrollment")) {
    add(
      {
        definitionKey: "january_enrollment",
        label: "January enrollment",
        targetComponentKey: "tuition",
        direction: "reduction",
        calculation: "fixed",
        basis: "tuition",
        basisAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
        amountXof: 250_000,
        stacking: "additive",
        approvalRequired: true,
      },
      "january_enrollment",
    );
  }
  if (expectedKeys.has("three_fpt")) {
    const match = note.match(/3fpt\s*\((\d+(?:\.\d+)?)%\)/);
    if (!match) throw new Error(`${rowKey} lacks an explicit 3FPT percentage`);
    const bps = Math.round(Number(match[1]) * 100);
    add(
      {
        definitionKey: "three_fpt",
        label: "3FPT",
        targetComponentKey: null,
        direction: "reduction",
        calculation: "percentage",
        basis: "gross_package",
        basisAmountXof: WORKBOOK_CUTOVER_REFERENCE_PACKAGE_XOF,
        percentageBps: bps,
        amountXof: Math.round(
          (WORKBOOK_CUTOVER_REFERENCE_PACKAGE_XOF * bps) / 10_000,
        ),
        stacking: "exclusive",
        approvalRequired: true,
      },
      "three_fpt",
    );
  }
  const explicitBps = Math.round((source.scholarshipOnTuition ?? 0) * 10_000);
  if (explicitBps > 0 && knownTuitionBps > explicitBps) {
    throw new Error(
      `${rowKey} names ${knownTuitionBps} tuition scholarship bps but the source cell contains ${explicitBps}`,
    );
  }
  let socialHelpNeedsManual = expectedKeys.has("social_help");
  const unexplainedBps = explicitBps - knownTuitionBps;
  if (unexplainedBps > 0) {
    if (socialHelpNeedsManual) {
      add(
        {
          definitionKey: "social_help",
          label: "Social help",
          targetComponentKey: "tuition",
          direction: "reduction",
          calculation: "manual",
          basis: "tuition",
          basisAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
          amountXof: Math.round(
            (WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition * unexplainedBps) /
              10_000,
          ),
          stacking: "additive",
          approvalRequired: true,
        },
        "social_help",
      );
      knownTuitionBps += unexplainedBps;
      socialHelpNeedsManual = false;
    } else {
      tuitionPercentage(
        "reviewed_manual_adjustment",
        "Reviewed workbook tuition scholarship",
        unexplainedBps,
      );
    }
  }
  let remaining =
    signedAdjustmentXof -
    adjustments.reduce(
      (sum, adjustment) =>
        sum +
        (adjustment.direction === "reduction"
          ? -adjustment.amountXof
          : adjustment.amountXof),
      0,
    );
  if (socialHelpNeedsManual) {
    const amountXof = remaining < 0 ? -remaining : 0;
    add(
      {
        definitionKey: "social_help",
        label: "Social help (not separately quantified in workbook)",
        targetComponentKey: null,
        direction: "reduction",
        calculation: "manual",
        basis: "tuition",
        basisAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
        amountXof,
        stacking: "additive",
        approvalRequired: true,
      },
      "social_help_manual",
    );
    remaining += amountXof;
  }
  const hasReviewedManual = adjustments.some(
    (adjustment) => adjustment.definitionKey === "reviewed_manual_adjustment",
  );
  if (
    remaining !== 0 ||
    (expectedKeys.has("reviewed_manual_adjustment") && !hasReviewedManual)
  ) {
    add(
      {
        definitionKey: "reviewed_manual_adjustment",
        label:
          remaining === 0
            ? "Workbook note preserved; no separately quantified effect"
            : "Workbook final billed amount reconciliation",
        targetComponentKey: null,
        direction: remaining < 0 ? "reduction" : "charge",
        calculation: "manual",
        basis: "none",
        basisAmountXof: 0,
        amountXof: Math.abs(remaining),
        stacking: "additive",
        approvalRequired: true,
      },
      "final_reconciliation",
    );
    remaining = 0;
  }
  if (remaining !== 0)
    throw new Error(`${rowKey} adjustment derivation failed`);
  for (const key of expectedKeys) {
    if (!adjustments.some((adjustment) => adjustment.definitionKey === key)) {
      throw new Error(`${rowKey} did not preserve named adjustment ${key}`);
    }
  }
  return adjustments;
}

function assertHeaders(
  sheet: ExcelJS.Worksheet,
  expected: readonly string[],
): void {
  const actual = expected.map((_, index) =>
    literalText(sheet, 5, index + 1, false),
  );
  for (let index = 0; index < expected.length; index += 1) {
    if (sheet.getColumn(index + 1).hidden) {
      throw new Error(`${sheet.name} decision column ${index + 1} is hidden`);
    }
  }
  if (
    canonicalWorkbookCutoverJson(actual) !==
    canonicalWorkbookCutoverJson(expected)
  ) {
    throw new Error(
      `${sheet.name} row 5 headers do not match the signed-review contract`,
    );
  }
  const unexpected = literalText(sheet, 5, expected.length + 1, true);
  if (unexpected !== "") {
    throw new Error(
      `${sheet.name} has an unexpected extra decision-table column`,
    );
  }
}

function assertTableExtent(
  sheet: ExcelJS.Worksheet,
  expectedRows: number,
  columns: number,
): void {
  const firstUnexpected = 6 + expectedRows;
  for (let column = 1; column <= columns; column += 1) {
    if (cellValue(sheet.getCell(firstUnexpected, column)) !== null) {
      throw new Error(
        `${sheet.name} contains more than ${expectedRows} source rows`,
      );
    }
  }
}

function dataRows(sheet: ExcelJS.Worksheet, keyColumn: number): number[] {
  const rows: number[] = [];
  let rowNumber = 6;
  while (rowNumber <= 50_005) {
    const value = cellValue(sheet.getCell(rowNumber, keyColumn));
    if (value === null || String(value).trim() === "") break;
    rows.push(rowNumber);
    rowNumber += 1;
  }
  for (let index = rowNumber + 1; index <= sheet.actualRowCount; index += 1) {
    if (cellValue(sheet.getCell(index, keyColumn)) !== null) {
      throw new Error(`${sheet.name} decision rows are not contiguous`);
    }
  }
  return rows;
}

function assertVisibleRow(sheet: ExcelJS.Worksheet, rowNumber: number): void {
  if (sheet.getRow(rowNumber).hidden) {
    throw new Error(`${sheet.name} row ${rowNumber} is hidden`);
  }
}

function literalText(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  allowBlank: boolean,
): string {
  const cell = sheet.getCell(row, column);
  if (isFormula(cell.value)) {
    throw new Error(
      `${sheet.name}!${cell.address} must be a literal review/source value, not a formula`,
    );
  }
  const value = cellValue(cell);
  const text = value === null ? "" : String(value).trim();
  if (!allowBlank && text === "") {
    throw new Error(`${sheet.name}!${cell.address} is required`);
  }
  return text;
}

function literalDate(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
): string {
  const cell = sheet.getCell(row, column);
  if (isFormula(cell.value)) {
    throw new Error(
      `${sheet.name}!${cell.address} review date must be literal`,
    );
  }
  const value = cellValue(cell);
  if (value === null || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return parseDateOnly(String(value).trim());
}

function literalNumber(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
): number {
  const cell = sheet.getCell(row, column);
  if (isFormula(cell.value)) {
    throw new Error(`${sheet.name}!${cell.address} must be a literal number`);
  }
  const value = cellValue(cell);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${sheet.name}!${cell.address} must be a finite number`);
  }
  return value;
}

function literalNullableNumber(
  sheet: ExcelJS.Worksheet,
  row: number,
  column: number,
): number | null {
  const cell = sheet.getCell(row, column);
  if (isFormula(cell.value)) {
    throw new Error(`${sheet.name}!${cell.address} must be a literal number`);
  }
  const value = cellValue(cell);
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `${sheet.name}!${cell.address} must be a finite number or blank`,
    );
  }
  return value;
}

function cellValue(cell: ExcelJS.Cell): ExcelJS.CellValue | null {
  if (cell.value === undefined || cell.value === null) return null;
  if (isFormula(cell.value)) {
    if (cell.value.result === undefined) {
      throw new Error(
        `${cell.worksheet.name}!${cell.address} has no cached formula result`,
      );
    }
    return cell.value.result as ExcelJS.CellValue;
  }
  if (typeof cell.value === "object" && "text" in cell.value) {
    return cell.value.text;
  }
  return cell.value;
}

function isFormula(
  value: ExcelJS.CellValue,
): value is ExcelJS.CellFormulaValue {
  return (
    typeof value === "object" &&
    value !== null &&
    ("formula" in value || "sharedFormula" in value)
  );
}

function reviewFields(input: {
  reason: string;
  reviewer: string;
  reviewDate: string;
}): ReviewFields {
  return {
    reason: REASON.parse(input.reason),
    reviewer: EMAIL.parse(input.reviewer),
    reviewDate: parseDateOnly(input.reviewDate),
  };
}

function assertWorkbookSourceAnchor(
  source: ExtractionRow,
  reviewed: WorkbookCutoverReviewWorkbookData["workbookRows"][number],
): void {
  const expected = {
    sourceRowNumber: source.sourceRowNumber,
    category: source.category,
    sourceStudentName: source.sourceStudentName,
    amountBilledXof: source.amountBilledXof,
    amountPaidXof: source.amountPaidXof,
    installmentDueXof: source.installmentDueXof,
    housing: source.housing ? "Yes" : "No",
    cafeteria: source.cafeteria ? "Full" : "None",
    insurance: source.insurance ? "Yes" : "No",
    caution: source.caution ? "Yes" : "No",
    scholarshipOnTuition: source.scholarshipOnTuition,
    sourceNote: source.note ?? "",
  };
  const actual = {
    sourceRowNumber: reviewed.sourceRowNumber,
    category: reviewed.category,
    sourceStudentName: reviewed.sourceStudentName,
    amountBilledXof: reviewed.amountBilledXof,
    amountPaidXof: reviewed.amountPaidXof,
    installmentDueXof: reviewed.installmentDueXof,
    housing: reviewed.housing,
    cafeteria: reviewed.cafeteria,
    insurance: reviewed.insurance,
    caution: reviewed.caution,
    scholarshipOnTuition: reviewed.scholarshipOnTuition,
    sourceNote: reviewed.sourceNote,
  };
  if (
    canonicalWorkbookCutoverJson(actual) !==
    canonicalWorkbookCutoverJson(expected)
  ) {
    throw new Error(
      `${workbookCutoverWorkbookRowKey(source.sourceSheet, source.sourceRowNumber)} source cells drifted from the trusted extraction`,
    );
  }
}

function assertProductionSourceAnchor(
  source: WorkbookCutoverProductionStudentSnapshot,
  reviewed: WorkbookCutoverReviewWorkbookData["productionStudents"][number],
): void {
  const expected = {
    studentNo: source.studentNo,
    productionName: `${source.firstName} ${source.lastName}`.trim(),
    recordStatus: source.recordStatus,
    personStatus: source.personStatus,
    loginEmail: source.loginEmail ?? "",
  };
  const actual = {
    studentNo: canonicalStudentNo(reviewed.studentNo),
    productionName: reviewed.productionName,
    recordStatus: reviewed.recordStatus,
    personStatus: reviewed.personStatus,
    loginEmail: reviewed.loginEmail.toLowerCase(),
  };
  if (
    canonicalWorkbookCutoverJson(actual) !==
    canonicalWorkbookCutoverJson(expected)
  ) {
    throw new Error(
      `${source.sourceKey} source cells drifted from the frozen snapshot`,
    );
  }
}

function assertApplicantSourceAnchor(
  source: WorkbookCutoverProductionSnapshot["applicants"][number],
  reviewed: WorkbookCutoverReviewWorkbookData["applicants"][number],
): void {
  const expected = {
    sourceKey: source.sourceKey,
    sourceRecordSha256: source.sourceRecordSha256,
    applicantName: `${source.firstName} ${source.lastName}`.trim(),
    email: source.email,
    stage: source.stage,
  };
  const actual = {
    sourceKey: reviewed.sourceKey,
    sourceRecordSha256: reviewed.sourceRecordSha256.toLowerCase(),
    applicantName: reviewed.applicantName,
    email: reviewed.email.toLowerCase(),
    stage: reviewed.stage,
  };
  if (
    canonicalWorkbookCutoverJson(actual) !==
    canonicalWorkbookCutoverJson(expected)
  ) {
    throw new Error(
      `${source.sourceKey} source cells drifted from the frozen snapshot`,
    );
  }
}

function parseDateOnly(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Review date must be YYYY-MM-DD, received ${value || "blank"}`,
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Review date is invalid: ${value}`);
  }
  return value;
}

function manifestWorkbookKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("workbook:") ? trimmed : `workbook:${trimmed}`;
}

function canonicalStudentNo(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

function normalizeNote(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueMap<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const current = key(value);
    if (result.has(current)) throw new Error(`Duplicate ${label}: ${current}`);
    result.set(current, value);
  }
  return result;
}

function total<T>(values: readonly T[], select: (value: T) => number): number {
  const result = values.reduce((sum, value) => sum + select(value), 0);
  if (!Number.isSafeInteger(result)) throw new Error("XOF total is not safe");
  return result;
}

function academicYearStart(label: string): number {
  const match = label.match(/^(\d{4})/);
  if (!match)
    throw new Error(`Academic year label has no starting year: ${label}`);
  return Number(match[1]);
}

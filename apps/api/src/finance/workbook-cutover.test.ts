import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentBalanceExtractionRowDigest } from "./payment-balance-import.extraction.js";
import {
  WORKBOOK_CUTOVER_BASELINE,
  WORKBOOK_CUTOVER_CAUTION_BPS,
  WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES,
  WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF,
  WorkbookCutoverManifestSchema,
  workbookCutoverBillingTermLabel,
  workbookCutoverAcademicFingerprintDigest,
  workbookCutoverApplicantKey,
  workbookCutoverProductionStudentKey,
  workbookCutoverReviewSignature,
  workbookCutoverWorkbookRowKey,
  type WorkbookCutoverManifest,
} from "./workbook-cutover.manifest.js";
import {
  WorkbookCutoverProductionSnapshotSchema,
  deriveWorkbookCutoverAdjustmentKeys,
  verifyWorkbookCutoverManifestExtraction,
} from "./workbook-cutover.extraction.js";
import {
  WorkbookCutoverPlanInputSchema,
  planWorkbookCutover,
  workbookCutoverLiveSnapshotDigest,
  workbookCutoverPlanDigestMatches,
} from "./workbook-cutover.planner.js";
import { buildWorkbookCutoverManifestFromReviewData } from "./workbook-cutover.review-import.js";

const WORKBOOK_SHA = "a".repeat(64);
const EXTRACTION_SHA = "b".repeat(64);
const PRODUCTION_SHA = "c".repeat(64);
const REVIEW_SIGNATURE = "d".repeat(64);
const REVIEW_WORKBOOK_SHA = "e".repeat(64);
const DUE_DATES = [...WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES];

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function review(
  reason = "Reviewed and signed against the official cutover sources.",
) {
  return {
    reviewedBy: "finance-reviewer@daust.org",
    reviewedAt: "2026-09-01T10:00:00.000Z",
    reason,
    signedOff: true as const,
    signatureSha256: REVIEW_SIGNATURE,
  };
}

function resignManifest(manifest: WorkbookCutoverManifest): void {
  const context = {
    reviewWorkbookSha256: manifest.reviewWorkbook.sha256,
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    extractionSha256: manifest.trustedExtraction.sha256,
    productionSnapshotSha256: manifest.productionSnapshot.sha256,
  };
  const sign = (
    scope: string,
    sourceKey: string,
    payload: unknown,
    target: {
      reviewedBy: string;
      reviewedAt: string;
      reason: string;
      signatureSha256: string;
    },
  ) => {
    target.signatureSha256 = workbookCutoverReviewSignature({
      scope,
      sourceKey,
      payload,
      reviewedBy: target.reviewedBy,
      reviewedAt: target.reviewedAt,
      reason: target.reason,
      context,
    });
  };
  for (const row of manifest.workbookRows) {
    const { review: identityReview, ...identityPayload } = row.identity;
    sign("workbook_identity", row.sourceKey, identityPayload, identityReview);
    for (const adjustment of row.financial.adjustments) {
      const { review: adjustmentReview, ...payload } = adjustment;
      const suffix =
        adjustment.definitionKey === "social_help" &&
        adjustment.targetComponentKey === null
          ? "social_help_manual"
          : adjustment.definitionKey === "reviewed_manual_adjustment" &&
              adjustment.targetComponentKey === null
            ? "final_reconciliation"
            : adjustment.definitionKey;
      sign(
        `financial_adjustment:${suffix}`,
        row.sourceKey,
        payload,
        adjustmentReview,
      );
    }
  }
  for (const student of manifest.productionStudents) {
    const { review: studentReview, ...payload } = student;
    sign("production_student", student.sourceKey, payload, studentReview);
  }
  for (const applicant of manifest.applicants) {
    const { review: applicantReview, ...payload } = applicant;
    sign(
      "applicant_preservation",
      applicant.sourceKey,
      payload,
      applicantReview,
    );
  }
}

function distribute(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

function splitFour(total: number): number[] {
  return distribute(total, 4);
}

function allocateAcrossDue(due: readonly number[], paid: number): number[] {
  let remaining = paid;
  return due.map((amount) => {
    const applied = Math.min(amount, remaining);
    remaining -= applied;
    return applied;
  });
}

function academicFingerprint(index: number) {
  return {
    transcriptCount: index % 20,
    transcriptSha256: sha(`transcripts-${index}`),
    enrollmentCount: index % 10,
    enrollmentSha256: sha(`enrollments-${index}`),
    gradeSnapshotCount: index % 12,
    gradeSnapshotSha256: sha(`grades-${index}`),
    creditsSha256: sha(`credits-${index}`),
    gpaSha256: sha(`gpa-${index}`),
  };
}

function housingOption(index: number) {
  if (index < 58) return "none" as const;
  if (index < 58 + 311) return "double" as const;
  if (index < 58 + 311 + 24) return "double_ac" as const;
  if (index < 58 + 311 + 24 + 4) return "individual" as const;
  return "individual_ac" as const;
}

function services(index: number) {
  const housing = housingOption(index);
  const housingAmount =
    WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF[`housing_${housing}`];
  const cafeteria = index < WORKBOOK_CUTOVER_BASELINE.cafeteriaRows;
  const insurance = index < WORKBOOK_CUTOVER_BASELINE.insuranceRows;
  const caution =
    index >= 58 && index < 58 + WORKBOOK_CUTOVER_BASELINE.cautionRows;
  return {
    housing: { option: housing, annualAmountXof: housingAmount },
    cafeteria: {
      plan: cafeteria ? ("full" as const) : ("none" as const),
      annualAmountXof: cafeteria
        ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.cafeteria_full
        : 0,
    },
    insurance: {
      selected: insurance,
      annualAmountXof: insurance
        ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.insurance_selected
        : 0,
    },
    caution: {
      selected: caution,
      basisHousingOption: caution ? housing : ("none" as const),
      percentageBps: caution ? WORKBOOK_CUTOVER_CAUTION_BPS : (0 as const),
      amountXof: caution ? Math.round(housingAmount / 10) : 0,
      refundable: true as const,
    },
  };
}

function financialSnapshot(index: number, billedXof: number, paidXof: number) {
  const selected = services(index);
  const grossComponents = [
    {
      key: "tuition" as const,
      optionCode: "annual_tuition",
      grossAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
      refundable: false,
    },
    ...(selected.housing.option === "none"
      ? []
      : [
          {
            key: "housing" as const,
            optionCode: selected.housing.option,
            grossAmountXof: selected.housing.annualAmountXof,
            refundable: false,
          },
        ]),
    ...(selected.cafeteria.plan === "full"
      ? [
          {
            key: "cafeteria" as const,
            optionCode: "full",
            grossAmountXof: selected.cafeteria.annualAmountXof,
            refundable: false,
          },
        ]
      : []),
    ...(selected.insurance.selected
      ? [
          {
            key: "insurance" as const,
            optionCode: "annual",
            grossAmountXof: selected.insurance.annualAmountXof,
            refundable: false,
          },
        ]
      : []),
    ...(selected.caution.selected
      ? [
          {
            key: "housing_caution" as const,
            optionCode: selected.housing.option,
            grossAmountXof: selected.caution.amountXof,
            refundable: true,
          },
        ]
      : []),
  ];
  const grossXof = grossComponents.reduce(
    (sum, component) => sum + component.grossAmountXof,
    0,
  );
  const signedAdjustmentXof = billedXof - grossXof;
  const hasExplicitScholarship =
    index < WORKBOOK_CUTOVER_BASELINE.explicitPercentageScholarshipRows;
  const namedScholarshipXof = hasExplicitScholarship ? 297_500 : 0;
  const manualAdjustmentXof = signedAdjustmentXof + namedScholarshipXof;
  const adjustments = [
    ...(hasExplicitScholarship
      ? [
          {
            instanceKey: `merit_${index + 1}`,
            definitionKey: "merit_10" as const,
            label: "Mention Assez Bien",
            targetComponentKey: "tuition" as const,
            direction: "reduction" as const,
            calculation: "percentage" as const,
            basis: "tuition" as const,
            basisAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
            percentageBps: 1_000,
            amountXof: namedScholarshipXof,
            stacking: "exclusive" as const,
            approvalRequired: false as const,
            review: review(
              "The explicit workbook tuition scholarship percentage was reviewed and named.",
            ),
          },
        ]
      : []),
    ...(manualAdjustmentXof === 0
      ? []
      : [
          {
            instanceKey: `manual_${index + 1}`,
            definitionKey: "reviewed_manual_adjustment" as const,
            label: "Workbook final billed amount reconciliation",
            targetComponentKey: "tuition" as const,
            direction:
              manualAdjustmentXof < 0
                ? ("reduction" as const)
                : ("charge" as const),
            calculation: "manual" as const,
            basis: "none" as const,
            basisAmountXof: 0,
            amountXof: Math.abs(manualAdjustmentXof),
            stacking: "additive" as const,
            approvalRequired: true as const,
            review: review(
              "The workbook final bill is authoritative; this explicit residual preserves its exact total.",
            ),
          },
        ]),
  ];
  const components = grossComponents.map((component) => {
    const adjustmentXof = component.key === "tuition" ? signedAdjustmentXof : 0;
    return {
      ...component,
      adjustmentXof,
      netAmountXof: component.grossAmountXof + adjustmentXof,
    };
  });
  const due = splitFour(billedXof);
  const rowNumber = 20 + index;
  const installmentPaidTotal = rowNumber === 159 ? paidXof - 1_433 : paidXof;
  const paidDetail = allocateAcrossDue(due, installmentPaidTotal);
  const sourceNote =
    selected.housing.option === "double_ac"
      ? "Double w/ AC housing"
      : selected.housing.option === "individual"
        ? "Individual housing"
        : selected.housing.option === "individual_ac"
          ? "Individual w/ AC housing"
          : null;
  return {
    sourceCategory: index < 276 ? "O" : "N",
    amountBilledXof: billedXof,
    amountPaidXof: paidXof,
    installments: due.map((dueXof, installmentIndex) => ({
      sequence: installmentIndex + 1,
      dueXof,
      paidDetailXof: paidDetail[installmentIndex]!,
    })),
    services: selected,
    components,
    adjustments,
    sourceScholarshipOnTuition: hasExplicitScholarship ? 0.1 : null,
    sourceNote,
    accountCreditXof: rowNumber === 159 ? 1_433 : 0,
  };
}

function buildFixture() {
  const billed = distribute(
    WORKBOOK_CUTOVER_BASELINE.billedXof,
    WORKBOOK_CUTOVER_BASELINE.workbookRows,
  );
  const varianceIndex = 159 - 20;
  const otherPaidDetail = distribute(
    WORKBOOK_CUTOVER_BASELINE.installmentPaidXof - billed[varianceIndex]!,
    WORKBOOK_CUTOVER_BASELINE.positivePaymentRows - 1,
  );
  let otherPaidIndex = 0;
  const paidDetail = Array.from(
    { length: WORKBOOK_CUTOVER_BASELINE.positivePaymentRows },
    (_, index) => {
      if (index === varianceIndex) return billed[index]!;
      const value = otherPaidDetail[otherPaidIndex]!;
      otherPaidIndex += 1;
      return value;
    },
  );
  const extractionRows = Array.from(
    { length: WORKBOOK_CUTOVER_BASELINE.workbookRows },
    (_, index) => {
      const sourceRowNumber = 20 + index;
      const selected = services(index);
      const amountPaidXof =
        index < WORKBOOK_CUTOVER_BASELINE.positivePaymentRows
          ? paidDetail[index]! + (sourceRowNumber === 159 ? 1_433 : 0)
          : 0;
      const financial = financialSnapshot(index, billed[index]!, amountPaidXof);
      return {
        sourceSheet: "Comparison",
        sourceRowNumber,
        sourceStudentName: `Student ${index}`,
        normalizedStudentName: `STUDENT ${index}`,
        category: financial.sourceCategory,
        fullTuitionAndBoardXof: 4_295_000,
        amountBilledXof: financial.amountBilledXof,
        installmentDueXof: financial.installments.map((row) => row.dueXof),
        installmentPaidXof: financial.installments.map(
          (row) => row.paidDetailXof,
        ),
        amountPaidXof: financial.amountPaidXof,
        note: financial.sourceNote,
        cafeteria: selected.cafeteria.plan === "full",
        housing: selected.housing.option !== "none",
        caution: selected.caution.selected,
        insurance: selected.insurance.selected,
        scholarshipOnTuition: financial.sourceScholarshipOnTuition,
        reconciles: "Yes",
      };
    },
  );
  const extraction = {
    version: 1 as const,
    sourceFileName: "DAUST Students & Billing Final as of August 29 2026.xlsx",
    sourceWorkbookSha256: WORKBOOK_SHA,
    sheetName: "Comparison",
    headerRowNumber: 19,
    firstDataRowNumber: 20,
    lastDataRowNumber: 422,
    controlTotals: {
      rowCount: WORKBOOK_CUTOVER_BASELINE.workbookRows,
      positivePaymentRows: WORKBOOK_CUTOVER_BASELINE.positivePaymentRows,
      zeroPaymentRows: WORKBOOK_CUTOVER_BASELINE.zeroPaymentRows,
      amountBilledXof: WORKBOOK_CUTOVER_BASELINE.billedXof,
      amountPaidXof: WORKBOOK_CUTOVER_BASELINE.paidXof,
      installmentPaidXof: WORKBOOK_CUTOVER_BASELINE.installmentPaidXof,
    },
    qualityFindings: [],
    rows: extractionRows,
  };

  const reviewedStudents = Array.from(
    { length: WORKBOOK_CUTOVER_BASELINE.productionStudents },
    (_, index) => {
      const studentId = `student-id-${index}`;
      const fingerprint = academicFingerprint(index);
      return {
        sourceKey: workbookCutoverProductionStudentKey(studentId),
        sourceRecordSha256: sha(`production-student-${index}`),
        studentId,
        personId: `person-id-${index}`,
        studentNo: `F2026${String(index + 1).padStart(4, "0")}S`,
        firstName: `First${index}`,
        lastName: `Last${index}`,
        loginEmail: `student${index}@mydaust.com`,
        recordStatus:
          index < WORKBOOK_CUTOVER_BASELINE.productionActiveStudents
            ? ("active" as const)
            : ("pending_payment" as const),
        personStatus: "active" as const,
        roles:
          index < WORKBOOK_CUTOVER_BASELINE.productionActiveStudents
            ? ["student"]
            : [],
        academicFingerprint: fingerprint,
        academicFingerprintSha256:
          workbookCutoverAcademicFingerprintDigest(fingerprint),
      };
    },
  );
  const reviewedApplicants = Array.from(
    { length: WORKBOOK_CUTOVER_BASELINE.currentApplicants },
    (_, index) => {
      const applicantId = `applicant-id-${index}`;
      return {
        sourceKey: workbookCutoverApplicantKey(applicantId),
        sourceRecordSha256: sha(`applicant-${index}`),
        applicantId,
        firstName: `ApplicantFirst${index}`,
        lastName: `ApplicantLast${index}`,
        email: `applicant${index}@example.com`,
        stage: "submitted",
      };
    },
  );
  const reviewedProductionSnapshot = {
    schemaVersion: 1 as const,
    capturedAt: "2026-09-01T09:07:48.235Z",
    academicYearLabel: "2026–2027",
    sourceAsOfDate: WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate,
    controls: {
      productionStudents: WORKBOOK_CUTOVER_BASELINE.productionStudents,
      productionActiveStudents:
        WORKBOOK_CUTOVER_BASELINE.productionActiveStudents,
      productionPendingPaymentStudents:
        WORKBOOK_CUTOVER_BASELINE.productionPendingPaymentStudents,
      productionArchivedStudents:
        WORKBOOK_CUTOVER_BASELINE.productionArchivedStudents,
      currentApplicants: WORKBOOK_CUTOVER_BASELINE.currentApplicants,
    },
    students: reviewedStudents,
    applicants: reviewedApplicants.map((applicant) => ({ ...applicant })),
  };

  const workbookRows = extractionRows.map((source, index) => {
    const production = reviewedStudents[index]!;
    const financial = financialSnapshot(
      index,
      source.amountBilledXof,
      source.amountPaidXof,
    );
    return {
      sourceKey: workbookCutoverWorkbookRowKey(
        source.sourceSheet,
        source.sourceRowNumber,
      ),
      sourceSheet: source.sourceSheet,
      sourceRowNumber: source.sourceRowNumber,
      sourceRecordSha256: paymentBalanceExtractionRowDigest(source),
      sourceStudentClaim: source.sourceStudentName,
      identity: {
        decision: "link_existing" as const,
        studentId: production.studentId,
        personId: production.personId,
        studentNo: production.studentNo,
        firstName: production.firstName,
        lastName: production.lastName,
        loginEmail: production.loginEmail,
        recordStatus: production.recordStatus,
        personStatus: production.personStatus,
        roles: production.roles,
        academicFingerprint: production.academicFingerprint,
        academicFingerprintSha256: production.academicFingerprintSha256,
        matchEvidence: "official_student_number" as const,
        review: review(),
      },
      financial,
    };
  });
  const productionStudents = reviewedStudents.map((source, index) =>
    index < WORKBOOK_CUTOVER_BASELINE.workbookRows
      ? {
          decision: "link_workbook" as const,
          ...source,
          workbookRowKey: workbookRows[index]!.sourceKey,
          review: review(),
        }
      : {
          decision: "keep_exception" as const,
          ...source,
          exceptionCode: "reviewed_production_only",
          review: review(
            "This production-only Student is an explicitly documented cutover exception.",
          ),
        },
  );
  const applicants = reviewedApplicants.map((source) => ({
    decision: "preserve" as const,
    ...source,
    review: review(
      "This open Applicant remains an application after the cutover.",
    ),
  }));
  const manifest = {
    schemaVersion: 1 as const,
    importName: "August 29 2026 workbook roster and billing cutover",
    academicYearLabel: "2026–2027",
    academicYearStart: 2026,
    sourceAsOfDate: WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate,
    currency: "XOF" as const,
    sourceWorkbook: {
      fileName: extraction.sourceFileName,
      sha256: WORKBOOK_SHA,
    },
    trustedExtraction: {
      fileName: "trusted-extraction.json",
      sha256: EXTRACTION_SHA,
    },
    productionSnapshot: {
      fileName: "production-snapshot.json",
      sha256: PRODUCTION_SHA,
    },
    reviewWorkbook: {
      fileName: "review.xlsx",
      sha256: REVIEW_WORKBOOK_SHA,
    },
    billingTermLabel: workbookCutoverBillingTermLabel("2026–2027"),
    installmentDueDates: [...DUE_DATES],
    controls: {
      ...WORKBOOK_CUTOVER_BASELINE,
      sourceAsOfDate: undefined,
    },
    dispositionControls: {
      includedWorkbookRows: 403,
      includedBilledXof: WORKBOOK_CUTOVER_BASELINE.billedXof,
      includedPaidXof: WORKBOOK_CUTOVER_BASELINE.paidXof,
      reviewedExclusionRows: 0,
      reviewedExclusionBilledXof: 0,
      reviewedExclusionPaidXof: 0,
      heldWorkbookRows: 0,
      heldBilledXof: 0,
      heldPaidXof: 0,
      linkedProductionStudents: 403,
      keptProductionExceptions: 14,
      archivedProductionStudents: 0,
      heldProductionStudents: 0,
      preservedApplicants: 42,
    },
    workbookRows,
    productionStudents,
    applicants,
    reviewNote:
      "All workbook rows, production Students, and open Applicants are assigned exactly once.",
  };
  delete (manifest.controls as { sourceAsOfDate?: string }).sourceAsOfDate;
  resignManifest(manifest as unknown as WorkbookCutoverManifest);

  const liveSnapshot = {
    schemaVersion: 1 as const,
    capturedAt: "2026-09-01T11:00:00.000Z",
    academicYearLabel: "2026–2027",
    students: reviewedStudents.map((student) => ({
      ...student,
      financialFingerprintSha256: sha(`finance-${student.studentId}`),
      pendingRefundIds: [] as string[],
      inFlightProofSubmissionIds: [] as string[],
      inFlightPaymentLinkIds: [] as string[],
      inFlightPiSpiRequestIds: [] as string[],
    })),
    applicants: reviewedApplicants,
    feeSchedules: [
      {
        id: "fee-schedule-1",
        academicYearLabel: "2026–2027",
        revision: 5,
        status: "approved" as const,
        fingerprintSha256: sha("fee-schedule"),
      },
    ],
    terms: [
      {
        id: "term-1",
        academicYearLabel: "2026–2027",
        label: workbookCutoverBillingTermLabel("2026–2027"),
        status: "active" as const,
        installmentDueDates: [...DUE_DATES],
        fingerprintSha256: sha("term"),
      },
    ],
    billingCatalogFingerprintSha256: sha("billing-catalog"),
    studentNumberSequence: {
      academicYearStart: 2026,
      nextAssignableValue: 1_000,
    },
    existingStudentNumbers: reviewedStudents.map(
      (student) => student.studentNo,
    ),
    existingLoginEmails: reviewedStudents.map((student) => student.loginEmail),
    orphanPendingRefundIds: [] as string[],
  };
  const planInput = {
    manifest,
    trustedExtraction: extraction,
    reviewedProductionSnapshot,
    sourceDigests: {
      workbookSha256: WORKBOOK_SHA,
      trustedExtractionSha256: EXTRACTION_SHA,
      reviewedProductionSnapshotSha256: PRODUCTION_SHA,
    },
    liveSnapshot,
  };
  return planInput;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function recomputeDispositionControls(
  manifest: ReturnType<typeof buildFixture>["manifest"],
) {
  const included = manifest.workbookRows.filter(
    (row) =>
      row.identity.decision === "link_existing" ||
      row.identity.decision === "create_new",
  );
  const excluded = manifest.workbookRows.filter(
    (row) => row.identity.decision === "reviewed_duplicate",
  );
  const held = manifest.workbookRows.filter(
    (row) => row.identity.decision === "hold",
  );
  manifest.dispositionControls = {
    includedWorkbookRows: included.length,
    includedBilledXof: included.reduce(
      (sum, row) => sum + row.financial.amountBilledXof,
      0,
    ),
    includedPaidXof: included.reduce(
      (sum, row) => sum + row.financial.amountPaidXof,
      0,
    ),
    reviewedExclusionRows: excluded.length,
    reviewedExclusionBilledXof: excluded.reduce(
      (sum, row) => sum + row.financial.amountBilledXof,
      0,
    ),
    reviewedExclusionPaidXof: excluded.reduce(
      (sum, row) => sum + row.financial.amountPaidXof,
      0,
    ),
    heldWorkbookRows: held.length,
    heldBilledXof: held.reduce(
      (sum, row) => sum + row.financial.amountBilledXof,
      0,
    ),
    heldPaidXof: held.reduce(
      (sum, row) => sum + row.financial.amountPaidXof,
      0,
    ),
    linkedProductionStudents: manifest.productionStudents.filter(
      (row) => row.decision === "link_workbook",
    ).length,
    keptProductionExceptions: manifest.productionStudents.filter(
      (row) => row.decision === "keep_exception",
    ).length,
    archivedProductionStudents: manifest.productionStudents.filter(
      (row) => row.decision === "archive",
    ).length,
    heldProductionStudents: manifest.productionStudents.filter(
      (row) => row.decision === "hold",
    ).length,
    preservedApplicants: manifest.applicants.length,
  };
}

describe("workbook cutover exhaustive reviewed inputs", () => {
  it("builds an exhaustive signed manifest from all three offline review tables", () => {
    const input = buildFixture();
    const reason =
      "Reviewed and signed against the frozen workbook and production sources.";
    const reviewer = "finance-reviewer@daust.org";
    const reviewDate = "2026-09-01";
    const workbookRows = input.trustedExtraction.rows.map((source, index) => {
      const student = input.reviewedProductionSnapshot.students[index]!;
      return {
        sourceKey: `${source.sourceSheet}!${source.sourceRowNumber}`,
        sourceRowNumber: source.sourceRowNumber,
        category: source.category,
        sourceStudentName: source.sourceStudentName,
        amountBilledXof: source.amountBilledXof,
        amountPaidXof: source.amountPaidXof,
        installmentDueXof: source.installmentDueXof as [
          number,
          number,
          number,
          number,
        ],
        housing: source.housing ? "Yes" : "No",
        cafeteria: source.cafeteria ? "Full" : "None",
        insurance: source.insurance ? "Yes" : "No",
        caution: source.caution ? "Yes" : "No",
        scholarshipOnTuition: source.scholarshipOnTuition,
        sourceNote: source.note ?? "",
        decision: "Link existing",
        officialStudentNo: student.studentNo,
        newFirstName: "",
        newLastName: "",
        duplicateCanonicalRow: "",
        reason,
        reviewer,
        reviewDate,
      };
    });
    const productionStudents = input.reviewedProductionSnapshot.students.map(
      (student, index) => ({
        studentId: student.studentId,
        studentNo: student.studentNo,
        productionName: `${student.firstName} ${student.lastName}`,
        recordStatus: student.recordStatus,
        personStatus: student.personStatus,
        loginEmail: student.loginEmail ?? "",
        decision:
          index < WORKBOOK_CUTOVER_BASELINE.workbookRows
            ? "Link workbook row"
            : "Keep exception",
        workbookRow:
          index < WORKBOOK_CUTOVER_BASELINE.workbookRows
            ? `Comparison!${20 + index}`
            : "",
        reason,
        reviewer,
        reviewDate,
      }),
    );
    const applicants = input.reviewedProductionSnapshot.applicants.map(
      (applicant) => ({
        sourceKey: applicant.sourceKey,
        applicantId: applicant.applicantId,
        applicantName: `${applicant.firstName} ${applicant.lastName}`,
        email: applicant.email,
        stage: applicant.stage,
        sourceRecordSha256: applicant.sourceRecordSha256,
        disposition: "Preserve current application",
        reason,
        reviewer,
        reviewDate,
      }),
    );
    const importInput = {
      reviewWorkbookSha256: "e".repeat(64),
      reviewWorkbookFileName: "completed-review.xlsx",
      extraction: input.trustedExtraction,
      extractionSha256: EXTRACTION_SHA,
      extractionFileName: "trusted-extraction.json",
      productionSnapshot: input.reviewedProductionSnapshot,
      productionSnapshotSha256: PRODUCTION_SHA,
      productionSnapshotFileName: "production-snapshot.json",
    };
    const manifest = buildWorkbookCutoverManifestFromReviewData(importInput, {
      workbookRows,
      productionStudents,
      applicants,
    });
    expect(manifest.workbookRows).toHaveLength(403);
    expect(manifest.productionStudents).toHaveLength(417);
    expect(manifest.applicants).toHaveLength(42);
    expect(manifest.dispositionControls).toMatchObject({
      includedWorkbookRows: 403,
      linkedProductionStudents: 403,
      keptProductionExceptions: 14,
      preservedApplicants: 42,
    });
    expect(() =>
      buildWorkbookCutoverManifestFromReviewData(importInput, {
        workbookRows,
        productionStudents,
        applicants: applicants.map((applicant, index) =>
          index === 0
            ? { ...applicant, sourceRecordSha256: "f".repeat(64) }
            : applicant,
        ),
      }),
    ).toThrow(/source cells drifted/);
  });

  it("derives named awards and manual corrections from workbook note provenance", () => {
    expect(
      deriveWorkbookCutoverAdjustmentKeys(
        "Mention Assez Bien (10%); Family Discount (10%); January enrollment (−250,000)",
      ),
    ).toEqual(["family", "january_enrollment", "merit_10"]);
    expect(
      deriveWorkbookCutoverAdjustmentKeys(
        "(billed corrected −30,000); 30% scholarship",
      ),
    ).toContain("reviewed_manual_adjustment");
  });

  it("accepts an exhaustive bijection and preserves every workbook control", () => {
    const input = buildFixture();
    const parsedManifest = WorkbookCutoverManifestSchema.parse(input.manifest);
    const parsedSnapshot = WorkbookCutoverProductionSnapshotSchema.parse(
      input.reviewedProductionSnapshot,
    );
    expect(parsedManifest.workbookRows).toHaveLength(403);
    expect(parsedManifest.productionStudents).toHaveLength(417);
    expect(parsedSnapshot.applicants).toHaveLength(42);
    expect(() =>
      verifyWorkbookCutoverManifestExtraction(
        parsedManifest,
        input.trustedExtraction,
      ),
    ).not.toThrow();
  });

  it("rejects tampering with every kind of signed review", () => {
    const tamperers: Array<
      (manifest: ReturnType<typeof buildFixture>["manifest"]) => void
    > = [
      (manifest) => {
        manifest.workbookRows[0]!.identity.review.reason =
          "This workbook identity decision was modified after review.";
      },
      (manifest) => {
        manifest.workbookRows[0]!.financial.adjustments[0]!.review.reason =
          "This financial adjustment decision was modified after review.";
      },
      (manifest) => {
        manifest.productionStudents[0]!.review.reason =
          "This production Student decision was modified after review.";
      },
      (manifest) => {
        manifest.applicants[0]!.review.reason =
          "This Applicant preservation decision was modified after review.";
      },
    ];

    for (const tamper of tamperers) {
      const input = buildFixture();
      tamper(input.manifest);
      const parsed = WorkbookCutoverManifestSchema.safeParse(input.manifest);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.map((issue) => issue.message)).toContain(
          "Signed review does not match its decision payload and source anchors",
        );
      }
    }
  });

  it("emits a deterministic, fully reconciled, confirmation-ready plan", () => {
    const input = WorkbookCutoverPlanInputSchema.parse(buildFixture());
    const first = planWorkbookCutover(input);
    const second = planWorkbookCutover(input);
    expect(first.confirmBlocked).toBe(false);
    expect(first.planSha256).toBe(second.planSha256);
    expect(first.controls).toMatchObject({
      workbookRows: 403,
      productionStudents: 417,
      applicants: 42,
      sourceBilledXof: 1_514_469_978,
      sourcePaidXof: 286_551_264,
      includedRows: 403,
      reviewedExclusionRows: 0,
      heldRows: 0,
      accountCreditXof: 1_433,
      preserveApplicants: 42,
      reconciles: true,
    });
    const variance = first.workbookActions.find(
      (action) => action.sourceKey === "workbook:Comparison!159",
    );
    expect(variance?.disposition).toBe("reconstruct_existing");
    if (variance?.disposition === "reconstruct_existing") {
      expect(variance.reconstruction.accountCreditXof).toBe(1_433);
      expect(
        variance.reconstruction.installmentAllocations.reduce(
          (sum, row) => sum + row.amountXof,
          0,
        ),
      ).toBe(variance.reconstruction.amountBilledXof);
      expect(
        variance.reconstruction.componentAllocations.reduce(
          (sum, row) => sum + row.amountXof,
          0,
        ),
      ).toBe(variance.reconstruction.amountBilledXof);
    }
  });

  it("rejects duplicate Student claims instead of moving academics by similarity", () => {
    const input = buildFixture();
    input.manifest.workbookRows[1]!.identity = clone(
      input.manifest.workbookRows[0]!.identity,
    );
    expect(
      WorkbookCutoverManifestSchema.safeParse(input.manifest).success,
    ).toBe(false);
  });

  it("permits a reviewed duplicate only as an explicit financial exclusion", () => {
    const input = buildFixture();
    input.manifest.workbookRows[0]!.identity = {
      decision: "reviewed_duplicate",
      canonicalWorkbookRowKey: input.manifest.workbookRows[1]!.sourceKey,
      duplicateStudentClaim: "Student 1",
      review: review(
        "This physical row duplicates the reviewed canonical workbook row.",
      ),
    };
    const source = input.reviewedProductionSnapshot.students[0]!;
    input.manifest.productionStudents[0] = {
      decision: "keep_exception",
      ...source,
      exceptionCode: "duplicate_workbook_row_excluded",
      review: review(
        "The linked workbook row was excluded as a reviewed duplicate.",
      ),
    };
    recomputeDispositionControls(input.manifest);
    resignManifest(input.manifest as WorkbookCutoverManifest);
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(false);
    expect(plan.controls.reviewedExclusionRows).toBe(1);
    expect(
      plan.controls.includedBilledXof +
        plan.controls.reviewedExclusionBilledXof,
    ).toBe(WORKBOOK_CUTOVER_BASELINE.billedXof);
  });

  it("blocks confirmation for every reviewed hold and every pending refund", () => {
    const input = buildFixture();
    input.manifest.workbookRows[0]!.identity = {
      decision: "hold",
      holdCode: "missing_official_identity",
      candidateStudentNos: [],
      review: review(
        "The official identity is not yet sufficient to create or link.",
      ),
    };
    const source = input.reviewedProductionSnapshot.students[0]!;
    input.manifest.productionStudents[0] = {
      decision: "keep_exception",
      ...source,
      exceptionCode: "workbook_identity_held",
      review: review(
        "This production Student cannot be linked while the workbook row is held.",
      ),
    };
    input.liveSnapshot.students[1]!.pendingRefundIds = ["refund-1"];
    recomputeDispositionControls(input.manifest);
    resignManifest(input.manifest as WorkbookCutoverManifest);
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(true);
    expect(plan.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["workbook_identity_hold", "refund_pending"]),
    );
  });

  it("blocks source-set and academic fingerprint drift", () => {
    const input = buildFixture();
    input.liveSnapshot.students.splice(0, 1);
    input.liveSnapshot.students[0]!.academicFingerprint = clone(
      input.liveSnapshot.students[0]!.academicFingerprint,
    );
    input.liveSnapshot.students[0]!.academicFingerprint.gpaSha256 =
      sha("changed-gpa");
    input.liveSnapshot.students[0]!.academicFingerprintSha256 =
      workbookCutoverAcademicFingerprintDigest(
        input.liveSnapshot.students[0]!.academicFingerprint,
      );
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(true);
    expect(plan.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        "production_student_source_set_drift",
        "academic_fingerprint_drift",
      ]),
    );
  });

  it("blocks ambiguous fee schedules and terms", () => {
    const input = buildFixture();
    input.liveSnapshot.feeSchedules.push({
      ...input.liveSnapshot.feeSchedules[0]!,
      id: "fee-schedule-2",
    });
    input.liveSnapshot.terms.push({
      ...input.liveSnapshot.terms[0]!,
      id: "term-2",
    });
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(true);
    expect(plan.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["ambiguous_fee_schedule", "ambiguous_term"]),
    );
  });

  it("binds the annual billing term to the existing approved schedule dates", () => {
    const input = buildFixture();
    input.liveSnapshot.terms[0]!.installmentDueDates[1] = "2026-11-06";
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(true);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: "term_installment_dates_mismatch" }),
    );
  });

  it("anchors every Student finance ledger in the confirmation plan digest", () => {
    const input = WorkbookCutoverPlanInputSchema.parse(buildFixture());
    const dryRun = planWorkbookCutover(input);
    expect(workbookCutoverPlanDigestMatches(dryRun, dryRun.planSha256)).toBe(
      true,
    );
    input.liveSnapshot.students[0]!.financialFingerprintSha256 = sha(
      "finance-changed-after-dry-run",
    );
    const confirmationReplan = planWorkbookCutover(input);
    expect(confirmationReplan.planSha256).not.toBe(dryRun.planSha256);
    expect(
      workbookCutoverPlanDigestMatches(confirmationReplan, dryRun.planSha256),
    ).toBe(false);
  });

  it("keeps the live-state digest stable when only the observation time changes", () => {
    const input = WorkbookCutoverPlanInputSchema.parse(buildFixture());
    const firstDigest = workbookCutoverLiveSnapshotDigest(input.liveSnapshot);
    input.liveSnapshot.capturedAt = "2026-09-01T11:05:00.000Z";
    expect(workbookCutoverLiveSnapshotDigest(input.liveSnapshot)).toBe(
      firstDigest,
    );
  });

  it("accepts a freshly reviewed larger production and Applicant source set", () => {
    const input = buildFixture();
    const addedStudent = clone(input.reviewedProductionSnapshot.students[0]!);
    addedStudent.studentId = "student-id-new";
    addedStudent.personId = "person-id-new";
    addedStudent.studentNo = "S20269999NS";
    addedStudent.firstName = "New";
    addedStudent.lastName = "Student";
    addedStudent.loginEmail = "new.student@mydaust.com";
    addedStudent.sourceKey = workbookCutoverProductionStudentKey(
      addedStudent.studentId,
    );
    addedStudent.sourceRecordSha256 = sha("production-student-new");
    input.reviewedProductionSnapshot.students.push(addedStudent);
    input.reviewedProductionSnapshot.controls.productionStudents += 1;
    input.reviewedProductionSnapshot.controls.productionActiveStudents += 1;
    input.manifest.productionStudents.push({
      decision: "keep_exception",
      ...addedStudent,
      exceptionCode: "admitted_after_initial_review",
      review: review(
        "This later production Student was included in the refreshed exhaustive review.",
      ),
    });
    input.manifest.controls.productionStudents += 1;
    input.manifest.controls.productionActiveStudents += 1;
    input.liveSnapshot.students.push({
      ...addedStudent,
      financialFingerprintSha256: sha("finance-new-student"),
      pendingRefundIds: [],
      inFlightProofSubmissionIds: [],
      inFlightPaymentLinkIds: [],
      inFlightPiSpiRequestIds: [],
    });
    input.liveSnapshot.existingStudentNumbers.push(addedStudent.studentNo);
    input.liveSnapshot.existingLoginEmails.push(addedStudent.loginEmail);

    const addedApplicant = {
      sourceKey: workbookCutoverApplicantKey("applicant-id-new"),
      sourceRecordSha256: sha("applicant-new"),
      applicantId: "applicant-id-new",
      firstName: "Later",
      lastName: "Applicant",
      email: "later.applicant@example.com",
      stage: "submitted",
    };
    input.reviewedProductionSnapshot.applicants.push(addedApplicant);
    input.reviewedProductionSnapshot.controls.currentApplicants += 1;
    input.manifest.applicants.push({
      decision: "preserve",
      ...addedApplicant,
      review: review(
        "This later open Applicant was included in the refreshed exhaustive review.",
      ),
    });
    input.manifest.controls.currentApplicants += 1;
    input.liveSnapshot.applicants.push(addedApplicant);
    recomputeDispositionControls(input.manifest);
    resignManifest(input.manifest as WorkbookCutoverManifest);

    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(false);
    expect(plan.controls.productionStudents).toBe(418);
    expect(plan.controls.applicants).toBe(43);
    expect(plan.controls.preserveApplicants).toBe(43);
  });

  it("preplans locked permanent numbers and collision-safe SIS-only login identities", () => {
    const input = buildFixture();
    input.manifest.workbookRows[0]!.identity = {
      decision: "create_new",
      firstName: "Ada",
      lastName: "Lovelace",
      personalEmail: "ada@example.com",
      review: review(
        "No official existing Student matches this reviewed workbook identity.",
      ),
    };
    const source = input.reviewedProductionSnapshot.students[0]!;
    input.manifest.productionStudents[0] = {
      decision: "keep_exception",
      ...source,
      exceptionCode: "reviewed_production_only",
      review: review(
        "This production-only Student is retained as an explicit exception.",
      ),
    };
    input.liveSnapshot.existingLoginEmails.push("ada.lovelace@mydaust.com");
    recomputeDispositionControls(input.manifest);
    resignManifest(input.manifest as WorkbookCutoverManifest);
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(false);
    const created = plan.workbookActions.find(
      (action) => action.sourceKey === "workbook:Comparison!20",
    );
    expect(created).toMatchObject({
      disposition: "create_and_reconstruct",
      plannedStudentNo: "S20261000AL",
      plannedLoginEmail: "ada.lovelace.2@mydaust.com",
      programCode: null,
    });
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({
        code: "program_unassigned",
        sourceKey: "workbook:Comparison!20",
      }),
    );
  });

  it("blocks any mismatch between reviewed rows and trusted extraction", () => {
    const input = buildFixture();
    input.manifest.workbookRows[0]!.sourceStudentClaim = "Changed claim";
    const plan = planWorkbookCutover(
      WorkbookCutoverPlanInputSchema.parse(input),
    );
    expect(plan.confirmBlocked).toBe(true);
    expect(
      plan.blockers.some(
        (blocker) => blocker.code === "workbook_source_set_drift",
      ),
    ).toBe(true);
  });

  it("allows the +1,433 XOF variance only on Comparison row 159", () => {
    const input = buildFixture();
    const first = input.manifest.workbookRows[0]!;
    const second = input.manifest.workbookRows[1]!;
    first.financial.amountPaidXof += 1;
    first.financial.accountCreditXof += 1;
    second.financial.amountPaidXof -= 1;
    const parsed = WorkbookCutoverManifestSchema.safeParse(input.manifest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.map((issue) => issue.message).join("\n"),
      ).toMatch(/Only Comparison row 159/);
    }
  });
});

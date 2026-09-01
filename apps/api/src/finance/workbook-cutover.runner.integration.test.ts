import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import {
  INITIAL_BILLING_ADJUSTMENT_DEFINITIONS,
  INITIAL_BILLING_SERVICE_OPTIONS,
} from "@mydaust/shared";
import { paymentBalanceExtractionRowDigest } from "./payment-balance-import.extraction.js";
import { auditWorkbookCutoverBatch } from "./workbook-cutover.audit.js";
import {
  WorkbookCutoverProductionSnapshotSchema,
  WorkbookCutoverTrustedExtractionSchema,
} from "./workbook-cutover.extraction.js";
import {
  WORKBOOK_CUTOVER_BASELINE,
  WORKBOOK_CUTOVER_CAUTION_BPS,
  WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES,
  WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF,
  WorkbookCutoverManifestSchema,
  workbookCutoverBillingTermLabel,
  workbookCutoverManifestDigest,
  workbookCutoverProductionStudentKey,
  workbookCutoverReviewSignature,
  workbookCutoverWorkbookRowKey,
} from "./workbook-cutover.manifest.js";
import {
  WorkbookCutoverBlockedError,
  executeWorkbookCutover,
  planWorkbookCutoverFromDatabase,
} from "./workbook-cutover.runner.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { WorkbookCutoverAttestationService } from "./workbook-cutover-attestation.service.js";
import {
  captureWorkbookCutoverAcademicFingerprints,
  captureWorkbookCutoverLiveSnapshot,
} from "./workbook-cutover.snapshot.js";

const SCHEMA = `workbook_cutover_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

const WORKBOOK_SHA = "a".repeat(64);
const EXTRACTION_SHA = "b".repeat(64);
const PRODUCTION_SHA = "c".repeat(64);
const REVIEW_SIGNATURE = "d".repeat(64);
const DUE_DATES = [...WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES];
const CANONICAL_INDEX = 58;
const ACTIVATION_INDEX = CANONICAL_INDEX + 1;
const ACCOUNT_CREDIT_INDEX = 159 - 20;

let prisma: PrismaClient;
let actorEmail: string;
let actorId: string;
let studentId: string;
let activationStudentId: string;
let accountCreditStudentId: string;
let termId: string;
let oldInvoiceId: string;
let oldPaymentId: string;
let activationOldInvoiceId: string;
let oldVoidInvoiceId: string;
let failedPaymentId: string;
let indirectLinkId: string;
let indirectLinkSubmissionId: string;
let indirectPaymentSubmissionId: string;
let indirectLinkPiSpiId: string;
let indirectPaymentPiSpiId: string;
let pendingApplicantId: string;
let activationApplicantId: string;
let applicantLegacyLinkId: string;
let activationLegacyLinkId: string;
let applicantOnlySubmissionId: string;
let applicantOnlyPiSpiId: string;
let archivedStudentId: string;
let archivedStudentPersonId: string;
let archivedApplicantId: string;
let archivedPendingPaymentId: string;
let archivedPointerPaymentLinkId: string;
let archivedPaymentLinkIds: string[];
let archivedPaymentSubmissionIds: string[];
let archivedPiSpiRequestIds: string[];

function distribute(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

function allocateAcrossDue(due: readonly number[], paid: number): number[] {
  let remaining = paid;
  return due.map((amount) => {
    const applied = Math.min(amount, remaining);
    remaining -= applied;
    return applied;
  });
}

function review(
  reason = "Reviewed and signed against the exact institutional source records.",
) {
  return {
    reviewedBy: actorEmail,
    reviewedAt: "2026-09-01T10:00:00.000Z",
    reason,
    signedOff: true as const,
    signatureSha256: REVIEW_SIGNATURE,
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
  // Preserve the baseline service counts while making the included canonical
  // row exercise the real row-306 shape: no housing charge, but a refundable
  // caution explicitly based on the double-housing option.
  const cautionWithoutHousing = index === CANONICAL_INDEX;
  const housing = cautionWithoutHousing
    ? ("none" as const)
    : index === CANONICAL_INDEX - 1
      ? ("double" as const)
      : housingOption(index);
  const housingAmount =
    WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF[`housing_${housing}`];
  const cafeteria = index < WORKBOOK_CUTOVER_BASELINE.cafeteriaRows;
  const insurance = index < WORKBOOK_CUTOVER_BASELINE.insuranceRows;
  const caution =
    cautionWithoutHousing ||
    (index >= 58 && index < 58 + WORKBOOK_CUTOVER_BASELINE.cautionRows);
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
      basisHousingOption: caution
        ? cautionWithoutHousing
          ? ("double" as const)
          : housing
        : ("none" as const),
      percentageBps: caution ? WORKBOOK_CUTOVER_CAUTION_BPS : (0 as const),
      amountXof: caution
        ? cautionWithoutHousing
          ? 68_000
          : Math.round(housingAmount / 10)
        : 0,
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
            optionCode: selected.caution.basisHousingOption,
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
              "The workbook tuition percentage was independently reviewed.",
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
            targetComponentKey: null,
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
              "The workbook net bill is authoritative and this explicit residual reconciles it.",
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
  const due = distribute(billedXof, 4);
  const sourceRowNumber = 20 + index;
  const installmentPaidXof =
    sourceRowNumber === 159 ? paidXof - 1_433 : paidXof;
  const paidDetail = allocateAcrossDue(due, installmentPaidXof);
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
    accountCreditXof: sourceRowNumber === 159 ? 1_433 : 0,
  };
}

function extractionFixture() {
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
  // Keep the included Student below the first-installment cash gate so the
  // integration exercises canonical onboarding-link rotation. Move the same
  // cash to another positive-payment row to preserve every workbook control.
  const canonicalPaidXof = paidDetail[CANONICAL_INDEX]!;
  paidDetail[CANONICAL_INDEX] = 100;
  paidDetail[CANONICAL_INDEX + 1] =
    paidDetail[CANONICAL_INDEX + 1]! + canonicalPaidXof - 100;
  const rows = Array.from(
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
  return WorkbookCutoverTrustedExtractionSchema.parse({
    version: 1,
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
    rows,
  });
}

async function reviewedInputs(recordAttestation = true) {
  const extraction = extractionFixture();
  const live = await captureWorkbookCutoverLiveSnapshot(prisma, {
    academicYearLabel: "2026–2027",
    academicYearStart: 2026,
  });
  const reviewedStudents = live.students.map((student) => ({
    sourceKey: student.sourceKey,
    sourceRecordSha256: student.sourceRecordSha256,
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
  }));
  const reviewedStudent = reviewedStudents.find(
    (student) => student.studentId === studentId,
  )!;
  const reviewedActivationStudent = reviewedStudents.find(
    (student) => student.studentId === activationStudentId,
  )!;
  const reviewedAccountCreditStudent = reviewedStudents.find(
    (student) => student.studentId === accountCreditStudentId,
  )!;
  const reviewedApplicants = live.applicants.map((applicant) => ({
    sourceKey: applicant.sourceKey,
    sourceRecordSha256: applicant.sourceRecordSha256,
    applicantId: applicant.applicantId,
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    email: applicant.email,
    stage: applicant.stage,
  }));
  const reviewedProductionSnapshot =
    WorkbookCutoverProductionSnapshotSchema.parse({
      schemaVersion: 1,
      capturedAt: "2026-09-01T09:00:00.000Z",
      academicYearLabel: "2026–2027",
      sourceAsOfDate: WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate,
      controls: {
        productionStudents: WORKBOOK_CUTOVER_BASELINE.productionStudents,
        productionActiveStudents:
          WORKBOOK_CUTOVER_BASELINE.productionActiveStudents,
        productionPendingPaymentStudents:
          WORKBOOK_CUTOVER_BASELINE.productionPendingPaymentStudents,
        productionArchivedStudents: 0,
        currentApplicants: WORKBOOK_CUTOVER_BASELINE.currentApplicants,
      },
      students: reviewedStudents,
      applicants: reviewedApplicants,
    });
  const canonicalSource = extraction.rows[CANONICAL_INDEX]!;
  const canonicalKey = workbookCutoverWorkbookRowKey(
    canonicalSource.sourceSheet,
    canonicalSource.sourceRowNumber,
  );
  const activationSource = extraction.rows[ACTIVATION_INDEX]!;
  const activationKey = workbookCutoverWorkbookRowKey(
    activationSource.sourceSheet,
    activationSource.sourceRowNumber,
  );
  const accountCreditSource = extraction.rows[ACCOUNT_CREDIT_INDEX]!;
  const accountCreditKey = workbookCutoverWorkbookRowKey(
    accountCreditSource.sourceSheet,
    accountCreditSource.sourceRowNumber,
  );
  const workbookRows = extraction.rows.map((source, index) => {
    const financial = financialSnapshot(
      index,
      source.amountBilledXof,
      source.amountPaidXof,
    );
    const sourceKey = workbookCutoverWorkbookRowKey(
      source.sourceSheet,
      source.sourceRowNumber,
    );
    return {
      sourceKey,
      sourceSheet: source.sourceSheet,
      sourceRowNumber: source.sourceRowNumber,
      sourceRecordSha256: paymentBalanceExtractionRowDigest(source),
      sourceStudentClaim: source.sourceStudentName,
      identity:
        index === CANONICAL_INDEX
          ? {
              decision: "link_existing" as const,
              studentId: reviewedStudent.studentId,
              personId: reviewedStudent.personId,
              studentNo: reviewedStudent.studentNo,
              firstName: reviewedStudent.firstName,
              lastName: reviewedStudent.lastName,
              loginEmail: reviewedStudent.loginEmail,
              recordStatus: reviewedStudent.recordStatus,
              personStatus: reviewedStudent.personStatus,
              roles: reviewedStudent.roles,
              academicFingerprint: reviewedStudent.academicFingerprint,
              academicFingerprintSha256:
                reviewedStudent.academicFingerprintSha256,
              matchEvidence: "official_student_number" as const,
              review: review(),
            }
          : index === ACTIVATION_INDEX
            ? {
                decision: "link_existing" as const,
                studentId: reviewedActivationStudent.studentId,
                personId: reviewedActivationStudent.personId,
                studentNo: reviewedActivationStudent.studentNo,
                firstName: reviewedActivationStudent.firstName,
                lastName: reviewedActivationStudent.lastName,
                loginEmail: reviewedActivationStudent.loginEmail,
                recordStatus: reviewedActivationStudent.recordStatus,
                personStatus: reviewedActivationStudent.personStatus,
                roles: reviewedActivationStudent.roles,
                academicFingerprint:
                  reviewedActivationStudent.academicFingerprint,
                academicFingerprintSha256:
                  reviewedActivationStudent.academicFingerprintSha256,
                matchEvidence: "official_student_number" as const,
                review: review(),
              }
            : index === ACCOUNT_CREDIT_INDEX
              ? {
                  decision: "link_existing" as const,
                  studentId: reviewedAccountCreditStudent.studentId,
                  personId: reviewedAccountCreditStudent.personId,
                  studentNo: reviewedAccountCreditStudent.studentNo,
                  firstName: reviewedAccountCreditStudent.firstName,
                  lastName: reviewedAccountCreditStudent.lastName,
                  loginEmail: reviewedAccountCreditStudent.loginEmail,
                  recordStatus: reviewedAccountCreditStudent.recordStatus,
                  personStatus: reviewedAccountCreditStudent.personStatus,
                  roles: reviewedAccountCreditStudent.roles,
                  academicFingerprint:
                    reviewedAccountCreditStudent.academicFingerprint,
                  academicFingerprintSha256:
                    reviewedAccountCreditStudent.academicFingerprintSha256,
                  matchEvidence: "official_student_number" as const,
                  review: review(),
                }
              : {
                  decision: "reviewed_duplicate" as const,
                  canonicalWorkbookRowKey: canonicalKey,
                  duplicateStudentClaim: canonicalSource.sourceStudentName,
                  review: review(
                    "This integration source row is a reviewed duplicate used to exercise exclusion controls.",
                  ),
                },
      financial,
    };
  });
  const included = workbookRows[CANONICAL_INDEX]!;
  const activationIncluded = workbookRows[ACTIVATION_INDEX]!;
  const accountCreditIncluded = workbookRows[ACCOUNT_CREDIT_INDEX]!;
  const includedBill =
    included.financial.amountBilledXof +
    activationIncluded.financial.amountBilledXof +
    accountCreditIncluded.financial.amountBilledXof;
  const includedPaid =
    included.financial.amountPaidXof +
    activationIncluded.financial.amountPaidXof +
    accountCreditIncluded.financial.amountPaidXof;
  const manifestInput = {
    schemaVersion: 1,
    importName: "Workbook cutover runner integration fixture",
    academicYearLabel: "2026–2027",
    academicYearStart: 2026,
    sourceAsOfDate: WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate,
    currency: "XOF",
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
      fileName: "completed-review.xlsx",
      sha256: "e".repeat(64),
    },
    billingTermLabel: workbookCutoverBillingTermLabel("2026–2027"),
    installmentDueDates: DUE_DATES,
    controls: {
      workbookRows: WORKBOOK_CUTOVER_BASELINE.workbookRows,
      productionStudents: WORKBOOK_CUTOVER_BASELINE.productionStudents,
      productionActiveStudents:
        WORKBOOK_CUTOVER_BASELINE.productionActiveStudents,
      productionPendingPaymentStudents:
        WORKBOOK_CUTOVER_BASELINE.productionPendingPaymentStudents,
      productionArchivedStudents: 0,
      currentApplicants: WORKBOOK_CUTOVER_BASELINE.currentApplicants,
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
      includedWorkbookRows: 3,
      includedBilledXof: includedBill,
      includedPaidXof: includedPaid,
      reviewedExclusionRows: 400,
      reviewedExclusionBilledXof:
        WORKBOOK_CUTOVER_BASELINE.billedXof - includedBill,
      reviewedExclusionPaidXof:
        WORKBOOK_CUTOVER_BASELINE.paidXof - includedPaid,
      heldWorkbookRows: 0,
      heldBilledXof: 0,
      heldPaidXof: 0,
      linkedProductionStudents: 3,
      keptProductionExceptions:
        WORKBOOK_CUTOVER_BASELINE.productionStudents - 4,
      archivedProductionStudents: 1,
      heldProductionStudents: 0,
      preservedApplicants: WORKBOOK_CUTOVER_BASELINE.currentApplicants,
    },
    workbookRows,
    productionStudents: reviewedStudents.map((student) =>
      student.studentId === studentId
        ? {
            decision: "link_workbook" as const,
            ...student,
            workbookRowKey: canonicalKey,
            review: review(),
          }
        : student.studentId === activationStudentId
          ? {
              decision: "link_workbook" as const,
              ...student,
              workbookRowKey: activationKey,
              review: review(),
            }
          : student.studentId === accountCreditStudentId
            ? {
                decision: "link_workbook" as const,
                ...student,
                workbookRowKey: accountCreditKey,
                review: review(),
              }
            : student.studentId === archivedStudentId
              ? {
                  decision: "archive" as const,
                  ...student,
                  revokeStudentRole: true as const,
                  bumpSessionVersion: true as const,
                  suspendPersonOnlyWhenNoOtherInstitutionalRole: true as const,
                  review: review(
                    "This production-only Student was signed for archive in the integration cutover.",
                  ),
                }
              : {
                  decision: "keep_exception" as const,
                  ...student,
                  exceptionCode: "integration_reviewed_production_only",
                  review: review(
                    "This production-only Student is an explicitly reviewed integration exception.",
                  ),
                },
    ),
    applicants: reviewedApplicants.map((applicant) => ({
      decision: "preserve" as const,
      ...applicant,
      review: review(
        "This open Applicant remains an application through the integration cutover.",
      ),
    })),
    reviewNote:
      "Every integration workbook row and production Student has exactly one signed disposition.",
  };
  const signatureContext = {
    reviewWorkbookSha256: "e".repeat(64),
    sourceWorkbookSha256: WORKBOOK_SHA,
    extractionSha256: EXTRACTION_SHA,
    productionSnapshotSha256: PRODUCTION_SHA,
  };
  for (const row of manifestInput.workbookRows) {
    const { review: identityReview, ...identityPayload } = row.identity;
    identityReview.signatureSha256 = workbookCutoverReviewSignature({
      scope: "workbook_identity",
      sourceKey: row.sourceKey,
      payload: identityPayload,
      reviewedBy: identityReview.reviewedBy,
      reviewedAt: identityReview.reviewedAt,
      reason: identityReview.reason,
      context: signatureContext,
    });
    for (const adjustment of row.financial.adjustments) {
      const { review: adjustmentReview, ...adjustmentPayload } = adjustment;
      const scope =
        adjustment.definitionKey === "social_help" &&
        adjustment.targetComponentKey === null
          ? "financial_adjustment:social_help_manual"
          : adjustment.definitionKey === "reviewed_manual_adjustment" &&
              adjustment.targetComponentKey === null
            ? "financial_adjustment:final_reconciliation"
            : `financial_adjustment:${adjustment.definitionKey}`;
      adjustmentReview.signatureSha256 = workbookCutoverReviewSignature({
        scope,
        sourceKey: row.sourceKey,
        payload: adjustmentPayload,
        reviewedBy: adjustmentReview.reviewedBy,
        reviewedAt: adjustmentReview.reviewedAt,
        reason: adjustmentReview.reason,
        context: signatureContext,
      });
    }
  }
  for (const student of manifestInput.productionStudents) {
    const { review: studentReview, ...studentPayload } = student;
    studentReview.signatureSha256 = workbookCutoverReviewSignature({
      scope: "production_student",
      sourceKey: student.sourceKey,
      payload: studentPayload,
      reviewedBy: studentReview.reviewedBy,
      reviewedAt: studentReview.reviewedAt,
      reason: studentReview.reason,
      context: signatureContext,
    });
  }
  for (const applicant of manifestInput.applicants) {
    const { review: applicantReview, ...applicantPayload } = applicant;
    applicantReview.signatureSha256 = workbookCutoverReviewSignature({
      scope: "applicant_preservation",
      sourceKey: applicant.sourceKey,
      payload: applicantPayload,
      reviewedBy: applicantReview.reviewedBy,
      reviewedAt: applicantReview.reviewedAt,
      reason: applicantReview.reason,
      context: signatureContext,
    });
  }
  const manifest = WorkbookCutoverManifestSchema.parse(manifestInput);
  if (recordAttestation) {
    await new WorkbookCutoverAttestationService(
      prisma as unknown as PrismaService,
    ).attest(
      {
        personId: actorId,
        roles: ["admin"],
        email: actorEmail,
        name: "Cutover Reviewer",
      },
      workbookCutoverManifestDigest(manifest),
    );
  }
  return {
    manifest,
    sources: {
      trustedExtraction: extraction,
      reviewedProductionSnapshot,
      sourceDigests: {
        workbookSha256: WORKBOOK_SHA,
        trustedExtractionSha256: EXTRACTION_SHA,
        reviewedProductionSnapshotSha256: PRODUCTION_SHA,
      },
    },
    included,
    activationIncluded,
    accountCreditIncluded,
  };
}

describe.skipIf(!DB_URL)("workbook cutover runner transaction", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    actorEmail = `cutover-reviewer-${randomUUID()}@test.local`;
    const actor = await prisma.person.create({
      data: {
        email: actorEmail,
        firstName: "Cutover",
        lastName: "Reviewer",
        kind: "staff",
        roles: ["admin"],
      },
    });
    actorId = actor.id;
    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
      ],
      skipDuplicates: true,
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        label: "2026–2027",
        status: "active",
        startsOn: new Date("2026-08-01T00:00:00.000Z"),
        endsOn: new Date("2027-07-31T00:00:00.000Z"),
      },
    });
    const term = await prisma.term.create({
      data: {
        name: workbookCutoverBillingTermLabel("2026–2027"),
        startDate: new Date(`${DUE_DATES[0]}T00:00:00.000Z`),
        endDate: new Date(`${DUE_DATES[3]}T00:00:00.000Z`),
        academicYearId: academicYear.id,
        semester: "Annual",
        status: "planning",
      },
    });
    termId = term.id;
    await prisma.feeSchedule.create({
      data: {
        academicYearLabel: academicYear.label,
        revision: 1,
        status: "approved",
        reason: "Cutover integration fixture",
        createdById: actor.id,
        approvedById: actor.id,
        approvedAt: new Date("2026-09-01T08:00:00.000Z"),
        components: {
          create: {
            key: "tuition",
            label: "Tuition",
            costCenterCode: "9100",
            annualAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
            defaultSelected: true,
          },
        },
        rows: {
          create: DUE_DATES.map((dueOn, index) => ({
            academicYearLabel: academicYear.label,
            semester: index < 2 ? "Fall" : "Spring",
            label: `Installment ${index + 1}`,
            sequence: index + 1,
            dueOn: new Date(`${dueOn}T00:00:00.000Z`),
            amountFullXof: 1,
            amountTuitionXof: 1,
          })),
        },
      },
    });
    await prisma.billingServiceOption.createMany({
      data: INITIAL_BILLING_SERVICE_OPTIONS.map((option) => ({
        ...option,
        academicYearLabel: academicYear.label,
        active: true,
      })),
    });
    await prisma.billingAdjustmentDefinition.createMany({
      data: INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.map((definition) => ({
        ...definition,
        academicYearLabel: academicYear.label,
        active: true,
      })),
    });
    await prisma.studentNumberSequence.create({
      data: { academicYearStart: 2026, nextValue: 500 },
    });
    const person = await prisma.person.create({
      data: {
        email: `runner-student-${randomUUID()}@mydaust.com`,
        firstName: "Runner",
        lastName: "Student",
        kind: "student",
        roles: [],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: "F20260001RS",
        recordStatus: "pending_payment",
      },
    });
    studentId = student.id;
    const extraIdentities = Array.from(
      { length: WORKBOOK_CUTOVER_BASELINE.productionStudents - 1 },
      (_, index) => {
        // Reserve the first extra identity for a second linked, payment-pending
        // Student whose workbook cash will activate them during the cutover.
        // The following 401 remain active so the production controls stay exact.
        const active =
          index > 0 &&
          index <= WORKBOOK_CUTOVER_BASELINE.productionActiveStudents;
        return {
          personId: randomUUID(),
          studentId: randomUUID(),
          studentNo: `F2026${String(index + 2).padStart(5, "0")}X`,
          email: `cutover-extra-${index + 2}@mydaust.com`,
          active,
        };
      },
    );
    activationStudentId = extraIdentities[0]!.studentId;
    archivedStudentId = extraIdentities[1]!.studentId;
    archivedStudentPersonId = extraIdentities[1]!.personId;
    accountCreditStudentId = extraIdentities[2]!.studentId;
    await prisma.person.createMany({
      data: extraIdentities.map((identity, index) => ({
        id: identity.personId,
        email: identity.email,
        firstName: `Extra${index + 2}`,
        lastName: "Student",
        kind: "student",
        roles: identity.active ? ["student"] : [],
        status: "active",
      })),
    });
    await prisma.student.createMany({
      data: extraIdentities.map((identity) => ({
        id: identity.studentId,
        personId: identity.personId,
        studentNo: identity.studentNo,
        dateOfBirth:
          identity.studentId === activationStudentId
            ? new Date("2005-02-14T00:00:00.000Z")
            : null,
        recordStatus: identity.active
          ? ("active" as const)
          : ("pending_payment" as const),
      })),
    });
    await prisma.applicant.createMany({
      data: Array.from(
        { length: WORKBOOK_CUTOVER_BASELINE.currentApplicants },
        (_, index) => ({
          id: randomUUID(),
          firstName: `Applicant${index + 1}`,
          lastName: "Pending",
          email: `cutover-applicant-${index + 1}@example.test`,
          stage: index % 2 === 0 ? "submitted" : "review",
        }),
      ),
    });
    const department = await prisma.department.create({
      data: { code: `CUT${randomUUID().slice(0, 5)}`, name: "Cutover Studies" },
    });
    const course = await prisma.course.create({
      data: {
        code: `CUT-${randomUUID().slice(0, 8)}`,
        title: "Cutover History",
        credits: 3,
        departmentId: department.id,
      },
    });
    const section = await prisma.section.create({
      data: {
        courseId: course.id,
        termId: term.id,
        sectionCode: "A",
        capacity: 20,
        days: "MWF",
        startTime: "09:00",
        endTime: "10:00",
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: student.id,
        sectionId: section.id,
        status: "completed",
        grade: "A",
      },
    });
    const gradeSubmission = await prisma.gradeSubmission.create({
      data: {
        sectionId: section.id,
        status: "approved",
        submittedById: actor.id,
        submittedAt: new Date("2026-08-20T10:00:00.000Z"),
        approvedById: actor.id,
        approvedAt: new Date("2026-08-21T10:00:00.000Z"),
        version: 1,
      },
    });
    const gradeItem = await prisma.gradeSubmissionItem.create({
      data: {
        gradeSubmissionId: gradeSubmission.id,
        version: 1,
        enrollmentId: enrollment.id,
        studentId: student.id,
        courseId: course.id,
        termId: term.id,
        courseCode: course.code,
        courseTitle: course.title,
        termLabel: term.name,
        credits: 3,
        grade: "A",
        gradePoints: 4,
        countsTowardGpa: true,
        countsTowardCredits: true,
      },
    });
    await prisma.transcriptEntry.create({
      data: {
        studentId: student.id,
        source: "approved_enrollment",
        sourceKey: `cutover-transcript-${randomUUID()}`,
        gradeSubmissionItemId: gradeItem.id,
        enrollmentId: enrollment.id,
        courseId: course.id,
        termId: term.id,
        courseCode: course.code,
        courseTitle: course.title,
        termLabel: term.name,
        grade: "A",
        credits: 3,
        earnedCredits: 3,
        gradePoints: 4,
        countsTowardGpa: true,
        countsTowardCredits: true,
      },
    });

    const oldInvoice = await prisma.invoice.create({
      data: {
        number: `OLD-${randomUUID()}`,
        studentId: student.id,
        termId: term.id,
        totalAmount: 1_000,
        amountPaid: 500,
        status: "partial",
        packageType: "standard_full",
        academicYearLabel: academicYear.label,
        costCenterCode: "9100",
        revision: 4,
        components: {
          create: {
            kind: "tuition",
            label: "Old tuition",
            costCenterCode: "9100",
            grossAmountXof: 1_000,
            amountXof: 1_000,
          },
        },
        plan: {
          create: {
            createdById: actor.id,
            installments: {
              create: {
                sequence: 1,
                dueDate: new Date("2026-08-15T00:00:00.000Z"),
                amountDue: 1_000,
                amountPaid: 500,
                status: "partial",
              },
            },
          },
        },
      },
      include: { components: true, plan: { include: { installments: true } } },
    });
    oldInvoiceId = oldInvoice.id;
    const oldPayment = await prisma.payment.create({
      data: {
        invoiceId: oldInvoice.id,
        studentId: student.id,
        amount: 500,
        method: "legacy_unknown",
        status: "success",
        provider: "integration",
        providerRef: `old-${randomUUID()}`,
        source: "integration",
        settledAt: new Date("2026-08-16T12:00:00.000Z"),
        allocations: {
          create: {
            installmentId: oldInvoice.plan!.installments[0]!.id,
            amount: 500,
          },
        },
        componentAllocations: {
          create: {
            invoiceComponentId: oldInvoice.components[0]!.id,
            amountXof: 500,
          },
        },
      },
    });
    oldPaymentId = oldPayment.id;
    const pendingApplicant = await prisma.applicant.create({
      data: {
        firstName: "Runner",
        lastName: "Student",
        email: `runner-accepted-${randomUUID()}@example.test`,
        stage: "accepted",
        onboardingStatus: "payment_pending",
        studentId: student.id,
        admissionAcademicYearId: academicYear.id,
        enrollmentInvoiceId: oldInvoice.id,
        requiredEnrollmentCashXof: 1_000,
        acceptedAt: new Date("2026-08-10T10:00:00.000Z"),
        paymentPendingAt: new Date("2026-08-10T10:05:00.000Z"),
      },
    });
    pendingApplicantId = pendingApplicant.id;
    // Model a legacy link whose ownership is carried only by Applicant, plus
    // attempts that likewise omit Student, invoice, Payment, and link IDs.
    const applicantLegacyLink = await prisma.paymentLink.create({
      data: {
        token: `applicant-legacy-${randomUUID()}`,
        amountXof: 500,
        purpose: "Legacy enrollment balance",
        payeeName: "Runner Student",
        dueDate: oldInvoice.plan!.installments[0]!.dueDate,
        onboardingApplicantId: pendingApplicant.id,
        status: "active",
      },
    });
    applicantLegacyLinkId = applicantLegacyLink.id;
    await prisma.applicant.update({
      where: { id: pendingApplicant.id },
      data: { activeOnboardingPaymentLinkId: applicantLegacyLink.id },
    });
    const applicantOnlySubmission = await prisma.paymentSubmission.create({
      data: {
        status: "submitted",
        activeKey: `applicant-${randomUUID()}`,
        source: "integration",
        applicantId: pendingApplicant.id,
        submittedAmountXof: 500,
        contactEmail: "runner@example.test",
        bankSnapshot: { bank: "test" },
      },
    });
    applicantOnlySubmissionId = applicantOnlySubmission.id;
    const applicantOnlyPiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `applicant-${randomUUID()}`,
        status: "sent",
        source: "integration",
        payerAlias: "+221700000003",
        amountXof: 500,
        motif: "Legacy Applicant-only attempt",
        applicantId: pendingApplicant.id,
      },
    });
    applicantOnlyPiSpiId = applicantOnlyPiSpi.id;
    await prisma.annualBillingProfile.create({
      data: {
        studentId: student.id,
        academicYearLabel: academicYear.label,
        status: "active",
        revision: 2,
        sourceKind: "staff",
        feeScheduleId: null,
        canonicalInvoiceId: oldInvoice.id,
        grossChargesXof: 1_000,
        netBilledXof: 1_000,
        createdById: actor.id,
      },
    });

    const activationOldInvoice = await prisma.invoice.create({
      data: {
        number: `ACTIVATION-OLD-${randomUUID()}`,
        studentId: activationStudentId,
        termId: term.id,
        totalAmount: 2_000,
        amountPaid: 0,
        status: "open",
        packageType: "standard_full",
        academicYearLabel: academicYear.label,
        costCenterCode: "9100",
        components: {
          create: {
            kind: "tuition",
            label: "Old activation tuition",
            costCenterCode: "9100",
            grossAmountXof: 2_000,
            amountXof: 2_000,
          },
        },
        plan: {
          create: {
            createdById: actor.id,
            installments: {
              create: {
                sequence: 1,
                dueDate: new Date("2026-08-15T00:00:00.000Z"),
                amountDue: 2_000,
                amountPaid: 0,
                status: "pending",
              },
            },
          },
        },
      },
      include: { plan: { include: { installments: true } } },
    });
    activationOldInvoiceId = activationOldInvoice.id;
    const activationApplicant = await prisma.applicant.create({
      data: {
        firstName: "Extra2",
        lastName: "Student",
        email: `runner-activation-${randomUUID()}@example.test`,
        stage: "accepted",
        onboardingStatus: "payment_pending",
        dateOfBirth: new Date("2005-02-14T00:00:00.000Z"),
        studentId: activationStudentId,
        admissionAcademicYearId: academicYear.id,
        enrollmentInvoiceId: activationOldInvoice.id,
        requiredEnrollmentCashXof: 2_000,
        acceptedAt: new Date("2026-08-11T10:00:00.000Z"),
        paymentPendingAt: new Date("2026-08-11T10:05:00.000Z"),
      },
    });
    activationApplicantId = activationApplicant.id;
    const activationLegacyLink = await prisma.paymentLink.create({
      data: {
        token: `activation-legacy-${randomUUID()}`,
        amountXof: 2_000,
        purpose: "Legacy first installment",
        payeeName: "Extra2 Student",
        dueDate: activationOldInvoice.plan!.installments[0]!.dueDate,
        studentId: activationStudentId,
        invoiceId: activationOldInvoice.id,
        onboardingApplicantId: activationApplicant.id,
        status: "active",
      },
    });
    activationLegacyLinkId = activationLegacyLink.id;
    await prisma.applicant.update({
      where: { id: activationApplicant.id },
      data: { activeOnboardingPaymentLinkId: activationLegacyLink.id },
    });

    const voidInvoice = await prisma.invoice.create({
      data: {
        number: `VOID-${randomUUID()}`,
        studentId: student.id,
        termId: term.id,
        totalAmount: 250,
        status: "void",
        packageType: "custom",
        academicYearLabel: academicYear.label,
        costCenterCode: "9100",
      },
    });
    oldVoidInvoiceId = voidInvoice.id;
    const failedPayment = await prisma.payment.create({
      data: {
        invoiceId: voidInvoice.id,
        studentId: student.id,
        amount: 250,
        method: "wire",
        status: "failed",
        provider: "integration",
        providerRef: `failed-${randomUUID()}`,
        source: "integration",
      },
    });
    failedPaymentId = failedPayment.id;
    const link = await prisma.paymentLink.create({
      data: {
        token: `cutover-${randomUUID()}`,
        amountXof: 250,
        purpose: "Indirect void-invoice attempt",
        payeeName: "Runner Student",
        invoiceId: voidInvoice.id,
        // An unsettled attempt can outlive an already-cancelled link. The
        // runner must still resolve ownership through the link and cancel it.
        status: "cancelled",
      },
    });
    indirectLinkId = link.id;
    const linkSubmission = await prisma.paymentSubmission.create({
      data: {
        status: "submitted",
        activeKey: `link-${randomUUID()}`,
        source: "integration",
        paymentLinkId: link.id,
        submittedAmountXof: 250,
        contactEmail: "runner@example.test",
        bankSnapshot: { bank: "test" },
      },
    });
    indirectLinkSubmissionId = linkSubmission.id;
    const paymentSubmission = await prisma.paymentSubmission.create({
      data: {
        status: "awaiting_proof",
        activeKey: `payment-${randomUUID()}`,
        source: "integration",
        invoiceId: voidInvoice.id,
        paymentId: failedPayment.id,
        submittedAmountXof: 250,
        contactEmail: "runner@example.test",
        bankSnapshot: { bank: "test" },
      },
    });
    indirectPaymentSubmissionId = paymentSubmission.id;
    const linkPiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `link-${randomUUID()}`,
        status: "sent",
        source: "integration",
        payerAlias: "+221700000001",
        amountXof: 250,
        motif: "Indirect link attempt",
        paymentLinkId: link.id,
      },
    });
    indirectLinkPiSpiId = linkPiSpi.id;
    const paymentPiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `payment-${randomUUID()}`,
        status: "initiated",
        source: "integration",
        payerAlias: "+221700000002",
        amountXof: 250,
        motif: "Indirect payment attempt",
        invoiceId: voidInvoice.id,
        paymentId: failedPayment.id,
      },
    });
    indirectPaymentPiSpiId = paymentPiSpi.id;

    const archivedInvoice = await prisma.invoice.create({
      data: {
        number: `ARCHIVE-${randomUUID()}`,
        studentId: archivedStudentId,
        termId: term.id,
        totalAmount: 9_000,
        status: "open",
        packageType: "custom",
        academicYearLabel: academicYear.label,
        costCenterCode: "9100",
      },
    });
    const archivedPendingPayment = await prisma.payment.create({
      data: {
        invoiceId: archivedInvoice.id,
        studentId: archivedStudentId,
        amount: 9_000,
        method: "wire",
        status: "pending",
        provider: "integration",
        providerRef: `archive-pending-${randomUUID()}`,
        source: "integration",
      },
    });
    archivedPendingPaymentId = archivedPendingPayment.id;
    const archivedApplicant = await prisma.applicant.create({
      data: {
        firstName: "Archived",
        lastName: "Student",
        email: `archived-accepted-${randomUUID()}@example.test`,
        stage: "accepted",
        onboardingStatus: "payment_pending",
        studentId: archivedStudentId,
        admissionAcademicYearId: academicYear.id,
        enrollmentInvoiceId: archivedInvoice.id,
        requiredEnrollmentCashXof: 9_000,
        statusTokenHash: createHash("sha256")
          .update(`archived-status-${randomUUID()}`)
          .digest("hex"),
        statusTokenExpiresAt: null,
        statusTokenRevokedAt: null,
        acceptedAt: new Date("2026-08-12T10:00:00.000Z"),
        paymentPendingAt: new Date("2026-08-12T10:05:00.000Z"),
      },
    });
    archivedApplicantId = archivedApplicant.id;
    const pointerOnlyLink = await prisma.paymentLink.create({
      data: {
        token: `archive-pointer-${randomUUID()}`,
        amountXof: 9_000,
        purpose: "Pointer-only archived enrollment capability",
        payeeName: "Archived Student",
        status: "active",
      },
    });
    archivedPointerPaymentLinkId = pointerOnlyLink.id;
    const applicantOwnedLink = await prisma.paymentLink.create({
      data: {
        token: `archive-applicant-${randomUUID()}`,
        amountXof: 9_000,
        purpose: "Applicant-owned archived capability",
        payeeName: "Archived Student",
        onboardingApplicantId: archivedApplicant.id,
        status: "active",
      },
    });
    const indirectAttemptLink = await prisma.paymentLink.create({
      data: {
        token: `archive-indirect-${randomUUID()}`,
        amountXof: 9_000,
        purpose: "Attempt-only archived capability",
        payeeName: "Archived Student",
        status: "active",
      },
    });
    archivedPaymentLinkIds = [
      pointerOnlyLink.id,
      applicantOwnedLink.id,
      indirectAttemptLink.id,
    ].sort();
    await prisma.applicant.update({
      where: { id: archivedApplicant.id },
      data: { activeOnboardingPaymentLinkId: pointerOnlyLink.id },
    });
    const directSubmission = await prisma.paymentSubmission.create({
      data: {
        status: "submitted",
        activeKey: `archive-direct-${randomUUID()}`,
        source: "integration",
        studentId: archivedStudentId,
        paymentId: archivedPendingPayment.id,
        paymentLinkId: indirectAttemptLink.id,
        submittedAmountXof: 9_000,
        contactEmail: "archived@example.test",
        bankSnapshot: { bank: "test" },
      },
    });
    const applicantSubmission = await prisma.paymentSubmission.create({
      data: {
        status: "awaiting_proof",
        activeKey: `archive-applicant-${randomUUID()}`,
        source: "integration",
        applicantId: archivedApplicant.id,
        paymentLinkId: pointerOnlyLink.id,
        submittedAmountXof: 9_000,
        contactEmail: "archived@example.test",
        bankSnapshot: { bank: "test" },
      },
    });
    archivedPaymentSubmissionIds = [
      directSubmission.id,
      applicantSubmission.id,
    ].sort();
    const indirectPiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `archive-indirect-${randomUUID()}`,
        status: "sent",
        source: "integration",
        payerAlias: "+221700000004",
        amountXof: 9_000,
        motif: "Attempt-link-only archived request",
        paymentLinkId: indirectAttemptLink.id,
      },
    });
    const applicantPiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `archive-applicant-${randomUUID()}`,
        status: "initiated",
        source: "integration",
        payerAlias: "+221700000005",
        amountXof: 9_000,
        motif: "Applicant-only archived request",
        applicantId: archivedApplicant.id,
      },
    });
    archivedPiSpiRequestIds = [indirectPiSpi.id, applicantPiSpi.id].sort();
  }, 180_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("blocks confirmation until every named reviewer attests the exact manifest digest", async () => {
    const input = await reviewedInputs(false);
    const missingPlan = await planWorkbookCutoverFromDatabase(
      prisma,
      input.manifest,
      input.sources,
      { actorEmail },
    );
    expect(missingPlan.confirmBlocked).toBe(true);
    expect(missingPlan.blockers.map((blocker) => blocker.code)).toContain(
      "reviewer_attestation_missing",
    );
    expect(JSON.stringify(missingPlan.blockers)).not.toContain(actorEmail);
    await expect(
      executeWorkbookCutover(prisma, input.manifest, input.sources, {
        actorEmail,
        expectedPlanSha256: missingPlan.planSha256,
        newStudentCredentials: [],
      }),
    ).rejects.toBeInstanceOf(WorkbookCutoverBlockedError);

    await new WorkbookCutoverAttestationService(
      prisma as unknown as PrismaService,
    ).attest(authUserForReplay(), missingPlan.manifestSha256);
    const attestedPlan = await planWorkbookCutoverFromDatabase(
      prisma,
      input.manifest,
      input.sources,
      { actorEmail },
    );
    expect(attestedPlan.confirmBlocked).toBe(false);
    expect(attestedPlan.blockers).toEqual([]);
    expect(attestedPlan.planSha256).not.toBe(missingPlan.planSha256);
  }, 180_000);

  it("rolls back every supersession and cancellation when reconstruction fails late", async () => {
    const canonicalSourceKey = workbookCutoverWorkbookRowKey(
      "Comparison",
      20 + CANONICAL_INDEX,
    );
    const sourceClaim = createHash("sha256")
      .update(`${WORKBOOK_SHA}\n${canonicalSourceKey}`)
      .digest("hex");
    const collision = await prisma.invoice.create({
      data: {
        number: `WB-${sourceClaim.slice(0, 28)}`,
        studentId,
        termId,
        totalAmount: 1,
        status: "void",
        packageType: "custom",
        academicYearLabel: "2026–2027",
        costCenterCode: "9100",
      },
    });
    try {
      const input = await reviewedInputs();
      const plan = await planWorkbookCutoverFromDatabase(
        prisma,
        input.manifest,
        input.sources,
        { actorEmail },
      );
      expect(plan.confirmBlocked).toBe(false);

      await expect(
        executeWorkbookCutover(prisma, input.manifest, input.sources, {
          actorEmail,
          expectedPlanSha256: plan.planSha256,
          newStudentCredentials: [],
        }),
      ).rejects.toThrow();

      await expect(
        prisma.invoice.findUniqueOrThrow({ where: { id: oldInvoiceId } }),
      ).resolves.toMatchObject({ status: "partial", revision: 4 });
      await expect(
        prisma.payment.findUniqueOrThrow({ where: { id: oldPaymentId } }),
      ).resolves.toMatchObject({ status: "success" });
      await expect(
        prisma.paymentLink.findUniqueOrThrow({
          where: { id: applicantLegacyLinkId },
        }),
      ).resolves.toMatchObject({ status: "active" });
      await expect(
        prisma.paymentSubmission.findUniqueOrThrow({
          where: { id: applicantOnlySubmissionId },
        }),
      ).resolves.toMatchObject({ status: "submitted" });
      await expect(
        prisma.invoice.findUniqueOrThrow({
          where: { id: activationOldInvoiceId },
        }),
      ).resolves.toMatchObject({ status: "open", revision: 0 });
      await expect(
        prisma.paymentLink.findUniqueOrThrow({
          where: { id: activationLegacyLinkId },
        }),
      ).resolves.toMatchObject({ status: "active" });
      await expect(
        prisma.applicant.findUniqueOrThrow({
          where: { id: activationApplicantId },
        }),
      ).resolves.toMatchObject({ onboardingStatus: "payment_pending" });
      await expect(
        prisma.student.findUniqueOrThrow({
          where: { id: archivedStudentId },
          include: { person: true },
        }),
      ).resolves.toMatchObject({
        recordStatus: "active",
        person: {
          status: "active",
          roles: expect.arrayContaining(["student"]),
        },
      });
      await expect(
        prisma.applicant.findUniqueOrThrow({
          where: { id: archivedApplicantId },
        }),
      ).resolves.toMatchObject({
        activeOnboardingPaymentLinkId: archivedPointerPaymentLinkId,
        statusTokenRevokedAt: null,
        statusTokenExpiresAt: null,
      });
      await expect(
        prisma.paymentLink.count({
          where: { id: { in: archivedPaymentLinkIds }, status: "active" },
        }),
      ).resolves.toBe(archivedPaymentLinkIds.length);
      await expect(
        prisma.payment.findUniqueOrThrow({
          where: { id: archivedPendingPaymentId },
        }),
      ).resolves.toMatchObject({ status: "pending" });
      await expect(
        prisma.auditLog.count({
          where: {
            entityId: activationApplicantId,
            action: "onboarding-activated",
          },
        }),
      ).resolves.toBe(0);
      await expect(prisma.workbookCutoverBatch.count()).resolves.toBe(0);
    } finally {
      await prisma.invoice.deleteMany({ where: { id: collision.id } });
    }
  }, 180_000);

  it("atomically reconstructs, preserves academics, activates self-service access, audits, and replays as a no-op", async () => {
    const input = await reviewedInputs();
    const academicBefore = await captureWorkbookCutoverAcademicFingerprints(
      prisma,
      [studentId, activationStudentId],
    );
    const plan = await planWorkbookCutoverFromDatabase(
      prisma,
      input.manifest,
      input.sources,
      { actorEmail },
    );
    expect(plan).toMatchObject({
      confirmBlocked: false,
      controls: {
        includedRows: 3,
        reviewedExclusionRows: 400,
        accountCreditXof: 1_433,
        archiveStudents: 1,
        reconciles: true,
      },
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.reviewerAttestations).toEqual([
      expect.objectContaining({
        manifestSha256: plan.manifestSha256,
        reviewerId: actorId,
        revokedAt: null,
      }),
    ]);

    const result = await executeWorkbookCutover(
      prisma,
      input.manifest,
      input.sources,
      {
        actorEmail,
        expectedPlanSha256: plan.planSha256,
        newStudentCredentials: [],
      },
    );
    expect(result).toMatchObject({
      alreadyImported: false,
      workbookLinkedRows: 3,
      workbookCreatedRows: 0,
      workbookDuplicateRows: 400,
      productionArchivedStudents: 1,
      includedBilledXof:
        input.included.financial.amountBilledXof +
        input.activationIncluded.financial.amountBilledXof +
        input.accountCreditIncluded.financial.amountBilledXof,
      includedPaidXof:
        input.included.financial.amountPaidXof +
        input.activationIncluded.financial.amountPaidXof +
        input.accountCreditIncluded.financial.amountPaidXof,
      activations: 1,
    });

    const [
      oldInvoice,
      oldPayment,
      failedPayment,
      indirectLink,
      applicantLegacyLink,
      pendingApplicant,
      submissions,
      piSpi,
    ] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: oldInvoiceId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: oldPaymentId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: failedPaymentId } }),
      prisma.paymentLink.findUniqueOrThrow({ where: { id: indirectLinkId } }),
      prisma.paymentLink.findUniqueOrThrow({
        where: { id: applicantLegacyLinkId },
      }),
      prisma.applicant.findUniqueOrThrow({
        where: { id: pendingApplicantId },
        include: {
          activeOnboardingPaymentLink: true,
          enrollmentInvoice: {
            include: {
              plan: {
                include: {
                  installments: { orderBy: { sequence: "asc" } },
                },
              },
            },
          },
        },
      }),
      prisma.paymentSubmission.findMany({
        where: {
          id: {
            in: [
              indirectLinkSubmissionId,
              indirectPaymentSubmissionId,
              applicantOnlySubmissionId,
            ],
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.piSpiRequest.findMany({
        where: {
          id: {
            in: [
              indirectLinkPiSpiId,
              indirectPaymentPiSpiId,
              applicantOnlyPiSpiId,
            ],
          },
        },
        orderBy: { id: "asc" },
      }),
    ]);
    expect(oldInvoice).toMatchObject({ status: "void", revision: 5 });
    expect(oldPayment.status).toBe("cancelled");
    expect(failedPayment.status).toBe("failed");
    expect(indirectLink.status).toBe("cancelled");
    expect(applicantLegacyLink.status).toBe("cancelled");
    expect(submissions).toHaveLength(3);
    expect(submissions.every((row) => row.status === "cancelled")).toBe(true);
    expect(submissions.every((row) => row.activeKey === null)).toBe(true);
    expect(piSpi).toHaveLength(3);
    expect(piSpi.every((row) => row.status === "cancelled")).toBe(true);

    const [
      archivedStudent,
      archivedLinks,
      archivedSubmissions,
      archivedPiSpiRequests,
      archivedPendingPayment,
      archivedApplicant,
      batchAudit,
    ] = await Promise.all([
      prisma.student.findUniqueOrThrow({
        where: { id: archivedStudentId },
        include: { person: true },
      }),
      prisma.paymentLink.findMany({
        where: { id: { in: archivedPaymentLinkIds } },
        orderBy: { id: "asc" },
      }),
      prisma.paymentSubmission.findMany({
        where: { id: { in: archivedPaymentSubmissionIds } },
        orderBy: { id: "asc" },
      }),
      prisma.piSpiRequest.findMany({
        where: { id: { in: archivedPiSpiRequestIds } },
        orderBy: { id: "asc" },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: archivedPendingPaymentId },
      }),
      prisma.applicant.findUniqueOrThrow({
        where: { id: archivedApplicantId },
      }),
      prisma.auditLog.findFirstOrThrow({
        where: {
          entity: "WorkbookCutoverBatch",
          entityId: result.batchId,
          action: "imported",
        },
      }),
    ]);
    expect(archivedStudent).toMatchObject({
      id: archivedStudentId,
      personId: archivedStudentPersonId,
      recordStatus: "archived",
      person: {
        status: "suspended",
        roles: [],
        sessionVersion: 1,
      },
    });
    expect(archivedLinks).toHaveLength(archivedPaymentLinkIds.length);
    expect(archivedLinks.every((row) => row.status === "cancelled")).toBe(true);
    expect(archivedSubmissions).toHaveLength(
      archivedPaymentSubmissionIds.length,
    );
    expect(
      archivedSubmissions.every(
        (row) => row.status === "cancelled" && row.activeKey === null,
      ),
    ).toBe(true);
    expect(archivedPiSpiRequests).toHaveLength(archivedPiSpiRequestIds.length);
    expect(
      archivedPiSpiRequests.every((row) => row.status === "cancelled"),
    ).toBe(true);
    expect(archivedPendingPayment.status).toBe("cancelled");
    expect(archivedApplicant.studentId).toBe(archivedStudentId);
    expect(archivedApplicant.activeOnboardingPaymentLinkId).toBeNull();
    expect(archivedApplicant.statusTokenRevokedAt).not.toBeNull();
    expect(archivedApplicant.statusTokenExpiresAt).toEqual(
      archivedApplicant.statusTokenRevokedAt,
    );
    const archivedCapabilityEvidence = (
      batchAudit.data as {
        archivedCapabilityCancellations: Array<{
          studentId: string;
          sourceRecordId: string;
          cancelledPaymentSubmissionIds: string[];
          cancelledPaymentLinkIds: string[];
          cancelledPiSpiRequestIds: string[];
          cancelledPendingPaymentIds: string[];
          linkedApplicantIds: string[];
          statusTokenCapabilityApplicantIds: string[];
          revokedApplicantStatusTokenIds: string[];
          preexistingInactiveApplicantStatusTokenIds: string[];
          clearedApplicantPaymentLinkPointers: Array<{
            applicantId: string;
            paymentLinkId: string;
          }>;
        }>;
      }
    ).archivedCapabilityCancellations;
    expect(archivedCapabilityEvidence).toEqual([
      expect.objectContaining({
        studentId: archivedStudentId,
        sourceRecordId: expect.any(String),
        cancelledPaymentSubmissionIds: archivedPaymentSubmissionIds,
        cancelledPaymentLinkIds: archivedPaymentLinkIds,
        cancelledPiSpiRequestIds: archivedPiSpiRequestIds,
        cancelledPendingPaymentIds: [archivedPendingPaymentId],
        linkedApplicantIds: [archivedApplicantId],
        statusTokenCapabilityApplicantIds: [archivedApplicantId],
        revokedApplicantStatusTokenIds: [archivedApplicantId],
        preexistingInactiveApplicantStatusTokenIds: [],
        clearedApplicantPaymentLinkPointers: [
          {
            applicantId: archivedApplicantId,
            paymentLinkId: archivedPointerPaymentLinkId,
          },
        ],
      }),
    ]);

    const source = await prisma.workbookCutoverSourceRecord.findFirstOrThrow({
      where: { batchId: result.batchId, sourceRowNumber: 20 + CANONICAL_INDEX },
      include: {
        canonicalInvoice: {
          include: {
            components: true,
            adjustments: true,
            plan: {
              include: { installments: { include: { components: true } } },
            },
            payments: {
              include: { allocations: true, componentAllocations: true },
            },
          },
        },
        billingProfile: { include: { selections: true, awards: true } },
        financialProvenance: true,
      },
    });
    const invoice = source.canonicalInvoice!;
    const firstInstallment = invoice.plan!.installments[0]!;
    expect(pendingApplicant).toMatchObject({
      onboardingStatus: "payment_pending",
      enrollmentInvoiceId: invoice.id,
      requiredEnrollmentCashXof: firstInstallment.amountDue,
    });
    expect(pendingApplicant.activeOnboardingPaymentLinkId).not.toBe(
      applicantLegacyLinkId,
    );
    expect(pendingApplicant.activeOnboardingPaymentLink).toMatchObject({
      status: "active",
      studentId,
      invoiceId: invoice.id,
      onboardingApplicantId: pendingApplicantId,
      amountXof:
        firstInstallment.amountDue - input.included.financial.amountPaidXof,
      costCenterCode: invoice.costCenterCode,
    });
    await expect(
      prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        include: { person: true },
      }),
    ).resolves.toMatchObject({
      recordStatus: "pending_payment",
      person: { roles: [] },
    });
    expect(
      pendingApplicant.activeOnboardingPaymentLink?.dueDate
        ?.toISOString()
        .slice(0, 10),
    ).toBe(firstInstallment.dueDate.toISOString().slice(0, 10));

    const activationSourceRecord =
      await prisma.workbookCutoverSourceRecord.findFirstOrThrow({
        where: {
          batchId: result.batchId,
          sourceRowNumber: 20 + ACTIVATION_INDEX,
        },
        include: {
          canonicalInvoice: {
            include: {
              plan: {
                include: {
                  installments: { orderBy: { sequence: "asc" } },
                },
              },
              payments: true,
            },
          },
        },
      });
    const activationInvoice = activationSourceRecord.canonicalInvoice!;
    const activationPayment = activationInvoice.payments.find(
      (payment) => payment.provider === "workbook_cutover",
    )!;
    const [
      activationApplicant,
      activationOldInvoice,
      activationLegacyLink,
      activationStudent,
    ] = await Promise.all([
      prisma.applicant.findUniqueOrThrow({
        where: { id: activationApplicantId },
      }),
      prisma.invoice.findUniqueOrThrow({
        where: { id: activationOldInvoiceId },
      }),
      prisma.paymentLink.findUniqueOrThrow({
        where: { id: activationLegacyLinkId },
      }),
      prisma.student.findUniqueOrThrow({
        where: { id: activationStudentId },
        include: { person: true },
      }),
    ]);
    expect(activationOldInvoice).toMatchObject({
      status: "void",
      revision: 1,
    });
    expect(activationLegacyLink.status).toBe("cancelled");
    expect(activationApplicant).toMatchObject({
      onboardingStatus: "enrolled",
      enrollmentInvoiceId: activationInvoice.id,
      activatedByPaymentId: activationPayment.id,
      activeOnboardingPaymentLinkId: null,
      studentInviteSentAt: null,
    });
    expect(activationStudent).toMatchObject({
      recordStatus: "active",
      dateOfBirth: new Date("2005-02-14T00:00:00.000Z"),
      person: {
        status: "active",
        roles: ["student"],
        passwordHash: null,
        mustChangePassword: false,
      },
    });
    await expect(
      prisma.studentInvite.count({
        where: {
          studentPersonId: activationStudent.personId,
          usedAt: null,
        },
      }),
    ).resolves.toBe(0);
    expect(
      input.activationIncluded.financial.amountPaidXof,
    ).toBeGreaterThanOrEqual(
      activationInvoice.plan!.installments[0]!.amountDue,
    );
    expect(invoice.totalAmount).toBe(input.included.financial.amountBilledXof);
    expect(invoice.amountPaid).toBe(
      input.included.financial.installments.reduce(
        (sum, row) => sum + row.paidDetailXof,
        0,
      ),
    );
    expect(
      invoice.components.reduce((sum, row) => sum + row.amountXof, 0),
    ).toBe(invoice.totalAmount);
    expect(invoice.plan?.installments.map((row) => row.amountDue)).toEqual(
      input.included.financial.installments.map((row) => row.dueXof),
    );
    expect(
      invoice.plan?.installments.every(
        (installment) =>
          installment.components.reduce(
            (sum, row) => sum + row.amountDue,
            0,
          ) === installment.amountDue,
      ),
    ).toBe(true);
    const reconstructionPayment = invoice.payments.find(
      (payment) => payment.provider === "workbook_cutover",
    )!;
    expect(reconstructionPayment).toMatchObject({
      amount: input.included.financial.amountPaidXof,
      settledAt: null,
    });
    expect(reconstructionPayment.recognizedOn?.toISOString().slice(0, 10)).toBe(
      "2026-08-29",
    );
    expect(
      reconstructionPayment.allocations.reduce(
        (sum, row) => sum + row.amount,
        0,
      ),
    ).toBe(invoice.amountPaid);
    expect(
      reconstructionPayment.componentAllocations.reduce(
        (sum, row) => sum + row.amountXof,
        0,
      ),
    ).toBe(invoice.amountPaid);
    expect(source.billingProfile?.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "housing", optionCode: "none" }),
        expect.objectContaining({ kind: "cafeteria", optionCode: "full" }),
        expect.objectContaining({ kind: "insurance", optionCode: "annual" }),
        expect.objectContaining({
          kind: "housing_caution",
          optionCode: "housing_10_percent",
          percentageBasisOptionCode: "double",
          percentageBasisServiceKind: "housing",
        }),
      ]),
    );
    expect(source.financialProvenance.map((row) => row.kind).sort()).toEqual([
      "invoice_void",
      "new_invoice",
      "payment_superseded",
      "reconstruction_payment",
    ]);
    await expect(
      prisma.invoice.findUniqueOrThrow({ where: { id: oldVoidInvoiceId } }),
    ).resolves.toMatchObject({ status: "void" });
    await expect(
      prisma.mealPlan.findUniqueOrThrow({
        where: {
          studentId_academicYearLabel: {
            studentId,
            academicYearLabel: "2026–2027",
          },
        },
      }),
    ).resolves.toMatchObject({ type: "full", active: true });
    await expect(
      prisma.housingAssignment.count({
        where: {
          studentId,
          academicYearLabel: "2026–2027",
          status: "assigned",
        },
      }),
    ).resolves.toBe(0);

    const academicAfter = await captureWorkbookCutoverAcademicFingerprints(
      prisma,
      [studentId, activationStudentId],
    );
    expect(academicAfter).toEqual(academicBefore);
    await expect(
      prisma.transcriptEntry.count({ where: { studentId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.enrollment.count({ where: { studentId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.gradeSubmissionItem.count({ where: { studentId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.workbookCutoverSourceRecord.count({
        where: { batchId: result.batchId },
      }),
    ).resolves.toBe(
      WORKBOOK_CUTOVER_BASELINE.workbookRows +
        WORKBOOK_CUTOVER_BASELINE.productionStudents +
        WORKBOOK_CUTOVER_BASELINE.currentApplicants,
    );

    const audit = await auditWorkbookCutoverBatch(prisma, result.batchId);
    expect(audit).toMatchObject({
      ok: true,
      workbookRows: WORKBOOK_CUTOVER_BASELINE.workbookRows,
      productionStudents: WORKBOOK_CUTOVER_BASELINE.productionStudents,
      applicants: WORKBOOK_CUTOVER_BASELINE.currentApplicants,
      includedWorkbookRows: 3,
      excludedWorkbookRows: 400,
      archivedStudents: 1,
      enrollmentActivations: 1,
      activationAuditRows: 1,
    });
    const importedAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entity: "WorkbookCutoverBatch",
        entityId: result.batchId,
        action: "imported",
      },
    });
    expect(importedAudit.data).toMatchObject({
      reviewerAttestationIds: plan.reviewerAttestations.map(
        (attestation) => attestation.id,
      ),
    });

    // Once a batch is imported, an exact replay remains a strict no-op even if
    // the pre-confirmation attestation is later revoked. It must not re-run the
    // destructive cutover or create fresh audit evidence.
    await new WorkbookCutoverAttestationService(
      prisma as unknown as PrismaService,
    ).revoke(authUserForReplay(), plan.manifestSha256, "decisions_changed");
    const countsBeforeReplay = await Promise.all([
      prisma.invoice.count(),
      prisma.payment.count(),
      prisma.auditLog.count(),
      prisma.workbookCutoverFinancialProvenance.count(),
      prisma.paymentLink.count(),
    ]);
    const replay = await executeWorkbookCutover(
      prisma,
      input.manifest,
      input.sources,
      {
        actorEmail,
        expectedPlanSha256: plan.planSha256,
        newStudentCredentials: [],
      },
    );
    expect(replay).toMatchObject({
      alreadyImported: true,
      batchId: result.batchId,
    });
    const replayPlan = await planWorkbookCutoverFromDatabase(
      prisma,
      input.manifest,
      input.sources,
      { actorEmail },
    );
    expect(replayPlan).toMatchObject({
      alreadyImportedBatchId: result.batchId,
      controls: { accountCreditXof: 1_433 },
    });
    await expect(
      Promise.all([
        prisma.invoice.count(),
        prisma.payment.count(),
        prisma.auditLog.count(),
        prisma.workbookCutoverFinancialProvenance.count(),
        prisma.paymentLink.count(),
      ]),
    ).resolves.toEqual(countsBeforeReplay);
    await expect(
      executeWorkbookCutover(prisma, input.manifest, input.sources, {
        actorEmail,
        expectedPlanSha256: "f".repeat(64),
        newStudentCredentials: [],
      }),
    ).rejects.toBeInstanceOf(WorkbookCutoverBlockedError);
  }, 180_000);
});

function authUserForReplay(): AuthUser {
  return {
    personId: actorId,
    roles: ["admin"],
    email: actorEmail,
    name: "Cutover Reviewer",
  };
}

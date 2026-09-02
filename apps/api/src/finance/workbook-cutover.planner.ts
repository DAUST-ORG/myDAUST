import { createHash } from "node:crypto";
import { z } from "zod";
import { allocateProportionallyXof } from "./component-allocation.js";
import {
  WorkbookCutoverProductionSnapshotSchema,
  WorkbookCutoverTrustedExtractionSchema,
  workbookCutoverManifestExtractionIssues,
  workbookCutoverManifestProductionSnapshotIssues,
  workbookCutoverProductionSnapshotDigest,
} from "./workbook-cutover.extraction.js";
import {
  WORKBOOK_CUTOVER_BASELINE,
  WorkbookCutoverAcademicFingerprintSchema,
  WorkbookCutoverManifestSchema,
  WorkbookCutoverSha256Schema,
  canonicalWorkbookCutoverJson,
  workbookCutoverAcademicFingerprintDigest,
  workbookCutoverManifestDigest,
  type WorkbookCutoverFinancialSnapshot,
  type WorkbookCutoverManifest,
  type WorkbookCutoverManifestRow,
  type WorkbookCutoverProductionDecision,
} from "./workbook-cutover.manifest.js";

type AcademicFingerprint = z.infer<
  typeof WorkbookCutoverAcademicFingerprintSchema
>;

const IdSchema = z.string().trim().min(1).max(240);
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Expected a valid YYYY-MM-DD date");

const LiveStudentSchema = z
  .object({
    sourceKey: z.string().trim().min(3).max(240),
    sourceRecordSha256: WorkbookCutoverSha256Schema,
    studentId: IdSchema,
    personId: IdSchema,
    studentNo: z.string().trim().min(2).max(64),
    firstName: z.string().trim().min(1).max(160),
    lastName: z.string().trim().min(1).max(160),
    loginEmail: z.string().trim().email().max(320).nullable(),
    recordStatus: z.enum(["active", "pending_payment", "archived"]),
    personStatus: z.enum(["active", "suspended", "inactive"]),
    roles: z.array(z.string().trim().min(1).max(80)).max(50),
    academicFingerprint: WorkbookCutoverAcademicFingerprintSchema,
    academicFingerprintSha256: WorkbookCutoverSha256Schema,
    /**
     * SHA-256 of canonical sorted finance state: every invoice/credit ID,
     * status, revision, billed/paid amount, component and installment; every
     * payment ID/status/amount/settlement/refund; and every unsettled proof
     * submission, payment link, and PI-SPI request. Confirmation must rederive
     * the same value inside its SERIALIZABLE transaction.
     */
    financialFingerprintSha256: WorkbookCutoverSha256Schema,
    pendingRefundIds: z.array(IdSchema).max(10_000),
    inFlightProofSubmissionIds: z.array(IdSchema).max(10_000),
    inFlightPaymentLinkIds: z.array(IdSchema).max(10_000),
    inFlightPiSpiRequestIds: z.array(IdSchema).max(10_000),
  })
  .strict();

const LiveApplicantSchema = z
  .object({
    sourceKey: z.string().trim().min(3).max(240),
    sourceRecordSha256: WorkbookCutoverSha256Schema,
    applicantId: IdSchema,
    firstName: z.string().trim().min(1).max(160),
    lastName: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(320),
    stage: z.string().trim().min(1).max(80),
    onboardingStatus: z
      .enum(["not_started", "payment_pending", "enrolled", "cancelled"])
      .optional(),
    studentId: IdSchema.nullable().optional(),
    activeOnboardingPaymentLinkId: IdSchema.nullable().optional(),
    statusTokenCapability: z.boolean().optional(),
    statusTokenActive: z.boolean().optional(),
    operationalFingerprintSha256: WorkbookCutoverSha256Schema.optional(),
    paymentLinkBearerIds: z.array(IdSchema).max(10_000).optional(),
    paymentSubmissionResumeTokenIds: z.array(IdSchema).max(10_000).optional(),
    inFlightProofSubmissionIds: z.array(IdSchema).max(10_000).optional(),
    inFlightPaymentLinkIds: z.array(IdSchema).max(10_000).optional(),
    inFlightPiSpiRequestIds: z.array(IdSchema).max(10_000).optional(),
    pendingPaymentIds: z.array(IdSchema).max(10_000).optional(),
    pendingRefundIds: z.array(IdSchema).max(10_000).optional(),
  })
  .strict();

const LiveFeeScheduleSchema = z
  .object({
    id: IdSchema,
    academicYearLabel: z.string().trim().min(4).max(64),
    revision: z.number().int().positive(),
    status: z.enum(["draft", "approved", "superseded"]),
    fingerprintSha256: WorkbookCutoverSha256Schema,
  })
  .strict();

const LiveTermSchema = z
  .object({
    id: IdSchema,
    academicYearLabel: z.string().trim().min(4).max(64),
    label: z.string().trim().min(1).max(120),
    status: z.enum(["planned", "active", "closed"]),
    installmentDueDates: z.array(DateOnlySchema).length(4),
    fingerprintSha256: WorkbookCutoverSha256Schema,
  })
  .strict();

export const WorkbookCutoverLiveSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().datetime({ offset: true }),
    academicYearLabel: z.string().trim().min(4).max(64),
    students: z.array(LiveStudentSchema).max(50_000),
    applicants: z.array(LiveApplicantSchema).max(50_000),
    feeSchedules: z.array(LiveFeeScheduleSchema).max(1_000),
    terms: z.array(LiveTermSchema).max(1_000),
    /**
     * Canonical hash of every service option and adjustment definition for the
     * target academic year, including inactive rows and stable database IDs.
     * The runner resolves those IDs during confirmation, so catalog drift must
     * invalidate the reviewed plan.
     */
    billingCatalogFingerprintSha256: WorkbookCutoverSha256Schema,
    studentNumberSequence: z
      .object({
        academicYearStart: z.number().int().min(2000).max(2999),
        nextAssignableValue: z.number().int().positive().max(10_000_000),
      })
      .strict()
      .nullable(),
    existingStudentNumbers: z
      .array(z.string().trim().min(2).max(64))
      .max(100_000),
    existingLoginEmails: z
      .array(z.string().trim().email().max(320))
      .max(100_000),
    orphanPendingRefundIds: z.array(IdSchema).max(10_000),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    validateUniqueLive(snapshot.students, "studentId", ctx, ["students"]);
    validateUniqueLive(snapshot.students, "personId", ctx, ["students"]);
    validateUniqueLive(snapshot.students, "sourceKey", ctx, ["students"]);
    validateUniqueLive(snapshot.applicants, "applicantId", ctx, ["applicants"]);
    validateUniqueLive(snapshot.applicants, "sourceKey", ctx, ["applicants"]);
    validateUniqueLive(snapshot.feeSchedules, "id", ctx, ["feeSchedules"]);
    validateUniqueLive(snapshot.terms, "id", ctx, ["terms"]);
    for (const [index, student] of snapshot.students.entries()) {
      if (
        student.academicFingerprintSha256 !==
        workbookCutoverAcademicFingerprintDigest(student.academicFingerprint)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["students", index, "academicFingerprintSha256"],
          message:
            "Academic fingerprint SHA must be derived from the canonical academic controls",
        });
      }
    }
  });

export type WorkbookCutoverLiveSnapshot = z.infer<
  typeof WorkbookCutoverLiveSnapshotSchema
>;

export const WorkbookCutoverPlanInputSchema = z
  .object({
    manifest: WorkbookCutoverManifestSchema,
    trustedExtraction: WorkbookCutoverTrustedExtractionSchema,
    reviewedProductionSnapshot: WorkbookCutoverProductionSnapshotSchema,
    sourceDigests: z
      .object({
        workbookSha256: WorkbookCutoverSha256Schema,
        trustedExtractionSha256: WorkbookCutoverSha256Schema,
        reviewedProductionSnapshotSha256: WorkbookCutoverSha256Schema,
      })
      .strict(),
    liveSnapshot: WorkbookCutoverLiveSnapshotSchema,
  })
  .strict();

export type WorkbookCutoverPlanInput = z.infer<
  typeof WorkbookCutoverPlanInputSchema
>;

export type WorkbookCutoverBlockerCode =
  | "source_hash_mismatch"
  | "workbook_source_set_drift"
  | "reviewed_production_snapshot_mismatch"
  | "production_student_source_set_drift"
  | "applicant_source_set_drift"
  | "production_identity_drift"
  | "applicant_identity_drift"
  | "applicant_removal_required"
  | "academic_fingerprint_drift"
  | "workbook_identity_hold"
  | "production_student_hold"
  | "refund_pending"
  | "ambiguous_fee_schedule"
  | "ambiguous_term"
  | "term_installment_dates_mismatch"
  | "student_number_sequence_unavailable"
  | "student_number_collision"
  | "login_email_collision"
  | "reviewed_preallocation_mismatch"
  | "reviewer_attestation_missing"
  | "reviewer_attestation_revoked"
  | "reviewer_attestation_identity_drift"
  | "reviewer_attestation_statement_stale";

export interface WorkbookCutoverBlocker {
  code: WorkbookCutoverBlockerCode;
  sourceKey: string | null;
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkbookCutoverWarning {
  code: "program_unassigned";
  sourceKey: string;
  message: string;
}

export interface WorkbookCutoverInstallmentAllocation {
  sequence: number;
  amountXof: number;
}

export interface WorkbookCutoverComponentAllocation {
  componentKey: string;
  amountXof: number;
}

export interface WorkbookCutoverReconstructionSpec {
  sourceKey: string;
  amountBilledXof: number;
  amountPaidXof: number;
  recognizedOn: string;
  settledAt: null;
  installmentDueDates: readonly string[];
  installments: WorkbookCutoverFinancialSnapshot["installments"];
  components: WorkbookCutoverFinancialSnapshot["components"];
  adjustments: WorkbookCutoverFinancialSnapshot["adjustments"];
  services: WorkbookCutoverFinancialSnapshot["services"];
  installmentAllocations: WorkbookCutoverInstallmentAllocation[];
  componentAllocations: WorkbookCutoverComponentAllocation[];
  accountCreditXof: number;
  cancelUnsettledAttempts: true;
  voidAllEffectiveInvoicesAndCredits: true;
}

export interface WorkbookCutoverExistingStudentAction {
  disposition: "reconstruct_existing";
  sourceKey: string;
  studentId: string;
  personId: string;
  studentNo: string;
  preserveAcademicFingerprint: AcademicFingerprint;
  reconstruction: WorkbookCutoverReconstructionSpec;
}

export interface WorkbookCutoverCreateStudentAction {
  disposition: "create_and_reconstruct";
  sourceKey: string;
  firstName: string;
  lastName: string;
  personalEmail: string | null;
  programCode: string | null;
  plannedStudentNo: string | null;
  plannedLoginEmail: string | null;
  reconstruction: WorkbookCutoverReconstructionSpec;
}

export interface WorkbookCutoverDuplicateExclusionAction {
  disposition: "exclude_reviewed_duplicate";
  sourceKey: string;
  canonicalWorkbookRowKey: string;
  amountBilledXof: number;
  amountPaidXof: number;
}

export interface WorkbookCutoverHeldAction {
  disposition: "held";
  sourceKey: string;
  amountBilledXof: number;
  amountPaidXof: number;
}

export type WorkbookCutoverWorkbookAction =
  | WorkbookCutoverExistingStudentAction
  | WorkbookCutoverCreateStudentAction
  | WorkbookCutoverDuplicateExclusionAction
  | WorkbookCutoverHeldAction;

export interface WorkbookCutoverPlanControls {
  workbookRows: 403;
  productionStudents: number;
  applicants: number;
  sourceBilledXof: 1_514_469_978;
  sourcePaidXof: 286_551_264;
  includedRows: number;
  includedBilledXof: number;
  includedPaidXof: number;
  reviewedExclusionRows: number;
  reviewedExclusionBilledXof: number;
  reviewedExclusionPaidXof: number;
  heldRows: number;
  heldBilledXof: number;
  heldPaidXof: number;
  accountCreditXof: number;
  archiveStudents: number;
  keepExceptionStudents: number;
  preserveApplicants: number;
  removeApplicants: number;
  reconciles: true;
}

export interface WorkbookCutoverPlan {
  schemaVersion: 1;
  manifestSha256: string;
  sourceWorkbookSha256: string;
  trustedExtractionSha256: string;
  reviewedProductionSnapshotSha256: string;
  reviewedProductionSnapshotCanonicalSha256: string;
  liveSnapshotSha256: string;
  planSha256: string;
  capturedAt: string;
  confirmBlocked: boolean;
  blockers: WorkbookCutoverBlocker[];
  warnings: WorkbookCutoverWarning[];
  selectedFeeSchedule: {
    id: string;
    revision: number;
    fingerprintSha256: string;
  } | null;
  selectedTerm: {
    id: string;
    fingerprintSha256: string;
    installmentDueDates: readonly string[];
  } | null;
  workbookActions: WorkbookCutoverWorkbookAction[];
  productionActions: WorkbookCutoverProductionDecision[];
  applicantActions: WorkbookCutoverManifest["applicants"];
  controls: WorkbookCutoverPlanControls;
}

/**
 * Build the entire cutover plan from immutable reviewed inputs and a fresh live
 * snapshot. This function performs no I/O and never resolves identity by name.
 */
export function planWorkbookCutover(
  rawInput: WorkbookCutoverPlanInput,
): WorkbookCutoverPlan {
  const input = WorkbookCutoverPlanInputSchema.parse(rawInput);
  const {
    manifest,
    trustedExtraction,
    reviewedProductionSnapshot,
    liveSnapshot,
  } = input;
  const blockers: WorkbookCutoverBlocker[] = [];

  checkSourceHashes(input, blockers);
  for (const extractionIssue of workbookCutoverManifestExtractionIssues(
    manifest,
    trustedExtraction,
  )) {
    blockers.push({
      code: "workbook_source_set_drift",
      sourceKey: issueSourceKey(extractionIssue),
      message: extractionIssue,
    });
  }
  for (const snapshotIssue of workbookCutoverManifestProductionSnapshotIssues(
    manifest,
    reviewedProductionSnapshot,
  )) {
    blockers.push({
      code: "reviewed_production_snapshot_mismatch",
      sourceKey: issueSourceKey(snapshotIssue),
      message: snapshotIssue,
    });
  }

  const createAllocations = preplanCreateIdentities(
    manifest,
    liveSnapshot,
    blockers,
  );
  checkReviewedHolds(manifest, blockers);
  checkApplicantRemovals(manifest, blockers);
  checkLiveSourceSets(reviewedProductionSnapshot, liveSnapshot, blockers);
  checkRefunds(liveSnapshot, blockers);
  const selectedFeeSchedule = selectFeeSchedule(
    manifest,
    liveSnapshot,
    blockers,
  );
  const selectedTerm = selectTerm(manifest, liveSnapshot, blockers);

  const workbookActions = [...manifest.workbookRows]
    .sort((left, right) => compareText(left.sourceKey, right.sourceKey))
    .map((row) => planWorkbookRow(row, manifest, createAllocations));
  const productionActions = [...manifest.productionStudents].sort(
    (left, right) => compareText(left.sourceKey, right.sourceKey),
  );
  const applicantActions = [...manifest.applicants].sort((left, right) =>
    compareText(left.sourceKey, right.sourceKey),
  );
  const controls = planControls(workbookActions, productionActions, manifest);
  const manifestSha256 = workbookCutoverManifestDigest(manifest);
  const reviewedProductionSnapshotCanonicalSha256 =
    workbookCutoverProductionSnapshotDigest(reviewedProductionSnapshot);
  const liveSnapshotSha256 = workbookCutoverLiveSnapshotDigest(liveSnapshot);
  blockers.sort(compareBlockers);
  const warnings: WorkbookCutoverWarning[] = workbookActions
    .filter(
      (action): action is WorkbookCutoverCreateStudentAction =>
        action.disposition === "create_and_reconstruct" &&
        action.programCode === null,
    )
    .map((action) => ({
      code: "program_unassigned",
      sourceKey: action.sourceKey,
      message:
        "The workbook has no reviewed program; create this Student unassigned and resolve the operational mismatch later",
    }));

  const planAnchor = {
    schemaVersion: 1 as const,
    manifestSha256,
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: manifest.trustedExtraction.sha256,
    reviewedProductionSnapshotSha256: manifest.productionSnapshot.sha256,
    reviewedProductionSnapshotCanonicalSha256,
    liveSnapshotSha256,
    selectedFeeSchedule,
    selectedTerm,
    workbookActions,
    productionActions,
    applicantActions,
    controls,
    blockers,
    warnings,
  };
  const planSha256 = createHash("sha256")
    .update(canonicalWorkbookCutoverJson(planAnchor))
    .digest("hex");
  return {
    ...planAnchor,
    planSha256,
    capturedAt: liveSnapshot.capturedAt,
    confirmBlocked: blockers.length > 0,
  };
}

export function workbookCutoverLiveSnapshotDigest(
  snapshot: WorkbookCutoverLiveSnapshot,
): string {
  // `capturedAt` is operator evidence, not database state. Including the wall
  // clock would make an unchanged confirmation replan differ from its dry run.
  // Time-sensitive state (for example term closure) is already materialized in
  // the normalized snapshot fields below and remains digest-bound.
  const { capturedAt: _capturedAt, ...stableSnapshot } = snapshot;
  const normalized = {
    ...stableSnapshot,
    students: [...snapshot.students]
      .sort((left, right) => compareText(left.sourceKey, right.sourceKey))
      .map((student) => ({
        ...student,
        roles: [...student.roles].sort(compareText),
        pendingRefundIds: [...student.pendingRefundIds].sort(compareText),
        inFlightProofSubmissionIds: [
          ...student.inFlightProofSubmissionIds,
        ].sort(compareText),
        inFlightPaymentLinkIds: [...student.inFlightPaymentLinkIds].sort(
          compareText,
        ),
        inFlightPiSpiRequestIds: [...student.inFlightPiSpiRequestIds].sort(
          compareText,
        ),
      })),
    applicants: [...snapshot.applicants]
      .sort((left, right) => compareText(left.sourceKey, right.sourceKey))
      .map((applicant) => ({
        ...applicant,
        paymentLinkBearerIds: [...(applicant.paymentLinkBearerIds ?? [])].sort(
          compareText,
        ),
        paymentSubmissionResumeTokenIds: [
          ...(applicant.paymentSubmissionResumeTokenIds ?? []),
        ].sort(compareText),
        inFlightProofSubmissionIds: [
          ...(applicant.inFlightProofSubmissionIds ?? []),
        ].sort(compareText),
        inFlightPaymentLinkIds: [
          ...(applicant.inFlightPaymentLinkIds ?? []),
        ].sort(compareText),
        inFlightPiSpiRequestIds: [
          ...(applicant.inFlightPiSpiRequestIds ?? []),
        ].sort(compareText),
        pendingPaymentIds: [...(applicant.pendingPaymentIds ?? [])].sort(
          compareText,
        ),
        pendingRefundIds: [...(applicant.pendingRefundIds ?? [])].sort(
          compareText,
        ),
      })),
    feeSchedules: [...snapshot.feeSchedules].sort((left, right) =>
      compareText(left.id, right.id),
    ),
    terms: [...snapshot.terms].sort((left, right) =>
      compareText(left.id, right.id),
    ),
    existingStudentNumbers: [...snapshot.existingStudentNumbers]
      .map(canonicalStudentNo)
      .sort(compareText),
    existingLoginEmails: [...snapshot.existingLoginEmails]
      .map((email) => email.toLowerCase())
      .sort(compareText),
    orphanPendingRefundIds: [...snapshot.orphanPendingRefundIds].sort(
      compareText,
    ),
  };
  return createHash("sha256")
    .update(canonicalWorkbookCutoverJson(normalized))
    .digest("hex");
}

/** Confirmation is permitted only for the exact clean dry-run digest. */
export function workbookCutoverPlanDigestMatches(
  plan: Pick<WorkbookCutoverPlan, "planSha256" | "confirmBlocked">,
  expectedPlanSha256: string,
): boolean {
  return (
    !plan.confirmBlocked &&
    /^[a-f0-9]{64}$/.test(expectedPlanSha256) &&
    plan.planSha256 === expectedPlanSha256
  );
}

function planWorkbookRow(
  row: WorkbookCutoverManifestRow,
  manifest: WorkbookCutoverManifest,
  createAllocations: ReadonlyMap<
    string,
    { studentNo: string | null; loginEmail: string | null }
  >,
): WorkbookCutoverWorkbookAction {
  const identity = row.identity;
  if (identity.decision === "reviewed_duplicate") {
    return {
      disposition: "exclude_reviewed_duplicate",
      sourceKey: row.sourceKey,
      canonicalWorkbookRowKey: identity.canonicalWorkbookRowKey,
      amountBilledXof: row.financial.amountBilledXof,
      amountPaidXof: row.financial.amountPaidXof,
    };
  }
  if (identity.decision === "hold") {
    return {
      disposition: "held",
      sourceKey: row.sourceKey,
      amountBilledXof: row.financial.amountBilledXof,
      amountPaidXof: row.financial.amountPaidXof,
    };
  }
  const reconstruction = reconstructionSpec(row, manifest);
  if (identity.decision === "link_existing") {
    return {
      disposition: "reconstruct_existing",
      sourceKey: row.sourceKey,
      studentId: identity.studentId,
      personId: identity.personId,
      studentNo: identity.studentNo,
      preserveAcademicFingerprint: identity.academicFingerprint,
      reconstruction,
    };
  }
  const allocated = createAllocations.get(row.sourceKey) ?? {
    studentNo: null,
    loginEmail: null,
  };
  return {
    disposition: "create_and_reconstruct",
    sourceKey: row.sourceKey,
    firstName: identity.firstName,
    lastName: identity.lastName,
    personalEmail: identity.personalEmail,
    programCode: identity.programCode ?? null,
    plannedStudentNo: allocated.studentNo,
    plannedLoginEmail: allocated.loginEmail,
    reconstruction,
  };
}

function reconstructionSpec(
  row: WorkbookCutoverManifestRow,
  manifest: WorkbookCutoverManifest,
): WorkbookCutoverReconstructionSpec {
  const appliedToInvoiceXof = row.financial.installments.reduce(
    (sum, installment) => sum + installment.paidDetailXof,
    0,
  );
  const componentAllocations = allocateProportionallyXof(
    appliedToInvoiceXof,
    row.financial.components.map((component) => ({
      id: component.key,
      availableXof: component.netAmountXof,
    })),
  ).map((allocation) => ({
    componentKey: allocation.id,
    amountXof: allocation.amountXof,
  }));
  return {
    sourceKey: row.sourceKey,
    amountBilledXof: row.financial.amountBilledXof,
    amountPaidXof: row.financial.amountPaidXof,
    recognizedOn: manifest.sourceAsOfDate,
    settledAt: null,
    installmentDueDates: manifest.installmentDueDates,
    installments: row.financial.installments,
    components: row.financial.components,
    adjustments: row.financial.adjustments,
    services: row.financial.services,
    installmentAllocations: row.financial.installments
      .filter((installment) => installment.paidDetailXof > 0)
      .map((installment) => ({
        sequence: installment.sequence,
        amountXof: installment.paidDetailXof,
      })),
    componentAllocations,
    accountCreditXof: row.financial.accountCreditXof,
    cancelUnsettledAttempts: true,
    voidAllEffectiveInvoicesAndCredits: true,
  };
}

function checkSourceHashes(
  input: WorkbookCutoverPlanInput,
  blockers: WorkbookCutoverBlocker[],
): void {
  const expected = {
    workbookSha256: input.manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: input.manifest.trustedExtraction.sha256,
    reviewedProductionSnapshotSha256: input.manifest.productionSnapshot.sha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (
      input.sourceDigests[key as keyof typeof input.sourceDigests] !== value
    ) {
      blockers.push({
        code: "source_hash_mismatch",
        sourceKey: null,
        message: `${key} does not match the immutable reviewed manifest`,
      });
    }
  }
  if (
    input.trustedExtraction.sourceWorkbookSha256 !==
    input.sourceDigests.workbookSha256
  ) {
    blockers.push({
      code: "source_hash_mismatch",
      sourceKey: null,
      message:
        "The trusted extraction is not bound to the supplied workbook digest",
    });
  }
}

function checkReviewedHolds(
  manifest: WorkbookCutoverManifest,
  blockers: WorkbookCutoverBlocker[],
): void {
  for (const row of manifest.workbookRows) {
    if (row.identity.decision !== "hold") continue;
    blockers.push({
      code: "workbook_identity_hold",
      sourceKey: row.sourceKey,
      message: `Workbook identity remains held: ${row.identity.holdCode}`,
    });
  }
  for (const student of manifest.productionStudents) {
    if (student.decision !== "hold") continue;
    blockers.push({
      code: "production_student_hold",
      sourceKey: student.sourceKey,
      message: `Production Student remains held: ${student.holdCode}`,
    });
  }
}

function checkApplicantRemovals(
  manifest: WorkbookCutoverManifest,
  blockers: WorkbookCutoverBlocker[],
): void {
  for (const applicant of manifest.applicants) {
    if (applicant.decision === "remove") continue;
    blockers.push({
      code: "applicant_removal_required",
      sourceKey: applicant.sourceKey,
      message:
        "Every frozen current Applicant requires the signed terminal removal disposition",
    });
  }
}

function checkLiveSourceSets(
  reviewed: z.infer<typeof WorkbookCutoverProductionSnapshotSchema>,
  live: WorkbookCutoverLiveSnapshot,
  blockers: WorkbookCutoverBlocker[],
): void {
  const reviewedStudents = new Map(
    reviewed.students.map((student) => [student.sourceKey, student]),
  );
  const liveStudents = new Map(
    live.students.map((student) => [student.sourceKey, student]),
  );
  for (const key of unionKeys(reviewedStudents, liveStudents)) {
    const baseline = reviewedStudents.get(key);
    const current = liveStudents.get(key);
    if (!baseline || !current) {
      blockers.push({
        code: "production_student_source_set_drift",
        sourceKey: key,
        message: baseline
          ? "A reviewed production Student is absent from the fresh snapshot"
          : "A fresh production Student is absent from the reviewed source set",
      });
      continue;
    }
    const identityFieldsEqual =
      baseline.sourceRecordSha256 === current.sourceRecordSha256 &&
      baseline.studentId === current.studentId &&
      baseline.personId === current.personId &&
      baseline.studentNo === current.studentNo &&
      baseline.firstName === current.firstName &&
      baseline.lastName === current.lastName &&
      baseline.loginEmail === current.loginEmail &&
      baseline.recordStatus === current.recordStatus &&
      baseline.personStatus === current.personStatus &&
      canonicalWorkbookCutoverJson([...baseline.roles].sort(compareText)) ===
        canonicalWorkbookCutoverJson([...current.roles].sort(compareText)) &&
      baseline.academicFingerprintSha256 === current.academicFingerprintSha256;
    if (!identityFieldsEqual) {
      blockers.push({
        code: "production_identity_drift",
        sourceKey: key,
        message:
          "Official identity, access status, or roles changed after the reviewed production snapshot",
      });
    }
    if (
      baseline.academicFingerprintSha256 !==
        current.academicFingerprintSha256 ||
      workbookCutoverAcademicFingerprintDigest(baseline.academicFingerprint) !==
        workbookCutoverAcademicFingerprintDigest(current.academicFingerprint)
    ) {
      blockers.push({
        code: "academic_fingerprint_drift",
        sourceKey: key,
        message:
          "Transcript, enrollment, grade, credit, or GPA fingerprint changed after review",
      });
    }
  }

  const reviewedApplicants = new Map(
    reviewed.applicants.map((applicant) => [applicant.sourceKey, applicant]),
  );
  const liveApplicants = new Map(
    live.applicants.map((applicant) => [applicant.sourceKey, applicant]),
  );
  for (const key of unionKeys(reviewedApplicants, liveApplicants)) {
    const baseline = reviewedApplicants.get(key);
    const current = liveApplicants.get(key);
    if (!baseline || !current) {
      blockers.push({
        code: "applicant_source_set_drift",
        sourceKey: key,
        message: baseline
          ? "A reviewed Applicant is absent from the fresh snapshot"
          : "A fresh Applicant is absent from the reviewed source set",
      });
      continue;
    }
    if (
      baseline.sourceRecordSha256 !== current.sourceRecordSha256 ||
      baseline.applicantId !== current.applicantId ||
      baseline.firstName !== current.firstName ||
      baseline.lastName !== current.lastName ||
      baseline.email !== current.email ||
      baseline.stage !== current.stage
    ) {
      blockers.push({
        code: "applicant_identity_drift",
        sourceKey: key,
        message: "Applicant identity or stage changed after source review",
      });
    }
  }
}

function checkRefunds(
  live: WorkbookCutoverLiveSnapshot,
  blockers: WorkbookCutoverBlocker[],
): void {
  for (const student of live.students) {
    if (student.pendingRefundIds.length === 0) continue;
    blockers.push({
      code: "refund_pending",
      sourceKey: student.sourceKey,
      message: "A refund remains pending for this Student",
      details: { refundIds: [...student.pendingRefundIds].sort(compareText) },
    });
  }
  for (const applicant of live.applicants) {
    if ((applicant.pendingRefundIds ?? []).length === 0) continue;
    blockers.push({
      code: "refund_pending",
      sourceKey: applicant.sourceKey,
      message: "A refund remains pending for this Applicant",
      details: {
        refundIds: [...(applicant.pendingRefundIds ?? [])].sort(compareText),
      },
    });
  }
  if (live.orphanPendingRefundIds.length > 0) {
    blockers.push({
      code: "refund_pending",
      sourceKey: null,
      message: "A pending refund is not attributable to a reviewed Student",
      details: {
        refundIds: [...live.orphanPendingRefundIds].sort(compareText),
      },
    });
  }
}

function selectFeeSchedule(
  manifest: WorkbookCutoverManifest,
  live: WorkbookCutoverLiveSnapshot,
  blockers: WorkbookCutoverBlocker[],
): WorkbookCutoverPlan["selectedFeeSchedule"] {
  const candidates = live.feeSchedules
    .filter(
      (schedule) =>
        schedule.academicYearLabel === manifest.academicYearLabel &&
        schedule.status === "approved",
    )
    .sort((left, right) => compareText(left.id, right.id));
  if (candidates.length !== 1) {
    blockers.push({
      code: "ambiguous_fee_schedule",
      sourceKey: null,
      message: `Expected exactly one approved fee schedule; found ${candidates.length}`,
      details: { candidateIds: candidates.map((candidate) => candidate.id) },
    });
    return null;
  }
  const candidate = candidates[0]!;
  return {
    id: candidate.id,
    revision: candidate.revision,
    fingerprintSha256: candidate.fingerprintSha256,
  };
}

function selectTerm(
  manifest: WorkbookCutoverManifest,
  live: WorkbookCutoverLiveSnapshot,
  blockers: WorkbookCutoverBlocker[],
): WorkbookCutoverPlan["selectedTerm"] {
  const candidates = live.terms
    .filter(
      (term) =>
        term.academicYearLabel === manifest.academicYearLabel &&
        term.label === manifest.billingTermLabel,
    )
    .sort((left, right) => compareText(left.id, right.id));
  if (candidates.length !== 1) {
    blockers.push({
      code: "ambiguous_term",
      sourceKey: null,
      message: `Expected exactly one billing term; found ${candidates.length}`,
      details: { candidateIds: candidates.map((candidate) => candidate.id) },
    });
    return null;
  }
  const candidate = candidates[0]!;
  if (
    canonicalWorkbookCutoverJson(candidate.installmentDueDates) !==
    canonicalWorkbookCutoverJson(manifest.installmentDueDates)
  ) {
    blockers.push({
      code: "term_installment_dates_mismatch",
      sourceKey: null,
      message:
        "The selected term does not carry the four reviewed installment dates",
      details: {
        expected: manifest.installmentDueDates,
        actual: candidate.installmentDueDates,
      },
    });
  }
  return {
    id: candidate.id,
    fingerprintSha256: candidate.fingerprintSha256,
    installmentDueDates: candidate.installmentDueDates,
  };
}

function preplanCreateIdentities(
  manifest: WorkbookCutoverManifest,
  live: WorkbookCutoverLiveSnapshot,
  blockers: WorkbookCutoverBlocker[],
): Map<string, { studentNo: string | null; loginEmail: string | null }> {
  const creates = manifest.workbookRows
    .filter(
      (
        row,
      ): row is WorkbookCutoverManifestRow & {
        identity: Extract<
          WorkbookCutoverManifestRow["identity"],
          { decision: "create_new" }
        >;
      } => row.identity.decision === "create_new",
    )
    .sort((left, right) => compareText(left.sourceKey, right.sourceKey));
  const result = new Map<
    string,
    { studentNo: string | null; loginEmail: string | null }
  >();
  if (creates.length === 0) return result;
  const sequence = live.studentNumberSequence;
  if (!sequence || sequence.academicYearStart !== manifest.academicYearStart) {
    blockers.push({
      code: "student_number_sequence_unavailable",
      sourceKey: null,
      message:
        "A locked StudentNumberSequence baseline is required to preplan new identities",
    });
    for (const row of creates) {
      result.set(row.sourceKey, { studentNo: null, loginEmail: null });
    }
    return result;
  }

  const usedNumbers = new Set(
    [
      ...live.existingStudentNumbers,
      ...live.students.map((row) => row.studentNo),
    ].map(canonicalStudentNo),
  );
  const usedEmails = new Set(
    [
      ...live.existingLoginEmails,
      ...live.students.flatMap((row) =>
        row.loginEmail ? [row.loginEmail] : [],
      ),
    ].map((email) => email.toLowerCase()),
  );
  let nextValue = sequence.nextAssignableValue;
  for (const row of creates) {
    let studentNo = "";
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const candidate = `S${manifest.academicYearStart}${nextValue}${studentNameInitials(row.identity.firstName, row.identity.lastName)}`;
      nextValue += 1;
      if (!usedNumbers.has(candidate)) {
        studentNo = candidate;
        break;
      }
    }
    if (!studentNo) {
      blockers.push({
        code: "student_number_collision",
        sourceKey: row.sourceKey,
        message:
          "Unable to reserve a unique Student number from the live sequence",
      });
      result.set(row.sourceKey, { studentNo: null, loginEmail: null });
      continue;
    }
    usedNumbers.add(studentNo);
    const loginEmail = allocateLoginEmail(
      row.identity.firstName,
      row.identity.lastName,
      usedEmails,
    );
    if (!loginEmail) {
      blockers.push({
        code: "login_email_collision",
        sourceKey: row.sourceKey,
        message: "Unable to reserve a unique @mydaust.com login identity",
      });
      result.set(row.sourceKey, { studentNo, loginEmail: null });
      continue;
    }
    usedEmails.add(loginEmail);
    if (
      row.identity.plannedStudentNo !== undefined &&
      (row.identity.plannedStudentNo !== studentNo ||
        row.identity.plannedLoginEmail !== loginEmail)
    ) {
      blockers.push({
        code: "reviewed_preallocation_mismatch",
        sourceKey: row.sourceKey,
        message:
          "The reviewed Student number/login preallocation no longer matches live sequence and email state",
        details: {
          reviewedStudentNo: row.identity.plannedStudentNo,
          livePlannedStudentNo: studentNo,
          reviewedLoginEmail: row.identity.plannedLoginEmail,
          livePlannedLoginEmail: loginEmail,
        },
      });
    }
    result.set(row.sourceKey, { studentNo, loginEmail });
  }
  return result;
}

function planControls(
  actions: readonly WorkbookCutoverWorkbookAction[],
  productionActions: readonly WorkbookCutoverProductionDecision[],
  manifest: WorkbookCutoverManifest,
): WorkbookCutoverPlanControls {
  const included = actions.filter(
    (action) =>
      action.disposition === "reconstruct_existing" ||
      action.disposition === "create_and_reconstruct",
  );
  const excluded = actions.filter(
    (action): action is WorkbookCutoverDuplicateExclusionAction =>
      action.disposition === "exclude_reviewed_duplicate",
  );
  const held = actions.filter(
    (action): action is WorkbookCutoverHeldAction =>
      action.disposition === "held",
  );
  const includedBilledXof = sumXof(
    included.map((action) => action.reconstruction.amountBilledXof),
  );
  const includedPaidXof = sumXof(
    included.map((action) => action.reconstruction.amountPaidXof),
  );
  const reviewedExclusionBilledXof = sumXof(
    excluded.map((action) => action.amountBilledXof),
  );
  const reviewedExclusionPaidXof = sumXof(
    excluded.map((action) => action.amountPaidXof),
  );
  const heldBilledXof = sumXof(held.map((action) => action.amountBilledXof));
  const heldPaidXof = sumXof(held.map((action) => action.amountPaidXof));
  if (
    included.length + excluded.length + held.length !==
      WORKBOOK_CUTOVER_BASELINE.workbookRows ||
    includedBilledXof + reviewedExclusionBilledXof + heldBilledXof !==
      WORKBOOK_CUTOVER_BASELINE.billedXof ||
    includedPaidXof + reviewedExclusionPaidXof + heldPaidXof !==
      WORKBOOK_CUTOVER_BASELINE.paidXof
  ) {
    throw new Error(
      "Workbook cutover plan failed source conservation controls",
    );
  }
  return {
    workbookRows: WORKBOOK_CUTOVER_BASELINE.workbookRows,
    productionStudents: productionActions.length,
    applicants: manifest.applicants.length,
    sourceBilledXof: WORKBOOK_CUTOVER_BASELINE.billedXof,
    sourcePaidXof: WORKBOOK_CUTOVER_BASELINE.paidXof,
    includedRows: included.length,
    includedBilledXof,
    includedPaidXof,
    reviewedExclusionRows: excluded.length,
    reviewedExclusionBilledXof,
    reviewedExclusionPaidXof,
    heldRows: held.length,
    heldBilledXof,
    heldPaidXof,
    accountCreditXof: sumXof(
      included.map((action) => action.reconstruction.accountCreditXof),
    ),
    archiveStudents: productionActions.filter(
      (action) => action.decision === "archive",
    ).length,
    keepExceptionStudents: productionActions.filter(
      (action) => action.decision === "keep_exception",
    ).length,
    preserveApplicants: manifest.applicants.filter(
      (action) => action.decision === "preserve",
    ).length,
    removeApplicants: manifest.applicants.filter(
      (action) => action.decision === "remove",
    ).length,
    reconciles: true,
  };
}

function studentNameInitials(firstName: string, lastName: string): string {
  const tokens = `${firstName} ${lastName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  return tokens.map((token) => token[0]).join("") || "XX";
}

function allocateLoginEmail(
  firstName: string,
  lastName: string,
  used: ReadonlySet<string>,
): string | null {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  const first = clean(firstName) || "student";
  const last = clean(lastName);
  const base = last ? `${first}.${last}` : first;
  for (let suffix = 1; suffix <= 100_000; suffix += 1) {
    const candidate = `${base}${suffix === 1 ? "" : `.${suffix}`}@mydaust.com`;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

function canonicalStudentNo(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

function issueSourceKey(issue: string): string | null {
  const separator = issue.indexOf(":");
  if (separator < 0) return null;
  const suffix = issue.slice(separator + 1);
  return suffix.startsWith("workbook:") ||
    suffix.startsWith("student:") ||
    suffix.startsWith("applicant:")
    ? suffix
    : null;
}

function unionKeys<T, U>(
  left: Map<string, T>,
  right: Map<string, U>,
): string[] {
  return [...new Set([...left.keys(), ...right.keys()])].sort(compareText);
}

function sumXof(values: readonly number[]): number {
  const value = values.reduce((sum, current) => sum + current, 0);
  if (!Number.isSafeInteger(value)) {
    throw new Error("Workbook cutover XOF plan exceeds safe integers");
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareBlockers(
  left: WorkbookCutoverBlocker,
  right: WorkbookCutoverBlocker,
): number {
  return (
    compareText(left.code, right.code) ||
    compareText(left.sourceKey ?? "", right.sourceKey ?? "") ||
    compareText(left.message, right.message)
  );
}

function validateUniqueLive<
  Row extends Record<Key, string>,
  Key extends keyof Row,
>(
  rows: readonly Row[],
  key: Key,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const value = row[key];
    if (seen.has(value)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, index, String(key)],
        message: `${String(key)} ${value} appears more than once`,
      });
    }
    seen.add(value);
  }
}

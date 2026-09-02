import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@mydaust/db";
import { z } from "zod";
import { auditWorkbookCutoverBatch } from "./workbook-cutover.audit.js";
import { canonicalWorkbookCutoverJson } from "./workbook-cutover.manifest.js";

export const WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT = 9;
export const WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION =
  "workbook-pending-payment-override-activated";
export const WORKBOOK_PENDING_ACTIVATION_APPLICANT_AUDIT_ACTION =
  "workbook-pending-payment-override-activated";
export const WORKBOOK_PENDING_ACTIVATION_BATCH_AUDIT_ACTION =
  "pending-payment-activation-imported";

const MAX_TRANSACTION_ATTEMPTS = 3;
const TRANSACTION_TIMEOUT_MS = 60_000;
const ACTIVATION_REASON =
  "Reviewed workbook roster override: include the cutover Student without inventing enrollment cash";
const LOGIN_EMAIL = z.string().max(320).email();

type PendingActivationDb = Prisma.TransactionClient | PrismaClient;

export type WorkbookPendingActivationBlocker = {
  code: string;
  count?: number;
};

export type PendingActivationLinkSnapshot = {
  id: string;
  onboardingApplicantId: string | null;
  studentId: string | null;
  invoiceId: string | null;
  status: string;
  amountXof: number;
  tokenSha256: string;
};

export type PendingActivationSubmissionSnapshot = {
  id: string;
  applicantId: string | null;
  studentId: string | null;
  invoiceId: string | null;
  paymentLinkId: string | null;
  paymentId: string | null;
  status: string;
  activeKeySha256: string | null;
  resumeTokenSha256: string | null;
};

export type PendingActivationPiSpiSnapshot = {
  id: string;
  applicantId: string | null;
  studentId: string | null;
  invoiceId: string | null;
  paymentLinkId: string | null;
  paymentId: string | null;
  status: string;
  amountXof: number;
};

export type PendingActivationPaymentSnapshot = {
  id: string;
  studentId: string;
  invoiceId: string;
  status: string;
  amount: number;
  updatedAt: string;
};

export type PendingActivationInvoiceSnapshot = {
  id: string;
  studentId: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  revision: number;
  updatedAt: string;
};

export type PendingActivationInviteSnapshot = {
  id: string;
  purpose: string;
  expiresAt: string;
  usedAt: string | null;
};

export type PendingActivationRequestSnapshot = {
  id: string;
  expiresAt: string;
  approvedAt: string | null;
};

export type PendingActivationCardSnapshot = {
  id: string;
  batchId: string;
  expiresAt: string;
};

export type WorkbookPendingActivationTargetSnapshot = {
  sourceRecordId: string;
  sourceKeySha256: string;
  linkedWorkbookRecord: {
    id: string;
    batchId: string;
    sourceKind: string;
    sourceKeySha256: string;
    disposition: string | null;
    studentId: string | null;
    canonicalInvoiceId: string | null;
    billingProfileId: string | null;
    appliedAt: string | null;
  } | null;
  student: {
    id: string;
    personId: string;
    recordStatus: string;
    enrolledAt: string | null;
  };
  person: {
    id: string;
    kind: string;
    status: string;
    suspendedAt: string | null;
    roles: string[];
    emailSha256: string | null;
    passwordHashSha256: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: string | null;
    lastLoginAt: string | null;
    sessionVersion: number;
    loginEmailMatchCount: number;
    loginEmailValid: boolean;
  };
  applicant: {
    id: string;
    studentId: string | null;
    stage: string;
    onboardingStatus: string;
    enrollmentInvoiceId: string | null;
    activeOnboardingPaymentLinkId: string | null;
    activatedByPaymentId: string | null;
    acceptedAt: string | null;
    paymentPendingAt: string | null;
    enrolledAt: string | null;
    onboardingCancelledAt: string | null;
    statusTokenHashSha256: string | null;
    statusTokenExpiresAt: string | null;
    statusTokenRevokedAt: string | null;
  } | null;
  links: PendingActivationLinkSnapshot[];
  submissions: PendingActivationSubmissionSnapshot[];
  piSpiRequests: PendingActivationPiSpiSnapshot[];
  payments: PendingActivationPaymentSnapshot[];
  invoices: PendingActivationInvoiceSnapshot[];
  invites: PendingActivationInviteSnapshot[];
  activeActivationRequests: PendingActivationRequestSnapshot[];
  activeActivationCards: PendingActivationCardSnapshot[];
};

export type WorkbookPendingActivationCapturedState = {
  batch: {
    id: string;
    status: string;
    identityManifestSha256: string;
    confirmationPlanSha256: string;
    sourceWorkbookSha256: string;
    importedAt: string | null;
  } | null;
  actor: {
    id: string;
    kind: string;
    status: string;
    roles: string[];
  };
  globalStudentCounts: {
    physical: number;
    active: number;
    pendingPayment: number;
    archived: number;
  };
  targets: WorkbookPendingActivationTargetSnapshot[];
};

export type WorkbookPendingActivationPlan = {
  schemaVersion: 1;
  operation: "workbook-pending-payment-activation";
  capturedAt: string;
  batchId: string;
  actorId: string;
  planSha256: string;
  confirmBlocked: boolean;
  blockers: WorkbookPendingActivationBlocker[];
  targetCount: number;
  activeLinkCount: number;
  proofDraftCount: number;
  submittedProofCount: number;
  activePiSpiCount: number;
  pendingPaymentCount: number;
  refundPendingCount: number;
  globalStudentCounts: WorkbookPendingActivationCapturedState["globalStudentCounts"];
  alreadyApplied: boolean;
  targets: WorkbookPendingActivationTargetSnapshot[];
};

export type WorkbookPendingActivationResult = {
  batchId: string;
  planSha256: string;
  alreadyApplied: boolean;
  activatedStudents: number;
  activatedApplicants: number;
  cancelledPaymentLinks: number;
  cancelledProofDrafts: number;
  cancelledDraftPayments: number;
  auditRowsCreated: number;
};

export type WorkbookPendingActivationAudit = {
  ok: true;
  batchId: string;
  planSha256: string;
  targetCount: number;
  activeStudents: number;
  enrolledApplicants: number;
  revokedStatusBearers: number;
  remainingActiveLinks: number;
  studentAuditRows: number;
  applicantAuditRows: number;
  batchAuditRows: number;
  physicalStudents: number;
  activeRosterStudents: number;
  pendingPaymentStudents: number;
  archivedStudents: number;
  canonicalInvoices: number;
  reconstructionPayments: number;
  originalCutoverAuditOk: true;
};

type PersistedSummary = {
  planSha256: string;
  targetCount: number;
  studentIds: string[];
  applicantIds: string[];
  sourceRecordIds: string[];
  cancelledPaymentLinkIds: string[];
};

type ValidatedStudentAuditEvidence = {
  studentId: string;
  applicantId: string;
  personId: string;
  sourceRecordId: string;
  sourceKeySha256: string;
  newEnrolledAt: string;
  priorSessionVersion: number;
  newSessionVersion: number;
};

type ValidatedApplicantAuditEvidence = {
  applicantId: string;
  studentId: string;
  sourceRecordId: string;
  sourceKeySha256: string;
  activatedAt: string;
};

type ValidatedLifecycleAuditEvidence = {
  students: Map<string, ValidatedStudentAuditEvidence>;
  applicants: Map<string, ValidatedApplicantAuditEvidence>;
};

export class WorkbookPendingActivationBlockedError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WorkbookPendingActivationBlockedError";
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashNullable(value: string | null): string | null {
  return value === null ? null : sha256(value);
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((row) => typeof row === "string")
    ? value
    : null;
}

function parsePersistedSummary(value: unknown): PersistedSummary | null {
  if (!isObject(value)) return null;
  const studentIds = parseStringArray(value.studentIds);
  const applicantIds = parseStringArray(value.applicantIds);
  const sourceRecordIds = parseStringArray(value.sourceRecordIds);
  const cancelledPaymentLinkIds = parseStringArray(
    value.cancelledPaymentLinkIds,
  );
  if (
    value.schemaVersion !== 1 ||
    value.operation !== "workbook-pending-payment-activation" ||
    typeof value.planSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.planSha256) ||
    value.targetCount !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    value.studentAuditRows !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    value.applicantAuditRows !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    value.activePaymentAttemptCountAtConfirmation !== 0 ||
    value.pendingOrRefundPaymentCountAtConfirmation !== 0 ||
    value.reviewedOverride !== true ||
    value.inventedCash !== false ||
    value.financialLedgerChanged !== false ||
    !studentIds ||
    !applicantIds ||
    !sourceRecordIds ||
    !cancelledPaymentLinkIds ||
    studentIds.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    applicantIds.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    sourceRecordIds.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    cancelledPaymentLinkIds.length !==
      WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    uniqueSorted(studentIds).length !== studentIds.length ||
    uniqueSorted(applicantIds).length !== applicantIds.length ||
    uniqueSorted(sourceRecordIds).length !== sourceRecordIds.length ||
    uniqueSorted(cancelledPaymentLinkIds).length !==
      cancelledPaymentLinkIds.length
  ) {
    return null;
  }
  return {
    planSha256: value.planSha256,
    targetCount: value.targetCount,
    studentIds: uniqueSorted(studentIds),
    applicantIds: uniqueSorted(applicantIds),
    sourceRecordIds: uniqueSorted(sourceRecordIds),
    cancelledPaymentLinkIds: uniqueSorted(cancelledPaymentLinkIds),
  };
}

async function requireActor(db: PendingActivationDb, emailInput: string) {
  const normalized = emailInput.trim().toLowerCase();
  const actors = await db.person.findMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, kind: true, status: true, roles: true },
    orderBy: { id: "asc" },
    take: 2,
  });
  const actor = actors[0];
  if (
    actors.length !== 1 ||
    !actor ||
    actor.kind !== "staff" ||
    actor.status !== "active" ||
    !actor.roles.includes("admin")
  ) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation actor must be an active staff administrator",
    );
  }
  return actor;
}

async function findSummaryLogs(db: PendingActivationDb, batchId: string) {
  return db.auditLog.findMany({
    where: {
      entity: "WorkbookCutoverBatch",
      entityId: batchId,
      action: WORKBOOK_PENDING_ACTIVATION_BATCH_AUDIT_ACTION,
    },
    select: { id: true, data: true },
    orderBy: { createdAt: "asc" },
  });
}

async function existingSummary(
  db: PendingActivationDb,
  batchId: string,
): Promise<PersistedSummary | null> {
  const logs = await findSummaryLogs(db, batchId);
  if (logs.length > 1) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation batch has duplicate summary audit evidence",
      { summaryAuditRows: logs.length },
    );
  }
  if (logs.length === 0) return null;
  const parsed = parsePersistedSummary(logs[0]!.data);
  if (!parsed) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation batch summary audit evidence is malformed",
    );
  }
  return parsed;
}

async function assertOriginalCutoverAuditHealthy(
  db: PendingActivationDb,
  batchId: string,
  protectedStudentIds: readonly string[],
): Promise<void> {
  try {
    const audit = await auditWorkbookCutoverBatch(
      db as unknown as PrismaClient,
      batchId,
      { protectedPaymentActivityStudentIds: protectedStudentIds },
    );
    if (!audit.ok) {
      throw new Error("original cutover audit returned a non-success result");
    }
  } catch {
    throw new WorkbookPendingActivationBlockedError(
      "Original workbook cutover audit must pass before activation",
      { code: "original_cutover_audit_failed" },
    );
  }
}

function countStatuses(
  targets: readonly WorkbookPendingActivationTargetSnapshot[],
) {
  const submissions = targets.flatMap((target) => target.submissions);
  const piSpi = targets.flatMap((target) => target.piSpiRequests);
  const payments = targets.flatMap((target) => target.payments);
  return {
    activeLinkCount: targets
      .flatMap((target) => target.links)
      .filter((row) => row.status === "active").length,
    proofDraftCount: submissions.filter(
      (row) => row.status === "awaiting_proof",
    ).length,
    submittedProofCount: submissions.filter((row) => row.status === "submitted")
      .length,
    activePiSpiCount: piSpi.filter((row) =>
      ["initiated", "sent"].includes(row.status),
    ).length,
    pendingPaymentCount: payments.filter((row) => row.status === "pending")
      .length,
    refundPendingCount: payments.filter(
      (row) => row.status === "refund_pending",
    ).length,
  };
}

async function captureGlobalStudentCounts(
  db: PendingActivationDb,
): Promise<WorkbookPendingActivationCapturedState["globalStudentCounts"]> {
  const students = await db.student.findMany({
    select: { recordStatus: true },
  });
  return {
    physical: students.length,
    active: students.filter((row) => row.recordStatus === "active").length,
    pendingPayment: students.filter(
      (row) => row.recordStatus === "pending_payment",
    ).length,
    archived: students.filter((row) => row.recordStatus === "archived").length,
  };
}

export function buildWorkbookPendingActivationPlan(
  state: WorkbookPendingActivationCapturedState,
  batchId: string,
  capturedAt = new Date(),
): WorkbookPendingActivationPlan {
  const blockers: WorkbookPendingActivationBlocker[] = [];
  if (!state.batch) {
    blockers.push({ code: "cutover_batch_missing" });
  } else if (
    state.batch.id !== batchId ||
    state.batch.status !== "imported" ||
    !state.batch.importedAt
  ) {
    blockers.push({ code: "cutover_batch_not_imported" });
  }
  if (state.globalStudentCounts.physical !== 446) {
    blockers.push({
      code: "physical_student_count_mismatch",
      count: state.globalStudentCounts.physical,
    });
  }
  if (state.globalStudentCounts.active !== 391) {
    blockers.push({
      code: "active_student_count_mismatch",
      count: state.globalStudentCounts.active,
    });
  }
  if (state.globalStudentCounts.pendingPayment !== 9) {
    blockers.push({
      code: "pending_payment_student_count_mismatch",
      count: state.globalStudentCounts.pendingPayment,
    });
  }
  if (state.globalStudentCounts.archived !== 46) {
    blockers.push({
      code: "archived_student_count_mismatch",
      count: state.globalStudentCounts.archived,
    });
  }
  if (
    state.globalStudentCounts.active +
      state.globalStudentCounts.pendingPayment +
      state.globalStudentCounts.archived !==
    state.globalStudentCounts.physical
  ) {
    blockers.push({ code: "student_status_partition_mismatch" });
  }
  if (state.targets.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT) {
    blockers.push({
      code: "pending_target_count_mismatch",
      count: state.targets.length,
    });
  }
  const studentIds = state.targets.map((row) => row.student.id);
  const personIds = state.targets.map((row) => row.person.id);
  const applicantIds = state.targets.flatMap((row) =>
    row.applicant ? [row.applicant.id] : [],
  );
  if (uniqueSorted(studentIds).length !== studentIds.length) {
    blockers.push({ code: "duplicate_target_student" });
  }
  if (uniqueSorted(personIds).length !== personIds.length) {
    blockers.push({ code: "duplicate_target_person" });
  }
  if (uniqueSorted(applicantIds).length !== state.targets.length) {
    blockers.push({ code: "missing_or_duplicate_target_applicant" });
  }
  const submissionAssignments = state.targets.flatMap((target) =>
    target.submissions.map((attempt) => attempt.id),
  );
  const piSpiAssignments = state.targets.flatMap((target) =>
    target.piSpiRequests.map((attempt) => attempt.id),
  );
  if (
    uniqueSorted(submissionAssignments).length !==
      submissionAssignments.length ||
    uniqueSorted(piSpiAssignments).length !== piSpiAssignments.length
  ) {
    blockers.push({ code: "duplicate_payment_attempt_target_assignment" });
  }

  for (const target of state.targets) {
    const workbook = target.linkedWorkbookRecord;
    const applicant = target.applicant;
    if (
      !workbook ||
      workbook.batchId !== state.batch?.id ||
      workbook.sourceKind !== "workbook_row" ||
      workbook.disposition !== "link_existing_student" ||
      workbook.studentId !== target.student.id ||
      !workbook.canonicalInvoiceId ||
      !workbook.billingProfileId ||
      !workbook.appliedAt
    ) {
      blockers.push({ code: "workbook_link_drift" });
    }
    if (
      target.student.recordStatus !== "pending_payment" ||
      target.student.enrolledAt !== null ||
      target.student.personId !== target.person.id
    ) {
      blockers.push({ code: "student_lifecycle_drift" });
    }
    if (
      target.person.kind !== "student" ||
      target.person.status !== "active" ||
      target.person.suspendedAt !== null ||
      target.person.roles.length !== 0 ||
      target.person.emailSha256 === null ||
      !target.person.loginEmailValid ||
      target.person.loginEmailMatchCount !== 1 ||
      target.person.passwordHashSha256 !== null ||
      target.person.mustChangePassword ||
      target.person.passwordChangedAt !== null ||
      target.person.lastLoginAt !== null ||
      target.invites.length !== 0 ||
      target.activeActivationRequests.length !== 0 ||
      target.activeActivationCards.length !== 0
    ) {
      blockers.push({ code: "student_identity_drift" });
    }
    if (
      !applicant ||
      applicant.studentId !== target.student.id ||
      applicant.stage !== "accepted" ||
      applicant.onboardingStatus !== "payment_pending" ||
      applicant.enrollmentInvoiceId !== workbook?.canonicalInvoiceId ||
      applicant.activatedByPaymentId !== null ||
      applicant.enrolledAt !== null ||
      applicant.onboardingCancelledAt !== null ||
      applicant.statusTokenHashSha256 === null ||
      applicant.statusTokenRevokedAt !== null ||
      !applicant.acceptedAt ||
      !applicant.paymentPendingAt
    ) {
      blockers.push({ code: "applicant_lifecycle_drift" });
    }
    const activeLinks = target.links.filter((link) => link.status === "active");
    if (
      !applicant ||
      activeLinks.length !== 1 ||
      applicant.activeOnboardingPaymentLinkId !== activeLinks[0]?.id ||
      activeLinks[0]?.onboardingApplicantId !== applicant.id ||
      activeLinks[0]?.studentId !== target.student.id ||
      activeLinks[0]?.invoiceId !== applicant.enrollmentInvoiceId
    ) {
      blockers.push({ code: "active_onboarding_link_drift" });
    }
    if (
      workbook?.canonicalInvoiceId &&
      !target.invoices.some(
        (invoice) =>
          invoice.id === workbook.canonicalInvoiceId &&
          invoice.studentId === target.student.id &&
          invoice.status !== "void",
      )
    ) {
      blockers.push({ code: "canonical_invoice_drift" });
    }
    const targetLinkIds = new Set(target.links.map((link) => link.id));
    const targetInvoiceIds = new Set(
      [applicant?.enrollmentInvoiceId, workbook?.canonicalInvoiceId].flatMap(
        (value) => (value ? [value] : []),
      ),
    );
    const relatedPayments = new Map(
      target.payments.map((payment) => [payment.id, payment]),
    );
    const attemptOwnershipDrift = [
      ...target.submissions.map((attempt) => ({
        applicantId: attempt.applicantId,
        studentId: attempt.studentId,
        invoiceId: attempt.invoiceId,
        paymentId: attempt.paymentId,
        paymentLinkId: attempt.paymentLinkId,
      })),
      ...target.piSpiRequests.map((attempt) => ({
        applicantId: attempt.applicantId,
        studentId: attempt.studentId,
        invoiceId: attempt.invoiceId,
        paymentId: attempt.paymentId,
        paymentLinkId: attempt.paymentLinkId,
      })),
    ].some((attempt) => {
      return (
        (attempt.applicantId !== null &&
          attempt.applicantId !== applicant?.id) ||
        (attempt.studentId !== null &&
          attempt.studentId !== target.student.id) ||
        (attempt.invoiceId !== null &&
          !targetInvoiceIds.has(attempt.invoiceId)) ||
        (attempt.paymentLinkId !== null &&
          !targetLinkIds.has(attempt.paymentLinkId)) ||
        (attempt.paymentId !== null &&
          (() => {
            const payment = relatedPayments.get(attempt.paymentId);
            return (
              !payment ||
              payment.studentId !== target.student.id ||
              !targetInvoiceIds.has(payment.invoiceId)
            );
          })())
      );
    });
    if (attemptOwnershipDrift) {
      blockers.push({ code: "payment_attempt_ownership_drift" });
    }
  }
  const counts = countStatuses(state.targets);
  if (counts.proofDraftCount + counts.submittedProofCount > 0) {
    blockers.push({
      code: "active_payment_proof_attempt",
      count: counts.proofDraftCount + counts.submittedProofCount,
    });
  }
  if (counts.activePiSpiCount > 0) {
    blockers.push({
      code: "active_pispi_attempt",
      count: counts.activePiSpiCount,
    });
  }
  if (counts.pendingPaymentCount > 0) {
    blockers.push({
      code: "pending_payment_attempt",
      count: counts.pendingPaymentCount,
    });
  }
  if (counts.refundPendingCount > 0) {
    blockers.push({
      code: "refund_pending",
      count: counts.refundPendingCount,
    });
  }
  const blockerCodes = blockers
    .map((row) => ({ code: row.code, count: row.count ?? null }))
    .sort((left, right) =>
      `${left.code}:${left.count}`.localeCompare(
        `${right.code}:${right.count}`,
      ),
    );
  const anchor = {
    schemaVersion: 1,
    operation: "workbook-pending-payment-activation",
    batch: state.batch,
    actorId: state.actor.id,
    globalStudentCounts: state.globalStudentCounts,
    expectedTargetCount: WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT,
    targets: [...state.targets].sort((left, right) =>
      left.sourceRecordId.localeCompare(right.sourceRecordId),
    ),
    blockerCodes,
  };
  return {
    schemaVersion: 1,
    operation: "workbook-pending-payment-activation",
    capturedAt: capturedAt.toISOString(),
    batchId,
    actorId: state.actor.id,
    planSha256: sha256(canonicalWorkbookCutoverJson(anchor)),
    confirmBlocked: blockers.length > 0,
    blockers,
    targetCount: state.targets.length,
    ...counts,
    globalStudentCounts: state.globalStudentCounts,
    alreadyApplied: false,
    targets: state.targets,
  };
}

async function captureState(
  db: PendingActivationDb,
  batchId: string,
  actorEmail: string,
): Promise<WorkbookPendingActivationCapturedState> {
  const actor = await requireActor(db, actorEmail);
  const globalStudentCounts = await captureGlobalStudentCounts(db);
  const capturedNow = new Date();
  const batch = await db.workbookCutoverBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      identityManifestSha256: true,
      confirmationPlanSha256: true,
      sourceWorkbookSha256: true,
      importedAt: true,
    },
  });
  const records = batch
    ? await db.workbookCutoverSourceRecord.findMany({
        where: {
          batchId,
          sourceKind: "production_student",
          disposition: "link_workbook_row",
          student: { is: { recordStatus: "pending_payment" } },
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          sourceKeySha256: true,
          linkedWorkbookRecord: {
            select: {
              id: true,
              batchId: true,
              sourceKind: true,
              sourceKeySha256: true,
              disposition: true,
              studentId: true,
              canonicalInvoiceId: true,
              billingProfileId: true,
              appliedAt: true,
            },
          },
          student: {
            select: {
              id: true,
              personId: true,
              recordStatus: true,
              enrolledAt: true,
              person: {
                select: {
                  id: true,
                  kind: true,
                  status: true,
                  suspendedAt: true,
                  roles: true,
                  email: true,
                  passwordHash: true,
                  mustChangePassword: true,
                  passwordChangedAt: true,
                  lastLoginAt: true,
                  sessionVersion: true,
                },
              },
              applicant: {
                select: {
                  id: true,
                  studentId: true,
                  stage: true,
                  onboardingStatus: true,
                  enrollmentInvoiceId: true,
                  activeOnboardingPaymentLinkId: true,
                  activatedByPaymentId: true,
                  acceptedAt: true,
                  paymentPendingAt: true,
                  enrolledAt: true,
                  onboardingCancelledAt: true,
                  statusTokenHash: true,
                  statusTokenExpiresAt: true,
                  statusTokenRevokedAt: true,
                },
              },
            },
          },
        },
      })
    : [];

  const studentIds = records.flatMap((row) =>
    row.student ? [row.student.id] : [],
  );
  const personIds = records.flatMap((row) =>
    row.student?.person ? [row.student.person.id] : [],
  );
  const applicantIds = records.flatMap((row) =>
    row.student?.applicant ? [row.student.applicant.id] : [],
  );
  const activePointerIds = records.flatMap((row) =>
    row.student?.applicant?.activeOnboardingPaymentLinkId
      ? [row.student.applicant.activeOnboardingPaymentLinkId]
      : [],
  );
  const invoiceIds = uniqueSorted(
    records.flatMap((row) =>
      [
        row.linkedWorkbookRecord?.canonicalInvoiceId,
        row.student?.applicant?.enrollmentInvoiceId,
      ].flatMap((value) => (value ? [value] : [])),
    ),
  );
  const links =
    applicantIds.length > 0 || activePointerIds.length > 0
      ? await db.paymentLink.findMany({
          where: {
            OR: [
              ...(applicantIds.length > 0
                ? [{ onboardingApplicantId: { in: applicantIds } }]
                : []),
              ...(activePointerIds.length > 0
                ? [{ id: { in: activePointerIds } }]
                : []),
            ],
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            onboardingApplicantId: true,
            studentId: true,
            invoiceId: true,
            status: true,
            amountXof: true,
            token: true,
          },
        })
      : [];
  const linkIds = links.map((row) => row.id);
  const attemptScope = [
    ...(linkIds.length > 0 ? [{ paymentLinkId: { in: linkIds } }] : []),
    ...(applicantIds.length > 0 ? [{ applicantId: { in: applicantIds } }] : []),
    ...(studentIds.length > 0 ? [{ studentId: { in: studentIds } }] : []),
    ...(invoiceIds.length > 0 ? [{ invoiceId: { in: invoiceIds } }] : []),
  ];
  const [
    submissions,
    piSpiRequests,
    invoices,
    invites,
    activationRequests,
    activationCards,
  ] = await Promise.all([
    attemptScope.length > 0
      ? db.paymentSubmission.findMany({
          where: { OR: attemptScope },
          orderBy: { id: "asc" },
          select: {
            id: true,
            applicantId: true,
            studentId: true,
            invoiceId: true,
            paymentLinkId: true,
            paymentId: true,
            status: true,
            activeKey: true,
            resumeToken: true,
          },
        })
      : [],
    attemptScope.length > 0
      ? db.piSpiRequest.findMany({
          where: { OR: attemptScope },
          orderBy: { id: "asc" },
          select: {
            id: true,
            applicantId: true,
            studentId: true,
            invoiceId: true,
            paymentLinkId: true,
            paymentId: true,
            status: true,
            amountXof: true,
          },
        })
      : [],
    studentIds.length > 0 || invoiceIds.length > 0
      ? db.invoice.findMany({
          where: {
            OR: [
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
              ...(invoiceIds.length > 0 ? [{ id: { in: invoiceIds } }] : []),
            ],
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            studentId: true,
            status: true,
            totalAmount: true,
            amountPaid: true,
            revision: true,
            updatedAt: true,
          },
        })
      : [],
    personIds.length > 0
      ? db.studentInvite.findMany({
          where: { studentPersonId: { in: personIds } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            studentPersonId: true,
            purpose: true,
            expiresAt: true,
            usedAt: true,
          },
        })
      : [],
    personIds.length > 0
      ? db.studentActivationRequest.findMany({
          where: {
            studentPersonId: { in: personIds },
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: capturedNow },
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            studentPersonId: true,
            expiresAt: true,
            approvedAt: true,
          },
        })
      : [],
    personIds.length > 0
      ? db.studentActivationCard.findMany({
          where: {
            studentPersonId: { in: personIds },
            claimedAt: null,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: capturedNow },
            batch: {
              is: { revokedAt: null, expiresAt: { gt: capturedNow } },
            },
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            batchId: true,
            studentPersonId: true,
            expiresAt: true,
          },
        })
      : [],
  ]);
  const attemptPaymentIds = uniqueSorted(
    [...submissions, ...piSpiRequests].flatMap((row) =>
      row.paymentId ? [row.paymentId] : [],
    ),
  );
  const studentPayments =
    studentIds.length > 0 ||
    invoiceIds.length > 0 ||
    attemptPaymentIds.length > 0
      ? await db.payment.findMany({
          where: {
            OR: [
              ...(studentIds.length > 0
                ? [{ studentId: { in: studentIds } }]
                : []),
              ...(invoiceIds.length > 0
                ? [{ invoiceId: { in: invoiceIds } }]
                : []),
              ...(attemptPaymentIds.length > 0
                ? [{ id: { in: attemptPaymentIds } }]
                : []),
            ],
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            studentId: true,
            invoiceId: true,
            status: true,
            amount: true,
            updatedAt: true,
          },
        })
      : [];
  const normalizedEmails = uniqueSorted(
    records.flatMap((row) => {
      const email = row.student?.person.email?.trim().toLowerCase();
      return email ? [email] : [];
    }),
  );
  const emailMatches =
    normalizedEmails.length > 0
      ? await db.person.findMany({
          where: {
            OR: normalizedEmails.map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            })),
          },
          select: { id: true, email: true },
        })
      : [];

  const targets: WorkbookPendingActivationTargetSnapshot[] = records.flatMap(
    (record) => {
      const student = record.student;
      if (!student?.person) return [];
      const applicant = student.applicant;
      const targetLinks = links.filter(
        (link) =>
          link.onboardingApplicantId === applicant?.id ||
          link.id === applicant?.activeOnboardingPaymentLinkId,
      );
      const targetLinkIds = new Set(targetLinks.map((link) => link.id));
      const targetInvoiceIds = new Set(
        [
          record.linkedWorkbookRecord?.canonicalInvoiceId,
          applicant?.enrollmentInvoiceId,
        ].flatMap((value) => (value ? [value] : [])),
      );
      const attemptBelongs = (row: {
        applicantId: string | null;
        studentId: string | null;
        invoiceId: string | null;
        paymentLinkId: string | null;
      }) =>
        row.applicantId === applicant?.id ||
        row.studentId === student.id ||
        (row.invoiceId !== null && targetInvoiceIds.has(row.invoiceId)) ||
        (row.paymentLinkId !== null && targetLinkIds.has(row.paymentLinkId));
      const targetSubmissions = submissions.filter(attemptBelongs);
      const targetPiSpi = piSpiRequests.filter(attemptBelongs);
      const targetAttemptPaymentIds = new Set(
        [...targetSubmissions, ...targetPiSpi].flatMap((row) =>
          row.paymentId ? [row.paymentId] : [],
        ),
      );
      return [
        {
          sourceRecordId: record.id,
          sourceKeySha256: record.sourceKeySha256,
          linkedWorkbookRecord: record.linkedWorkbookRecord
            ? {
                ...record.linkedWorkbookRecord,
                appliedAt: iso(record.linkedWorkbookRecord.appliedAt),
              }
            : null,
          student: {
            id: student.id,
            personId: student.personId,
            recordStatus: student.recordStatus,
            enrolledAt: iso(student.enrolledAt),
          },
          person: {
            id: student.person.id,
            kind: student.person.kind,
            status: student.person.status,
            suspendedAt: iso(student.person.suspendedAt),
            roles: [...student.person.roles].sort(),
            emailSha256: hashNullable(
              student.person.email?.trim().toLowerCase() ?? null,
            ),
            passwordHashSha256: hashNullable(student.person.passwordHash),
            mustChangePassword: student.person.mustChangePassword,
            passwordChangedAt: iso(student.person.passwordChangedAt),
            lastLoginAt: iso(student.person.lastLoginAt),
            sessionVersion: student.person.sessionVersion,
            loginEmailMatchCount: emailMatches.filter(
              (match) =>
                match.email?.trim().toLowerCase() ===
                student.person.email?.trim().toLowerCase(),
            ).length,
            loginEmailValid:
              student.person.email !== null &&
              student.person.email.trim() === student.person.email &&
              LOGIN_EMAIL.safeParse(student.person.email).success,
          },
          applicant: applicant
            ? {
                id: applicant.id,
                studentId: applicant.studentId,
                stage: applicant.stage,
                onboardingStatus: applicant.onboardingStatus,
                enrollmentInvoiceId: applicant.enrollmentInvoiceId,
                activeOnboardingPaymentLinkId:
                  applicant.activeOnboardingPaymentLinkId,
                activatedByPaymentId: applicant.activatedByPaymentId,
                acceptedAt: iso(applicant.acceptedAt),
                paymentPendingAt: iso(applicant.paymentPendingAt),
                enrolledAt: iso(applicant.enrolledAt),
                onboardingCancelledAt: iso(applicant.onboardingCancelledAt),
                statusTokenHashSha256: hashNullable(applicant.statusTokenHash),
                statusTokenExpiresAt: iso(applicant.statusTokenExpiresAt),
                statusTokenRevokedAt: iso(applicant.statusTokenRevokedAt),
              }
            : null,
          links: targetLinks.map((link) => ({
            id: link.id,
            onboardingApplicantId: link.onboardingApplicantId,
            studentId: link.studentId,
            invoiceId: link.invoiceId,
            status: link.status,
            amountXof: link.amountXof,
            tokenSha256: sha256(link.token),
          })),
          submissions: targetSubmissions.map((row) => ({
            id: row.id,
            applicantId: row.applicantId,
            studentId: row.studentId,
            invoiceId: row.invoiceId,
            paymentLinkId: row.paymentLinkId,
            paymentId: row.paymentId,
            status: row.status,
            activeKeySha256: hashNullable(row.activeKey),
            resumeTokenSha256: hashNullable(row.resumeToken),
          })),
          piSpiRequests: targetPiSpi.map((row) => ({
            id: row.id,
            applicantId: row.applicantId,
            studentId: row.studentId,
            invoiceId: row.invoiceId,
            paymentLinkId: row.paymentLinkId,
            paymentId: row.paymentId,
            status: row.status,
            amountXof: row.amountXof,
          })),
          payments: studentPayments
            .filter(
              (row) =>
                row.studentId === student.id ||
                targetInvoiceIds.has(row.invoiceId) ||
                targetAttemptPaymentIds.has(row.id),
            )
            .map((row) => ({
              ...row,
              updatedAt: row.updatedAt.toISOString(),
            })),
          invoices: invoices
            .filter((row) => row.studentId === student.id)
            .map((row) => ({
              ...row,
              updatedAt: row.updatedAt.toISOString(),
            })),
          invites: invites
            .filter((row) => row.studentPersonId === student.person.id)
            .map((row) => ({
              id: row.id,
              purpose: row.purpose,
              expiresAt: row.expiresAt.toISOString(),
              usedAt: iso(row.usedAt),
            })),
          activeActivationRequests: activationRequests
            .filter((row) => row.studentPersonId === student.person.id)
            .map((row) => ({
              id: row.id,
              expiresAt: row.expiresAt.toISOString(),
              approvedAt: iso(row.approvedAt),
            })),
          activeActivationCards: activationCards
            .filter((row) => row.studentPersonId === student.person.id)
            .map((row) => ({
              id: row.id,
              batchId: row.batchId,
              expiresAt: row.expiresAt.toISOString(),
            })),
        },
      ];
    },
  );
  return {
    batch: batch
      ? {
          ...batch,
          importedAt: iso(batch.importedAt),
        }
      : null,
    actor,
    globalStudentCounts,
    targets,
  };
}

export async function planWorkbookPendingActivationFromDatabase(
  db: PendingActivationDb,
  input: { batchId: string; actorEmail: string },
): Promise<WorkbookPendingActivationPlan> {
  const actor = await requireActor(db, input.actorEmail);
  const summary = await existingSummary(db, input.batchId);
  if (summary) {
    const globalStudentCounts = await captureGlobalStudentCounts(db);
    return {
      schemaVersion: 1,
      operation: "workbook-pending-payment-activation",
      capturedAt: new Date().toISOString(),
      batchId: input.batchId,
      actorId: actor.id,
      planSha256: summary.planSha256,
      confirmBlocked: false,
      blockers: [],
      targetCount: summary.targetCount,
      activeLinkCount: 0,
      proofDraftCount: 0,
      submittedProofCount: 0,
      activePiSpiCount: 0,
      pendingPaymentCount: 0,
      refundPendingCount: 0,
      globalStudentCounts,
      alreadyApplied: true,
      targets: [],
    };
  }
  const state = await captureState(db, input.batchId, input.actorEmail);
  await assertOriginalCutoverAuditHealthy(
    db,
    input.batchId,
    state.targets.map((target) => target.student.id),
  );
  return buildWorkbookPendingActivationPlan(state, input.batchId);
}

function assertConfirmable(plan: WorkbookPendingActivationPlan): void {
  if (
    plan.confirmBlocked ||
    plan.blockers.length > 0 ||
    plan.targetCount !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT
  ) {
    throw new WorkbookPendingActivationBlockedError(
      "Pending-payment activation is blocked by live controls",
      {
        blockerCounts: plan.blockers.reduce<Record<string, number>>(
          (counts, blocker) => {
            counts[blocker.code] = (counts[blocker.code] ?? 0) + 1;
            return counts;
          },
          {},
        ),
      },
    );
  }
}

async function lockIds(
  tx: Prisma.TransactionClient,
  table:
    | "Student"
    | "Person"
    | "Applicant"
    | "PaymentLink"
    | "WireTransferSubmission"
    | "PiSpiRequest"
    | "Payment"
    | "Invoice"
    | "StudentActivationRequest"
    | "StudentActivationCard"
    | "WorkbookCutoverSourceRecord",
  ids: readonly string[],
): Promise<void> {
  const unique = uniqueSorted(ids);
  if (unique.length === 0) return;
  const tableSql = Prisma.raw(`"${table}"`);
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM ${tableSql} WHERE "id" IN (${Prisma.join(unique)}) ORDER BY "id" FOR UPDATE`,
  );
  if (rows.length !== unique.length) {
    throw new WorkbookPendingActivationBlockedError(
      "A planned activation record disappeared while locks were acquired",
      { table, expected: unique.length, actual: rows.length },
    );
  }
}

async function lockPlanRows(
  tx: Prisma.TransactionClient,
  plan: WorkbookPendingActivationPlan,
): Promise<void> {
  await lockIds(
    tx,
    "Student",
    plan.targets.map((row) => row.student.id),
  );
  await lockIds(tx, "Person", [
    plan.actorId,
    ...plan.targets.map((row) => row.person.id),
  ]);
  await lockIds(
    tx,
    "WorkbookCutoverSourceRecord",
    plan.targets.flatMap((row) => [
      row.sourceRecordId,
      ...(row.linkedWorkbookRecord ? [row.linkedWorkbookRecord.id] : []),
    ]),
  );
  await lockIds(
    tx,
    "Applicant",
    plan.targets.flatMap((row) => (row.applicant ? [row.applicant.id] : [])),
  );
  await lockIds(
    tx,
    "PaymentLink",
    plan.targets.flatMap((row) => row.links.map((link) => link.id)),
  );
  await lockIds(
    tx,
    "WireTransferSubmission",
    plan.targets.flatMap((row) =>
      row.submissions.map((submission) => submission.id),
    ),
  );
  await lockIds(
    tx,
    "PiSpiRequest",
    plan.targets.flatMap((row) =>
      row.piSpiRequests.map((request) => request.id),
    ),
  );
  await lockIds(
    tx,
    "Payment",
    plan.targets.flatMap((row) => row.payments.map((payment) => payment.id)),
  );
  await lockIds(
    tx,
    "Invoice",
    plan.targets.flatMap((row) => row.invoices.map((invoice) => invoice.id)),
  );
  await lockIds(
    tx,
    "StudentActivationRequest",
    plan.targets.flatMap((row) =>
      row.activeActivationRequests.map((request) => request.id),
    ),
  );
  await lockIds(
    tx,
    "StudentActivationCard",
    plan.targets.flatMap((row) =>
      row.activeActivationCards.map((card) => card.id),
    ),
  );
}

async function lockBatch(
  tx: Prisma.TransactionClient,
  batchId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "WorkbookCutoverBatch" WHERE "id" = ${batchId} FOR UPDATE`,
  );
  if (rows.length !== 1) {
    throw new WorkbookPendingActivationBlockedError(
      "Workbook cutover batch does not exist",
    );
  }
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}

function validatedLifecycleAuditEvidence(
  rows: Array<{ entity: string; entityId: string; data: unknown }>,
  batchId: string,
  summary: PersistedSummary,
): ValidatedLifecycleAuditEvidence {
  if (rows.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT * 2) {
    throw new WorkbookPendingActivationBlockedError(
      "Exact replay lifecycle audit count differs from 18",
    );
  }
  const students = new Map<string, ValidatedStudentAuditEvidence>();
  const applicants = new Map<string, ValidatedApplicantAuditEvidence>();
  for (const row of rows) {
    if (!isObject(row.data)) {
      throw new WorkbookPendingActivationBlockedError(
        "Activation lifecycle audit evidence is malformed",
      );
    }
    const data = row.data;
    const commonValid =
      data.schemaVersion === 1 &&
      data.operation === "workbook-pending-payment-activation" &&
      data.batchId === batchId &&
      data.planSha256 === summary.planSha256 &&
      typeof data.sourceRecordId === "string" &&
      summary.sourceRecordIds.includes(data.sourceRecordId) &&
      typeof data.sourceKeySha256 === "string" &&
      /^[a-f0-9]{64}$/.test(data.sourceKeySha256) &&
      data.reason === ACTIVATION_REASON;
    if (!commonValid) {
      throw new WorkbookPendingActivationBlockedError(
        "Activation lifecycle audit anchors are malformed",
      );
    }

    if (row.entity === "Student" && summary.studentIds.includes(row.entityId)) {
      const priorRoles = parseStringArray(data.personPriorRoles);
      const newRoles = parseStringArray(data.personNewRoles);
      if (
        students.has(row.entityId) ||
        typeof data.applicantId !== "string" ||
        !summary.applicantIds.includes(data.applicantId) ||
        typeof data.personId !== "string" ||
        typeof data.linkedWorkbookRecordId !== "string" ||
        data.priorRecordStatus !== "pending_payment" ||
        data.newRecordStatus !== "active" ||
        data.priorEnrolledAt !== null ||
        !isIsoTimestamp(data.newEnrolledAt) ||
        !priorRoles ||
        priorRoles.length !== 0 ||
        !newRoles ||
        canonicalWorkbookCutoverJson(newRoles) !==
          canonicalWorkbookCutoverJson(["student"]) ||
        !Number.isInteger(data.personPriorSessionVersion) ||
        (data.personPriorSessionVersion as number) < 0 ||
        data.personNewSessionVersion !==
          (data.personPriorSessionVersion as number) + 1 ||
        data.passwordAndInvitesChanged !== false ||
        data.invoicesPaymentsAndBalancesChanged !== false
      ) {
        throw new WorkbookPendingActivationBlockedError(
          "Student activation audit evidence is malformed",
        );
      }
      students.set(row.entityId, {
        studentId: row.entityId,
        applicantId: data.applicantId,
        personId: data.personId,
        sourceRecordId: data.sourceRecordId as string,
        sourceKeySha256: data.sourceKeySha256 as string,
        newEnrolledAt: data.newEnrolledAt,
        priorSessionVersion: data.personPriorSessionVersion as number,
        newSessionVersion: data.personNewSessionVersion as number,
      });
      continue;
    }

    if (
      row.entity === "Applicant" &&
      summary.applicantIds.includes(row.entityId)
    ) {
      if (
        applicants.has(row.entityId) ||
        typeof data.studentId !== "string" ||
        !summary.studentIds.includes(data.studentId) ||
        typeof data.invoiceId !== "string" ||
        data.priorStage !== "accepted" ||
        data.newStage !== "accepted" ||
        data.priorOnboardingStatus !== "payment_pending" ||
        data.newOnboardingStatus !== "enrolled" ||
        data.activatedByPaymentId !== null ||
        data.statusBearerRevoked !== true ||
        typeof data.priorActiveOnboardingPaymentLinkId !== "string" ||
        !summary.cancelledPaymentLinkIds.includes(
          data.priorActiveOnboardingPaymentLinkId,
        ) ||
        data.newActiveOnboardingPaymentLinkId !== null ||
        data.paymentGateOverride !== true ||
        data.inventedCash !== false ||
        !isIsoTimestamp(data.activatedAt)
      ) {
        throw new WorkbookPendingActivationBlockedError(
          "Applicant activation audit evidence is malformed",
        );
      }
      applicants.set(row.entityId, {
        applicantId: row.entityId,
        studentId: data.studentId,
        sourceRecordId: data.sourceRecordId as string,
        sourceKeySha256: data.sourceKeySha256 as string,
        activatedAt: data.activatedAt,
      });
      continue;
    }

    throw new WorkbookPendingActivationBlockedError(
      "Activation lifecycle audit targets are malformed",
    );
  }

  if (
    students.size !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    applicants.size !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT
  ) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation lifecycle audit evidence is incomplete",
    );
  }
  for (const student of students.values()) {
    const applicant = applicants.get(student.applicantId);
    if (
      !applicant ||
      applicant.studentId !== student.studentId ||
      applicant.sourceRecordId !== student.sourceRecordId ||
      applicant.sourceKeySha256 !== student.sourceKeySha256 ||
      applicant.activatedAt !== student.newEnrolledAt
    ) {
      throw new WorkbookPendingActivationBlockedError(
        "Student and Applicant audit evidence does not cross-reconcile",
      );
    }
  }
  if (
    uniqueSorted([...students.values()].map((row) => row.personId)).length !==
      students.size ||
    uniqueSorted([...students.values()].map((row) => row.sourceRecordId))
      .length !== students.size
  ) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation lifecycle audit evidence repeats an identity anchor",
    );
  }
  return { students, applicants };
}

async function verifyReplayEvidence(
  db: PendingActivationDb,
  batchId: string,
  summary: PersistedSummary,
): Promise<ValidatedLifecycleAuditEvidence> {
  const rows = await db.auditLog.findMany({
    where: {
      action: WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION,
      entityId: { in: [...summary.studentIds, ...summary.applicantIds] },
    },
    select: { entity: true, entityId: true, data: true },
  });
  return validatedLifecycleAuditEvidence(rows, batchId, summary);
}

function retryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function executeInsideTransaction(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    actorEmail: string;
    expectedPlanSha256: string;
  },
): Promise<WorkbookPendingActivationResult> {
  await lockBatch(tx, input.batchId);
  const replaySummary = await existingSummary(tx, input.batchId);
  if (replaySummary) {
    if (input.expectedPlanSha256 !== replaySummary.planSha256) {
      throw new WorkbookPendingActivationBlockedError(
        "Exact replay requires the original confirmed plan SHA-256",
        {
          suppliedPlanSha256: input.expectedPlanSha256,
          confirmedPlanSha256: replaySummary.planSha256,
        },
      );
    }
    await requireActor(tx, input.actorEmail);
    await verifyReplayEvidence(tx, input.batchId, replaySummary);
    return {
      batchId: input.batchId,
      planSha256: replaySummary.planSha256,
      alreadyApplied: true,
      activatedStudents: 0,
      activatedApplicants: 0,
      cancelledPaymentLinks: 0,
      cancelledProofDrafts: 0,
      cancelledDraftPayments: 0,
      auditRowsCreated: 0,
    };
  }

  const initialState = await captureState(tx, input.batchId, input.actorEmail);
  const initialPlan = buildWorkbookPendingActivationPlan(
    initialState,
    input.batchId,
  );
  assertConfirmable(initialPlan);
  await assertOriginalCutoverAuditHealthy(
    tx,
    input.batchId,
    initialPlan.targets.map((target) => target.student.id),
  );
  await lockPlanRows(tx, initialPlan);
  const lockedState = await captureState(tx, input.batchId, input.actorEmail);
  const plan = buildWorkbookPendingActivationPlan(lockedState, input.batchId);
  assertConfirmable(plan);
  if (plan.planSha256 !== initialPlan.planSha256) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation state changed while row locks were acquired",
    );
  }
  if (plan.planSha256 !== input.expectedPlanSha256) {
    throw new WorkbookPendingActivationBlockedError(
      "Live activation plan does not match the reviewed dry-run SHA-256",
      {
        suppliedPlanSha256: input.expectedPlanSha256,
        livePlanSha256: plan.planSha256,
      },
    );
  }

  const existingLifecycleAudits = await tx.auditLog.findMany({
    where: {
      action: WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION,
      entityId: {
        in: plan.targets.flatMap((target) => [
          target.student.id,
          target.applicant!.id,
        ]),
      },
    },
    select: { data: true },
  });
  if (
    existingLifecycleAudits.some(
      (row) => isObject(row.data) && row.data.batchId === input.batchId,
    )
  ) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation lifecycle audit evidence exists without a batch summary",
    );
  }

  const now = new Date();
  const studentIds: string[] = [];
  const applicantIds: string[] = [];
  const cancelledLinkIds: string[] = [];

  for (const target of plan.targets) {
    const applicant = target.applicant!;
    const activeLinks = target.links.filter((link) => link.status === "active");

    const applicantClaim = await tx.applicant.updateMany({
      where: {
        id: applicant.id,
        studentId: target.student.id,
        stage: "accepted",
        onboardingStatus: "payment_pending",
        enrollmentInvoiceId: applicant.enrollmentInvoiceId,
        activeOnboardingPaymentLinkId: applicant.activeOnboardingPaymentLinkId,
        activatedByPaymentId: null,
        enrolledAt: null,
        onboardingCancelledAt: null,
        statusTokenHash: { not: null },
        statusTokenRevokedAt: null,
      },
      data: {
        onboardingStatus: "enrolled",
        enrolledAt: now,
        activeOnboardingPaymentLinkId: null,
        activatedByPaymentId: null,
        statusTokenHash: null,
        statusTokenExpiresAt: now,
        statusTokenRevokedAt: now,
      },
    });
    if (applicantClaim.count !== 1) {
      throw new WorkbookPendingActivationBlockedError(
        "A pending Applicant changed during activation",
      );
    }
    const linkMutation = await tx.paymentLink.updateMany({
      where: {
        id: { in: activeLinks.map((link) => link.id) },
        status: "active",
      },
      data: { status: "cancelled" },
    });
    if (linkMutation.count !== activeLinks.length) {
      throw new WorkbookPendingActivationBlockedError(
        "An onboarding PaymentLink changed during activation",
      );
    }
    const studentClaim = await tx.student.updateMany({
      where: {
        id: target.student.id,
        personId: target.person.id,
        recordStatus: "pending_payment",
        enrolledAt: null,
      },
      data: { recordStatus: "active", enrolledAt: now },
    });
    if (studentClaim.count !== 1) {
      throw new WorkbookPendingActivationBlockedError(
        "A pending Student changed during activation",
      );
    }
    const personClaim = await tx.person.updateMany({
      where: {
        id: target.person.id,
        kind: "student",
        status: "active",
        suspendedAt: null,
        roles: { equals: [] },
        passwordHash: null,
        mustChangePassword: false,
        passwordChangedAt: null,
        lastLoginAt: null,
        sessionVersion: target.person.sessionVersion,
      },
      data: { roles: ["student"], sessionVersion: { increment: 1 } },
    });
    if (personClaim.count !== 1) {
      throw new WorkbookPendingActivationBlockedError(
        "A pending Student identity changed during activation",
      );
    }

    await tx.auditLog.create({
      data: {
        entity: "Student",
        entityId: target.student.id,
        action: WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION,
        actorId: plan.actorId,
        data: safeJson({
          schemaVersion: 1,
          operation: "workbook-pending-payment-activation",
          batchId: input.batchId,
          planSha256: plan.planSha256,
          sourceRecordId: target.sourceRecordId,
          sourceKeySha256: target.sourceKeySha256,
          linkedWorkbookRecordId: target.linkedWorkbookRecord!.id,
          applicantId: applicant.id,
          personId: target.person.id,
          priorRecordStatus: "pending_payment",
          newRecordStatus: "active",
          priorEnrolledAt: null,
          newEnrolledAt: now.toISOString(),
          personPriorRoles: target.person.roles,
          personNewRoles: ["student"],
          personPriorSessionVersion: target.person.sessionVersion,
          personNewSessionVersion: target.person.sessionVersion + 1,
          passwordAndInvitesChanged: false,
          invoicesPaymentsAndBalancesChanged: false,
          reason: ACTIVATION_REASON,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: applicant.id,
        action: WORKBOOK_PENDING_ACTIVATION_APPLICANT_AUDIT_ACTION,
        actorId: plan.actorId,
        data: safeJson({
          schemaVersion: 1,
          operation: "workbook-pending-payment-activation",
          batchId: input.batchId,
          planSha256: plan.planSha256,
          sourceRecordId: target.sourceRecordId,
          sourceKeySha256: target.sourceKeySha256,
          studentId: target.student.id,
          invoiceId: applicant.enrollmentInvoiceId,
          priorStage: "accepted",
          newStage: "accepted",
          priorOnboardingStatus: "payment_pending",
          newOnboardingStatus: "enrolled",
          activatedByPaymentId: null,
          statusBearerRevoked: true,
          priorActiveOnboardingPaymentLinkId:
            applicant.activeOnboardingPaymentLinkId,
          newActiveOnboardingPaymentLinkId: null,
          paymentGateOverride: true,
          inventedCash: false,
          activatedAt: now.toISOString(),
          reason: ACTIVATION_REASON,
        }),
      },
    });

    studentIds.push(target.student.id);
    applicantIds.push(applicant.id);
    cancelledLinkIds.push(...activeLinks.map((row) => row.id));
  }

  await tx.auditLog.create({
    data: {
      entity: "WorkbookCutoverBatch",
      entityId: input.batchId,
      action: WORKBOOK_PENDING_ACTIVATION_BATCH_AUDIT_ACTION,
      actorId: plan.actorId,
      data: safeJson({
        schemaVersion: 1,
        operation: "workbook-pending-payment-activation",
        planSha256: plan.planSha256,
        originalCutoverPlanSha256: lockedState.batch!.confirmationPlanSha256,
        identityManifestSha256: lockedState.batch!.identityManifestSha256,
        targetCount: studentIds.length,
        studentAuditRows: studentIds.length,
        applicantAuditRows: applicantIds.length,
        studentIds: uniqueSorted(studentIds),
        applicantIds: uniqueSorted(applicantIds),
        sourceRecordIds: uniqueSorted(
          plan.targets.map((target) => target.sourceRecordId),
        ),
        cancelledPaymentLinkIds: uniqueSorted(cancelledLinkIds),
        activePaymentAttemptCountAtConfirmation: 0,
        pendingOrRefundPaymentCountAtConfirmation: 0,
        activatedAt: now.toISOString(),
        reviewedOverride: true,
        inventedCash: false,
        financialLedgerChanged: false,
        reason: ACTIVATION_REASON,
      }),
    },
  });

  return {
    batchId: input.batchId,
    planSha256: plan.planSha256,
    alreadyApplied: false,
    activatedStudents: studentIds.length,
    activatedApplicants: applicantIds.length,
    cancelledPaymentLinks: uniqueSorted(cancelledLinkIds).length,
    cancelledProofDrafts: 0,
    cancelledDraftPayments: 0,
    auditRowsCreated: studentIds.length + applicantIds.length + 1,
  };
}

export async function executeWorkbookPendingActivation(
  prisma: PrismaClient,
  input: {
    batchId: string;
    actorEmail: string;
    expectedPlanSha256: string;
  },
): Promise<WorkbookPendingActivationResult> {
  if (!/^[a-f0-9]{64}$/.test(input.expectedPlanSha256)) {
    throw new WorkbookPendingActivationBlockedError(
      "Confirmation requires the exact reviewed dry-run plan SHA-256",
    );
  }
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => executeInsideTransaction(tx, input),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 30_000,
          timeout: TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (error) {
      if (attempt < MAX_TRANSACTION_ATTEMPTS && retryable(error)) continue;
      throw error;
    }
  }
  throw new WorkbookPendingActivationBlockedError(
    "Pending-payment activation exhausted transaction retries",
  );
}

export async function auditWorkbookPendingActivation(
  prisma: PrismaClient,
  batchId: string,
  expectedPlanSha256?: string,
): Promise<WorkbookPendingActivationAudit> {
  const summary = await existingSummary(prisma, batchId);
  if (!summary) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation batch summary audit evidence is missing",
    );
  }
  if (expectedPlanSha256 && summary.planSha256 !== expectedPlanSha256) {
    throw new WorkbookPendingActivationBlockedError(
      "Activation audit does not match the expected plan SHA-256",
    );
  }
  const lifecycleEvidence = await verifyReplayEvidence(
    prisma,
    batchId,
    summary,
  );
  const originalCutoverAudit = await auditWorkbookCutoverBatch(
    prisma,
    batchId,
    { protectedPaymentActivityStudentIds: summary.studentIds },
  );
  const [
    students,
    applicants,
    activeLinks,
    batchAuditRows,
    physicalStudents,
    activeRosterStudents,
    pendingPaymentStudents,
    archivedStudents,
    canonicalInvoices,
    reconstructionPayments,
  ] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: summary.studentIds } },
      select: {
        id: true,
        recordStatus: true,
        enrolledAt: true,
        person: { select: { id: true, roles: true, sessionVersion: true } },
      },
    }),
    prisma.applicant.findMany({
      where: { id: { in: summary.applicantIds } },
      select: {
        id: true,
        stage: true,
        onboardingStatus: true,
        enrolledAt: true,
        activatedByPaymentId: true,
        activeOnboardingPaymentLinkId: true,
        statusTokenHash: true,
        statusTokenRevokedAt: true,
      },
    }),
    prisma.paymentLink.count({
      where: {
        onboardingApplicantId: { in: summary.applicantIds },
        status: "active",
      },
    }),
    prisma.auditLog.count({
      where: {
        entity: "WorkbookCutoverBatch",
        entityId: batchId,
        action: WORKBOOK_PENDING_ACTIVATION_BATCH_AUDIT_ACTION,
      },
    }),
    prisma.student.count(),
    prisma.student.count({ where: { recordStatus: "active" } }),
    prisma.student.count({ where: { recordStatus: "pending_payment" } }),
    prisma.student.count({ where: { recordStatus: "archived" } }),
    prisma.workbookCutoverSourceRecord.count({
      where: {
        batchId,
        sourceKind: "workbook_row",
        disposition: { in: ["link_existing_student", "create_student"] },
        canonicalInvoiceId: { not: null },
      },
    }),
    prisma.workbookCutoverSourceRecord.count({
      where: {
        batchId,
        sourceKind: "workbook_row",
        disposition: { in: ["link_existing_student", "create_student"] },
        reconstructionPaymentId: { not: null },
      },
    }),
  ]);
  const validStudents = students.filter((row) => {
    const evidence = lifecycleEvidence.students.get(row.id);
    return (
      evidence &&
      row.recordStatus === "active" &&
      row.enrolledAt !== null &&
      row.enrolledAt.toISOString() === evidence.newEnrolledAt &&
      row.person.id === evidence.personId &&
      row.person.sessionVersion === evidence.newSessionVersion &&
      evidence.newSessionVersion === evidence.priorSessionVersion + 1 &&
      canonicalWorkbookCutoverJson([...row.person.roles].sort()) ===
        canonicalWorkbookCutoverJson(["student"])
    );
  });
  const validApplicants = applicants.filter((row) => {
    const evidence = lifecycleEvidence.applicants.get(row.id);
    return (
      evidence &&
      row.stage === "accepted" &&
      row.onboardingStatus === "enrolled" &&
      row.enrolledAt !== null &&
      row.enrolledAt.toISOString() === evidence.activatedAt &&
      row.activatedByPaymentId === null &&
      row.activeOnboardingPaymentLinkId === null
    );
  });
  const revokedBearers = applicants.filter(
    (row) => row.statusTokenHash === null && row.statusTokenRevokedAt !== null,
  );
  const studentAuditRows = lifecycleEvidence.students.size;
  const applicantAuditRows = lifecycleEvidence.applicants.size;
  if (
    validStudents.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    validApplicants.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    revokedBearers.length !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    activeLinks !== 0 ||
    studentAuditRows !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    applicantAuditRows !== WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT ||
    batchAuditRows !== 1 ||
    physicalStudents !== 446 ||
    activeRosterStudents !== 400 ||
    pendingPaymentStudents !== 0 ||
    archivedStudents !== 46 ||
    canonicalInvoices !== 400 ||
    reconstructionPayments !== 223 ||
    !originalCutoverAudit.ok ||
    originalCutoverAudit.canonicalInvoices !== 400 ||
    originalCutoverAudit.reconstructionPayments !== 223
  ) {
    throw new WorkbookPendingActivationBlockedError(
      "Pending-payment activation post-audit failed",
      {
        activeStudents: validStudents.length,
        enrolledApplicants: validApplicants.length,
        revokedStatusBearers: revokedBearers.length,
        remainingActiveLinks: activeLinks,
        studentAuditRows,
        applicantAuditRows,
        batchAuditRows,
        physicalStudents,
        activeRosterStudents,
        pendingPaymentStudents,
        archivedStudents,
        canonicalInvoices,
        reconstructionPayments,
        originalCutoverAuditOk: originalCutoverAudit.ok,
      },
    );
  }
  return {
    ok: true,
    batchId,
    planSha256: summary.planSha256,
    targetCount: summary.targetCount,
    activeStudents: validStudents.length,
    enrolledApplicants: validApplicants.length,
    revokedStatusBearers: revokedBearers.length,
    remainingActiveLinks: activeLinks,
    studentAuditRows,
    applicantAuditRows,
    batchAuditRows,
    physicalStudents,
    activeRosterStudents,
    pendingPaymentStudents,
    archivedStudents,
    canonicalInvoices,
    reconstructionPayments,
    originalCutoverAuditOk: true,
  };
}

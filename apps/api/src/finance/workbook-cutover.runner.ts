import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient } from "@mydaust/db";
import { archiveStudentInTransaction } from "../registrar/registrar.service.js";
import { projectedInstallmentStatus } from "./account-position.js";
import {
  type EnrollmentActivation,
  syncEnrollmentGateInTransaction,
} from "./admission-payment-gate.js";
import {
  type BillingOperationalSelection,
  syncBillingProfileOperationsInTransaction,
} from "./billing-profile.service.js";
import type {
  WorkbookCutoverProductionSnapshot,
  WorkbookCutoverTrustedExtraction,
} from "./workbook-cutover.extraction.js";
import {
  type WorkbookCutoverManifest,
  type WorkbookCutoverManifestRow,
  canonicalWorkbookCutoverJson,
  workbookCutoverManifestDigest,
} from "./workbook-cutover.manifest.js";
import {
  type WorkbookCutoverCreateStudentAction,
  type WorkbookCutoverBlocker,
  type WorkbookCutoverExistingStudentAction,
  type WorkbookCutoverLiveSnapshot,
  type WorkbookCutoverPlan,
  type WorkbookCutoverWorkbookAction,
  planWorkbookCutover,
} from "./workbook-cutover.planner.js";
import { captureWorkbookCutoverLiveSnapshot } from "./workbook-cutover.snapshot.js";
import { WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256 } from "./workbook-cutover-attestation.service.js";

const CUTOVER_ACTOR_ROLES = new Set(["admin", "bursar"]);
const REVIEWER_ROLES = new Set(["admin", "bursar", "registrar", "admissions"]);
const MAX_TRANSACTION_ATTEMPTS = 3;
const TRANSACTION_TIMEOUT_MS = 15 * 60 * 1_000;

type CutoverDb = Prisma.TransactionClient | PrismaClient;

export interface WorkbookCutoverSources {
  trustedExtraction: WorkbookCutoverTrustedExtraction;
  reviewedProductionSnapshot: WorkbookCutoverProductionSnapshot;
  sourceDigests: {
    workbookSha256: string;
    trustedExtractionSha256: string;
    reviewedProductionSnapshotSha256: string;
  };
}

export interface WorkbookCutoverInvocation {
  actorEmail: string;
}

export interface WorkbookCutoverNewStudentCredential {
  sourceKey: string;
  temporaryPassword: string;
}

export interface WorkbookCutoverExecutionInvocation extends WorkbookCutoverInvocation {
  expectedPlanSha256: string;
  newStudentCredentials: readonly WorkbookCutoverNewStudentCredential[];
}

export interface WorkbookCutoverReviewerBinding {
  reviewedBy: string;
  personId: string;
}

export interface WorkbookCutoverReviewerAttestationEvidence {
  id: string;
  manifestSha256: string;
  reviewerId: string;
  reviewerEmailNormalized: string;
  authorizedRoles: readonly string[];
  statementSha256: string;
  attestedAt: Date;
  revokedAt: Date | null;
  revokedById: string | null;
  revocationReason: string | null;
}

export interface WorkbookCutoverReviewerAttestationState {
  id: string;
  manifestSha256: string;
  reviewerId: string;
  reviewerEmailSha256: string;
  authorizedRoles: string[];
  statementSha256: string;
  attestedAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revocationReason: string | null;
}

export interface WorkbookCutoverDatabasePlan extends WorkbookCutoverPlan {
  actorId: string;
  purePlanSha256: string;
  alreadyImportedBatchId: string | null;
  reviewerBindings: WorkbookCutoverReviewerBinding[];
  reviewerAttestations: WorkbookCutoverReviewerAttestationState[];
}

export interface WorkbookCutoverResult {
  batchId: string;
  alreadyImported: boolean;
  workbookLinkedRows: number;
  workbookCreatedRows: number;
  workbookDuplicateRows: number;
  productionArchivedStudents: number;
  includedBilledXof: number;
  includedPaidXof: number;
  credentialRows: number;
  activations: number;
}

interface WorkbookCutoverCommittedResult {
  result: WorkbookCutoverResult;
  activationPayloads: EnrollmentActivation[];
}

interface CutoverEvidence {
  cancelledPaymentSubmissionIds: string[];
  cancelledPaymentLinkIds: string[];
  cancelledPiSpiRequestIds: string[];
  cancelledPendingPaymentIds: string[];
  archivedCapabilityCancellations: ArchivedCapabilityCancellationEvidence[];
  activationApplicantIds: string[];
}

interface CancelledPaymentCapabilities {
  cancelledPaymentSubmissionIds: string[];
  cancelledPaymentLinkIds: string[];
  cancelledPiSpiRequestIds: string[];
  cancelledPendingPaymentIds: string[];
}

interface ClearedApplicantPaymentLinkPointer {
  applicantId: string;
  paymentLinkId: string;
}

interface RevokedApplicantBearerCapabilities {
  linkedApplicantIds: string[];
  statusTokenCapabilityApplicantIds: string[];
  revokedApplicantStatusTokenIds: string[];
  preexistingInactiveApplicantStatusTokenIds: string[];
  clearedApplicantPaymentLinkPointers: ClearedApplicantPaymentLinkPointer[];
}

interface ArchivedCapabilityCancellationEvidence
  extends CancelledPaymentCapabilities, RevokedApplicantBearerCapabilities {
  studentId: string;
  sourceRecordId: string;
}

export class WorkbookCutoverBlockedError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkbookCutoverBlockedError";
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceClaimSha256(
  sourceWorkbookSha256: string,
  sourceKey: string,
): string {
  return sha256(`${sourceWorkbookSha256}\n${sourceKey}`);
}

function eventClaimSha256(
  batchId: string,
  sourceRecordId: string,
  kind: string,
  objectId: string,
): string {
  return sha256(`${batchId}\n${sourceRecordId}\n${kind}\n${objectId}`);
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeNumber(value: bigint, label: string): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new WorkbookCutoverBlockedError(
      `${label} exceeds safe whole-XOF bounds`,
      {},
    );
  }
  return converted;
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  );
}

async function requireCutoverActor(db: CutoverDb, emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const actor = await db.person.findUnique({
    where: { email },
    select: { id: true, status: true, roles: true },
  });
  if (
    !actor ||
    actor.status !== "active" ||
    !actor.roles.some((role) => CUTOVER_ACTOR_ROLES.has(role))
  ) {
    throw new WorkbookCutoverBlockedError(
      "Cutover actor must be an active bursar or administrator",
      {},
    );
  }
  return actor;
}

function reviewedByValues(manifest: WorkbookCutoverManifest): string[] {
  const values = new Set<string>();
  for (const row of manifest.workbookRows) {
    values.add(row.identity.review.reviewedBy.trim().toLowerCase());
    for (const adjustment of row.financial.adjustments) {
      values.add(adjustment.review.reviewedBy.trim().toLowerCase());
    }
  }
  for (const row of manifest.productionStudents) {
    values.add(row.review.reviewedBy.trim().toLowerCase());
  }
  for (const row of manifest.applicants) {
    values.add(row.review.reviewedBy.trim().toLowerCase());
  }
  return [...values].sort();
}

async function bindReviewers(
  db: CutoverDb,
  manifest: WorkbookCutoverManifest,
): Promise<WorkbookCutoverReviewerBinding[]> {
  const reviewedBy = reviewedByValues(manifest);
  if (reviewedBy.length === 0) return [];
  const people = await db.person.findMany({
    where: {
      OR: reviewedBy.map((email) => ({
        email: { equals: email, mode: "insensitive" as const },
      })),
    },
    select: { id: true, email: true, status: true, roles: true },
  });
  const byEmail = new Map<string, typeof people>();
  for (const person of people) {
    if (!person.email) continue;
    const key = person.email.trim().toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), person]);
  }
  const bindings: WorkbookCutoverReviewerBinding[] = [];
  for (const value of reviewedBy) {
    const matches = byEmail.get(value) ?? [];
    const person = matches.length === 1 ? matches[0] : null;
    if (
      !person ||
      person.status !== "active" ||
      !person.roles.some((role) => REVIEWER_ROLES.has(role))
    ) {
      throw new WorkbookCutoverBlockedError(
        "Every signed review must name an active authorized staff email",
        { code: "reviewer_identity_invalid" },
      );
    }
    bindings.push({ reviewedBy: value, personId: person.id });
  }
  return bindings;
}

function attestationBlocker(
  code: WorkbookCutoverBlocker["code"],
  message: string,
): WorkbookCutoverBlocker {
  return { code, sourceKey: null, message };
}

export function assessWorkbookCutoverReviewerAttestations(input: {
  manifestSha256: string;
  reviewerBindings: readonly WorkbookCutoverReviewerBinding[];
  evidence: readonly WorkbookCutoverReviewerAttestationEvidence[];
}): {
  states: WorkbookCutoverReviewerAttestationState[];
  blockers: WorkbookCutoverBlocker[];
} {
  const reviewerIds = new Set(
    input.reviewerBindings.map((binding) => binding.personId),
  );
  const exactEvidence = input.evidence
    .filter(
      (row) =>
        row.manifestSha256 === input.manifestSha256 &&
        reviewerIds.has(row.reviewerId),
    )
    .sort(
      (left, right) =>
        left.reviewerId.localeCompare(right.reviewerId) ||
        left.id.localeCompare(right.id),
    );
  const byReviewer = new Map<
    string,
    WorkbookCutoverReviewerAttestationEvidence[]
  >();
  for (const row of exactEvidence) {
    byReviewer.set(row.reviewerId, [
      ...(byReviewer.get(row.reviewerId) ?? []),
      row,
    ]);
  }

  const blockers: WorkbookCutoverBlocker[] = [];
  for (const binding of input.reviewerBindings) {
    const matches = byReviewer.get(binding.personId) ?? [];
    if (matches.length !== 1) {
      blockers.push(
        attestationBlocker(
          "reviewer_attestation_missing",
          "One named reviewer has not authenticated and attested this exact manifest digest.",
        ),
      );
      continue;
    }
    const row = matches[0]!;
    if (row.revokedAt) {
      blockers.push(
        attestationBlocker(
          "reviewer_attestation_revoked",
          "One named reviewer's attestation for this exact manifest digest is revoked.",
        ),
      );
      continue;
    }
    if (
      row.reviewerEmailNormalized !== binding.reviewedBy ||
      !row.authorizedRoles.some((role) => REVIEWER_ROLES.has(role))
    ) {
      blockers.push(
        attestationBlocker(
          "reviewer_attestation_identity_drift",
          "One named reviewer's authenticated identity no longer matches the manifest decision identity.",
        ),
      );
      continue;
    }
    if (row.statementSha256 !== WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256) {
      blockers.push(
        attestationBlocker(
          "reviewer_attestation_statement_stale",
          "One named reviewer's attestation used a superseded attestation statement.",
        ),
      );
    }
  }

  return {
    states: exactEvidence.map((row) => ({
      id: row.id,
      manifestSha256: row.manifestSha256,
      reviewerId: row.reviewerId,
      reviewerEmailSha256: sha256(row.reviewerEmailNormalized),
      authorizedRoles: [...row.authorizedRoles].sort(),
      statementSha256: row.statementSha256,
      attestedAt: row.attestedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokedById: row.revokedById,
      revocationReason: row.revocationReason,
    })),
    blockers,
  };
}

async function reviewerAttestationEvidence(
  db: CutoverDb,
  manifestSha256: string,
  reviewerBindings: readonly WorkbookCutoverReviewerBinding[],
): Promise<WorkbookCutoverReviewerAttestationEvidence[]> {
  if (reviewerBindings.length === 0) return [];
  return db.workbookCutoverReviewerAttestation.findMany({
    where: {
      manifestSha256,
      reviewerId: { in: reviewerBindings.map((binding) => binding.personId) },
    },
    select: {
      id: true,
      manifestSha256: true,
      reviewerId: true,
      reviewerEmailNormalized: true,
      authorizedRoles: true,
      statementSha256: true,
      attestedAt: true,
      revokedAt: true,
      revokedById: true,
      revocationReason: true,
    },
    orderBy: [{ reviewerId: "asc" }, { id: "asc" }],
  });
}

async function findExistingBatch(
  db: CutoverDb,
  identityManifestSha256: string,
) {
  return db.workbookCutoverBatch.findUnique({
    where: { identityManifestSha256 },
    select: {
      id: true,
      status: true,
      sourceWorkbookSha256: true,
      sourceExtractionSha256: true,
      rosterSnapshotSha256: true,
      confirmationPlanSha256: true,
      workbookLinkedRows: true,
      workbookCreatedRows: true,
      workbookDuplicateRows: true,
      productionArchivedStudents: true,
      includedBilledXof: true,
      includedPaidXof: true,
    },
  });
}

function exactReplayPlan(
  actorId: string,
  manifest: WorkbookCutoverManifest,
  existing: NonNullable<Awaited<ReturnType<typeof findExistingBatch>>>,
): WorkbookCutoverDatabasePlan {
  if (
    existing.status !== "imported" ||
    existing.sourceWorkbookSha256 !== manifest.sourceWorkbook.sha256 ||
    existing.sourceExtractionSha256 !== manifest.trustedExtraction.sha256 ||
    existing.rosterSnapshotSha256 !== manifest.productionSnapshot.sha256
  ) {
    throw new WorkbookCutoverBlockedError(
      "Manifest digest belongs to a different or incomplete cutover batch",
      { batchId: existing.id, status: existing.status },
    );
  }
  return {
    schemaVersion: 1,
    actorId,
    purePlanSha256: existing.confirmationPlanSha256,
    alreadyImportedBatchId: existing.id,
    reviewerBindings: [],
    reviewerAttestations: [],
    manifestSha256: workbookCutoverManifestDigest(manifest),
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: manifest.trustedExtraction.sha256,
    reviewedProductionSnapshotSha256: manifest.productionSnapshot.sha256,
    reviewedProductionSnapshotCanonicalSha256: "already-imported",
    liveSnapshotSha256: "already-imported",
    planSha256: existing.confirmationPlanSha256,
    capturedAt: "already-imported",
    confirmBlocked: false,
    blockers: [],
    warnings: [],
    selectedFeeSchedule: null,
    selectedTerm: null,
    workbookActions: [],
    productionActions: [],
    applicantActions: [],
    controls: {
      workbookRows: 403,
      productionStudents: manifest.productionStudents.length,
      applicants: manifest.applicants.length,
      sourceBilledXof: 1_514_469_978,
      sourcePaidXof: 286_551_264,
      includedRows: existing.workbookLinkedRows + existing.workbookCreatedRows,
      includedBilledXof: safeNumber(
        existing.includedBilledXof,
        "included billed XOF",
      ),
      includedPaidXof: safeNumber(
        existing.includedPaidXof,
        "included paid XOF",
      ),
      reviewedExclusionRows: existing.workbookDuplicateRows,
      reviewedExclusionBilledXof:
        1_514_469_978 - safeNumber(existing.includedBilledXof, "included bill"),
      reviewedExclusionPaidXof:
        286_551_264 - safeNumber(existing.includedPaidXof, "included paid"),
      heldRows: 0,
      heldBilledXof: 0,
      heldPaidXof: 0,
      accountCreditXof: manifest.workbookRows
        .filter(
          (row) =>
            row.identity.decision === "link_existing" ||
            row.identity.decision === "create_new",
        )
        .reduce((sum, row) => sum + row.financial.accountCreditXof, 0),
      archiveStudents: existing.productionArchivedStudents,
      keepExceptionStudents: manifest.productionStudents.filter(
        (row) => row.decision === "keep_exception",
      ).length,
      preserveApplicants: manifest.applicants.length,
      reconciles: true,
    },
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

async function executeInsideTransaction(
  tx: Prisma.TransactionClient,
  input: {
    manifest: WorkbookCutoverManifest;
    sources: WorkbookCutoverSources;
    invocation: WorkbookCutoverExecutionInvocation;
  },
): Promise<WorkbookCutoverCommittedResult> {
  const planned = await planWithDatabase(
    tx,
    input.manifest,
    input.sources,
    input.invocation,
  );
  const plan = planned.plan;
  if (plan.alreadyImportedBatchId) {
    if (plan.planSha256 !== input.invocation.expectedPlanSha256) {
      throw new WorkbookCutoverBlockedError(
        "Exact replay requires the original confirmed cutover plan SHA-256",
        {
          expectedPlanSha256: input.invocation.expectedPlanSha256,
          confirmedPlanSha256: plan.planSha256,
        },
      );
    }
    const batch = await tx.workbookCutoverBatch.findUniqueOrThrow({
      where: { id: plan.alreadyImportedBatchId },
    });
    return {
      result: {
        batchId: batch.id,
        alreadyImported: true,
        workbookLinkedRows: batch.workbookLinkedRows,
        workbookCreatedRows: batch.workbookCreatedRows,
        workbookDuplicateRows: batch.workbookDuplicateRows,
        productionArchivedStudents: batch.productionArchivedStudents,
        includedBilledXof: safeNumber(
          batch.includedBilledXof,
          "included billed XOF",
        ),
        includedPaidXof: safeNumber(batch.includedPaidXof, "included paid XOF"),
        credentialRows: 0,
        activations: 0,
      },
      activationPayloads: [],
    };
  }
  assertConfirmablePlan(plan);
  if (plan.planSha256 !== input.invocation.expectedPlanSha256) {
    throw new WorkbookCutoverBlockedError(
      "Live workbook cutover plan changed after the reviewed dry run",
      {
        expectedPlanSha256: input.invocation.expectedPlanSha256,
        livePlanSha256: plan.planSha256,
      },
    );
  }
  const liveSnapshot = planned.liveSnapshot!;
  const credentials = validateCredentialInputs(
    plan,
    input.invocation.newStudentCredentials,
  );
  const batch = await tx.workbookCutoverBatch.create({
    data: {
      sourceFileName: input.manifest.sourceWorkbook.fileName,
      sourceWorkbookSha256: input.manifest.sourceWorkbook.sha256,
      sourceExtractionSha256: input.manifest.trustedExtraction.sha256,
      identityManifestSha256: plan.manifestSha256,
      rosterSnapshotSha256: input.manifest.productionSnapshot.sha256,
      confirmationPlanSha256: plan.planSha256,
      status: "planned",
      academicYearLabel: input.manifest.academicYearLabel,
      sourceAsOfDate: dateOnly(input.manifest.sourceAsOfDate),
      workbookRowCount: input.manifest.workbookRows.length,
      productionStudentCount: input.manifest.productionStudents.length,
      applicantCount: input.manifest.applicants.length,
      sourceBilledXof: BigInt(plan.controls.sourceBilledXof),
      sourcePaidXof: BigInt(plan.controls.sourcePaidXof),
      createdById: plan.actorId,
    },
  });
  const recordIds = sourceRecordIdMap(input.manifest);
  await createSourceRecords(tx, {
    batchId: batch.id,
    manifest: input.manifest,
    plan,
    ids: recordIds,
  });
  const catalog = await loadCatalogContext(tx, input.manifest, plan);
  const evidence: CutoverEvidence = {
    cancelledPaymentSubmissionIds: [],
    cancelledPaymentLinkIds: [],
    cancelledPiSpiRequestIds: [],
    cancelledPendingPaymentIds: [],
    archivedCapabilityCancellations: [],
    activationApplicantIds: [],
  };
  const activationPayloads: EnrollmentActivation[] = [];
  const supersededInvoiceIds: string[] = [];
  const supersededPaymentIds: string[] = [];
  const manifestRows = new Map(
    input.manifest.workbookRows.map((row) => [row.sourceKey, row]),
  );
  const createActions: WorkbookCutoverCreateStudentAction[] = [];

  for (const action of plan.workbookActions) {
    const sourceRecordId = recordIds.get(action.sourceKey)!;
    if (action.disposition === "held") {
      throw new WorkbookCutoverBlockedError(
        "A held workbook row reached confirmation",
        { sourceKey: action.sourceKey },
      );
    }
    if (action.disposition === "exclude_reviewed_duplicate") {
      await tx.workbookCutoverSourceRecord.update({
        where: { id: sourceRecordId },
        data: { appliedAt: new Date() },
      });
      continue;
    }
    let studentId: string;
    if (action.disposition === "create_and_reconstruct") {
      const temporaryPassword = credentials.get(action.sourceKey)!;
      const created = await createNewStudent(tx, {
        action,
        manifest: input.manifest,
        actorId: plan.actorId,
        temporaryPassword,
      });
      studentId = created.studentId;
      createActions.push(action);
    } else {
      studentId = action.studentId;
    }
    const reconstruction = await applyWorkbookReconstruction(tx, {
      batchId: batch.id,
      sourceRecordId,
      row: manifestRows.get(action.sourceKey)!,
      action,
      studentId,
      actorId: plan.actorId,
      manifest: input.manifest,
      plan,
      catalog,
      evidence,
    });
    supersededInvoiceIds.push(...reconstruction.supersededInvoiceIds);
    supersededPaymentIds.push(...reconstruction.supersededPaymentIds);
    if (reconstruction.activation) {
      activationPayloads.push(reconstruction.activation);
    }
  }
  await advanceStudentNumberSequence(
    tx,
    input.manifest,
    liveSnapshot,
    createActions,
  );

  const workbookRecordBySource = new Map(
    await tx.workbookCutoverSourceRecord
      .findMany({
        where: { batchId: batch.id, sourceKind: "workbook_row" },
        select: { id: true, sourceKey: true, studentId: true },
      })
      .then((rows) => rows.map((row) => [row.sourceKey, row] as const)),
  );
  for (const action of plan.productionActions) {
    const sourceRecordId = recordIds.get(action.sourceKey)!;
    if (action.decision === "hold") {
      throw new WorkbookCutoverBlockedError(
        "A held production Student reached confirmation",
        { sourceKey: action.sourceKey },
      );
    }
    if (action.decision === "link_workbook") {
      const workbookRecord = workbookRecordBySource.get(action.workbookRowKey);
      if (!workbookRecord || workbookRecord.studentId !== action.studentId) {
        throw new WorkbookCutoverBlockedError(
          "Production-to-workbook identity edge did not resolve to one Student",
          { sourceKey: action.sourceKey },
        );
      }
    }
    if (action.decision === "archive") {
      const cancelledCapabilities =
        await cancelStudentPaymentCapabilitiesInTransaction(
          tx,
          action.studentId,
          "Student archived by the signed August 29 workbook cutover",
        );
      evidence.cancelledPaymentSubmissionIds.push(
        ...cancelledCapabilities.cancelledPaymentSubmissionIds,
      );
      evidence.cancelledPaymentLinkIds.push(
        ...cancelledCapabilities.cancelledPaymentLinkIds,
      );
      evidence.cancelledPiSpiRequestIds.push(
        ...cancelledCapabilities.cancelledPiSpiRequestIds,
      );
      evidence.cancelledPendingPaymentIds.push(
        ...cancelledCapabilities.cancelledPendingPaymentIds,
      );
      const revokedApplicantCapabilities =
        await revokeLinkedApplicantBearerCapabilitiesInTransaction(
          tx,
          action.studentId,
        );
      evidence.archivedCapabilityCancellations.push({
        studentId: action.studentId,
        sourceRecordId,
        ...cancelledCapabilities,
        ...revokedApplicantCapabilities,
      });
      const archived = await archiveStudentInTransaction(
        tx,
        plan.actorId,
        action.studentId,
        action.review.reason,
        { batchId: batch.id, sourceRecordId },
      );
      if (archived.alreadyArchived) {
        throw new WorkbookCutoverBlockedError(
          "A reviewed archive action was already applied before confirmation",
          { sourceKey: action.sourceKey },
        );
      }
    }
    await tx.workbookCutoverSourceRecord.update({
      where: { id: sourceRecordId },
      data: { appliedAt: new Date() },
    });
  }
  for (const applicant of plan.applicantActions) {
    await tx.workbookCutoverSourceRecord.update({
      where: { id: recordIds.get(applicant.sourceKey)! },
      data: { appliedAt: new Date() },
    });
  }

  const importedAt = new Date();
  await tx.workbookCutoverBatch.update({
    where: { id: batch.id },
    data: {
      status: "imported",
      workbookLinkedRows: plan.workbookActions.filter(
        (row) => row.disposition === "reconstruct_existing",
      ).length,
      workbookCreatedRows: createActions.length,
      workbookDuplicateRows: plan.controls.reviewedExclusionRows,
      productionLinkedStudents: plan.productionActions.filter(
        (row) => row.decision === "link_workbook",
      ).length,
      productionKeptStudents: plan.productionActions.filter(
        (row) => row.decision === "keep_exception",
      ).length,
      productionArchivedStudents: plan.controls.archiveStudents,
      preservedApplicants: plan.controls.preserveApplicants,
      includedBilledXof: BigInt(plan.controls.includedBilledXof),
      includedPaidXof: BigInt(plan.controls.includedPaidXof),
      excludedBilledXof: BigInt(plan.controls.reviewedExclusionBilledXof),
      excludedPaidXof: BigInt(plan.controls.reviewedExclusionPaidXof),
      importedAt,
    },
  });
  await tx.auditLog.create({
    data: {
      entity: "WorkbookCutoverBatch",
      entityId: batch.id,
      action: "imported",
      actorId: plan.actorId,
      data: safeJson({
        sourceWorkbookSha256: input.manifest.sourceWorkbook.sha256,
        sourceExtractionSha256: input.manifest.trustedExtraction.sha256,
        rosterSnapshotSha256: input.manifest.productionSnapshot.sha256,
        manifestSha256: plan.manifestSha256,
        confirmationPlanSha256: plan.planSha256,
        reviewerAttestationIds: plan.reviewerAttestations.map(
          (attestation) => attestation.id,
        ),
        liveSnapshotSha256: plan.liveSnapshotSha256,
        billingCatalogFingerprintSha256:
          liveSnapshot.billingCatalogFingerprintSha256,
        sourceAsOfDate: input.manifest.sourceAsOfDate,
        controls: plan.controls,
        activations: activationPayloads.length,
        activationApplicantIds: uniqueSorted(evidence.activationApplicantIds),
        originalProductionStudentIds: uniqueSorted(
          liveSnapshot.students.map((student) => student.studentId),
        ),
        originalApplicantIds: uniqueSorted(
          liveSnapshot.applicants.map((applicant) => applicant.applicantId),
        ),
        academicFingerprints: liveSnapshot.students.map((student) => ({
          studentId: student.studentId,
          personId: student.personId,
          ...student.academicFingerprint,
          academicFingerprintSha256: student.academicFingerprintSha256,
        })),
        supersededInvoiceIds: uniqueSorted(supersededInvoiceIds),
        supersededPaymentIds: uniqueSorted(supersededPaymentIds),
        cancelledPaymentSubmissionIds: uniqueSorted(
          evidence.cancelledPaymentSubmissionIds,
        ),
        cancelledPaymentLinkIds: uniqueSorted(evidence.cancelledPaymentLinkIds),
        cancelledPiSpiRequestIds: uniqueSorted(
          evidence.cancelledPiSpiRequestIds,
        ),
        cancelledPendingPaymentIds: uniqueSorted(
          evidence.cancelledPendingPaymentIds,
        ),
        archivedCapabilityCancellations:
          evidence.archivedCapabilityCancellations
            .map((row) => ({
              studentId: row.studentId,
              sourceRecordId: row.sourceRecordId,
              cancelledPaymentSubmissionIds: uniqueSorted(
                row.cancelledPaymentSubmissionIds,
              ),
              cancelledPaymentLinkIds: uniqueSorted(
                row.cancelledPaymentLinkIds,
              ),
              cancelledPiSpiRequestIds: uniqueSorted(
                row.cancelledPiSpiRequestIds,
              ),
              cancelledPendingPaymentIds: uniqueSorted(
                row.cancelledPendingPaymentIds,
              ),
              linkedApplicantIds: uniqueSorted(row.linkedApplicantIds),
              statusTokenCapabilityApplicantIds: uniqueSorted(
                row.statusTokenCapabilityApplicantIds,
              ),
              revokedApplicantStatusTokenIds: uniqueSorted(
                row.revokedApplicantStatusTokenIds,
              ),
              preexistingInactiveApplicantStatusTokenIds: uniqueSorted(
                row.preexistingInactiveApplicantStatusTokenIds,
              ),
              clearedApplicantPaymentLinkPointers: [
                ...row.clearedApplicantPaymentLinkPointers,
              ].sort((left, right) =>
                left.applicantId.localeCompare(right.applicantId),
              ),
            }))
            .sort((left, right) =>
              left.sourceRecordId.localeCompare(right.sourceRecordId),
            ),
      }),
    },
  });
  return {
    result: {
      batchId: batch.id,
      alreadyImported: false,
      workbookLinkedRows: plan.workbookActions.filter(
        (row) => row.disposition === "reconstruct_existing",
      ).length,
      workbookCreatedRows: createActions.length,
      workbookDuplicateRows: plan.controls.reviewedExclusionRows,
      productionArchivedStudents: plan.controls.archiveStudents,
      includedBilledXof: plan.controls.includedBilledXof,
      includedPaidXof: plan.controls.includedPaidXof,
      credentialRows: createActions.length,
      activations: activationPayloads.length,
    },
    activationPayloads,
  };
}

export async function executeWorkbookCutover(
  prisma: PrismaClient,
  manifest: WorkbookCutoverManifest,
  sources: WorkbookCutoverSources,
  invocation: WorkbookCutoverExecutionInvocation,
): Promise<WorkbookCutoverResult> {
  if (!/^[a-f0-9]{64}$/.test(invocation.expectedPlanSha256)) {
    throw new WorkbookCutoverBlockedError(
      "Confirmation requires the exact reviewed dry-run plan SHA-256",
      {},
    );
  }
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      const committed = await prisma.$transaction(
        (tx) => executeInsideTransaction(tx, { manifest, sources, invocation }),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 30_000,
          timeout: TRANSACTION_TIMEOUT_MS,
        },
      );
      return committed.result;
    } catch (error) {
      if (
        attempt < MAX_TRANSACTION_ATTEMPTS &&
        isRetryableTransactionError(error)
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new WorkbookCutoverBlockedError(
    "Workbook cutover exhausted transaction retries",
    {},
  );
}

async function planWithDatabase(
  db: CutoverDb,
  manifest: WorkbookCutoverManifest,
  sources: WorkbookCutoverSources,
  invocation: WorkbookCutoverInvocation,
): Promise<{
  plan: WorkbookCutoverDatabasePlan;
  liveSnapshot: WorkbookCutoverLiveSnapshot | null;
}> {
  const actor = await requireCutoverActor(db, invocation.actorEmail);
  const manifestSha256 = workbookCutoverManifestDigest(manifest);
  const existing = await findExistingBatch(db, manifestSha256);
  if (existing) {
    return {
      plan: exactReplayPlan(actor.id, manifest, existing),
      liveSnapshot: null,
    };
  }
  const [liveSnapshot, reviewerBindings] = await Promise.all([
    captureWorkbookCutoverLiveSnapshot(db, manifest),
    bindReviewers(db, manifest),
  ]);
  const attestationEvidence = await reviewerAttestationEvidence(
    db,
    manifestSha256,
    reviewerBindings,
  );
  const attestationAssessment = assessWorkbookCutoverReviewerAttestations({
    manifestSha256,
    reviewerBindings,
    evidence: attestationEvidence,
  });
  const purePlan = planWorkbookCutover({
    manifest,
    trustedExtraction: sources.trustedExtraction,
    reviewedProductionSnapshot: sources.reviewedProductionSnapshot,
    sourceDigests: sources.sourceDigests,
    liveSnapshot,
  });
  const blockers = [...purePlan.blockers, ...attestationAssessment.blockers];
  const databasePlanSha256 = sha256(
    canonicalWorkbookCutoverJson({
      schemaVersion: 2,
      purePlanSha256: purePlan.planSha256,
      actorId: actor.id,
      reviewerBindings: reviewerBindings.map((binding) => ({
        personId: binding.personId,
        reviewedBySha256: sha256(binding.reviewedBy),
      })),
      reviewerAttestations: attestationAssessment.states,
      attestationBlockerCodes: attestationAssessment.blockers.map(
        (blocker) => blocker.code,
      ),
    }),
  );
  return {
    plan: {
      ...purePlan,
      confirmBlocked: purePlan.confirmBlocked || blockers.length > 0,
      blockers,
      actorId: actor.id,
      purePlanSha256: purePlan.planSha256,
      planSha256: databasePlanSha256,
      alreadyImportedBatchId: null,
      reviewerBindings,
      reviewerAttestations: attestationAssessment.states,
    },
    liveSnapshot,
  };
}

export async function planWorkbookCutoverFromDatabase(
  db: PrismaClient,
  manifest: WorkbookCutoverManifest,
  sources: WorkbookCutoverSources,
  invocation: WorkbookCutoverInvocation,
): Promise<WorkbookCutoverDatabasePlan> {
  return (await planWithDatabase(db, manifest, sources, invocation)).plan;
}

type WorkbookActionIncluded =
  WorkbookCutoverExistingStudentAction | WorkbookCutoverCreateStudentAction;

function includedWorkbookActions(
  plan: WorkbookCutoverDatabasePlan,
): WorkbookActionIncluded[] {
  return plan.workbookActions.filter(
    (action): action is WorkbookActionIncluded =>
      action.disposition === "reconstruct_existing" ||
      action.disposition === "create_and_reconstruct",
  );
}

function assertConfirmablePlan(plan: WorkbookCutoverDatabasePlan): void {
  if (plan.confirmBlocked || plan.blockers.length > 0) {
    throw new WorkbookCutoverBlockedError(
      "Workbook cutover confirmation is blocked by unresolved controls",
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
  if (
    plan.controls.heldRows !== 0 ||
    plan.productionActions.some((row) => row.decision === "hold") ||
    !plan.selectedFeeSchedule ||
    !plan.selectedTerm
  ) {
    throw new WorkbookCutoverBlockedError(
      "Every source decision and billing target must be resolved before confirmation",
      {},
    );
  }
}

function validateCredentialInputs(
  plan: WorkbookCutoverDatabasePlan,
  credentials: readonly WorkbookCutoverNewStudentCredential[],
): Map<string, string> {
  const expected = plan.workbookActions
    .filter(
      (action): action is WorkbookCutoverCreateStudentAction =>
        action.disposition === "create_and_reconstruct",
    )
    .map((action) => action.sourceKey)
    .sort();
  const bySource = new Map<string, string>();
  for (const credential of credentials) {
    if (
      bySource.has(credential.sourceKey) ||
      credential.temporaryPassword.length < 20 ||
      credential.temporaryPassword.length > 256
    ) {
      throw new WorkbookCutoverBlockedError(
        "New-student credential input is incomplete or duplicated",
        { sourceKey: credential.sourceKey },
      );
    }
    bySource.set(credential.sourceKey, credential.temporaryPassword);
  }
  if (expected.join("\n") !== [...bySource.keys()].sort().join("\n")) {
    throw new WorkbookCutoverBlockedError(
      "Credential rows must exactly match planned new Students",
      { expectedRows: expected.length, suppliedRows: bySource.size },
    );
  }
  return bySource;
}

function reviewerId(
  plan: WorkbookCutoverDatabasePlan,
  reviewedBy: string,
): string {
  const normalized = reviewedBy.trim().toLowerCase();
  const binding = plan.reviewerBindings.find(
    (candidate) => candidate.reviewedBy === normalized,
  );
  if (!binding) {
    throw new WorkbookCutoverBlockedError(
      "Signed reviewer binding disappeared from the confirmed plan",
      { code: "reviewer_binding_missing" },
    );
  }
  return binding.personId;
}

function sourceRecordIdMap(
  manifest: WorkbookCutoverManifest,
): Map<string, string> {
  return new Map(
    [
      ...manifest.workbookRows.map((row) => row.sourceKey),
      ...manifest.productionStudents.map((row) => row.sourceKey),
      ...manifest.applicants.map((row) => row.sourceKey),
    ].map((key) => [key, randomUUID()]),
  );
}

async function createSourceRecords(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    manifest: WorkbookCutoverManifest;
    plan: WorkbookCutoverDatabasePlan;
    ids: ReadonlyMap<string, string>;
  },
): Promise<void> {
  const workbookByKey = new Map(
    input.manifest.workbookRows.map((row) => [row.sourceKey, row]),
  );
  const actionByKey = new Map(
    input.plan.workbookActions.map((row) => [row.sourceKey, row]),
  );
  const workbookRows: Prisma.WorkbookCutoverSourceRecordCreateManyInput[] =
    input.manifest.workbookRows.map((row) => {
      const action = actionByKey.get(row.sourceKey)!;
      const disposition =
        action.disposition === "reconstruct_existing"
          ? "link_existing_student"
          : action.disposition === "create_and_reconstruct"
            ? "create_student"
            : action.disposition === "exclude_reviewed_duplicate"
              ? "reviewed_duplicate"
              : null;
      if (!disposition) {
        throw new WorkbookCutoverBlockedError(
          "A held workbook row reached source-record creation",
          { sourceKey: row.sourceKey },
        );
      }
      const duplicateKey =
        row.identity.decision === "reviewed_duplicate"
          ? row.identity.canonicalWorkbookRowKey
          : null;
      if (duplicateKey && !workbookByKey.has(duplicateKey)) {
        throw new WorkbookCutoverBlockedError(
          "Reviewed duplicate target is absent from the manifest",
          { sourceKey: row.sourceKey },
        );
      }
      return {
        id: input.ids.get(row.sourceKey)!,
        batchId: input.batchId,
        sourceKind: "workbook_row",
        sourceKey: row.sourceKey,
        sourceKeySha256: sha256(row.sourceKey),
        sourceFingerprintSha256: row.sourceRecordSha256,
        sourceClaimSha256: sourceClaimSha256(
          input.manifest.sourceWorkbook.sha256,
          row.sourceKey,
        ),
        sourceSheet: row.sourceSheet,
        sourceRowNumber: row.sourceRowNumber,
        sourceStudentClaim: row.sourceStudentClaim,
        sourceBilledXof: BigInt(row.financial.amountBilledXof),
        sourcePaidXof: BigInt(row.financial.amountPaidXof),
        disposition,
        reviewedById: reviewerId(input.plan, row.identity.review.reviewedBy),
        reviewedAt: new Date(row.identity.review.reviewedAt),
        reviewReason: row.identity.review.reason,
        reviewSignatureSha256: row.identity.review.signatureSha256,
        studentId:
          action.disposition === "reconstruct_existing"
            ? action.studentId
            : null,
        duplicateOfRecordId: duplicateKey ? input.ids.get(duplicateKey)! : null,
      };
    });

  const productionRows: Prisma.WorkbookCutoverSourceRecordCreateManyInput[] =
    input.manifest.productionStudents.map((row) => ({
      id: input.ids.get(row.sourceKey)!,
      batchId: input.batchId,
      sourceKind: "production_student",
      sourceKey: row.sourceKey,
      sourceKeySha256: sha256(row.sourceKey),
      sourceFingerprintSha256: row.sourceRecordSha256,
      disposition:
        row.decision === "link_workbook"
          ? "link_workbook_row"
          : row.decision === "keep_exception"
            ? "keep_exception"
            : row.decision === "archive"
              ? "archive_student"
              : null,
      reviewedById: reviewerId(input.plan, row.review.reviewedBy),
      reviewedAt: new Date(row.review.reviewedAt),
      reviewReason: row.review.reason,
      reviewSignatureSha256: row.review.signatureSha256,
      studentId: row.studentId,
      linkedWorkbookRecordId:
        row.decision === "link_workbook"
          ? input.ids.get(row.workbookRowKey)!
          : null,
    }));
  if (productionRows.some((row) => row.disposition === null)) {
    throw new WorkbookCutoverBlockedError(
      "A held production Student reached source-record creation",
      {},
    );
  }

  const applicantRows: Prisma.WorkbookCutoverSourceRecordCreateManyInput[] =
    input.manifest.applicants.map((row) => ({
      id: input.ids.get(row.sourceKey)!,
      batchId: input.batchId,
      sourceKind: "applicant",
      sourceKey: row.sourceKey,
      sourceKeySha256: sha256(row.sourceKey),
      sourceFingerprintSha256: row.sourceRecordSha256,
      disposition: "preserve_applicant",
      reviewedById: reviewerId(input.plan, row.review.reviewedBy),
      reviewedAt: new Date(row.review.reviewedAt),
      reviewReason: row.review.reason,
      reviewSignatureSha256: row.review.signatureSha256,
      applicantId: row.applicantId,
    }));

  await tx.workbookCutoverSourceRecord.createMany({
    data: [...workbookRows, ...productionRows, ...applicantRows],
  });
}

type CatalogContext = {
  serviceOptions: Map<
    string,
    {
      id: string;
      kind: "housing" | "cafeteria" | "insurance" | "housing_caution";
      code: string;
      label: string;
      amountXof: number | null;
      percentageBasisPoints: number | null;
      calculation: "fixed" | "percentage_of_service";
      basisServiceKind:
        "housing" | "cafeteria" | "insurance" | "housing_caution" | null;
      costCenterCode: string;
      refundable: boolean;
      active: boolean;
    }
  >;
  adjustmentDefinitions: Map<
    string,
    {
      id: string;
      key: string;
      active: boolean;
      basis:
        | "tuition"
        | "housing"
        | "cafeteria"
        | "insurance"
        | "housing_caution"
        | "gross_charges"
        | "manual";
      calculation: "percentage" | "fixed" | "manual";
      stacking: "additive" | "sequential" | "exclusive";
      effect: "discount" | "charge";
      percentageBasisPoints: number | null;
      fixedAmountXof: number | null;
      requiresApproval: boolean;
    }
  >;
  tuition: {
    id: string;
    label: string;
    costCenterCode: string;
  };
};

async function loadCatalogContext(
  tx: Prisma.TransactionClient,
  manifest: WorkbookCutoverManifest,
  plan: WorkbookCutoverDatabasePlan,
): Promise<CatalogContext> {
  const scheduleId = plan.selectedFeeSchedule!.id;
  const [schedule, serviceRows, definitionRows] = await Promise.all([
    tx.feeSchedule.findUnique({
      where: { id: scheduleId },
      include: { components: true },
    }),
    tx.billingServiceOption.findMany({
      where: { academicYearLabel: manifest.academicYearLabel },
      orderBy: [{ kind: "asc" }, { code: "asc" }, { id: "asc" }],
    }),
    tx.billingAdjustmentDefinition.findMany({
      where: { academicYearLabel: manifest.academicYearLabel },
      orderBy: [{ key: "asc" }, { id: "asc" }],
    }),
  ]);
  if (
    !schedule ||
    schedule.status !== "approved" ||
    schedule.revision !== plan.selectedFeeSchedule!.revision
  ) {
    throw new WorkbookCutoverBlockedError(
      "Approved fee schedule changed inside confirmation",
      {},
    );
  }
  const tuitionCandidates = schedule.components.filter(
    (component) => component.key === "tuition",
  );
  if (tuitionCandidates.length !== 1) {
    throw new WorkbookCutoverBlockedError(
      "The approved schedule must have exactly one tuition component",
      {},
    );
  }
  return {
    serviceOptions: new Map(
      serviceRows.map((row) => [`${row.kind}:${row.code}`, row]),
    ),
    adjustmentDefinitions: new Map(definitionRows.map((row) => [row.key, row])),
    tuition: tuitionCandidates[0]!,
  };
}

function resolveOperationalSelections(
  action: WorkbookActionIncluded,
  catalog: CatalogContext,
): BillingOperationalSelection[] {
  const services = action.reconstruction.services;
  const requests = [
    {
      kind: "housing" as const,
      code: services.housing.option,
      amountXof: services.housing.annualAmountXof,
      refundable: false,
      percentageBasisOptionCode: null,
    },
    {
      kind: "cafeteria" as const,
      code: services.cafeteria.plan,
      amountXof: services.cafeteria.annualAmountXof,
      refundable: false,
      percentageBasisOptionCode: null,
    },
    {
      kind: "insurance" as const,
      code: services.insurance.selected ? "annual" : "none",
      amountXof: services.insurance.annualAmountXof,
      refundable: false,
      percentageBasisOptionCode: null,
    },
    {
      kind: "housing_caution" as const,
      code: services.caution.selected ? "housing_10_percent" : "none",
      amountXof: services.caution.amountXof,
      refundable: true,
      percentageBasisOptionCode: services.caution.selected
        ? services.caution.basisHousingOption
        : null,
    },
  ];
  return requests.map((request) => {
    const option = catalog.serviceOptions.get(
      `${request.kind}:${request.code}`,
    );
    if (
      !option ||
      !option.active ||
      option.refundable !== request.refundable ||
      (option.calculation === "percentage_of_service" &&
        option.basisServiceKind !== "housing")
    ) {
      throw new WorkbookCutoverBlockedError(
        "A reviewed service selection is absent from the approved catalog",
        { sourceKey: action.sourceKey, kind: request.kind, code: request.code },
      );
    }
    const percentageBasis = request.percentageBasisOptionCode
      ? catalog.serviceOptions.get(
          `housing:${request.percentageBasisOptionCode}`,
        )
      : null;
    const catalogAmount =
      option.calculation === "fixed"
        ? option.amountXof
        : option.calculation === "percentage_of_service" &&
            option.percentageBasisPoints === services.caution.percentageBps &&
            percentageBasis?.active &&
            percentageBasis.calculation === "fixed" &&
            percentageBasis.amountXof !== null
          ? Math.round(
              (percentageBasis.amountXof * option.percentageBasisPoints) /
                10_000,
            )
          : null;
    if (catalogAmount !== request.amountXof) {
      throw new WorkbookCutoverBlockedError(
        "A reviewed service price differs from the live approved catalog",
        { sourceKey: action.sourceKey, kind: request.kind, code: request.code },
      );
    }
    return {
      kind: request.kind,
      serviceOptionId: option.id,
      optionCode: option.code,
      percentageBasisOptionId: percentageBasis?.id ?? null,
      percentageBasisOptionCode: percentageBasis?.code ?? null,
      percentageBasisServiceKind: percentageBasis ? ("housing" as const) : null,
      label: option.label,
      amountXof: request.amountXof,
      refundable: request.refundable,
    };
  });
}

function workbookCutoverMismatchWarnings(
  action: WorkbookActionIncluded,
): Prisma.InputJsonArray {
  const warnings: Prisma.InputJsonValue[] = [];
  if (
    action.disposition === "create_and_reconstruct" &&
    action.programCode === null
  ) {
    warnings.push("program_unassigned");
  }
  if (
    action.reconstruction.services.housing.option === "none" &&
    action.reconstruction.services.caution.selected
  ) {
    warnings.push({
      code: "caution_without_housing",
      message:
        "Workbook caution is retained without a housing charge and uses the reviewed alternate housing-price basis.",
      severity: "warning",
      percentageBasisOptionCode:
        action.reconstruction.services.caution.basisHousingOption,
    });
  }
  return warnings;
}

type CreatedComponent = {
  id: string;
  key: string;
  grossAmountXof: number;
  amountXof: number;
};

function componentCatalogSnapshot(
  component: WorkbookActionIncluded["reconstruction"]["components"][number],
  selections: readonly BillingOperationalSelection[],
  catalog: CatalogContext,
): {
  label: string;
  costCenterCode: string;
  scheduleComponentId: string | null;
} {
  if (component.key === "tuition") {
    return {
      label: catalog.tuition.label,
      costCenterCode: catalog.tuition.costCenterCode,
      scheduleComponentId: catalog.tuition.id,
    };
  }
  const kind =
    component.key === "housing_caution" ? "housing_caution" : component.key;
  const selection = selections.find((row) => row.kind === kind);
  if (!selection) {
    throw new WorkbookCutoverBlockedError(
      "Invoice component lacks its reviewed service selection",
      { componentKey: component.key },
    );
  }
  const option = catalog.serviceOptions.get(
    `${selection.kind}:${selection.optionCode}`,
  )!;
  return {
    label: option.label,
    costCenterCode: option.costCenterCode,
    scheduleComponentId: null,
  };
}

function installmentComponentGrid(
  installmentIds: readonly { id: string; amountDue: number }[],
  components: readonly CreatedComponent[],
): Array<{
  installmentId: string;
  invoiceComponentId: string;
  amountDue: number;
}> {
  const remaining = new Map(
    components.map((component) => [component.id, component.amountXof]),
  );
  const rows: Array<{
    installmentId: string;
    invoiceComponentId: string;
    amountDue: number;
  }> = [];
  for (const installment of installmentIds) {
    let rowRemaining = installment.amountDue;
    for (const component of components) {
      const columnRemaining = remaining.get(component.id) ?? 0;
      const amountDue = Math.min(rowRemaining, columnRemaining);
      rows.push({
        installmentId: installment.id,
        invoiceComponentId: component.id,
        amountDue,
      });
      rowRemaining -= amountDue;
      remaining.set(component.id, columnRemaining - amountDue);
    }
    if (rowRemaining !== 0) {
      throw new WorkbookCutoverBlockedError(
        "Workbook installment/component grid did not reconcile",
        { installmentId: installment.id },
      );
    }
  }
  if ([...remaining.values()].some((value) => value !== 0)) {
    throw new WorkbookCutoverBlockedError(
      "Workbook component/installment grid left an unallocated balance",
      {},
    );
  }
  return rows;
}

async function createNewStudent(
  tx: Prisma.TransactionClient,
  input: {
    action: WorkbookCutoverCreateStudentAction;
    manifest: WorkbookCutoverManifest;
    actorId: string;
    temporaryPassword: string;
  },
): Promise<{ studentId: string; personId: string }> {
  const action = input.action;
  if (!action.plannedStudentNo || !action.plannedLoginEmail) {
    throw new WorkbookCutoverBlockedError(
      "Confirmed new Student lacks a deterministic number or login",
      { sourceKey: action.sourceKey },
    );
  }
  const program = action.programCode
    ? await tx.program.findUnique({
        where: { code: action.programCode },
        select: { id: true },
      })
    : null;
  if (action.programCode && !program) {
    throw new WorkbookCutoverBlockedError(
      "Reviewed new-Student program does not exist",
      { sourceKey: action.sourceKey, programCode: action.programCode },
    );
  }
  const academicYear = await tx.academicYear.findUnique({
    where: { label: input.manifest.academicYearLabel },
    select: { id: true },
  });
  if (!academicYear) {
    throw new WorkbookCutoverBlockedError(
      "Cutover academic year does not exist",
      {},
    );
  }
  const personId = randomUUID();
  const studentId = randomUUID();
  const passwordHash = await bcrypt.hash(input.temporaryPassword, 10);
  await tx.person.create({
    data: {
      id: personId,
      email: action.plannedLoginEmail,
      firstName: action.firstName,
      lastName: action.lastName,
      kind: "student",
      roles: ["student"],
      // session-revocation-exempt: this Person is created in this transaction
      // and therefore cannot have an earlier authenticated session to revoke.
      passwordHash,
      mustChangePassword: true,
      status: "active",
      student: {
        create: {
          id: studentId,
          studentNo: action.plannedStudentNo,
          personalEmail: action.personalEmail,
          programId: program?.id ?? null,
          catalogYear: input.manifest.academicYearLabel,
          catalogYearId: academicYear.id,
          recordStatus: "active",
        },
      },
    },
  });
  await tx.auditLog.create({
    data: {
      entity: "Student",
      entityId: studentId,
      action: "workbook-cutover-created",
      actorId: input.actorId,
      data: {
        sourceKeySha256: sha256(action.sourceKey),
        studentNo: action.plannedStudentNo,
        loginDomain: "mydaust.com",
        sisLoginOnly: true,
      },
    },
  });
  return { studentId, personId };
}

async function advanceStudentNumberSequence(
  tx: Prisma.TransactionClient,
  manifest: WorkbookCutoverManifest,
  liveSnapshot: WorkbookCutoverLiveSnapshot,
  actions: readonly WorkbookCutoverCreateStudentAction[],
): Promise<void> {
  if (actions.length === 0) return;
  const baseline = liveSnapshot.studentNumberSequence;
  if (!baseline) {
    throw new WorkbookCutoverBlockedError(
      "Student number sequence disappeared inside confirmation",
      {},
    );
  }
  const numericValues = actions.map((action) => {
    const match = action.plannedStudentNo?.match(
      new RegExp(`^S${manifest.academicYearStart}(\\d+)[A-Z]+$`),
    );
    return match ? Number(match[1]) : Number.NaN;
  });
  if (numericValues.some((value) => !Number.isSafeInteger(value))) {
    throw new WorkbookCutoverBlockedError(
      "A planned Student number does not encode the locked annual sequence",
      {},
    );
  }
  const nextValue = Math.max(...numericValues) + 1;
  await tx.studentNumberSequence.update({
    where: { academicYearStart: manifest.academicYearStart },
    data: { nextValue },
  });
}

type SupersededInvoiceSnapshot = {
  id: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  snapshot: Prisma.InputJsonValue;
  snapshotSha256: string;
};

type SupersededPaymentSnapshot = {
  id: string;
  status: string;
  amount: number;
  snapshot: Prisma.InputJsonValue;
  snapshotSha256: string;
};

type SupersededFinancialState = {
  invoices: SupersededInvoiceSnapshot[];
  payments: SupersededPaymentSnapshot[];
  cancelledPaymentSubmissionIds: string[];
  cancelledPaymentLinkIds: string[];
  cancelledPiSpiRequestIds: string[];
  cancelledPendingPaymentIds: string[];
};

type PaymentCapabilityAttempt = {
  id: string;
  status: string;
  paymentId: string | null;
  paymentLinkId: string | null;
};

/**
 * Cancels every payer capability owned by a Student while retaining all rows.
 *
 * Ownership starts at the Student, every one of their invoices, and their
 * linked Applicant. It then follows Payment and PaymentLink references on both
 * proof-payment and PI-SPI attempts to a fixed point. This is intentionally
 * broader than relying on denormalized studentId alone: legacy attempts may
 * carry only an invoice, payment, link, Applicant, or Applicant active-link
 * pointer. The caller and this helper run in the same SERIALIZABLE transaction.
 */
async function cancelStudentPaymentCapabilitiesInTransaction(
  tx: Prisma.TransactionClient,
  studentId: string,
  reason: string,
): Promise<CancelledPaymentCapabilities> {
  const [studentInvoices, linkedApplicants] = await Promise.all([
    tx.invoice.findMany({
      where: { studentId },
      select: { id: true },
    }),
    tx.applicant.findMany({
      where: { studentId },
      select: {
        id: true,
        enrollmentInvoiceId: true,
        activeOnboardingPaymentLinkId: true,
      },
    }),
  ]);
  const invoiceIds = new Set(studentInvoices.map((row) => row.id));
  const applicantIds = new Set(linkedApplicants.map((row) => row.id));
  const paymentLinkIds = new Set(
    linkedApplicants.flatMap((row) =>
      row.activeOnboardingPaymentLinkId
        ? [row.activeOnboardingPaymentLinkId]
        : [],
    ),
  );
  for (const applicant of linkedApplicants) {
    if (applicant.enrollmentInvoiceId) {
      invoiceIds.add(applicant.enrollmentInvoiceId);
    }
  }

  const invoiceIdValues = [...invoiceIds];
  const ownedPayments = await tx.payment.findMany({
    where: {
      OR: [
        { studentId },
        ...(invoiceIdValues.length > 0
          ? [{ invoiceId: { in: invoiceIdValues } }]
          : []),
      ],
    },
    select: { id: true },
  });
  const paymentIds = new Set(ownedPayments.map((row) => row.id));
  const applicantIdValues = [...applicantIds];
  const directlyOwnedLinks = await tx.paymentLink.findMany({
    where: {
      OR: [
        { studentId },
        ...(invoiceIdValues.length > 0
          ? [{ invoiceId: { in: invoiceIdValues } }]
          : []),
        ...(applicantIdValues.length > 0
          ? [{ onboardingApplicantId: { in: applicantIdValues } }]
          : []),
        ...(paymentLinkIds.size > 0
          ? [{ id: { in: [...paymentLinkIds] } }]
          : []),
      ],
    },
    select: { id: true },
  });
  for (const link of directlyOwnedLinks) paymentLinkIds.add(link.id);

  const submissions = new Map<string, PaymentCapabilityAttempt>();
  const piSpiRequests = new Map<string, PaymentCapabilityAttempt>();
  let changed = true;
  while (changed) {
    const before =
      paymentIds.size +
      paymentLinkIds.size +
      submissions.size +
      piSpiRequests.size;
    const targetOr = [
      { studentId },
      ...(invoiceIdValues.length > 0
        ? [{ invoiceId: { in: invoiceIdValues } }]
        : []),
      ...(paymentIds.size > 0 ? [{ paymentId: { in: [...paymentIds] } }] : []),
      ...(paymentLinkIds.size > 0
        ? [{ paymentLinkId: { in: [...paymentLinkIds] } }]
        : []),
      ...(applicantIdValues.length > 0
        ? [{ applicantId: { in: applicantIdValues } }]
        : []),
    ];
    const [submissionRows, piSpiRows] = await Promise.all([
      tx.paymentSubmission.findMany({
        where: { OR: targetOr },
        select: {
          id: true,
          status: true,
          paymentId: true,
          paymentLinkId: true,
        },
      }),
      tx.piSpiRequest.findMany({
        where: { OR: targetOr },
        select: {
          id: true,
          status: true,
          paymentId: true,
          paymentLinkId: true,
        },
      }),
    ]);
    for (const row of submissionRows) submissions.set(row.id, row);
    for (const row of piSpiRows) piSpiRequests.set(row.id, row);
    for (const row of [...submissionRows, ...piSpiRows]) {
      if (row.paymentId) paymentIds.add(row.paymentId);
      if (row.paymentLinkId) paymentLinkIds.add(row.paymentLinkId);
    }
    const after =
      paymentIds.size +
      paymentLinkIds.size +
      submissions.size +
      piSpiRequests.size;
    changed = after !== before;
  }

  const unsettledSubmissions = [...submissions.values()]
    .filter((row) => ["awaiting_proof", "submitted"].includes(row.status))
    .sort((left, right) => left.id.localeCompare(right.id));
  const unsettledPiSpiRequests = [...piSpiRequests.values()]
    .filter((row) => ["initiated", "sent"].includes(row.status))
    .sort((left, right) => left.id.localeCompare(right.id));
  const [activeLinks, pendingPayments] = await Promise.all([
    paymentLinkIds.size > 0
      ? tx.paymentLink.findMany({
          where: { id: { in: [...paymentLinkIds] }, status: "active" },
          orderBy: { id: "asc" },
          select: { id: true },
        })
      : Promise.resolve([]),
    paymentIds.size > 0
      ? tx.payment.findMany({
          where: { id: { in: [...paymentIds] }, status: "pending" },
          orderBy: { id: "asc" },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const [submissionMutation, linkMutation, piSpiMutation, paymentMutation] =
    await Promise.all([
      unsettledSubmissions.length > 0
        ? tx.paymentSubmission.updateMany({
            where: {
              id: { in: unsettledSubmissions.map((row) => row.id) },
              status: { in: ["awaiting_proof", "submitted"] },
            },
            data: {
              status: "cancelled",
              activeKey: null,
              rejectionReason: reason,
            },
          })
        : Promise.resolve({ count: 0 }),
      activeLinks.length > 0
        ? tx.paymentLink.updateMany({
            where: {
              id: { in: activeLinks.map((row) => row.id) },
              status: "active",
            },
            data: { status: "cancelled" },
          })
        : Promise.resolve({ count: 0 }),
      unsettledPiSpiRequests.length > 0
        ? tx.piSpiRequest.updateMany({
            where: {
              id: { in: unsettledPiSpiRequests.map((row) => row.id) },
              status: { in: ["initiated", "sent"] },
            },
            data: { status: "cancelled", statusReason: reason },
          })
        : Promise.resolve({ count: 0 }),
      pendingPayments.length > 0
        ? tx.payment.updateMany({
            where: {
              id: { in: pendingPayments.map((row) => row.id) },
              status: "pending",
            },
            data: { status: "cancelled" },
          })
        : Promise.resolve({ count: 0 }),
    ]);
  if (
    submissionMutation.count !== unsettledSubmissions.length ||
    linkMutation.count !== activeLinks.length ||
    piSpiMutation.count !== unsettledPiSpiRequests.length ||
    paymentMutation.count !== pendingPayments.length
  ) {
    throw new WorkbookCutoverBlockedError(
      "A payer capability changed while cutover confirmation was running",
      {
        studentId,
        expectedSubmissionCancellations: unsettledSubmissions.length,
        actualSubmissionCancellations: submissionMutation.count,
        expectedLinkCancellations: activeLinks.length,
        actualLinkCancellations: linkMutation.count,
        expectedPiSpiCancellations: unsettledPiSpiRequests.length,
        actualPiSpiCancellations: piSpiMutation.count,
        expectedPendingPaymentCancellations: pendingPayments.length,
        actualPendingPaymentCancellations: paymentMutation.count,
      },
    );
  }

  return {
    cancelledPaymentSubmissionIds: unsettledSubmissions.map((row) => row.id),
    cancelledPaymentLinkIds: activeLinks.map((row) => row.id),
    cancelledPiSpiRequestIds: unsettledPiSpiRequests.map((row) => row.id),
    cancelledPendingPaymentIds: pendingPayments.map((row) => row.id),
  };
}

/**
 * Revokes the linked Applicant's public status bearer and removes its active
 * payment-link pointer after payer capabilities have been cancelled. The
 * verifier hash is retained as audit evidence; only its usability is revoked.
 */
async function revokeLinkedApplicantBearerCapabilitiesInTransaction(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<RevokedApplicantBearerCapabilities> {
  const now = new Date();
  const applicants = await tx.applicant.findMany({
    where: { studentId },
    select: {
      id: true,
      statusTokenHash: true,
      statusTokenRevokedAt: true,
      statusTokenExpiresAt: true,
      activeOnboardingPaymentLinkId: true,
    },
    orderBy: { id: "asc" },
  });
  const statusTokenCapabilityApplicantIds = applicants
    .filter((applicant) => applicant.statusTokenHash !== null)
    .map((applicant) => applicant.id);
  const activeStatusTokenApplicantIds = applicants
    .filter(
      (applicant) =>
        applicant.statusTokenHash !== null &&
        applicant.statusTokenRevokedAt === null &&
        (applicant.statusTokenExpiresAt === null ||
          applicant.statusTokenExpiresAt.getTime() > now.getTime()),
    )
    .map((applicant) => applicant.id);
  const activeStatusTokenApplicantIdSet = new Set(
    activeStatusTokenApplicantIds,
  );
  const preexistingInactiveApplicantStatusTokenIds =
    statusTokenCapabilityApplicantIds.filter(
      (applicantId) => !activeStatusTokenApplicantIdSet.has(applicantId),
    );
  const clearedApplicantPaymentLinkPointers = applicants
    .filter(
      (
        applicant,
      ): applicant is typeof applicant & {
        activeOnboardingPaymentLinkId: string;
      } => applicant.activeOnboardingPaymentLinkId !== null,
    )
    .map((applicant) => ({
      applicantId: applicant.id,
      paymentLinkId: applicant.activeOnboardingPaymentLinkId,
    }));

  if (clearedApplicantPaymentLinkPointers.length > 0) {
    const remainingActivePointers = await tx.paymentLink.findMany({
      where: {
        id: {
          in: clearedApplicantPaymentLinkPointers.map(
            (pointer) => pointer.paymentLinkId,
          ),
        },
        status: "active",
      },
      select: { id: true },
    });
    if (remainingActivePointers.length > 0) {
      throw new WorkbookCutoverBlockedError(
        "A linked Applicant payment capability remained active before archive",
        {
          studentId,
          activePaymentLinkCount: remainingActivePointers.length,
        },
      );
    }
  }

  const tokenMutation =
    activeStatusTokenApplicantIds.length > 0
      ? await tx.applicant.updateMany({
          where: {
            id: { in: activeStatusTokenApplicantIds },
            statusTokenHash: { not: null },
            statusTokenRevokedAt: null,
            OR: [
              { statusTokenExpiresAt: null },
              { statusTokenExpiresAt: { gt: now } },
            ],
          },
          data: {
            statusTokenRevokedAt: now,
            statusTokenExpiresAt: now,
          },
        })
      : { count: 0 };
  const pointerMutation =
    clearedApplicantPaymentLinkPointers.length > 0
      ? await tx.applicant.updateMany({
          where: {
            OR: clearedApplicantPaymentLinkPointers.map((pointer) => ({
              id: pointer.applicantId,
              activeOnboardingPaymentLinkId: pointer.paymentLinkId,
            })),
          },
          data: { activeOnboardingPaymentLinkId: null },
        })
      : { count: 0 };
  if (
    tokenMutation.count !== activeStatusTokenApplicantIds.length ||
    pointerMutation.count !== clearedApplicantPaymentLinkPointers.length
  ) {
    throw new WorkbookCutoverBlockedError(
      "A linked Applicant bearer capability changed during archive",
      {
        studentId,
        expectedStatusTokenRevocations: activeStatusTokenApplicantIds.length,
        actualStatusTokenRevocations: tokenMutation.count,
        expectedPaymentLinkPointerClears:
          clearedApplicantPaymentLinkPointers.length,
        actualPaymentLinkPointerClears: pointerMutation.count,
      },
    );
  }

  return {
    linkedApplicantIds: applicants.map((applicant) => applicant.id),
    statusTokenCapabilityApplicantIds,
    revokedApplicantStatusTokenIds: activeStatusTokenApplicantIds,
    preexistingInactiveApplicantStatusTokenIds,
    clearedApplicantPaymentLinkPointers,
  };
}

async function supersedeStudentFinancialState(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<SupersededFinancialState> {
  const pendingRefund = await tx.payment.findFirst({
    where: { studentId, status: "refund_pending" },
    select: { id: true },
  });
  if (pendingRefund) {
    throw new WorkbookCutoverBlockedError(
      "A refund became pending during cutover confirmation",
      { paymentId: pendingRefund.id },
    );
  }
  const [invoices, payments] = await Promise.all([
    tx.invoice.findMany({
      where: { studentId, status: { not: "void" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        components: {
          orderBy: { id: "asc" },
          include: {
            adjustments: { orderBy: { id: "asc" } },
            installments: { orderBy: { id: "asc" } },
          },
        },
        adjustments: { orderBy: { id: "asc" } },
        plan: {
          include: {
            installments: {
              orderBy: [{ sequence: "asc" }, { id: "asc" }],
              include: {
                components: { orderBy: { id: "asc" } },
                allocations: { orderBy: { id: "asc" } },
              },
            },
          },
        },
      },
    }),
    tx.payment.findMany({
      where: { studentId, status: { in: ["success", "pending"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        allocations: { orderBy: { id: "asc" } },
        componentAllocations: { orderBy: { id: "asc" } },
        submission: true,
        piSpiRequest: true,
      },
    }),
  ]);

  const invoiceSnapshots = invoices.map((invoice) => {
    const snapshot = safeJson(invoice);
    return {
      id: invoice.id,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      snapshot,
      snapshotSha256: sha256(canonicalWorkbookCutoverJson(snapshot)),
    };
  });
  const paymentSnapshots = payments.map((payment) => {
    const snapshot = safeJson(payment);
    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      snapshot,
      snapshotSha256: sha256(canonicalWorkbookCutoverJson(snapshot)),
    };
  });
  const cancelledCapabilities =
    await cancelStudentPaymentCapabilitiesInTransaction(
      tx,
      studentId,
      "Superseded by the signed August 29 workbook cutover baseline",
    );

  if (invoices.length > 0) {
    await tx.invoice.updateMany({
      where: { id: { in: invoices.map((invoice) => invoice.id) } },
      data: { status: "void", revision: { increment: 1 } },
    });
  }
  if (payments.length > 0) {
    await tx.payment.updateMany({
      where: { id: { in: payments.map((payment) => payment.id) } },
      data: { status: "cancelled" },
    });
  }
  return {
    invoices: invoiceSnapshots,
    payments: paymentSnapshots,
    ...cancelledCapabilities,
  };
}

async function createFinancialEvent(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    sourceRecordId: string;
    kind:
      | "invoice_void"
      | "payment_superseded"
      | "new_invoice"
      | "reconstruction_payment"
      | "account_credit";
    objectId: string;
    invoiceId?: string | null;
    paymentId?: string | null;
    replacementInvoiceId?: string | null;
    replacementPaymentId?: string | null;
    originalStatus?: string | null;
    originalAmountXof?: number | null;
    originalPaidXof?: number | null;
    recognizedOn?: Date | null;
    snapshot: Prisma.InputJsonValue;
    snapshotSha256?: string;
  },
): Promise<void> {
  await tx.workbookCutoverFinancialProvenance.create({
    data: {
      batchId: input.batchId,
      sourceRecordId: input.sourceRecordId,
      kind: input.kind,
      invoiceId: input.invoiceId ?? null,
      paymentId: input.paymentId ?? null,
      replacementInvoiceId: input.replacementInvoiceId ?? null,
      replacementPaymentId: input.replacementPaymentId ?? null,
      originalStatus: input.originalStatus ?? null,
      originalAmountXof:
        input.originalAmountXof === undefined ||
        input.originalAmountXof === null
          ? null
          : BigInt(input.originalAmountXof),
      originalPaidXof:
        input.originalPaidXof === undefined || input.originalPaidXof === null
          ? null
          : BigInt(input.originalPaidXof),
      recognizedOn: input.recognizedOn ?? null,
      snapshotJson: input.snapshot,
      snapshotSha256:
        input.snapshotSha256 ??
        sha256(canonicalWorkbookCutoverJson(input.snapshot)),
      eventClaimSha256: eventClaimSha256(
        input.batchId,
        input.sourceRecordId,
        input.kind,
        input.objectId,
      ),
    },
  });
}

function adjustmentDefinitionKey(
  adjustment: WorkbookCutoverManifestRow["financial"]["adjustments"][number],
): string {
  if (adjustment.definitionKey === "three_fpt") return "three_fpt";
  if (adjustment.definitionKey === "reviewed_manual_adjustment") {
    return adjustment.direction === "charge"
      ? "manual_charge"
      : "manual_adjustment";
  }
  return adjustment.definitionKey;
}

function adjustmentBasis(
  basis: "tuition" | "gross_package" | "none",
): "tuition" | "gross_charges" | "manual" {
  return basis === "gross_package"
    ? "gross_charges"
    : basis === "none"
      ? "manual"
      : "tuition";
}

function validateAdjustmentDefinition(
  action: WorkbookActionIncluded,
  adjustment: WorkbookCutoverManifestRow["financial"]["adjustments"][number],
  definition: CatalogContext["adjustmentDefinitions"] extends Map<
    string,
    infer Definition
  >
    ? Definition
    : never,
): void {
  const expectedBasis = adjustmentBasis(adjustment.basis);
  const expectedEffect =
    adjustment.direction === "reduction" ? "discount" : "charge";
  const flexibleManualBasis =
    adjustment.definitionKey === "reviewed_manual_adjustment";
  const commonMismatch =
    !definition.active ||
    (!flexibleManualBasis && definition.basis !== expectedBasis) ||
    definition.stacking !== adjustment.stacking ||
    definition.effect !== expectedEffect ||
    definition.requiresApproval !== adjustment.approvalRequired;
  const configuredCalculationMismatch =
    definition.calculation === "percentage"
      ? adjustment.calculation !== "percentage" ||
        definition.percentageBasisPoints !== adjustment.percentageBps
      : definition.calculation === "fixed"
        ? adjustment.calculation !== "fixed" ||
          definition.fixedAmountXof !== adjustment.amountXof
        : false;
  if (commonMismatch || configuredCalculationMismatch) {
    throw new WorkbookCutoverBlockedError(
      "A reviewed adjustment no longer matches its approved catalog definition",
      {
        sourceKey: action.sourceKey,
        definitionKey: definition.key,
        adjustmentInstanceKey: adjustment.instanceKey,
      },
    );
  }
}

async function applyWorkbookReconstruction(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    sourceRecordId: string;
    row: WorkbookCutoverManifestRow;
    action: WorkbookActionIncluded;
    studentId: string;
    actorId: string;
    manifest: WorkbookCutoverManifest;
    plan: WorkbookCutoverDatabasePlan;
    catalog: CatalogContext;
    evidence: CutoverEvidence;
  },
): Promise<{
  paymentId: string | null;
  activation: EnrollmentActivation | null;
  supersededInvoiceIds: string[];
  supersededPaymentIds: string[];
}> {
  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, personId: true, studentNo: true },
  });
  if (!student) {
    throw new WorkbookCutoverBlockedError(
      "Reviewed Student disappeared inside confirmation",
      { sourceKey: input.action.sourceKey },
    );
  }
  if (
    input.action.disposition === "reconstruct_existing" &&
    (student.personId !== input.action.personId ||
      student.studentNo !== input.action.studentNo)
  ) {
    throw new WorkbookCutoverBlockedError(
      "Reviewed existing Student identity changed inside confirmation",
      { sourceKey: input.action.sourceKey },
    );
  }

  const superseded = await supersedeStudentFinancialState(tx, student.id);
  input.evidence.cancelledPaymentSubmissionIds.push(
    ...superseded.cancelledPaymentSubmissionIds,
  );
  input.evidence.cancelledPaymentLinkIds.push(
    ...superseded.cancelledPaymentLinkIds,
  );
  input.evidence.cancelledPiSpiRequestIds.push(
    ...superseded.cancelledPiSpiRequestIds,
  );
  input.evidence.cancelledPendingPaymentIds.push(
    ...superseded.cancelledPendingPaymentIds,
  );

  const selections = resolveOperationalSelections(input.action, input.catalog);
  const directPaidXof =
    input.action.reconstruction.installmentAllocations.reduce(
      (sum, allocation) => sum + allocation.amountXof,
      0,
    );
  if (
    directPaidXof + input.action.reconstruction.accountCreditXof !==
      input.action.reconstruction.amountPaidXof ||
    directPaidXof > input.action.reconstruction.amountBilledXof
  ) {
    throw new WorkbookCutoverBlockedError(
      "Confirmed paid-to-date reconstruction does not reconcile",
      { sourceKey: input.action.sourceKey },
    );
  }
  const invoiceId = randomUUID();
  const paymentId =
    input.action.reconstruction.amountPaidXof > 0 ? randomUUID() : null;
  const sourceClaim = sourceClaimSha256(
    input.manifest.sourceWorkbook.sha256,
    input.action.sourceKey,
  );
  const invoiceStatus =
    directPaidXof >= input.action.reconstruction.amountBilledXof
      ? "paid"
      : directPaidXof > 0
        ? "partial"
        : "open";
  await tx.invoice.create({
    data: {
      id: invoiceId,
      number: `WB-${sourceClaim.slice(0, 28)}`,
      studentId: student.id,
      termId: input.plan.selectedTerm!.id,
      totalAmount: input.action.reconstruction.amountBilledXof,
      amountPaid: directPaidXof,
      status: invoiceStatus,
      description: "August 29 workbook annual billing baseline",
      costCenterCode: input.catalog.tuition.costCenterCode,
      packageType: "standard_full",
      academicYearLabel: input.manifest.academicYearLabel,
      feeScheduleId: input.plan.selectedFeeSchedule!.id,
      feeScheduleRevision: input.plan.selectedFeeSchedule!.revision,
      paymentPlanOverride: true,
      revision: 1,
    },
  });

  const grossChargesXof = input.action.reconstruction.components.reduce(
    (sum, component) => sum + component.grossAmountXof,
    0,
  );
  const existingProfile = await tx.annualBillingProfile.findUnique({
    where: {
      studentId_academicYearLabel: {
        studentId: student.id,
        academicYearLabel: input.manifest.academicYearLabel,
      },
    },
    select: { id: true, revision: true },
  });
  if (existingProfile) {
    await tx.billingProfileSelection.deleteMany({
      where: { profileId: existingProfile.id },
    });
    await tx.billingProfileAward.deleteMany({
      where: { profileId: existingProfile.id },
    });
  }
  const profile = existingProfile
    ? await tx.annualBillingProfile.update({
        where: { id: existingProfile.id },
        data: {
          status: "active",
          revision: { increment: 1 },
          sourceKind: "workbook",
          sourceWorkbookSha256: input.manifest.sourceWorkbook.sha256,
          sourceSheet: input.row.sourceSheet,
          sourceRowNumber: input.row.sourceRowNumber,
          sourceRowFingerprintSha256: input.row.sourceRecordSha256,
          sourceAsOfDate: dateOnly(input.manifest.sourceAsOfDate),
          feeScheduleId: input.plan.selectedFeeSchedule!.id,
          canonicalInvoiceId: invoiceId,
          grossChargesXof,
          netBilledXof: input.action.reconstruction.amountBilledXof,
          mismatchWarnings: workbookCutoverMismatchWarnings(input.action),
          createdById: input.actorId,
        },
      })
    : await tx.annualBillingProfile.create({
        data: {
          studentId: student.id,
          academicYearLabel: input.manifest.academicYearLabel,
          status: "active",
          revision: 0,
          sourceKind: "workbook",
          sourceWorkbookSha256: input.manifest.sourceWorkbook.sha256,
          sourceSheet: input.row.sourceSheet,
          sourceRowNumber: input.row.sourceRowNumber,
          sourceRowFingerprintSha256: input.row.sourceRecordSha256,
          sourceAsOfDate: dateOnly(input.manifest.sourceAsOfDate),
          feeScheduleId: input.plan.selectedFeeSchedule!.id,
          canonicalInvoiceId: invoiceId,
          grossChargesXof,
          netBilledXof: input.action.reconstruction.amountBilledXof,
          mismatchWarnings: workbookCutoverMismatchWarnings(input.action),
          createdById: input.actorId,
        },
      });
  await tx.billingProfileSelection.createMany({
    data: selections.map((selection) => ({
      profileId: profile.id,
      academicYearLabel: input.manifest.academicYearLabel,
      ...selection,
    })),
  });

  const components: CreatedComponent[] = [];
  for (const planned of input.action.reconstruction.components) {
    const catalogSnapshot = componentCatalogSnapshot(
      planned,
      selections,
      input.catalog,
    );
    const component = await tx.invoiceComponent.create({
      data: {
        invoiceId,
        scheduleComponentId: catalogSnapshot.scheduleComponentId,
        kind: planned.key,
        label: catalogSnapshot.label,
        costCenterCode: catalogSnapshot.costCenterCode,
        grossAmountXof: planned.grossAmountXof,
        amountXof: planned.netAmountXof,
      },
    });
    components.push({
      id: component.id,
      key: planned.key,
      grossAmountXof: planned.grossAmountXof,
      amountXof: planned.netAmountXof,
    });
  }
  const componentByKey = new Map(
    components.map((component) => [component.key, component]),
  );

  const paymentPlan = await tx.paymentPlan.create({
    data: { invoiceId, createdById: input.actorId },
  });
  const paidBySequence = new Map(
    input.action.reconstruction.installmentAllocations.map((allocation) => [
      allocation.sequence,
      allocation.amountXof,
    ]),
  );
  const installments: Array<{
    id: string;
    sequence: number;
    amountDue: number;
  }> = [];
  for (const [
    index,
    planned,
  ] of input.action.reconstruction.installments.entries()) {
    const amountPaid = paidBySequence.get(planned.sequence) ?? 0;
    const dueDate = dateOnly(
      input.action.reconstruction.installmentDueDates[index]!,
    );
    const installment = await tx.installment.create({
      data: {
        planId: paymentPlan.id,
        sequence: planned.sequence,
        label: `Installment ${planned.sequence}`,
        dueDate,
        amountDue: planned.dueXof,
        amountPaid,
        status: projectedInstallmentStatus({
          dueDate,
          amountDue: planned.dueXof,
          amountPaid,
        }),
      },
    });
    installments.push({
      id: installment.id,
      sequence: installment.sequence,
      amountDue: installment.amountDue,
    });
  }
  await tx.installmentComponent.createMany({
    data: installmentComponentGrid(installments, components),
  });

  for (const adjustment of input.action.reconstruction.adjustments) {
    const definitionKey = adjustmentDefinitionKey(adjustment);
    const definition = input.catalog.adjustmentDefinitions.get(definitionKey);
    if (!definition || !definition.active) {
      throw new WorkbookCutoverBlockedError(
        "A reviewed adjustment is absent from the approved catalog",
        { sourceKey: input.action.sourceKey, definitionKey },
      );
    }
    validateAdjustmentDefinition(input.action, adjustment, definition);
    const invoiceAdjustment = await tx.invoiceAdjustment.create({
      data: {
        invoiceId,
        invoiceComponentId:
          (adjustment.targetComponentKey
            ? componentByKey.get(adjustment.targetComponentKey)?.id
            : null) ?? null,
        billingProfileId: profile.id,
        definitionId: definition.id,
        code: adjustment.instanceKey,
        label: adjustment.label,
        source: "workbook",
        basis: adjustmentBasis(adjustment.basis),
        calculation: adjustment.calculation,
        stacking: adjustment.stacking,
        effect: adjustment.direction === "reduction" ? "discount" : "charge",
        basisAmountXof: adjustment.basisAmountXof,
        percentageBasisPoints: adjustment.percentageBps ?? null,
        amountXof: adjustment.amountXof,
        reason: adjustment.review.reason,
        sourceReference: sourceClaim,
        createdById: input.actorId,
      },
    });
    await tx.billingProfileAward.create({
      data: {
        profileId: profile.id,
        definitionId: definition.id,
        definitionKey,
        label: adjustment.label,
        source: "workbook",
        basis: adjustmentBasis(adjustment.basis),
        calculation: adjustment.calculation,
        stacking: adjustment.stacking,
        effect: adjustment.direction === "reduction" ? "discount" : "charge",
        requiresApproval: definition.requiresApproval,
        basisAmountXof: adjustment.basisAmountXof,
        percentageBasisPoints: adjustment.percentageBps ?? null,
        amountXof: adjustment.amountXof,
        reason: adjustment.review.reason,
        invoiceAdjustmentId: invoiceAdjustment.id,
      },
    });
  }

  let creditInvoiceId: string | null = null;
  if (paymentId) {
    await tx.payment.create({
      data: {
        id: paymentId,
        invoiceId,
        studentId: student.id,
        amount: input.action.reconstruction.amountPaidXof,
        method: "legacy_unknown",
        status: "success",
        provider: "workbook_cutover",
        providerRef: `WBC-${sourceClaim}`,
        source: "paid_to_date_workbook",
        initiatedById: input.actorId,
        settledAt: null,
        recognizedOn: dateOnly(input.action.reconstruction.recognizedOn),
        ipnPayload: {
          batchId: input.batchId,
          sourceRecordId: input.sourceRecordId,
          sourceClaimSha256: sourceClaim,
          sourceWorkbookSha256: input.manifest.sourceWorkbook.sha256,
          manifestSha256: input.plan.manifestSha256,
          confirmationPlanSha256: input.plan.planSha256,
          sourceAsOfDate: input.manifest.sourceAsOfDate,
          sourceSheet: input.row.sourceSheet,
          sourceRowNumber: input.row.sourceRowNumber,
          amountBilledXof: input.action.reconstruction.amountBilledXof,
          amountPaidXof: input.action.reconstruction.amountPaidXof,
          accountCreditXof: input.action.reconstruction.accountCreditXof,
        },
      },
    });
    const installmentBySequence = new Map(
      installments.map((installment) => [installment.sequence, installment]),
    );
    if (input.action.reconstruction.installmentAllocations.length > 0) {
      await tx.paymentAllocation.createMany({
        data: input.action.reconstruction.installmentAllocations.map(
          (allocation) => ({
            paymentId,
            installmentId: installmentBySequence.get(allocation.sequence)!.id,
            amount: allocation.amountXof,
          }),
        ),
      });
    }
    if (input.action.reconstruction.componentAllocations.length > 0) {
      await tx.paymentComponentAllocation.createMany({
        data: input.action.reconstruction.componentAllocations.map(
          (allocation) => ({
            paymentId,
            invoiceComponentId: componentByKey.get(allocation.componentKey)!.id,
            amountXof: allocation.amountXof,
          }),
        ),
      });
    }
    await tx.auditLog.create({
      data: {
        entity: "Payment",
        entityId: paymentId,
        action: "workbook-cutover-reconstructed",
        actorId: input.actorId,
        data: {
          batchId: input.batchId,
          sourceRecordId: input.sourceRecordId,
          sourceClaimSha256: sourceClaim,
        },
      },
    });
    if (input.action.reconstruction.accountCreditXof > 0) {
      const credit = await tx.invoice.create({
        data: {
          number: `CR-PAY-${paymentId}`,
          studentId: student.id,
          termId: input.plan.selectedTerm!.id,
          totalAmount: -input.action.reconstruction.accountCreditXof,
          amountPaid: 0,
          status: "paid",
          description: `Reviewed August 29 workbook account credit — ${sourceClaim.slice(0, 12)}`,
          costCenterCode: input.catalog.tuition.costCenterCode,
          packageType: "credit",
          academicYearLabel: input.manifest.academicYearLabel,
        },
      });
      creditInvoiceId = credit.id;
    }
  }

  const linkedApplicant = await tx.applicant.findUnique({
    where: { studentId: student.id },
    select: { id: true, enrollmentInvoiceId: true },
  });
  if (linkedApplicant) {
    await tx.applicant.update({
      where: { id: linkedApplicant.id },
      data: { enrollmentInvoiceId: invoiceId },
    });
  }

  await syncBillingProfileOperationsInTransaction(tx, {
    studentId: student.id,
    profileId: profile.id,
    academicYearLabel: input.manifest.academicYearLabel,
    selections,
  });
  const gate = await syncEnrollmentGateInTransaction(tx, {
    invoiceId,
    paymentId: paymentId ?? undefined,
    actorId: input.actorId,
    inFlightRotationPolicy: "preserve",
  });
  if (gate?.activation) {
    input.evidence.activationApplicantIds.push(gate.activation.applicantId);
  }

  for (const old of superseded.invoices) {
    await createFinancialEvent(tx, {
      batchId: input.batchId,
      sourceRecordId: input.sourceRecordId,
      kind: "invoice_void",
      objectId: old.id,
      invoiceId: old.id,
      replacementInvoiceId: invoiceId,
      originalStatus: old.status,
      originalAmountXof: old.totalAmount,
      originalPaidXof: old.amountPaid,
      snapshot: old.snapshot,
      snapshotSha256: old.snapshotSha256,
    });
  }
  for (const old of superseded.payments) {
    await createFinancialEvent(tx, {
      batchId: input.batchId,
      sourceRecordId: input.sourceRecordId,
      kind: "payment_superseded",
      objectId: old.id,
      paymentId: old.id,
      replacementInvoiceId: invoiceId,
      replacementPaymentId: paymentId,
      originalStatus: old.status,
      originalAmountXof: old.amount,
      snapshot: old.snapshot,
      snapshotSha256: old.snapshotSha256,
    });
  }
  const reconstructionSnapshot = safeJson({
    invoiceId,
    profileId: profile.id,
    paymentId,
    creditInvoiceId,
    reconstruction: input.action.reconstruction,
  });
  await createFinancialEvent(tx, {
    batchId: input.batchId,
    sourceRecordId: input.sourceRecordId,
    kind: "new_invoice",
    objectId: invoiceId,
    invoiceId,
    snapshot: reconstructionSnapshot,
  });
  if (paymentId) {
    await createFinancialEvent(tx, {
      batchId: input.batchId,
      sourceRecordId: input.sourceRecordId,
      kind: "reconstruction_payment",
      objectId: paymentId,
      paymentId,
      recognizedOn: dateOnly(input.action.reconstruction.recognizedOn),
      snapshot: safeJson({
        paymentId,
        invoiceId,
        amountXof: input.action.reconstruction.amountPaidXof,
        directAppliedXof: directPaidXof,
        accountCreditXof: input.action.reconstruction.accountCreditXof,
        sourceClaimSha256: sourceClaim,
      }),
    });
  }
  if (creditInvoiceId) {
    await createFinancialEvent(tx, {
      batchId: input.batchId,
      sourceRecordId: input.sourceRecordId,
      kind: "account_credit",
      objectId: creditInvoiceId,
      invoiceId: creditInvoiceId,
      recognizedOn: dateOnly(input.action.reconstruction.recognizedOn),
      snapshot: safeJson({
        creditInvoiceId,
        paymentId,
        amountXof: input.action.reconstruction.accountCreditXof,
        sourceClaimSha256: sourceClaim,
      }),
    });
  }
  await tx.workbookCutoverSourceRecord.update({
    where: { id: input.sourceRecordId },
    data: {
      studentId: student.id,
      billingProfileId: profile.id,
      canonicalInvoiceId: invoiceId,
      reconstructionPaymentId: paymentId,
      appliedAt: new Date(),
    },
  });
  return {
    paymentId,
    activation: gate?.activation ?? null,
    supersededInvoiceIds: superseded.invoices.map((row) => row.id),
    supersededPaymentIds: superseded.payments.map((row) => row.id),
  };
}

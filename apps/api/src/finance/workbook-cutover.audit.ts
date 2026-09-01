import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@mydaust/db";
import {
  WORKBOOK_CUTOVER_BASELINE,
  WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF,
  canonicalWorkbookCutoverJson,
  workbookCutoverAcademicFingerprintDigest,
} from "./workbook-cutover.manifest.js";
import { captureWorkbookCutoverAcademicFingerprints } from "./workbook-cutover.snapshot.js";
import { WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256 } from "./workbook-cutover-attestation.service.js";

export const WORKBOOK_CUTOVER_BATCH_AUDIT = {
  entity: "WorkbookCutoverBatch",
  action: "imported",
} as const;

export const WORKBOOK_CUTOVER_PAYMENT_AUDIT = {
  entity: "Payment",
  action: "workbook-cutover-reconstructed",
} as const;

export const WORKBOOK_CUTOVER_ARCHIVE_AUDIT = {
  entity: "Student",
  action: "student-archived-access-revoked",
} as const;

export interface WorkbookCutoverAcademicFingerprint {
  transcriptCount: number;
  transcriptSha256: string;
  enrollmentCount: number;
  enrollmentSha256: string;
  gradeSnapshotCount: number;
  gradeSnapshotSha256: string;
  creditsSha256: string;
  gpaSha256: string;
}

export interface WorkbookCutoverBatchAuditResult {
  batchId: string;
  ok: true;
  sourceRecords: number;
  workbookRows: number;
  productionStudents: number;
  applicants: number;
  includedWorkbookRows: number;
  excludedWorkbookRows: number;
  sourceBilledXof: number;
  sourcePaidXof: number;
  includedBilledXof: number;
  includedPaidXof: number;
  excludedBilledXof: number;
  excludedPaidXof: number;
  canonicalInvoices: number;
  reconstructionPayments: number;
  archivedStudents: number;
  preservedAcademicRecords: number;
  preservedApplicants: number;
  voidedInvoices: number;
  supersededPayments: number;
  cancelledInFlightAttempts: number;
  paymentAuditRows: number;
  reviewerAttestations: number;
  batchAuditRows: 1;
  enrollmentActivations: number;
  activationAuditRows: number;
  replayAnchorBatchCount: 1;
  replayAnchorManifestCount: 1;
}

type AcademicClient = Pick<PrismaClient, "student">;

type AcademicEvidence = WorkbookCutoverAcademicFingerprint & {
  studentId: string;
  personId: string;
  academicFingerprintSha256: string;
};

const batchInclude = {
  sourceRecords: {
    orderBy: [{ sourceKind: "asc" }, { sourceKey: "asc" }],
    include: {
      student: { include: { person: true, housingAssignments: true } },
      applicant: true,
      linkedWorkbookRecord: true,
      duplicateOfRecord: true,
      billingProfile: {
        include: {
          selections: {
            include: { serviceOption: true, percentageBasisOption: true },
          },
          awards: { include: { invoiceAdjustment: true } },
          mealPlan: true,
        },
      },
      canonicalInvoice: {
        include: {
          components: { include: { adjustments: true } },
          adjustments: true,
          plan: {
            include: {
              installments: {
                include: { components: true, allocations: true },
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      },
      reconstructionPayment: {
        include: {
          allocations: { include: { installment: true } },
          componentAllocations: { include: { invoiceComponent: true } },
        },
      },
      financialProvenance: {
        include: {
          invoice: {
            include: {
              components: {
                include: { adjustments: true, installments: true },
              },
              adjustments: true,
              plan: {
                include: {
                  installments: {
                    include: { components: true, allocations: true },
                  },
                },
              },
            },
          },
          payment: {
            include: { allocations: true, componentAllocations: true },
          },
          replacementInvoice: true,
          replacementPayment: true,
        },
      },
    },
  },
} satisfies Prisma.WorkbookCutoverBatchInclude;

type AuditedBatch = Prisma.WorkbookCutoverBatchGetPayload<{
  include: typeof batchInclude;
}>;
type SourceRecord = AuditedBatch["sourceRecords"][number];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Workbook cutover post-audit failed: ${message}`);
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeXof(value: bigint, label: string): number {
  const converted = Number(value);
  assert(
    Number.isSafeInteger(converted),
    `${label} exceeds safe whole-XOF bounds`,
  );
  return converted;
}

function sum(values: readonly number[], label: string): number {
  const total = values.reduce((accumulator, value) => accumulator + value, 0);
  assert(Number.isSafeInteger(total), `${label} exceeds safe whole-XOF bounds`);
  return total;
}

function dateKey(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function canonicalHash(value: unknown): string {
  return sha256(canonicalWorkbookCutoverJson(value));
}

/**
 * Canonical academic evidence shared by the confirming runner and independent
 * post-audit. It deliberately hashes stable row IDs and every academic value;
 * the cutover has no reason to mutate any of these rows.
 */
export async function captureWorkbookCutoverAcademicFingerprint(
  prisma: AcademicClient,
  studentId: string,
): Promise<WorkbookCutoverAcademicFingerprint> {
  const [captured] = await captureWorkbookCutoverAcademicFingerprints(prisma, [
    studentId,
  ]);
  assert(captured, `Student ${studentId} is missing during academic audit`);
  return captured.academicFingerprint;
}

interface ImportedBatchEvidence {
  activations: number;
  activationApplicantIds: string[];
  academicFingerprints: AcademicEvidence[];
  originalProductionStudentIds: string[];
  originalApplicantIds: string[];
  supersededInvoiceIds: string[];
  supersededPaymentIds: string[];
  cancelledPaymentSubmissionIds: string[];
  cancelledPaymentLinkIds: string[];
  cancelledPiSpiRequestIds: string[];
  cancelledPendingPaymentIds: string[];
  archivedCapabilityCancellations: ArchivedCapabilityCancellationEvidence[];
  reviewerAttestationIds: string[];
}

interface ArchivedCapabilityCancellationEvidence {
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
}

function evidenceRoot(data: unknown): Record<string, unknown> {
  const root = jsonObject(data);
  assert(root, "batch audit data is missing");
  return jsonObject(root.postAuditEvidence) ?? root;
}

function stringArray(object: Record<string, unknown>, key: string): string[] {
  const values = jsonArray(object[key]);
  assert(values, `batch audit ${key} evidence is missing`);
  assert(
    values.every((value) => typeof value === "string" && value.length > 0),
    `batch audit ${key} evidence is invalid`,
  );
  const strings = values as string[];
  assert(
    new Set(strings).size === strings.length,
    `batch audit ${key} repeats an ID`,
  );
  return strings;
}

function applicantPaymentLinkPointers(
  object: Record<string, unknown>,
): Array<{ applicantId: string; paymentLinkId: string }> {
  const values = jsonArray(object.clearedApplicantPaymentLinkPointers);
  assert(
    values,
    "batch audit cleared Applicant payment-link pointer evidence is missing",
  );
  const pointers = values.map((value) => {
    const pointer = jsonObject(value);
    assert(
      pointer &&
        typeof pointer.applicantId === "string" &&
        pointer.applicantId.length > 0 &&
        typeof pointer.paymentLinkId === "string" &&
        pointer.paymentLinkId.length > 0,
      "batch audit cleared Applicant payment-link pointer evidence is invalid",
    );
    return {
      applicantId: pointer.applicantId,
      paymentLinkId: pointer.paymentLinkId,
    };
  });
  assert(
    new Set(pointers.map((pointer) => pointer.applicantId)).size ===
      pointers.length &&
      new Set(pointers.map((pointer) => pointer.paymentLinkId)).size ===
        pointers.length,
    "batch audit cleared Applicant payment-link pointer evidence repeats an ID",
  );
  return pointers;
}

function academicFingerprintFromJson(
  raw: Record<string, unknown>,
): WorkbookCutoverAcademicFingerprint {
  const nested = jsonObject(raw.academicFingerprint) ?? raw;
  const integer = (key: keyof WorkbookCutoverAcademicFingerprint): number => {
    const value = nested[key];
    assert(
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
      `academic evidence ${key} is invalid`,
    );
    return value;
  };
  const digest = (key: keyof WorkbookCutoverAcademicFingerprint): string => {
    const value = nested[key];
    assert(
      typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
      `academic evidence ${key} is invalid`,
    );
    return value;
  };
  return {
    transcriptCount: integer("transcriptCount"),
    transcriptSha256: digest("transcriptSha256"),
    enrollmentCount: integer("enrollmentCount"),
    enrollmentSha256: digest("enrollmentSha256"),
    gradeSnapshotCount: integer("gradeSnapshotCount"),
    gradeSnapshotSha256: digest("gradeSnapshotSha256"),
    creditsSha256: digest("creditsSha256"),
    gpaSha256: digest("gpaSha256"),
  };
}

function parseImportedBatchEvidence(data: unknown): ImportedBatchEvidence {
  const root = evidenceRoot(data);
  const activations = root.activations;
  assert(
    typeof activations === "number" &&
      Number.isSafeInteger(activations) &&
      activations >= 0,
    "batch audit activation count is invalid",
  );
  const rawAcademic = jsonArray(root.academicFingerprints);
  assert(rawAcademic, "batch audit academic fingerprint evidence is missing");
  const academicFingerprints = rawAcademic.map((value) => {
    const object = jsonObject(value);
    assert(object, "batch audit academic fingerprint evidence is invalid");
    assert(
      typeof object.studentId === "string" && object.studentId.length > 0,
      "academic evidence Student ID is invalid",
    );
    assert(
      typeof object.personId === "string" && object.personId.length > 0,
      "academic evidence Person ID is invalid",
    );
    assert(
      typeof object.academicFingerprintSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(object.academicFingerprintSha256),
      "academic evidence aggregate SHA is invalid",
    );
    return {
      studentId: object.studentId,
      personId: object.personId,
      academicFingerprintSha256: object.academicFingerprintSha256,
      ...academicFingerprintFromJson(object),
    };
  });
  assert(
    new Set(academicFingerprints.map((row) => row.studentId)).size ===
      academicFingerprints.length,
    "batch audit academic evidence repeats a Student",
  );
  const rawArchiveCancellations = jsonArray(
    root.archivedCapabilityCancellations,
  );
  assert(
    rawArchiveCancellations,
    "batch audit archived capability evidence is missing",
  );
  const archivedCapabilityCancellations = rawArchiveCancellations.map(
    (value) => {
      const object = jsonObject(value);
      assert(object, "batch audit archived capability evidence is invalid");
      assert(
        typeof object.studentId === "string" && object.studentId.length > 0,
        "archived capability evidence Student ID is invalid",
      );
      assert(
        typeof object.sourceRecordId === "string" &&
          object.sourceRecordId.length > 0,
        "archived capability evidence source record ID is invalid",
      );
      return {
        studentId: object.studentId,
        sourceRecordId: object.sourceRecordId,
        cancelledPaymentSubmissionIds: stringArray(
          object,
          "cancelledPaymentSubmissionIds",
        ),
        cancelledPaymentLinkIds: stringArray(object, "cancelledPaymentLinkIds"),
        cancelledPiSpiRequestIds: stringArray(
          object,
          "cancelledPiSpiRequestIds",
        ),
        cancelledPendingPaymentIds: stringArray(
          object,
          "cancelledPendingPaymentIds",
        ),
        linkedApplicantIds: stringArray(object, "linkedApplicantIds"),
        statusTokenCapabilityApplicantIds: stringArray(
          object,
          "statusTokenCapabilityApplicantIds",
        ),
        revokedApplicantStatusTokenIds: stringArray(
          object,
          "revokedApplicantStatusTokenIds",
        ),
        preexistingInactiveApplicantStatusTokenIds: stringArray(
          object,
          "preexistingInactiveApplicantStatusTokenIds",
        ),
        clearedApplicantPaymentLinkPointers:
          applicantPaymentLinkPointers(object),
      };
    },
  );
  assert(
    new Set(archivedCapabilityCancellations.map((row) => row.sourceRecordId))
      .size === archivedCapabilityCancellations.length &&
      new Set(archivedCapabilityCancellations.map((row) => row.studentId))
        .size === archivedCapabilityCancellations.length,
    "batch audit archived capability evidence repeats a source record or Student",
  );
  return {
    activations,
    activationApplicantIds: stringArray(root, "activationApplicantIds"),
    academicFingerprints,
    originalProductionStudentIds: stringArray(
      root,
      "originalProductionStudentIds",
    ),
    originalApplicantIds: stringArray(root, "originalApplicantIds"),
    supersededInvoiceIds: stringArray(root, "supersededInvoiceIds"),
    supersededPaymentIds: stringArray(root, "supersededPaymentIds"),
    cancelledPaymentSubmissionIds: stringArray(
      root,
      "cancelledPaymentSubmissionIds",
    ),
    cancelledPaymentLinkIds: stringArray(root, "cancelledPaymentLinkIds"),
    cancelledPiSpiRequestIds: stringArray(root, "cancelledPiSpiRequestIds"),
    cancelledPendingPaymentIds: stringArray(root, "cancelledPendingPaymentIds"),
    archivedCapabilityCancellations,
    reviewerAttestationIds: stringArray(root, "reviewerAttestationIds"),
  };
}

async function auditReviewerAttestations(input: {
  prisma: PrismaClient;
  batch: AuditedBatch;
  attestationIds: readonly string[];
}): Promise<number> {
  const reviewerIds = [
    ...new Set(input.batch.sourceRecords.map((record) => record.reviewedById!)),
  ].sort();
  assert(
    reviewerIds.length > 0 &&
      input.attestationIds.length === reviewerIds.length,
    "reviewer attestation evidence does not cover every distinct signed reviewer",
  );
  const attestations =
    await input.prisma.workbookCutoverReviewerAttestation.findMany({
      where: { id: { in: [...input.attestationIds] } },
      select: {
        id: true,
        manifestSha256: true,
        reviewerId: true,
        reviewerEmailNormalized: true,
        authorizedRoles: true,
        statementSha256: true,
        attestedAt: true,
        revokedAt: true,
      },
      orderBy: [{ reviewerId: "asc" }, { id: "asc" }],
    });
  assert(
    attestations.length === input.attestationIds.length &&
      canonicalWorkbookCutoverJson(attestations.map((row) => row.id).sort()) ===
        canonicalWorkbookCutoverJson([...input.attestationIds].sort()) &&
      canonicalWorkbookCutoverJson(
        attestations.map((row) => row.reviewerId).sort(),
      ) === canonicalWorkbookCutoverJson(reviewerIds),
    "reviewer attestation IDs or reviewer bindings differ from imported evidence",
  );
  for (const attestation of attestations) {
    assert(
      attestation.manifestSha256 === input.batch.identityManifestSha256 &&
        attestation.statementSha256 ===
          WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256 &&
        /^[^@\s]+@[^@\s]+$/.test(attestation.reviewerEmailNormalized) &&
        attestation.reviewerEmailNormalized ===
          attestation.reviewerEmailNormalized.trim().toLowerCase() &&
        attestation.authorizedRoles.some((role) =>
          ["admin", "bursar", "registrar", "admissions"].includes(role),
        ) &&
        attestation.attestedAt.getTime() <= input.batch.importedAt!.getTime() &&
        (attestation.revokedAt === null ||
          attestation.revokedAt.getTime() >= input.batch.importedAt!.getTime()),
      "a reviewer attestation was absent, stale, revoked, or identity-invalid at cutover confirmation",
    );
  }
  return attestations.length;
}

function auditBatchAnchors(
  batch: AuditedBatch,
  data: unknown,
  groups: ReturnType<typeof dispositionCounts>,
): void {
  const root = jsonObject(data);
  assert(root, "batch audit data is missing");
  assert(
    root.sourceWorkbookSha256 === batch.sourceWorkbookSha256 &&
      root.sourceExtractionSha256 === batch.sourceExtractionSha256 &&
      root.rosterSnapshotSha256 === batch.rosterSnapshotSha256 &&
      root.manifestSha256 === batch.identityManifestSha256 &&
      root.confirmationPlanSha256 === batch.confirmationPlanSha256 &&
      root.sourceAsOfDate === dateKey(batch.sourceAsOfDate) &&
      typeof root.liveSnapshotSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(root.liveSnapshotSha256) &&
      typeof root.billingCatalogFingerprintSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(root.billingCatalogFingerprintSha256),
    "batch source, extraction, roster, manifest, plan, or live-state anchor differs",
  );
  const controls = jsonObject(root.controls);
  assert(controls, "batch audit control evidence is missing");
  const expectedControls = {
    workbookRows: batch.workbookRowCount,
    productionStudents: batch.productionStudentCount,
    applicants: batch.applicantCount,
    sourceBilledXof: safeXof(batch.sourceBilledXof, "source billed"),
    sourcePaidXof: safeXof(batch.sourcePaidXof, "source paid"),
    includedRows: groups.included.length,
    includedBilledXof: safeXof(batch.includedBilledXof, "included billed"),
    includedPaidXof: safeXof(batch.includedPaidXof, "included paid"),
    reviewedExclusionRows: groups.excluded.length,
    reviewedExclusionBilledXof: safeXof(
      batch.excludedBilledXof,
      "excluded billed",
    ),
    reviewedExclusionPaidXof: safeXof(batch.excludedPaidXof, "excluded paid"),
    heldRows: 0,
    heldBilledXof: 0,
    heldPaidXof: 0,
    archiveStudents: groups.archived.length,
    keepExceptionStudents: groups.production.filter(
      (record) => record.disposition === "keep_exception",
    ).length,
    preserveApplicants: groups.applicants.length,
    reconciles: true,
  };
  for (const [key, value] of Object.entries(expectedControls)) {
    assert(
      controls[key] === value,
      `batch control ${key} differs from persisted source dispositions`,
    );
  }
  assert(
    typeof controls.accountCreditXof === "number" &&
      Number.isSafeInteger(controls.accountCreditXof) &&
      controls.accountCreditXof >= 0,
    "batch control accountCreditXof is invalid",
  );
}

function dispositionCounts(batch: AuditedBatch): {
  workbook: SourceRecord[];
  production: SourceRecord[];
  applicants: SourceRecord[];
  included: SourceRecord[];
  excluded: SourceRecord[];
  archived: SourceRecord[];
} {
  const workbook = batch.sourceRecords.filter(
    (record) => record.sourceKind === "workbook_row",
  );
  const production = batch.sourceRecords.filter(
    (record) => record.sourceKind === "production_student",
  );
  const applicants = batch.sourceRecords.filter(
    (record) => record.sourceKind === "applicant",
  );
  const included = workbook.filter(
    (record) =>
      record.disposition === "link_existing_student" ||
      record.disposition === "create_student",
  );
  const excluded = workbook.filter(
    (record) => record.disposition === "reviewed_duplicate",
  );
  const archived = production.filter(
    (record) => record.disposition === "archive_student",
  );
  return { workbook, production, applicants, included, excluded, archived };
}

function auditSourceConservation(
  batch: AuditedBatch,
): ReturnType<typeof dispositionCounts> {
  assert(batch.status === "imported", "batch is not imported");
  assert(batch.importedAt !== null, "imported batch has no imported timestamp");
  const groups = dispositionCounts(batch);
  assert(
    groups.workbook.length === batch.workbookRowCount &&
      groups.workbook.length === WORKBOOK_CUTOVER_BASELINE.workbookRows,
    "workbook source count differs",
  );
  assert(
    groups.production.length === batch.productionStudentCount &&
      groups.production.length === WORKBOOK_CUTOVER_BASELINE.productionStudents,
    "production Student source count differs",
  );
  assert(
    groups.applicants.length === batch.applicantCount &&
      groups.applicants.length === WORKBOOK_CUTOVER_BASELINE.currentApplicants,
    "Applicant source count differs",
  );
  assert(
    batch.sourceRecords.length ===
      batch.workbookRowCount +
        batch.productionStudentCount +
        batch.applicantCount,
    "source records are not conserved exactly once",
  );
  assert(
    new Set(
      batch.sourceRecords.map(
        (record) => `${record.sourceKind}:${record.sourceKey}`,
      ),
    ).size === batch.sourceRecords.length,
    "a source key is assigned more than once",
  );
  for (const record of batch.sourceRecords) {
    assert(
      record.disposition !== null,
      `${record.sourceKey} has no disposition`,
    );
    assert(record.appliedAt !== null, `${record.sourceKey} was not applied`);
    assert(
      record.reviewedById !== null &&
        record.reviewedAt !== null &&
        record.reviewReason !== null &&
        record.reviewSignatureSha256 !== null,
      `${record.sourceKey} lacks a signed disposition`,
    );
    assert(
      record.sourceKeySha256 === sha256(record.sourceKey),
      `${record.sourceKey} source-key hash differs`,
    );
    assert(
      /^[a-f0-9]{64}$/.test(record.sourceFingerprintSha256),
      `${record.sourceKey} source fingerprint is invalid`,
    );
  }

  const workbookLinked = groups.workbook.filter(
    (record) => record.disposition === "link_existing_student",
  );
  const workbookCreated = groups.workbook.filter(
    (record) => record.disposition === "create_student",
  );
  assert(
    workbookLinked.length === batch.workbookLinkedRows &&
      workbookCreated.length === batch.workbookCreatedRows &&
      groups.excluded.length === batch.workbookDuplicateRows,
    "workbook disposition counters differ",
  );
  const productionLinked = groups.production.filter(
    (record) => record.disposition === "link_workbook_row",
  );
  const productionKept = groups.production.filter(
    (record) => record.disposition === "keep_exception",
  );
  assert(
    productionLinked.length === batch.productionLinkedStudents &&
      productionKept.length === batch.productionKeptStudents &&
      groups.archived.length === batch.productionArchivedStudents,
    "production Student disposition counters differ",
  );
  assert(
    groups.applicants.every(
      (record) => record.disposition === "preserve_applicant",
    ) && groups.applicants.length === batch.preservedApplicants,
    "Applicant preservation counters differ",
  );

  for (const record of productionLinked) {
    assert(
      record.linkedWorkbookRecord?.sourceKind === "workbook_row" &&
        record.linkedWorkbookRecord.studentId === record.studentId &&
        record.linkedWorkbookRecord.disposition === "link_existing_student",
      `${record.sourceKey} lacks a reciprocal workbook link`,
    );
  }
  for (const record of workbookLinked) {
    const reciprocal = productionLinked.filter(
      (productionRecord) =>
        productionRecord.linkedWorkbookRecordId === record.id &&
        productionRecord.studentId === record.studentId,
    );
    assert(
      reciprocal.length === 1,
      `${record.sourceKey} lacks exactly one reciprocal production Student link`,
    );
  }
  const originalStudentIds = new Set(
    groups.production.map((record) => record.studentId),
  );
  for (const record of workbookCreated) {
    assert(
      record.studentId !== null &&
        !originalStudentIds.has(record.studentId) &&
        record.student !== null &&
        record.student.person.email?.endsWith("@mydaust.com") === true &&
        record.student.person.passwordHash !== null &&
        record.student.person.mustChangePassword &&
        record.student.person.roles.includes("student") &&
        record.student.person.status === "active",
      `${record.sourceKey} new Student identity or access invariants differ`,
    );
  }
  for (const record of groups.excluded) {
    assert(
      record.duplicateOfRecord?.sourceKind === "workbook_row" &&
        record.duplicateOfRecord.disposition !== "reviewed_duplicate",
      `${record.sourceKey} lacks a canonical workbook duplicate target`,
    );
    assert(
      record.billingProfileId === null &&
        record.canonicalInvoiceId === null &&
        record.reconstructionPaymentId === null,
      `${record.sourceKey} duplicate created financial records`,
    );
  }

  const includedBilledXof = sum(
    groups.included.map((record) =>
      safeXof(record.sourceBilledXof!, "included bill"),
    ),
    "included billed controls",
  );
  const includedPaidXof = sum(
    groups.included.map((record) =>
      safeXof(record.sourcePaidXof!, "included paid"),
    ),
    "included paid controls",
  );
  const excludedBilledXof = sum(
    groups.excluded.map((record) =>
      safeXof(record.sourceBilledXof!, "excluded bill"),
    ),
    "excluded billed controls",
  );
  const excludedPaidXof = sum(
    groups.excluded.map((record) =>
      safeXof(record.sourcePaidXof!, "excluded paid"),
    ),
    "excluded paid controls",
  );
  const positivePaymentRows = groups.workbook.filter(
    (record) => safeXof(record.sourcePaidXof!, "source paid") > 0,
  ).length;
  assert(
    positivePaymentRows === WORKBOOK_CUTOVER_BASELINE.positivePaymentRows &&
      groups.workbook.length - positivePaymentRows ===
        WORKBOOK_CUTOVER_BASELINE.zeroPaymentRows,
    "positive/zero payment row controls differ",
  );
  assert(
    safeXof(batch.sourceBilledXof, "source billed") ===
      WORKBOOK_CUTOVER_BASELINE.billedXof &&
      safeXof(batch.sourcePaidXof, "source paid") ===
        WORKBOOK_CUTOVER_BASELINE.paidXof,
    "immutable workbook monetary controls differ",
  );
  assert(
    includedBilledXof ===
      safeXof(batch.includedBilledXof, "batch included bill") &&
      includedPaidXof ===
        safeXof(batch.includedPaidXof, "batch included paid") &&
      excludedBilledXof ===
        safeXof(batch.excludedBilledXof, "batch excluded bill") &&
      excludedPaidXof ===
        safeXof(batch.excludedPaidXof, "batch excluded paid") &&
      includedBilledXof + excludedBilledXof ===
        WORKBOOK_CUTOVER_BASELINE.billedXof &&
      includedPaidXof + excludedPaidXof === WORKBOOK_CUTOVER_BASELINE.paidXof,
    "included plus reviewed exclusions do not reconcile to workbook controls",
  );
  return groups;
}

interface IncludedFinancialAudit {
  appliedToInvoiceXof: number;
  accountCreditXof: number;
  voidedInvoices: number;
  supersededPayments: number;
}

function events(
  record: SourceRecord,
  kind: SourceRecord["financialProvenance"][number]["kind"],
) {
  return record.financialProvenance.filter((event) => event.kind === kind);
}

function auditProvenanceSnapshot(record: SourceRecord): void {
  const claims = new Set<string>();
  for (const event of record.financialProvenance) {
    assert(
      event.snapshotSha256 === canonicalHash(event.snapshotJson),
      `${record.sourceKey} has changed financial provenance evidence`,
    );
    assert(
      /^[a-f0-9]{64}$/.test(event.eventClaimSha256) &&
        !claims.has(event.eventClaimSha256),
      `${record.sourceKey} has invalid or repeated event provenance`,
    );
    claims.add(event.eventClaimSha256);
  }
}

function expectedJsonRows(
  object: Record<string, unknown>,
  key: string,
  sourceKey: string,
): Record<string, unknown>[] {
  const values = jsonArray(object[key]);
  assert(values, `${sourceKey} provenance snapshot ${key} is missing`);
  return values.map((value) => {
    const row = jsonObject(value);
    assert(row, `${sourceKey} provenance snapshot ${key} row is invalid`);
    return row;
  });
}

function selectJsonFields(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function sortedJsonRows(rows: readonly Record<string, unknown>[]) {
  return [...rows].sort((left, right) =>
    String(left.id ?? "").localeCompare(String(right.id ?? "")),
  );
}

function auditRetainedInvoiceChildren(
  sourceKey: string,
  snapshot: Record<string, unknown>,
  invoice: NonNullable<SourceRecord["financialProvenance"][number]["invoice"]>,
): void {
  const componentFields = [
    "id",
    "scheduleComponentId",
    "kind",
    "label",
    "costCenterCode",
    "grossAmountXof",
    "amountXof",
  ] as const;
  const adjustmentFields = [
    "id",
    "invoiceComponentId",
    "billingProfileId",
    "definitionId",
    "code",
    "label",
    "source",
    "basis",
    "calculation",
    "stacking",
    "effect",
    "basisAmountXof",
    "percentageBasisPoints",
    "amountXof",
    "reason",
    "sourceReference",
    "approvalRequestId",
    "createdById",
  ] as const;
  const expectedComponents = sortedJsonRows(
    expectedJsonRows(snapshot, "components", sourceKey).map((row) =>
      selectJsonFields(row, componentFields),
    ),
  );
  const actualComponents = sortedJsonRows(
    invoice.components.map((row) => selectJsonFields(row, componentFields)),
  );
  const expectedAdjustments = sortedJsonRows(
    expectedJsonRows(snapshot, "adjustments", sourceKey).map((row) =>
      selectJsonFields(row, adjustmentFields),
    ),
  );
  const actualAdjustments = sortedJsonRows(
    invoice.adjustments.map((row) => selectJsonFields(row, adjustmentFields)),
  );
  assert(
    canonicalWorkbookCutoverJson(expectedComponents) ===
      canonicalWorkbookCutoverJson(actualComponents) &&
      canonicalWorkbookCutoverJson(expectedAdjustments) ===
        canonicalWorkbookCutoverJson(actualAdjustments),
    `${sourceKey} old invoice components or adjustments changed`,
  );
  const expectedPlan = jsonObject(snapshot.plan);
  if (!expectedPlan) {
    assert(
      invoice.plan === null,
      `${sourceKey} old invoice gained a payment plan`,
    );
    return;
  }
  assert(invoice.plan, `${sourceKey} old invoice payment plan was deleted`);
  const expectedInstallments = expectedJsonRows(
    expectedPlan,
    "installments",
    sourceKey,
  );
  assert(
    expectedInstallments.length === invoice.plan.installments.length,
    `${sourceKey} old invoice installment rows were deleted`,
  );
  const actualById = new Map(
    invoice.plan.installments.map((row) => [row.id, row]),
  );
  for (const expected of expectedInstallments) {
    const actual = actualById.get(String(expected.id));
    assert(
      actual,
      `${sourceKey} old invoice installment ${String(expected.id)} is missing`,
    );
    assert(
      expected.sequence === actual.sequence &&
        expected.label === actual.label &&
        expected.dueDate === actual.dueDate.toISOString() &&
        expected.amountDue === actual.amountDue &&
        expected.amountPaid === actual.amountPaid &&
        expected.status === actual.status,
      `${sourceKey} old invoice installment ${actual.id} changed`,
    );
    const expectedComponents = expectedJsonRows(
      expected,
      "components",
      sourceKey,
    ).map((row) =>
      selectJsonFields(row, ["id", "invoiceComponentId", "amountDue"]),
    );
    const actualComponents = actual.components.map((row) =>
      selectJsonFields(row, ["id", "invoiceComponentId", "amountDue"]),
    );
    const expectedAllocations = expectedJsonRows(
      expected,
      "allocations",
      sourceKey,
    ).map((row) => selectJsonFields(row, ["id", "paymentId", "amount"]));
    const actualAllocations = actual.allocations.map((row) =>
      selectJsonFields(row, ["id", "paymentId", "amount"]),
    );
    assert(
      canonicalWorkbookCutoverJson(sortedJsonRows(expectedComponents)) ===
        canonicalWorkbookCutoverJson(sortedJsonRows(actualComponents)) &&
        canonicalWorkbookCutoverJson(sortedJsonRows(expectedAllocations)) ===
          canonicalWorkbookCutoverJson(sortedJsonRows(actualAllocations)),
      `${sourceKey} old installment allocations or component cells changed`,
    );
  }
}

function auditRetainedPaymentChildren(
  sourceKey: string,
  snapshot: Record<string, unknown>,
  payment: NonNullable<SourceRecord["financialProvenance"][number]["payment"]>,
): void {
  const expectedAllocations = expectedJsonRows(
    snapshot,
    "allocations",
    sourceKey,
  ).map((row) => selectJsonFields(row, ["id", "installmentId", "amount"]));
  const actualAllocations = payment.allocations.map((row) =>
    selectJsonFields(row, ["id", "installmentId", "amount"]),
  );
  const expectedComponents = expectedJsonRows(
    snapshot,
    "componentAllocations",
    sourceKey,
  ).map((row) =>
    selectJsonFields(row, [
      "id",
      "invoiceComponentId",
      "amountXof",
      "refundedAmountXof",
    ]),
  );
  const actualComponents = payment.componentAllocations.map((row) =>
    selectJsonFields(row, [
      "id",
      "invoiceComponentId",
      "amountXof",
      "refundedAmountXof",
    ]),
  );
  assert(
    canonicalWorkbookCutoverJson(sortedJsonRows(expectedAllocations)) ===
      canonicalWorkbookCutoverJson(sortedJsonRows(actualAllocations)) &&
      canonicalWorkbookCutoverJson(sortedJsonRows(expectedComponents)) ===
        canonicalWorkbookCutoverJson(sortedJsonRows(actualComponents)),
    `${sourceKey} old payment allocations changed or were deleted`,
  );
}

function requiredJsonNumber(
  object: Record<string, unknown>,
  key: string,
  sourceKey: string,
): number {
  const value = object[key];
  assert(
    typeof value === "number" && Number.isSafeInteger(value),
    `${sourceKey} reconstruction snapshot ${key} is invalid`,
  );
  return value;
}

function auditReconstructionSnapshot(input: {
  record: SourceRecord;
  event: SourceRecord["financialProvenance"][number];
  invoice: NonNullable<SourceRecord["canonicalInvoice"]>;
  payment: SourceRecord["reconstructionPayment"];
  accountCreditXof: number;
}): void {
  const root = jsonObject(input.event.snapshotJson);
  assert(
    root,
    `${input.record.sourceKey} canonical-invoice snapshot is missing`,
  );
  const reconstruction = jsonObject(root.reconstruction) ?? root;
  assert(
    reconstruction.sourceKey === input.record.sourceKey &&
      requiredJsonNumber(
        reconstruction,
        "amountBilledXof",
        input.record.sourceKey,
      ) === input.invoice.totalAmount &&
      requiredJsonNumber(
        reconstruction,
        "amountPaidXof",
        input.record.sourceKey,
      ) === (input.payment?.amount ?? 0) &&
      requiredJsonNumber(
        reconstruction,
        "accountCreditXof",
        input.record.sourceKey,
      ) === input.accountCreditXof &&
      reconstruction.recognizedOn ===
        dateKey(input.record.billingProfile?.sourceAsOfDate) &&
      (input.event.recognizedOn === null ||
        dateKey(input.event.recognizedOn) ===
          dateKey(input.record.billingProfile?.sourceAsOfDate)) &&
      reconstruction.settledAt === null,
    `${input.record.sourceKey} canonical invoice differs from its planned reconstruction`,
  );
  const dueDates = jsonArray(reconstruction.installmentDueDates);
  const expectedInstallments = jsonArray(reconstruction.installments);
  const actualInstallments = input.invoice.plan?.installments ?? [];
  assert(
    dueDates?.length === 4 && expectedInstallments?.length === 4,
    `${input.record.sourceKey} reconstruction snapshot lacks four installments`,
  );
  for (const [index, raw] of expectedInstallments.entries()) {
    const expected = jsonObject(raw);
    const actual = actualInstallments[index];
    assert(
      expected && actual,
      `${input.record.sourceKey} installment snapshot is invalid`,
    );
    assert(
      requiredJsonNumber(expected, "sequence", input.record.sourceKey) ===
        actual.sequence &&
        requiredJsonNumber(expected, "dueXof", input.record.sourceKey) ===
          actual.amountDue &&
        requiredJsonNumber(
          expected,
          "paidDetailXof",
          input.record.sourceKey,
        ) === actual.amountPaid &&
        dueDates[index] === dateKey(actual.dueDate),
      `${input.record.sourceKey} installment ${index + 1} differs from the workbook snapshot`,
    );
  }
  const expectedComponents = jsonArray(reconstruction.components);
  assert(
    expectedComponents,
    `${input.record.sourceKey} reconstruction snapshot lacks components`,
  );
  const expectedComponentRows = expectedComponents
    .map((raw) => {
      const component = jsonObject(raw);
      assert(
        component,
        `${input.record.sourceKey} component snapshot is invalid`,
      );
      assert(
        typeof component.key === "string",
        `${input.record.sourceKey} component snapshot key is invalid`,
      );
      return {
        key: component.key,
        grossAmountXof: requiredJsonNumber(
          component,
          "grossAmountXof",
          input.record.sourceKey,
        ),
        netAmountXof: requiredJsonNumber(
          component,
          "netAmountXof",
          input.record.sourceKey,
        ),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  const actualComponentRows = input.invoice.components
    .map((component) => ({
      key: component.kind,
      grossAmountXof: component.grossAmountXof,
      netAmountXof: component.amountXof,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
  assert(
    canonicalWorkbookCutoverJson(expectedComponentRows) ===
      canonicalWorkbookCutoverJson(actualComponentRows),
    `${input.record.sourceKey} component snapshots differ from the workbook plan`,
  );
  const expectedAdjustments = jsonArray(reconstruction.adjustments);
  assert(
    expectedAdjustments,
    `${input.record.sourceKey} reconstruction snapshot lacks adjustments`,
  );
  const expectedAdjustmentRows = expectedAdjustments
    .map((raw) => {
      const adjustment = jsonObject(raw);
      assert(
        adjustment,
        `${input.record.sourceKey} adjustment snapshot is invalid`,
      );
      assert(
        typeof adjustment.instanceKey === "string" &&
          typeof adjustment.definitionKey === "string" &&
          typeof adjustment.label === "string" &&
          (adjustment.targetComponentKey === null ||
            typeof adjustment.targetComponentKey === "string") &&
          typeof adjustment.direction === "string" &&
          typeof adjustment.calculation === "string" &&
          typeof adjustment.basis === "string" &&
          typeof adjustment.stacking === "string",
        `${input.record.sourceKey} adjustment snapshot fields are invalid`,
      );
      return {
        code: adjustment.instanceKey,
        definitionKey:
          adjustment.definitionKey === "reviewed_manual_adjustment"
            ? adjustment.direction === "charge"
              ? "manual_charge"
              : "manual_adjustment"
            : adjustment.definitionKey,
        label: adjustment.label,
        targetComponentKey: adjustment.targetComponentKey,
        effect: adjustment.direction === "reduction" ? "discount" : "charge",
        calculation: adjustment.calculation,
        basis:
          adjustment.basis === "gross_package"
            ? "gross_charges"
            : adjustment.basis === "none"
              ? "manual"
              : adjustment.basis,
        stacking: adjustment.stacking,
        basisAmountXof: requiredJsonNumber(
          adjustment,
          "basisAmountXof",
          input.record.sourceKey,
        ),
        percentageBasisPoints:
          typeof adjustment.percentageBps === "number"
            ? adjustment.percentageBps
            : null,
        amountXof: requiredJsonNumber(
          adjustment,
          "amountXof",
          input.record.sourceKey,
        ),
      };
    })
    .sort((left, right) => String(left.code).localeCompare(String(right.code)));
  const componentKindById = new Map(
    input.invoice.components.map((component) => [component.id, component.kind]),
  );
  const awardByAdjustmentId = new Map(
    (input.record.billingProfile?.awards ?? []).map((award) => [
      award.invoiceAdjustmentId,
      award,
    ]),
  );
  const actualAdjustmentRows = input.invoice.adjustments
    .map((adjustment) => ({
      code: adjustment.code,
      definitionKey:
        awardByAdjustmentId.get(adjustment.id)?.definitionKey ?? null,
      label: adjustment.label,
      targetComponentKey:
        adjustment.invoiceComponentId === null
          ? null
          : (componentKindById.get(adjustment.invoiceComponentId) ?? null),
      effect: adjustment.effect,
      calculation: adjustment.calculation,
      basis: adjustment.basis,
      stacking: adjustment.stacking,
      basisAmountXof: adjustment.basisAmountXof,
      percentageBasisPoints: adjustment.percentageBasisPoints,
      amountXof: adjustment.amountXof,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
  assert(
    canonicalWorkbookCutoverJson(expectedAdjustmentRows) ===
      canonicalWorkbookCutoverJson(actualAdjustmentRows),
    `${input.record.sourceKey} scholarship/adjustment provenance differs from the workbook plan`,
  );
}

function auditBillingProfileAndInvoice(
  batch: AuditedBatch,
  record: SourceRecord,
): IncludedFinancialAudit {
  assert(
    record.student && record.studentId,
    `${record.sourceKey} has no Student`,
  );
  const profile = record.billingProfile;
  const invoice = record.canonicalInvoice;
  assert(
    profile && invoice,
    `${record.sourceKey} lacks canonical billing records`,
  );
  assert(
    profile.id === record.billingProfileId &&
      invoice.id === record.canonicalInvoiceId &&
      profile.canonicalInvoiceId === invoice.id &&
      invoice.id === record.canonicalInvoiceId,
    `${record.sourceKey} profile/invoice links differ`,
  );
  assert(
    profile.studentId === record.studentId &&
      invoice.studentId === record.studentId &&
      profile.academicYearLabel === batch.academicYearLabel,
    `${record.sourceKey} canonical records target the wrong Student or year`,
  );
  assert(
    profile.status === "active" &&
      profile.sourceKind === "workbook" &&
      profile.sourceWorkbookSha256 === batch.sourceWorkbookSha256 &&
      profile.sourceSheet === record.sourceSheet &&
      profile.sourceRowNumber === record.sourceRowNumber &&
      profile.sourceRowFingerprintSha256 === record.sourceFingerprintSha256 &&
      dateKey(profile.sourceAsOfDate) === dateKey(batch.sourceAsOfDate),
    `${record.sourceKey} billing-profile source provenance differs`,
  );
  const billedXof = safeXof(record.sourceBilledXof!, "source billed");
  const paidXof = safeXof(record.sourcePaidXof!, "source paid");
  assert(
    invoice.totalAmount === billedXof &&
      invoice.status !== "void" &&
      invoice.academicYearLabel === profile.academicYearLabel &&
      profile.netBilledXof === billedXof,
    `${record.sourceKey} canonical billed total differs`,
  );

  const selections = new Map(
    profile.selections.map((selection) => [selection.kind, selection]),
  );
  assert(
    profile.selections.length === 4 &&
      ["housing", "cafeteria", "insurance", "housing_caution"].every((kind) =>
        selections.has(kind as "housing"),
      ),
    `${record.sourceKey} does not snapshot all four service choices`,
  );
  for (const selection of profile.selections) {
    const option = selection.serviceOption;
    const percentageBasisOption = selection.percentageBasisOption;
    const expectedAmount =
      option.calculation === "fixed"
        ? option.amountXof
        : option.basisServiceKind === "housing" &&
            option.percentageBasisPoints !== null &&
            percentageBasisOption?.calculation === "fixed" &&
            percentageBasisOption.amountXof !== null
          ? Math.round(
              (percentageBasisOption.amountXof * option.percentageBasisPoints) /
                10_000,
            )
          : null;
    const percentageBasisMatches =
      option.calculation === "percentage_of_service"
        ? percentageBasisOption !== null &&
          selection.percentageBasisOptionId === percentageBasisOption.id &&
          selection.percentageBasisOptionCode === percentageBasisOption.code &&
          selection.percentageBasisServiceKind === "housing" &&
          percentageBasisOption.kind === "housing" &&
          percentageBasisOption.academicYearLabel === profile.academicYearLabel
        : selection.percentageBasisOptionId === null &&
          selection.percentageBasisOptionCode === null &&
          selection.percentageBasisServiceKind === null &&
          percentageBasisOption === null;
    assert(
      selection.serviceOptionId === option.id &&
        selection.academicYearLabel === profile.academicYearLabel &&
        selection.optionCode === option.code &&
        selection.label === option.label &&
        option.kind === selection.kind &&
        option.academicYearLabel === profile.academicYearLabel &&
        percentageBasisMatches &&
        selection.amountXof === expectedAmount &&
        selection.refundable === option.refundable,
      `${record.sourceKey} service snapshot differs from its selected catalog option`,
    );
  }
  const caution = selections.get("housing_caution");
  const housingSelection = selections.get("housing");
  const warningRows = jsonArray(profile.mismatchWarnings) ?? [];
  const cautionWarnings = warningRows
    .map((warning) => jsonObject(warning))
    .filter((warning) => warning?.code === "caution_without_housing");
  const cautionWithoutHousing =
    housingSelection?.optionCode === "none" &&
    caution?.optionCode !== "none" &&
    (caution?.amountXof ?? 0) > 0;
  assert(
    cautionWarnings.length === (cautionWithoutHousing ? 1 : 0) &&
      cautionWarnings.every(
        (warning) =>
          warning?.severity === "warning" &&
          warning.percentageBasisOptionCode ===
            caution?.percentageBasisOptionCode,
      ),
    `${record.sourceKey} caution-without-housing operational warning differs`,
  );

  const componentIds = new Set(
    invoice.components.map((component) => component.id),
  );
  const grossXof = sum(
    invoice.components.map((component) => {
      assert(
        component.grossAmountXof !== null && component.grossAmountXof >= 0,
        `${record.sourceKey} component ${component.kind} lacks a gross snapshot`,
      );
      if (component.kind === "tuition") {
        assert(
          component.grossAmountXof ===
            WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
          `${record.sourceKey} tuition gross snapshot differs`,
        );
      } else {
        assert(
          selections.get(component.kind as "housing")?.amountXof ===
            component.grossAmountXof,
          `${record.sourceKey} component ${component.kind} differs from its service snapshot`,
        );
      }
      return component.grossAmountXof;
    }),
    "invoice gross components",
  );
  const netXof = sum(
    invoice.components.map((component) => component.amountXof),
    "invoice net components",
  );
  assert(
    grossXof === profile.grossChargesXof && netXof === invoice.totalAmount,
    `${record.sourceKey} gross/net component equations differ`,
  );
  assert(
    new Set(invoice.components.map((component) => component.kind)).size ===
      invoice.components.length,
    `${record.sourceKey} repeats an invoice component`,
  );
  const expectedComponentKinds = [
    "tuition",
    ...profile.selections
      .filter((selection) => selection.amountXof > 0)
      .map((selection) => selection.kind),
  ].sort();
  assert(
    canonicalWorkbookCutoverJson(
      invoice.components.map((component) => component.kind).sort(),
    ) === canonicalWorkbookCutoverJson(expectedComponentKinds),
    `${record.sourceKey} components do not match selected gross services`,
  );
  const adjustmentEffect = sum(
    invoice.adjustments.map((adjustment) => {
      assert(
        adjustment.amountXof >= 0 &&
          adjustment.invoiceId === invoice.id &&
          adjustment.billingProfileId === profile.id &&
          (adjustment.invoiceComponentId === null ||
            componentIds.has(adjustment.invoiceComponentId)),
        `${record.sourceKey} has invalid invoice adjustment provenance`,
      );
      return adjustment.effect === "discount"
        ? -adjustment.amountXof
        : adjustment.amountXof;
    }),
    "invoice adjustments",
  );
  assert(
    grossXof + adjustmentEffect === netXof,
    `${record.sourceKey} gross charges plus adjustments do not equal net bill`,
  );
  if (
    invoice.adjustments.every(
      (adjustment) => adjustment.invoiceComponentId !== null,
    )
  ) {
    for (const component of invoice.components) {
      const componentAdjustment = sum(
        component.adjustments.map((adjustment) =>
          adjustment.effect === "discount"
            ? -adjustment.amountXof
            : adjustment.amountXof,
        ),
        `component ${component.kind} adjustments`,
      );
      assert(
        component.grossAmountXof! + componentAdjustment === component.amountXof,
        `${record.sourceKey} component ${component.kind} gross/net equation differs`,
      );
    }
  }
  assert(
    profile.awards.length === invoice.adjustments.length,
    `${record.sourceKey} profile awards do not explain every adjustment`,
  );
  for (const award of profile.awards) {
    const adjustment = award.invoiceAdjustment;
    assert(
      adjustment &&
        award.invoiceAdjustmentId === adjustment.id &&
        award.amountXof === adjustment.amountXof &&
        award.effect === adjustment.effect &&
        award.basis === adjustment.basis &&
        award.calculation === adjustment.calculation &&
        award.stacking === adjustment.stacking &&
        award.profileId === profile.id &&
        adjustment.billingProfileId === profile.id,
      `${record.sourceKey} profile award differs from invoice adjustment`,
    );
  }

  const plan = invoice.plan;
  assert(
    plan && plan.installments.length === 4,
    `${record.sourceKey} lacks four installments`,
  );
  assert(
    plan.installments.map((installment) => installment.sequence).join(",") ===
      "1,2,3,4",
    `${record.sourceKey} installment sequence differs`,
  );
  const installmentDue = sum(
    plan.installments.map((installment) => installment.amountDue),
    "installment due",
  );
  const installmentPaid = sum(
    plan.installments.map((installment) => installment.amountPaid),
    "installment paid",
  );
  assert(
    installmentDue === invoice.totalAmount,
    `${record.sourceKey} installment due total differs`,
  );
  for (const installment of plan.installments) {
    assert(
      sum(
        installment.allocations.map((allocation) => allocation.amount),
        "installment allocations",
      ) === installment.amountPaid,
      `${record.sourceKey} installment ${installment.sequence} allocations differ`,
    );
    if (installment.components.length > 0) {
      assert(
        sum(
          installment.components.map((component) => component.amountDue),
          "installment components",
        ) === installment.amountDue,
        `${record.sourceKey} installment ${installment.sequence} component grid differs`,
      );
    }
  }

  const payment = record.reconstructionPayment;
  if (paidXof === 0) {
    assert(payment === null, `${record.sourceKey} zero-paid row has a payment`);
  } else {
    assert(
      payment,
      `${record.sourceKey} paid row lacks a reconstruction payment`,
    );
    assert(
      payment.amount === paidXof &&
        payment.invoiceId === invoice.id &&
        payment.studentId === record.studentId &&
        payment.status === "success" &&
        payment.method === "legacy_unknown" &&
        payment.provider === "workbook_cutover" &&
        payment.source === "paid_to_date_workbook" &&
        payment.settledAt === null &&
        dateKey(payment.recognizedOn) === dateKey(batch.sourceAsOfDate),
      `${record.sourceKey} reconstruction-payment accounting provenance differs`,
    );
  }
  const allocatedXof = payment
    ? sum(
        payment.allocations.map((allocation) => allocation.amount),
        "payment installments",
      )
    : 0;
  const componentAllocatedXof = payment
    ? sum(
        payment.componentAllocations.map((allocation) => {
          assert(
            componentIds.has(allocation.invoiceComponentId) &&
              allocation.refundedAmountXof === 0,
            `${record.sourceKey} payment component allocation targets the wrong invoice`,
          );
          return allocation.amountXof;
        }),
        "payment components",
      )
    : 0;
  assert(
    allocatedXof === componentAllocatedXof &&
      allocatedXof === installmentPaid &&
      allocatedXof === invoice.amountPaid,
    `${record.sourceKey} payment allocation equations differ`,
  );
  const accountCreditXof = paidXof - allocatedXof;
  assert(
    accountCreditXof >= 0,
    `${record.sourceKey} allocates more than Amount Paid`,
  );
  const reviewedCreditRow =
    record.sourceSheet === "Comparison" && record.sourceRowNumber === 159;
  assert(
    accountCreditXof === (reviewedCreditRow ? 1_433 : 0),
    `${record.sourceKey} account credit does not match the reviewed row-159 variance`,
  );

  auditProvenanceSnapshot(record);
  const newInvoiceEvents = events(record, "new_invoice");
  const reconstructionEvents = events(record, "reconstruction_payment");
  const accountCreditEvents = events(record, "account_credit");
  assert(
    newInvoiceEvents.length === 1 &&
      newInvoiceEvents[0]!.invoiceId === invoice.id,
    `${record.sourceKey} lacks one canonical-invoice event`,
  );
  auditReconstructionSnapshot({
    record,
    event: newInvoiceEvents[0]!,
    invoice,
    payment,
    accountCreditXof,
  });
  assert(
    reconstructionEvents.length === (paidXof > 0 ? 1 : 0) &&
      reconstructionEvents.every(
        (event) =>
          event.paymentId === payment?.id &&
          dateKey(event.recognizedOn) === dateKey(batch.sourceAsOfDate),
      ),
    `${record.sourceKey} reconstruction-payment event differs`,
  );
  assert(
    accountCreditEvents.length === (accountCreditXof > 0 ? 1 : 0),
    `${record.sourceKey} account-credit event count differs`,
  );
  if (accountCreditXof > 0) {
    const credit = accountCreditEvents[0]!.invoice;
    assert(
      credit &&
        credit.packageType === "credit" &&
        credit.studentId === record.studentId &&
        credit.totalAmount === -accountCreditXof &&
        credit.status !== "void" &&
        dateKey(accountCreditEvents[0]!.recognizedOn) ===
          dateKey(batch.sourceAsOfDate),
      `${record.sourceKey} account credit differs`,
    );
  }

  const invoiceVoidEvents = events(record, "invoice_void");
  for (const event of invoiceVoidEvents) {
    const snapshot = jsonObject(event.snapshotJson);
    assert(
      event.invoice &&
        event.invoice.status === "void" &&
        event.originalStatus !== "void" &&
        event.originalAmountXof === BigInt(event.invoice.totalAmount) &&
        event.originalPaidXof === BigInt(event.invoice.amountPaid) &&
        snapshot?.id === event.invoice.id &&
        snapshot.status === event.originalStatus &&
        snapshot.totalAmount === event.invoice.totalAmount &&
        snapshot.amountPaid === event.invoice.amountPaid &&
        event.replacementInvoiceId === invoice.id,
      `${record.sourceKey} old invoice was not retained and superseded`,
    );
    auditRetainedInvoiceChildren(record.sourceKey, snapshot, event.invoice);
  }
  const paymentEvents = events(record, "payment_superseded");
  for (const event of paymentEvents) {
    const snapshot = jsonObject(event.snapshotJson);
    assert(
      event.payment &&
        ["success", "pending"].includes(event.originalStatus ?? "") &&
        ["cancelled", "refunded", "failed"].includes(event.payment.status) &&
        event.originalAmountXof === BigInt(event.payment.amount) &&
        snapshot?.id === event.payment.id &&
        snapshot.status === event.originalStatus &&
        snapshot.amount === event.payment.amount &&
        (payment === null || event.replacementPaymentId === payment.id),
      `${record.sourceKey} old payment was not retained and superseded`,
    );
    auditRetainedPaymentChildren(record.sourceKey, snapshot, event.payment);
  }

  const cafeteria = selections.get("cafeteria")!;
  assert(
    profile.mealPlan &&
      profile.mealPlan.billingProfileId === profile.id &&
      profile.mealPlan.studentId === record.studentId &&
      profile.mealPlan.type ===
        (cafeteria.optionCode === "full" ? "full" : "none") &&
      profile.mealPlan.active === (cafeteria.optionCode === "full"),
    `${record.sourceKey} Dining does not match the billing profile`,
  );
  const housing = selections.get("housing")!;
  const annualHousingAssignments = record.student.housingAssignments.filter(
    (assignment) => assignment.academicYearLabel === profile.academicYearLabel,
  );
  assert(
    annualHousingAssignments.length <= 1,
    `${record.sourceKey} has duplicate Housing assignments for the billing year`,
  );
  const annualHousing = annualHousingAssignments[0] ?? null;
  if (housing.optionCode === "none") {
    assert(
      !annualHousing ||
        (annualHousing.billedServiceOptionId === null &&
          annualHousing.status === "unassigned"),
      `${record.sourceKey} Housing conflicts with the no-housing selection`,
    );
  } else {
    assert(
      annualHousing &&
        annualHousing.status !== "unassigned" &&
        annualHousing.billedServiceOptionId === housing.serviceOptionId,
      `${record.sourceKey} Housing does not match the billing profile`,
    );
  }
  return {
    appliedToInvoiceXof: allocatedXof,
    accountCreditXof,
    voidedInvoices: invoiceVoidEvents.length,
    supersededPayments: paymentEvents.length,
  };
}

function auditPaymentEvidence(input: {
  batchId: string;
  records: readonly SourceRecord[];
  auditLogs: readonly { entityId: string; data: unknown }[];
}): number {
  const paidRecords = input.records.filter(
    (record) => record.reconstructionPaymentId !== null,
  );
  for (const record of paidRecords) {
    const logs = input.auditLogs.filter(
      (auditLog) => auditLog.entityId === record.reconstructionPaymentId,
    );
    const data = logs.length === 1 ? jsonObject(logs[0]!.data) : null;
    assert(
      logs.length === 1 &&
        data?.batchId === input.batchId &&
        data.sourceRecordId === record.id &&
        data.sourceClaimSha256 === record.sourceClaimSha256,
      `${record.sourceKey} reconstruction payment lacks one exact audit`,
    );
  }
  return paidRecords.length;
}

async function auditAcademicEvidence(
  prisma: AcademicClient,
  productionRecords: readonly SourceRecord[],
  evidence: readonly AcademicEvidence[],
): Promise<number> {
  const productionStudentIds = productionRecords.map((record) => {
    assert(
      record.student && record.studentId === record.student.id,
      `${record.sourceKey} original production Student no longer exists`,
    );
    return record.studentId!;
  });
  assert(
    evidence.length === productionStudentIds.length &&
      new Set(evidence.map((row) => row.studentId)).size === evidence.length,
    "academic evidence does not cover every original production Student exactly once",
  );
  const byStudent = new Map(evidence.map((row) => [row.studentId, row]));
  const actualByStudent = new Map(
    (
      await captureWorkbookCutoverAcademicFingerprints(
        prisma,
        productionStudentIds,
      )
    ).map((row) => [row.studentId, row.academicFingerprint]),
  );
  assert(
    actualByStudent.size === productionStudentIds.length,
    "one or more original production Students disappeared during academic audit",
  );
  for (const record of productionRecords) {
    const expected = byStudent.get(record.studentId!);
    assert(expected, `${record.sourceKey} lacks baseline academic evidence`);
    assert(
      expected.personId === record.student!.personId,
      `${record.sourceKey} Person identity changed`,
    );
    const actual = actualByStudent.get(record.studentId!);
    assert(actual, `${record.sourceKey} academic rows cannot be re-derived`);
    const expectedFingerprint: WorkbookCutoverAcademicFingerprint = {
      transcriptCount: expected.transcriptCount,
      transcriptSha256: expected.transcriptSha256,
      enrollmentCount: expected.enrollmentCount,
      enrollmentSha256: expected.enrollmentSha256,
      gradeSnapshotCount: expected.gradeSnapshotCount,
      gradeSnapshotSha256: expected.gradeSnapshotSha256,
      creditsSha256: expected.creditsSha256,
      gpaSha256: expected.gpaSha256,
    };
    assert(
      canonicalWorkbookCutoverJson(actual) ===
        canonicalWorkbookCutoverJson(expectedFingerprint) &&
        workbookCutoverAcademicFingerprintDigest(actual) ===
          workbookCutoverAcademicFingerprintDigest(expectedFingerprint) &&
        expected.academicFingerprintSha256 ===
          workbookCutoverAcademicFingerprintDigest(expectedFingerprint),
      `${record.sourceKey} transcript, enrollment, grade, credit, or GPA fingerprint changed`,
    );
  }
  return productionStudentIds.length;
}

function auditArchiveEvidence(input: {
  batchId: string;
  records: readonly SourceRecord[];
  auditLogs: readonly { entityId: string; data: unknown }[];
}): void {
  for (const record of input.records) {
    assert(record.student, `${record.sourceKey} archived Student is missing`);
    const logs = input.auditLogs.filter(
      (auditLog) => auditLog.entityId === record.studentId,
    );
    const data = logs.length === 1 ? jsonObject(logs[0]!.data) : null;
    const previousSessionVersion = data?.previousSessionVersion;
    assert(
      logs.length === 1 &&
        data?.batchId === input.batchId &&
        data.sourceRecordId === record.id &&
        data.personId === record.student.personId &&
        typeof data.removedRole === "boolean" &&
        canonicalWorkbookCutoverJson(data.remainingRoles) ===
          canonicalWorkbookCutoverJson(record.student.person.roles) &&
        data.personSuspended === (record.student.person.roles.length === 0) &&
        typeof previousSessionVersion === "number" &&
        Number.isSafeInteger(previousSessionVersion) &&
        record.student.person.sessionVersion === previousSessionVersion + 1,
      `${record.sourceKey} lacks exact access-revocation audit evidence`,
    );
    assert(
      record.student.recordStatus === "archived" &&
        !record.student.person.roles.includes("student"),
      `${record.sourceKey} was not archived or still has the student role`,
    );
    if (record.student.person.roles.length === 0) {
      assert(
        record.student.person.status === "suspended" &&
          record.student.person.suspendedAt !== null,
        `${record.sourceKey} single-role Person was not suspended`,
      );
    } else {
      assert(
        record.student.person.status === "active",
        `${record.sourceKey} multi-role Person was incorrectly suspended`,
      );
    }
  }
}

type ArchivedCapabilityGraph = {
  applicants: Array<{
    id: string;
    statusTokenHash: string | null;
    statusTokenRevokedAt: Date | null;
    statusTokenExpiresAt: Date | null;
    activeOnboardingPaymentLinkId: string | null;
  }>;
  submissions: Array<{
    id: string;
    status: string;
    activeKey: string | null;
    paymentId: string | null;
    paymentLinkId: string | null;
  }>;
  links: Array<{ id: string; status: string }>;
  piSpiRequests: Array<{
    id: string;
    status: string;
    paymentId: string | null;
    paymentLinkId: string | null;
  }>;
  payments: Array<{ id: string; status: string }>;
};

/**
 * Independently reconstructs one archived Student's payer-capability graph.
 * This deliberately does not consume the runner's discovery helper: the audit
 * must catch a cancellation implementation that forgot an ownership edge.
 */
async function captureArchivedCapabilityGraph(
  prisma: PrismaClient,
  studentId: string,
): Promise<ArchivedCapabilityGraph> {
  const [studentInvoices, linkedApplicants] = await Promise.all([
    prisma.invoice.findMany({
      where: { studentId },
      select: { id: true },
    }),
    prisma.applicant.findMany({
      where: { studentId },
      select: {
        id: true,
        enrollmentInvoiceId: true,
        activeOnboardingPaymentLinkId: true,
        statusTokenHash: true,
        statusTokenRevokedAt: true,
        statusTokenExpiresAt: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const invoiceIds = new Set(studentInvoices.map((row) => row.id));
  const applicantIds = linkedApplicants.map((row) => row.id);
  const linkIds = new Set<string>();
  for (const applicant of linkedApplicants) {
    if (applicant.enrollmentInvoiceId) {
      invoiceIds.add(applicant.enrollmentInvoiceId);
    }
    if (applicant.activeOnboardingPaymentLinkId) {
      linkIds.add(applicant.activeOnboardingPaymentLinkId);
    }
  }
  const invoiceIdValues = [...invoiceIds];
  const payments = await prisma.payment.findMany({
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
  const paymentIds = new Set(payments.map((row) => row.id));
  const directLinks = await prisma.paymentLink.findMany({
    where: {
      OR: [
        { studentId },
        ...(invoiceIdValues.length > 0
          ? [{ invoiceId: { in: invoiceIdValues } }]
          : []),
        ...(applicantIds.length > 0
          ? [{ onboardingApplicantId: { in: applicantIds } }]
          : []),
        ...(linkIds.size > 0 ? [{ id: { in: [...linkIds] } }] : []),
      ],
    },
    select: { id: true },
  });
  for (const link of directLinks) linkIds.add(link.id);

  const submissionIds = new Set<string>();
  const piSpiRequestIds = new Set<string>();
  let previousSize = -1;
  while (
    previousSize !==
    submissionIds.size + piSpiRequestIds.size + paymentIds.size + linkIds.size
  ) {
    previousSize =
      submissionIds.size +
      piSpiRequestIds.size +
      paymentIds.size +
      linkIds.size;
    const attemptOwnershipOr = [
      { studentId },
      ...(invoiceIdValues.length > 0
        ? [{ invoiceId: { in: invoiceIdValues } }]
        : []),
      ...(applicantIds.length > 0
        ? [{ applicantId: { in: applicantIds } }]
        : []),
      ...(paymentIds.size > 0 ? [{ paymentId: { in: [...paymentIds] } }] : []),
      ...(linkIds.size > 0 ? [{ paymentLinkId: { in: [...linkIds] } }] : []),
    ];
    const [submissions, piSpiRequests] = await Promise.all([
      prisma.paymentSubmission.findMany({
        where: { OR: attemptOwnershipOr },
        select: { id: true, paymentId: true, paymentLinkId: true },
      }),
      prisma.piSpiRequest.findMany({
        where: { OR: attemptOwnershipOr },
        select: { id: true, paymentId: true, paymentLinkId: true },
      }),
    ]);
    for (const row of submissions) {
      submissionIds.add(row.id);
      if (row.paymentId) paymentIds.add(row.paymentId);
      if (row.paymentLinkId) linkIds.add(row.paymentLinkId);
    }
    for (const row of piSpiRequests) {
      piSpiRequestIds.add(row.id);
      if (row.paymentId) paymentIds.add(row.paymentId);
      if (row.paymentLinkId) linkIds.add(row.paymentLinkId);
    }
  }

  const [submissionRows, linkRows, piSpiRows, paymentRows] = await Promise.all([
    submissionIds.size > 0
      ? prisma.paymentSubmission.findMany({
          where: { id: { in: [...submissionIds] } },
          select: {
            id: true,
            status: true,
            activeKey: true,
            paymentId: true,
            paymentLinkId: true,
          },
        })
      : Promise.resolve([]),
    linkIds.size > 0
      ? prisma.paymentLink.findMany({
          where: { id: { in: [...linkIds] } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
    piSpiRequestIds.size > 0
      ? prisma.piSpiRequest.findMany({
          where: { id: { in: [...piSpiRequestIds] } },
          select: {
            id: true,
            status: true,
            paymentId: true,
            paymentLinkId: true,
          },
        })
      : Promise.resolve([]),
    paymentIds.size > 0
      ? prisma.payment.findMany({
          where: { id: { in: [...paymentIds] } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    applicants: linkedApplicants,
    submissions: submissionRows,
    links: linkRows,
    piSpiRequests: piSpiRows,
    payments: paymentRows,
  };
}

async function auditArchivedCapabilityCancellations(input: {
  prisma: PrismaClient;
  records: readonly SourceRecord[];
  evidence: readonly ArchivedCapabilityCancellationEvidence[];
  cutoverAt: Date;
  genericEvidence: {
    submission: ReadonlySet<string>;
    link: ReadonlySet<string>;
    piSpi: ReadonlySet<string>;
    payment: ReadonlySet<string>;
  };
}): Promise<void> {
  assert(
    input.evidence.length === input.records.length,
    "archived capability evidence count differs from archive dispositions",
  );
  const evidenceByRecord = new Map(
    input.evidence.map((row) => [row.sourceRecordId, row] as const),
  );
  const claimedIds = {
    submission: new Set<string>(),
    link: new Set<string>(),
    piSpi: new Set<string>(),
    payment: new Set<string>(),
  };
  const claim = (
    ids: readonly string[],
    seen: Set<string>,
    generic: ReadonlySet<string>,
    label: string,
  ) => {
    for (const id of ids) {
      assert(!seen.has(id), `archived ${label} evidence repeats an ID`);
      assert(
        generic.has(id),
        `archived ${label} evidence is missing from batch cancellation evidence`,
      );
      seen.add(id);
    }
  };

  for (const record of input.records) {
    const evidence = evidenceByRecord.get(record.id);
    assert(
      evidence && evidence.studentId === record.studentId,
      `${record.sourceKey} lacks exact archived capability evidence`,
    );
    claim(
      evidence.cancelledPaymentSubmissionIds,
      claimedIds.submission,
      input.genericEvidence.submission,
      "proof-payment",
    );
    claim(
      evidence.cancelledPaymentLinkIds,
      claimedIds.link,
      input.genericEvidence.link,
      "payment-link",
    );
    claim(
      evidence.cancelledPiSpiRequestIds,
      claimedIds.piSpi,
      input.genericEvidence.piSpi,
      "PI-SPI",
    );
    claim(
      evidence.cancelledPendingPaymentIds,
      claimedIds.payment,
      input.genericEvidence.payment,
      "pending-payment",
    );

    const graph = await captureArchivedCapabilityGraph(
      input.prisma,
      record.studentId!,
    );
    const applicantById = new Map(
      graph.applicants.map((applicant) => [applicant.id, applicant]),
    );
    assert(
      canonicalWorkbookCutoverJson(
        graph.applicants.map((applicant) => applicant.id).sort(),
      ) ===
        canonicalWorkbookCutoverJson([...evidence.linkedApplicantIds].sort()),
      `${record.sourceKey} linked Applicant evidence differs from retained rows`,
    );
    const statusTokenCapabilityApplicantIds = graph.applicants
      .filter((applicant) => applicant.statusTokenHash !== null)
      .map((applicant) => applicant.id)
      .sort();
    assert(
      canonicalWorkbookCutoverJson(statusTokenCapabilityApplicantIds) ===
        canonicalWorkbookCutoverJson(
          [...evidence.statusTokenCapabilityApplicantIds].sort(),
        ),
      `${record.sourceKey} status-token capability evidence differs from retained rows`,
    );
    const revokedStatusTokenIds = new Set(
      evidence.revokedApplicantStatusTokenIds,
    );
    const preexistingInactiveStatusTokenIds = new Set(
      evidence.preexistingInactiveApplicantStatusTokenIds,
    );
    assert(
      canonicalWorkbookCutoverJson(
        [...revokedStatusTokenIds, ...preexistingInactiveStatusTokenIds].sort(),
      ) === canonicalWorkbookCutoverJson(statusTokenCapabilityApplicantIds) &&
        [...revokedStatusTokenIds].every(
          (applicantId) => !preexistingInactiveStatusTokenIds.has(applicantId),
        ),
      `${record.sourceKey} status-token disposition evidence is not exhaustive`,
    );
    for (const applicantId of evidence.revokedApplicantStatusTokenIds) {
      const applicant = applicantById.get(applicantId);
      assert(
        applicant !== undefined &&
          applicant.statusTokenHash !== null &&
          applicant.statusTokenRevokedAt !== null &&
          applicant.statusTokenExpiresAt !== null &&
          applicant.statusTokenRevokedAt.getTime() <=
            input.cutoverAt.getTime() &&
          applicant.statusTokenExpiresAt.getTime() <= input.cutoverAt.getTime(),
        `${record.sourceKey} status-token revocation evidence does not match the retained Applicant`,
      );
    }
    assert(
      graph.applicants.every((applicant) => {
        if (applicant.activeOnboardingPaymentLinkId !== null) return false;
        if (applicant.statusTokenHash === null) return true;
        const revokedBeforeCutover =
          applicant.statusTokenRevokedAt !== null &&
          applicant.statusTokenRevokedAt.getTime() <= input.cutoverAt.getTime();
        const expiredBeforeCutover =
          applicant.statusTokenExpiresAt !== null &&
          applicant.statusTokenExpiresAt.getTime() <= input.cutoverAt.getTime();
        return revokedBeforeCutover || expiredBeforeCutover;
      }),
      `${record.sourceKey} retains an Applicant status or payment-link bearer capability`,
    );
    const pointerLinkIds = evidence.clearedApplicantPaymentLinkPointers.map(
      (pointer) => pointer.paymentLinkId,
    );
    const retainedPointerLinks =
      pointerLinkIds.length > 0
        ? await input.prisma.paymentLink.findMany({
            where: { id: { in: pointerLinkIds } },
            select: { id: true, status: true },
          })
        : [];
    const retainedPointerLinkById = new Map(
      retainedPointerLinks.map((link) => [link.id, link]),
    );
    assert(
      evidence.clearedApplicantPaymentLinkPointers.every((pointer) => {
        const applicant = applicantById.get(pointer.applicantId);
        const link = retainedPointerLinkById.get(pointer.paymentLinkId);
        return (
          applicant?.activeOnboardingPaymentLinkId === null &&
          link !== undefined &&
          link.status !== "active"
        );
      }),
      `${record.sourceKey} cleared Applicant payment-link evidence does not match retained rows`,
    );
    const submissions = new Map(graph.submissions.map((row) => [row.id, row]));
    const links = new Map(graph.links.map((row) => [row.id, row]));
    const piSpiRequests = new Map(
      graph.piSpiRequests.map((row) => [row.id, row]),
    );
    const payments = new Map(graph.payments.map((row) => [row.id, row]));
    assert(
      graph.submissions.every(
        (row) =>
          !["awaiting_proof", "submitted"].includes(row.status) &&
          (row.status !== "cancelled" || row.activeKey === null),
      ),
      `${record.sourceKey} retains an unsettled proof-payment capability`,
    );
    assert(
      graph.links.every((row) => row.status !== "active"),
      `${record.sourceKey} retains an active payment-link capability`,
    );
    assert(
      graph.piSpiRequests.every(
        (row) => !["initiated", "sent"].includes(row.status),
      ),
      `${record.sourceKey} retains an unsettled PI-SPI capability`,
    );
    assert(
      graph.payments.every((row) => row.status !== "pending"),
      `${record.sourceKey} retains a pending Payment capability`,
    );
    assert(
      evidence.cancelledPaymentSubmissionIds.every((id) => {
        const row = submissions.get(id);
        return row?.status === "cancelled" && row.activeKey === null;
      }) &&
        evidence.cancelledPaymentLinkIds.every(
          (id) => links.get(id)?.status === "cancelled",
        ) &&
        evidence.cancelledPiSpiRequestIds.every(
          (id) => piSpiRequests.get(id)?.status === "cancelled",
        ) &&
        evidence.cancelledPendingPaymentIds.every(
          (id) => payments.get(id)?.status === "cancelled",
        ),
      `${record.sourceKey} cancellation evidence does not match retained capability rows`,
    );
  }
}

function auditActivationEvidence(input: {
  expected: number;
  applicants: readonly {
    id: string;
    activatedByPaymentId: string | null;
  }[];
  auditLogs: readonly { entityId: string; action: string; data: unknown }[];
}): number {
  assert(
    input.applicants.length === input.expected,
    "enrollment activation count differs from batch audit evidence",
  );
  let activationAuditRows = 0;
  for (const applicant of input.applicants) {
    const activation = input.auditLogs.filter(
      (row) =>
        row.entityId === applicant.id && row.action === "onboarding-activated",
    );
    assert(
      activation.length === 1 &&
        jsonObject(activation[0]!.data)?.paymentId ===
          applicant.activatedByPaymentId,
      `Applicant ${applicant.id} lacks exact activation audit evidence`,
    );
    activationAuditRows += 1;
  }
  return activationAuditRows;
}

/**
 * Read-only, fail-closed independent post-audit. Run while Finance maintenance
 * is still active; any anomaly throws and must keep the cutover frozen.
 */
export async function auditWorkbookCutoverBatch(
  prisma: PrismaClient,
  batchId: string,
): Promise<WorkbookCutoverBatchAuditResult> {
  const batch = await prisma.workbookCutoverBatch.findUnique({
    where: { id: batchId },
    include: batchInclude,
  });
  assert(batch, "batch does not exist");
  const groups = auditSourceConservation(batch);

  for (const record of groups.production) {
    assert(
      record.student && record.student.id === record.studentId,
      `${record.sourceKey} original production Student was deleted`,
    );
  }
  for (const record of groups.applicants) {
    assert(
      record.applicant && record.applicant.id === record.applicantId,
      `${record.sourceKey} original Applicant was deleted`,
    );
  }

  let voidedInvoices = 0;
  let supersededPayments = 0;
  let reconstructedAccountCreditXof = 0;
  const permittedEffectiveInvoiceIds = new Set<string>();
  const reconstructionPaymentIds: string[] = [];
  for (const record of groups.included) {
    const financial = auditBillingProfileAndInvoice(batch, record);
    voidedInvoices += financial.voidedInvoices;
    supersededPayments += financial.supersededPayments;
    reconstructedAccountCreditXof += financial.accountCreditXof;
    permittedEffectiveInvoiceIds.add(record.canonicalInvoiceId!);
    for (const event of events(record, "account_credit")) {
      permittedEffectiveInvoiceIds.add(event.invoiceId!);
    }
    if (record.reconstructionPaymentId) {
      reconstructionPaymentIds.push(record.reconstructionPaymentId);
    }
  }

  const includedStudentIds = [
    ...new Set(groups.included.map((record) => record.studentId!)),
  ];
  const batchAuditLogs = await prisma.auditLog.findMany({
    where: {
      entity: WORKBOOK_CUTOVER_BATCH_AUDIT.entity,
      entityId: batch.id,
    },
    select: { action: true, data: true },
  });
  assert(
    batchAuditLogs.length === 1 &&
      batchAuditLogs[0]!.action === WORKBOOK_CUTOVER_BATCH_AUDIT.action,
    "batch audit count differs or an exact replay emitted another audit",
  );
  auditBatchAnchors(batch, batchAuditLogs[0]!.data, groups);
  const batchEvidence = parseImportedBatchEvidence(batchAuditLogs[0]!.data);
  const reviewerAttestations = await auditReviewerAttestations({
    prisma,
    batch,
    attestationIds: batchEvidence.reviewerAttestationIds,
  });
  const batchEvidenceRoot = evidenceRoot(batchAuditLogs[0]!.data);
  const batchControls = jsonObject(
    jsonObject(batchAuditLogs[0]!.data)?.controls ?? batchEvidenceRoot.controls,
  );
  assert(
    batchControls?.accountCreditXof === reconstructedAccountCreditXof,
    "batch account-credit control differs from reconstructed accounts",
  );
  assert(
    canonicalWorkbookCutoverJson(
      groups.production.map((record) => record.studentId!).sort(),
    ) ===
      canonicalWorkbookCutoverJson(
        [...batchEvidence.originalProductionStudentIds].sort(),
      ),
    "batch evidence does not preserve every original production Student ID",
  );
  assert(
    canonicalWorkbookCutoverJson(
      groups.applicants.map((record) => record.applicantId!).sort(),
    ) ===
      canonicalWorkbookCutoverJson(
        [...batchEvidence.originalApplicantIds].sort(),
      ),
    "batch evidence does not preserve every original Applicant ID",
  );

  const evidenceIds = {
    submission: new Set(batchEvidence.cancelledPaymentSubmissionIds),
    link: new Set(batchEvidence.cancelledPaymentLinkIds),
    piSpi: new Set(batchEvidence.cancelledPiSpiRequestIds),
    payment: new Set(batchEvidence.cancelledPendingPaymentIds),
  };
  const canonicalInvoiceByStudentId = new Map<string, string>();
  for (const record of groups.included) {
    assert(
      record.studentId && record.canonicalInvoiceId,
      `${record.sourceKey} lacks its canonical Student or invoice`,
    );
    assert(
      !canonicalInvoiceByStudentId.has(record.studentId),
      `Student ${record.studentId} has more than one included workbook row`,
    );
    canonicalInvoiceByStudentId.set(
      record.studentId,
      record.canonicalInvoiceId,
    );
  }
  const [includedInvoiceReferences, onboardingApplicants] = await Promise.all([
    prisma.invoice.findMany({
      where: { studentId: { in: includedStudentIds } },
      select: { id: true },
    }),
    prisma.applicant.findMany({
      where: { studentId: { in: includedStudentIds } },
      select: {
        id: true,
        studentId: true,
        onboardingStatus: true,
        requiredEnrollmentCashXof: true,
        enrollmentInvoiceId: true,
        activeOnboardingPaymentLinkId: true,
        enrollmentInvoice: {
          select: {
            id: true,
            status: true,
            costCenterCode: true,
            payments: {
              where: { status: "success" },
              select: { amount: true },
            },
            plan: {
              select: {
                installments: {
                  orderBy: { sequence: "asc" },
                  take: 1,
                  select: { amountDue: true, dueDate: true },
                },
              },
            },
          },
        },
        activeOnboardingPaymentLink: {
          select: {
            id: true,
            status: true,
            amountXof: true,
            studentId: true,
            invoiceId: true,
            onboardingApplicantId: true,
            costCenterCode: true,
            dueDate: true,
          },
        },
      },
    }),
  ]);
  const includedInvoiceIds = includedInvoiceReferences.map((row) => row.id);
  const onboardingApplicantIds = onboardingApplicants.map((row) => row.id);
  const sourcePaymentLinks = await prisma.paymentLink.findMany({
    where: {
      OR: [
        { studentId: { in: includedStudentIds } },
        { invoiceId: { in: includedInvoiceIds } },
        { onboardingApplicantId: { in: onboardingApplicantIds } },
        { id: { in: batchEvidence.cancelledPaymentLinkIds } },
      ],
    },
    select: {
      id: true,
      status: true,
      amountXof: true,
      studentId: true,
      invoiceId: true,
      onboardingApplicantId: true,
      costCenterCode: true,
      dueDate: true,
    },
  });
  const sourcePaymentLinkIds = sourcePaymentLinks.map((row) => row.id);
  const [
    effectiveInvoices,
    effectivePayments,
    paymentAuditLogs,
    archiveAuditLogs,
    activatedApplicants,
    sourcePaymentSubmissions,
    sourcePiSpiRequests,
    sourcePendingPayments,
    replayPlanCount,
    replayManifestCount,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { studentId: { in: includedStudentIds }, status: { not: "void" } },
      select: { id: true },
    }),
    prisma.payment.findMany({
      where: {
        studentId: { in: includedStudentIds },
        status: { in: ["success", "pending", "refund_pending"] },
      },
      select: { id: true, status: true },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: WORKBOOK_CUTOVER_PAYMENT_AUDIT.entity,
        entityId: { in: reconstructionPaymentIds },
        action: WORKBOOK_CUTOVER_PAYMENT_AUDIT.action,
      },
      select: { entityId: true, data: true },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: WORKBOOK_CUTOVER_ARCHIVE_AUDIT.entity,
        entityId: { in: groups.archived.map((record) => record.studentId!) },
        action: WORKBOOK_CUTOVER_ARCHIVE_AUDIT.action,
      },
      select: { entityId: true, data: true },
    }),
    prisma.applicant.findMany({
      where: { activatedByPaymentId: { in: reconstructionPaymentIds } },
      select: {
        id: true,
        activatedByPaymentId: true,
      },
    }),
    prisma.paymentSubmission.findMany({
      where: {
        OR: [
          { studentId: { in: includedStudentIds } },
          { invoiceId: { in: includedInvoiceIds } },
          { applicantId: { in: onboardingApplicantIds } },
          { paymentLinkId: { in: sourcePaymentLinkIds } },
          { id: { in: batchEvidence.cancelledPaymentSubmissionIds } },
        ],
      },
      select: { id: true, status: true },
    }),
    prisma.piSpiRequest.findMany({
      where: {
        OR: [
          { studentId: { in: includedStudentIds } },
          { invoiceId: { in: includedInvoiceIds } },
          { applicantId: { in: onboardingApplicantIds } },
          { paymentLinkId: { in: sourcePaymentLinkIds } },
          { id: { in: batchEvidence.cancelledPiSpiRequestIds } },
        ],
      },
      select: { id: true, status: true },
    }),
    prisma.payment.findMany({
      where: {
        OR: [
          { studentId: { in: includedStudentIds } },
          { id: { in: batchEvidence.cancelledPendingPaymentIds } },
        ],
      },
      select: { id: true, status: true },
    }),
    prisma.workbookCutoverBatch.count({
      where: { confirmationPlanSha256: batch.confirmationPlanSha256 },
    }),
    prisma.workbookCutoverBatch.count({
      where: { identityManifestSha256: batch.identityManifestSha256 },
    }),
  ]);

  const preservedAcademicRecords = await auditAcademicEvidence(
    prisma,
    groups.production,
    batchEvidence.academicFingerprints,
  );
  auditArchiveEvidence({
    batchId: batch.id,
    records: groups.archived,
    auditLogs: archiveAuditLogs,
  });
  await auditArchivedCapabilityCancellations({
    prisma,
    records: groups.archived,
    evidence: batchEvidence.archivedCapabilityCancellations,
    cutoverAt: batch.importedAt!,
    genericEvidence: evidenceIds,
  });
  const paymentAuditRows = auditPaymentEvidence({
    batchId: batch.id,
    records: groups.included,
    auditLogs: paymentAuditLogs,
  });
  const provenanceInvoiceIds = groups.included.flatMap((record) =>
    events(record, "invoice_void").map((event) => event.invoiceId!),
  );
  const provenancePaymentIds = groups.included.flatMap((record) =>
    events(record, "payment_superseded").map((event) => event.paymentId!),
  );
  assert(
    canonicalWorkbookCutoverJson([...provenanceInvoiceIds].sort()) ===
      canonicalWorkbookCutoverJson(
        [...batchEvidence.supersededInvoiceIds].sort(),
      ),
    "pre-cutover effective invoices do not have a 1:1 retained provenance event",
  );
  assert(
    canonicalWorkbookCutoverJson([...provenancePaymentIds].sort()) ===
      canonicalWorkbookCutoverJson(
        [...batchEvidence.supersededPaymentIds].sort(),
      ),
    "pre-cutover effective payments do not have a 1:1 retained provenance event",
  );

  assert(
    effectiveInvoices.every((invoice) =>
      permittedEffectiveInvoiceIds.has(invoice.id),
    ) && effectiveInvoices.length === permittedEffectiveInvoiceIds.size,
    "an included Student retains an unvoided pre-cutover invoice or credit",
  );
  const reconstructionSet = new Set(reconstructionPaymentIds);
  assert(
    effectivePayments.every(
      (payment) =>
        payment.status === "success" && reconstructionSet.has(payment.id),
    ) && effectivePayments.length === reconstructionPaymentIds.length,
    "an included Student retains an effective pre-cutover payment",
  );

  const allowedActivePaymentLinkIds = new Set<string>();
  for (const applicant of onboardingApplicants) {
    const expectedInvoiceId = canonicalInvoiceByStudentId.get(
      applicant.studentId!,
    );
    assert(
      expectedInvoiceId,
      `Applicant ${applicant.id} is linked to a non-included Student`,
    );
    const invoice = applicant.enrollmentInvoice;
    const firstInstallment = invoice?.plan?.installments[0];
    const verifiedCashXof = sum(
      invoice?.payments.map((payment) => payment.amount) ?? [],
      `Applicant ${applicant.id} verified enrollment cash`,
    );
    const remainingCashXof = firstInstallment
      ? Math.max(0, firstInstallment.amountDue - verifiedCashXof)
      : 0;

    if (applicant.onboardingStatus === "payment_pending") {
      assert(
        invoice &&
          invoice.id === expectedInvoiceId &&
          applicant.enrollmentInvoiceId === expectedInvoiceId &&
          invoice.status !== "void" &&
          firstInstallment,
        `Applicant ${applicant.id} is not gated by the canonical replacement invoice`,
      );
      assert(
        applicant.requiredEnrollmentCashXof === firstInstallment.amountDue,
        `Applicant ${applicant.id} enrollment-cash requirement differs from the canonical first installment`,
      );
      assert(
        remainingCashXof > 0,
        `Applicant ${applicant.id} remains payment-pending after satisfying the enrollment cash gate`,
      );
      const link = applicant.activeOnboardingPaymentLink;
      assert(
        link &&
          applicant.activeOnboardingPaymentLinkId === link.id &&
          link.status === "active" &&
          link.studentId === applicant.studentId &&
          link.invoiceId === expectedInvoiceId &&
          link.onboardingApplicantId === applicant.id &&
          link.amountXof === remainingCashXof &&
          link.costCenterCode === invoice.costCenterCode &&
          link.dueDate?.getTime() === firstInstallment.dueDate.getTime(),
        `Applicant ${applicant.id} active payment link does not match the canonical remaining enrollment balance`,
      );
      assert(
        !evidenceIds.link.has(link.id),
        `Applicant ${applicant.id} reuses a pre-cutover active payment link`,
      );
      allowedActivePaymentLinkIds.add(link.id);
      continue;
    }

    assert(
      applicant.activeOnboardingPaymentLinkId === null,
      `Applicant ${applicant.id} has an active-link pointer outside payment-pending onboarding`,
    );
  }
  assert(
    sourcePaymentSubmissions.every(
      (row) => !["awaiting_proof", "submitted"].includes(row.status),
    ) &&
      [...evidenceIds.submission].every((id) =>
        sourcePaymentSubmissions.some(
          (row) => row.id === id && row.status === "cancelled",
        ),
      ),
    "proof-payment attempts were not all cancelled",
  );
  assert(
    sourcePaymentLinks.every(
      (row) =>
        row.status !== "active" || allowedActivePaymentLinkIds.has(row.id),
    ) &&
      sourcePaymentLinks.filter((row) => row.status === "active").length ===
        allowedActivePaymentLinkIds.size &&
      [...evidenceIds.link].every((id) =>
        sourcePaymentLinks.some(
          (row) => row.id === id && row.status === "cancelled",
        ),
      ),
    "pre-cutover payment links were not cancelled or a non-canonical active link remains",
  );
  assert(
    sourcePiSpiRequests.every(
      (row) => !["initiated", "sent"].includes(row.status),
    ) &&
      [...evidenceIds.piSpi].every((id) =>
        sourcePiSpiRequests.some(
          (row) => row.id === id && row.status === "cancelled",
        ),
      ),
    "PI-SPI attempts were not all cancelled",
  );
  assert(
    sourcePendingPayments.every(
      (row) => !["pending", "refund_pending"].includes(row.status),
    ) &&
      [...evidenceIds.payment].every((id) =>
        sourcePendingPayments.some(
          (row) => row.id === id && row.status === "cancelled",
        ),
      ),
    "pending payments were not all cancelled or a refund remains pending",
  );

  const activationLogs = await prisma.auditLog.findMany({
    where: {
      entity: "Applicant",
      entityId: { in: activatedApplicants.map((applicant) => applicant.id) },
      action: "onboarding-activated",
    },
    select: { entityId: true, action: true, data: true },
  });
  const activationAuditRows = auditActivationEvidence({
    expected: batchEvidence.activations,
    applicants: activatedApplicants,
    auditLogs: activationLogs,
  });
  assert(
    canonicalWorkbookCutoverJson(
      activatedApplicants.map((applicant) => applicant.id).sort(),
    ) ===
      canonicalWorkbookCutoverJson(
        [...batchEvidence.activationApplicantIds].sort(),
      ),
    "activation Applicant IDs differ from batch evidence",
  );
  assert(
    replayPlanCount === 1,
    "confirmation plan digest is not a unique replay anchor",
  );
  assert(
    replayManifestCount === 1,
    "identity manifest digest is not a unique replay anchor",
  );

  return {
    batchId: batch.id,
    ok: true,
    sourceRecords: batch.sourceRecords.length,
    workbookRows: groups.workbook.length,
    productionStudents: groups.production.length,
    applicants: groups.applicants.length,
    includedWorkbookRows: groups.included.length,
    excludedWorkbookRows: groups.excluded.length,
    sourceBilledXof: safeXof(batch.sourceBilledXof, "source billed"),
    sourcePaidXof: safeXof(batch.sourcePaidXof, "source paid"),
    includedBilledXof: safeXof(batch.includedBilledXof, "included billed"),
    includedPaidXof: safeXof(batch.includedPaidXof, "included paid"),
    excludedBilledXof: safeXof(batch.excludedBilledXof, "excluded billed"),
    excludedPaidXof: safeXof(batch.excludedPaidXof, "excluded paid"),
    canonicalInvoices: groups.included.length,
    reconstructionPayments: reconstructionPaymentIds.length,
    archivedStudents: groups.archived.length,
    preservedAcademicRecords,
    preservedApplicants: groups.applicants.length,
    voidedInvoices,
    supersededPayments,
    cancelledInFlightAttempts:
      evidenceIds.submission.size +
      evidenceIds.link.size +
      evidenceIds.piSpi.size +
      evidenceIds.payment.size,
    paymentAuditRows,
    reviewerAttestations,
    batchAuditRows: 1,
    enrollmentActivations: activatedApplicants.length,
    activationAuditRows,
    replayAnchorBatchCount: 1,
    replayAnchorManifestCount: 1,
  };
}

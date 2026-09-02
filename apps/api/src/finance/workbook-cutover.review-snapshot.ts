import { createHash } from "node:crypto";
import { chmod, lstat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { Prisma, PrismaClient } from "@mydaust/db";
import {
  WorkbookCutoverProductionSnapshotSchema,
  workbookCutoverProductionSnapshotDigest,
  type WorkbookCutoverProductionSnapshot,
} from "./workbook-cutover.extraction.js";
import {
  WORKBOOK_CUTOVER_BASELINE,
  canonicalWorkbookCutoverJson,
} from "./workbook-cutover.manifest.js";
import type { WorkbookCutoverLiveSnapshot } from "./workbook-cutover.planner.js";
import {
  captureWorkbookCutoverLiveSnapshot,
  workbookCutoverApplicantSourceRecordDigest,
  workbookCutoverProductionStudentSourceRecordDigest,
} from "./workbook-cutover.snapshot.js";

export const WORKBOOK_CUTOVER_PRODUCTION_SNAPSHOT_MAX_BYTES = 50 * 1024 * 1024;

export interface WorkbookCutoverProductionSnapshotScope {
  academicYearLabel: string;
  academicYearStart: number;
  capturedAt?: Date;
}

export interface WorkbookCutoverProductionSnapshotWriteResult {
  bytes: number;
  fileSha256: string;
  canonicalSha256: string;
}

/**
 * Projects the mutation-oriented live snapshot to the smaller immutable source
 * reviewed by Finance, Registrar, and Admissions. No source row is inferred or
 * joined by name: the live source keys and database IDs remain authoritative.
 */
export function projectWorkbookCutoverProductionSnapshot(
  live: WorkbookCutoverLiveSnapshot,
): WorkbookCutoverProductionSnapshot {
  const students = [...live.students]
    .sort((left, right) => compareText(left.sourceKey, right.sourceKey))
    .map((student) => {
      const sourceRecord = {
        studentId: student.studentId,
        personId: student.personId,
        studentNo: student.studentNo,
        firstName: student.firstName,
        lastName: student.lastName,
        loginEmail: student.loginEmail,
        recordStatus: student.recordStatus,
        personStatus: student.personStatus,
        roles: student.roles,
        academicFingerprintSha256: student.academicFingerprintSha256,
      };
      if (
        student.sourceRecordSha256 !==
        workbookCutoverProductionStudentSourceRecordDigest(sourceRecord)
      ) {
        throw new Error(
          "A production Student source fingerprint is not canonical",
        );
      }
      return {
        sourceKey: student.sourceKey,
        sourceRecordSha256: student.sourceRecordSha256,
        ...sourceRecord,
        academicFingerprint: student.academicFingerprint,
      };
    });
  const applicants = [...live.applicants]
    .sort((left, right) => compareText(left.sourceKey, right.sourceKey))
    .map((applicant) => {
      const sourceRecord = {
        applicantId: applicant.applicantId,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        stage: applicant.stage,
      };
      if (
        applicant.sourceRecordSha256 !==
        workbookCutoverApplicantSourceRecordDigest(sourceRecord)
      ) {
        throw new Error("An Applicant source fingerprint is not canonical");
      }
      return {
        sourceKey: applicant.sourceKey,
        sourceRecordSha256: applicant.sourceRecordSha256,
        ...sourceRecord,
      };
    });
  return WorkbookCutoverProductionSnapshotSchema.parse({
    schemaVersion: 1,
    capturedAt: live.capturedAt,
    academicYearLabel: live.academicYearLabel,
    sourceAsOfDate: WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate,
    controls: {
      productionStudents: students.length,
      productionActiveStudents: students.filter(
        (student) => student.recordStatus === "active",
      ).length,
      productionPendingPaymentStudents: students.filter(
        (student) => student.recordStatus === "pending_payment",
      ).length,
      productionArchivedStudents: students.filter(
        (student) => student.recordStatus === "archived",
      ).length,
      currentApplicants: applicants.length,
    },
    students,
    applicants,
  });
}

export type WorkbookCutoverProductionSnapshotControls =
  WorkbookCutoverProductionSnapshot["controls"];

/**
 * Fail closed when the database no longer matches the operator-declared live
 * controls captured immediately before export. Production and Admissions stay
 * live while a review is in progress, so these counts must not be pinned to an
 * older workbook version; the resulting snapshot digest becomes the immutable
 * review anchor instead.
 */
export function assertWorkbookCutoverProductionSnapshotControls(
  snapshot: WorkbookCutoverProductionSnapshot,
  expected: WorkbookCutoverProductionSnapshotControls,
): void {
  if (
    canonicalWorkbookCutoverJson(snapshot.controls) !==
    canonicalWorkbookCutoverJson(expected)
  ) {
    throw new Error(
      "Production roster controls drifted from the operator-declared live controls",
    );
  }
}

/** Retained for verifying artifacts frozen against the original v1 review. */
export function assertWorkbookCutoverProductionSnapshotBaseline(
  snapshot: WorkbookCutoverProductionSnapshot,
): void {
  const expected = {
    productionStudents: WORKBOOK_CUTOVER_BASELINE.productionStudents,
    productionActiveStudents:
      WORKBOOK_CUTOVER_BASELINE.productionActiveStudents,
    productionPendingPaymentStudents:
      WORKBOOK_CUTOVER_BASELINE.productionPendingPaymentStudents,
    productionArchivedStudents:
      WORKBOOK_CUTOVER_BASELINE.productionArchivedStudents,
    currentApplicants: WORKBOOK_CUTOVER_BASELINE.currentApplicants,
  };
  assertWorkbookCutoverProductionSnapshotControls(snapshot, expected);
}

/**
 * Shared transaction guard for the exporter. The callback is deliberately
 * injected so the isolation/read-only contract can be tested without a DB.
 */
export async function inWorkbookCutoverReadOnlyRepeatableReadTransaction<T>(
  prisma: Pick<PrismaClient, "$transaction">,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return operation(tx);
    },
    {
      isolationLevel: "RepeatableRead",
      maxWait: 30_000,
      timeout: 120_000,
    },
  );
}

/** Captures and projects one coherent production view without any mutation. */
export async function captureWorkbookCutoverProductionSnapshotReadOnly(
  prisma: PrismaClient,
  scope: WorkbookCutoverProductionSnapshotScope,
): Promise<WorkbookCutoverProductionSnapshot> {
  return inWorkbookCutoverReadOnlyRepeatableReadTransaction(
    prisma,
    async (tx) =>
      projectWorkbookCutoverProductionSnapshot(
        await captureWorkbookCutoverLiveSnapshot(
          tx,
          {
            academicYearLabel: scope.academicYearLabel,
            academicYearStart: scope.academicYearStart,
          },
          { capturedAt: scope.capturedAt },
        ),
      ),
  );
}

/** Writes a bounded, non-overwriting, private snapshot artifact. */
export async function writeWorkbookCutoverProductionSnapshotFile(
  outputPath: string,
  snapshot: WorkbookCutoverProductionSnapshot,
): Promise<WorkbookCutoverProductionSnapshotWriteResult> {
  if (!isAbsolute(outputPath)) {
    throw new Error("Production snapshot output path must be absolute");
  }
  const parsed = WorkbookCutoverProductionSnapshotSchema.parse(snapshot);
  const bytes = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  if (bytes.byteLength > WORKBOOK_CUTOVER_PRODUCTION_SNAPSHOT_MAX_BYTES) {
    throw new Error("Production snapshot exceeds the private artifact limit");
  }
  const resolved = resolve(outputPath);
  await writeFile(resolved, bytes, { mode: 0o600, flag: "wx" });
  await chmod(resolved, 0o600);
  const metadata = await lstat(resolved);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error("Production snapshot output is not a private regular file");
  }
  return {
    bytes: bytes.byteLength,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    canonicalSha256: workbookCutoverProductionSnapshotDigest(parsed),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

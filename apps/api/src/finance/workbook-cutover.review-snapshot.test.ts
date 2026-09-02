import {
  mkdtemp,
  lstat,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@mydaust/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  workbookCutoverProductionSnapshotDigest,
  type WorkbookCutoverProductionSnapshot,
} from "./workbook-cutover.extraction.js";
import {
  workbookCutoverAcademicFingerprintDigest,
  workbookCutoverApplicantKey,
  workbookCutoverProductionStudentKey,
} from "./workbook-cutover.manifest.js";
import type { WorkbookCutoverLiveSnapshot } from "./workbook-cutover.planner.js";
import {
  workbookCutoverApplicantSourceRecordDigest,
  workbookCutoverProductionStudentSourceRecordDigest,
} from "./workbook-cutover.snapshot.js";
import {
  assertWorkbookCutoverProductionSnapshotBaseline,
  assertWorkbookCutoverProductionSnapshotControls,
  inWorkbookCutoverReadOnlyRepeatableReadTransaction,
  projectWorkbookCutoverProductionSnapshot,
  writeWorkbookCutoverProductionSnapshotFile,
} from "./workbook-cutover.review-snapshot.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("workbook cutover production review snapshot", () => {
  it("pure-projects every official identity and Applicant with exact controls", () => {
    const live = liveSnapshotFixture();
    const projected = projectWorkbookCutoverProductionSnapshot(live);

    expect(projected.controls).toEqual({
      productionStudents: 2,
      productionActiveStudents: 1,
      productionPendingPaymentStudents: 1,
      productionArchivedStudents: 0,
      currentApplicants: 1,
    });
    expect(projected.sourceAsOfDate).toBe("2026-08-29");
    expect(projected.students.map((row) => row.sourceKey)).toEqual([
      workbookCutoverProductionStudentKey("student-a"),
      workbookCutoverProductionStudentKey("student-b"),
    ]);
    expect(projected.students[0]).not.toHaveProperty(
      "financialFingerprintSha256",
    );
    expect(projected.applicants).toHaveLength(1);
    expect(() =>
      assertWorkbookCutoverProductionSnapshotBaseline(projected),
    ).toThrow(/operator-declared live controls/);
    expect(() =>
      assertWorkbookCutoverProductionSnapshotControls(
        projected,
        projected.controls,
      ),
    ).not.toThrow();
    expect(() =>
      assertWorkbookCutoverProductionSnapshotControls(projected, {
        ...projected.controls,
        currentApplicants: projected.controls.currentApplicants + 1,
      }),
    ).toThrow(/operator-declared live controls/);
  });

  it("rejects noncanonical source-record fingerprints", () => {
    const live = liveSnapshotFixture();
    live.students[0]!.sourceRecordSha256 = "f".repeat(64);
    expect(() => projectWorkbookCutoverProductionSnapshot(live)).toThrow(
      /fingerprint is not canonical/,
    );
  });

  it("sets READ ONLY inside one REPEATABLE READ transaction", async () => {
    const execute = vi.fn(async () => 0);
    const operation = vi.fn(async () => "captured");
    const transaction = vi.fn(
      async (
        callback: (tx: {
          $executeRawUnsafe: typeof execute;
        }) => Promise<string>,
        options: { isolationLevel: string },
      ) => {
        expect(options).toEqual({
          isolationLevel: "RepeatableRead",
          maxWait: 30_000,
          timeout: 120_000,
        });
        return callback({ $executeRawUnsafe: execute });
      },
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as Pick<PrismaClient, "$transaction">;

    await expect(
      inWorkbookCutoverReadOnlyRepeatableReadTransaction(
        prisma,
        operation as never,
      ),
    ).resolves.toBe("captured");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("SET TRANSACTION READ ONLY");
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0]!,
    );
  });

  it("writes one bounded private artifact and refuses overwrite or symlinks", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "mydaust-cutover-review-snapshot-"),
    );
    temporaryDirectories.push(directory);
    const snapshot = projectWorkbookCutoverProductionSnapshot(
      liveSnapshotFixture(),
    );
    const output = join(directory, "production-review-snapshot.json");
    const result = await writeWorkbookCutoverProductionSnapshotFile(
      output,
      snapshot,
    );

    const metadata = await lstat(output);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(result.canonicalSha256).toBe(
      workbookCutoverProductionSnapshotDigest(snapshot),
    );
    expect(JSON.parse((await readFile(output)).toString("utf8"))).toEqual(
      snapshot,
    );
    await expect(
      writeWorkbookCutoverProductionSnapshotFile(output, snapshot),
    ).rejects.toMatchObject({ code: "EEXIST" });

    const target = join(directory, "existing-target.json");
    const link = join(directory, "snapshot-link.json");
    await writeFile(target, "do not overwrite", { mode: 0o600 });
    await symlink(target, link);
    await expect(
      writeWorkbookCutoverProductionSnapshotFile(link, snapshot),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(
      writeWorkbookCutoverProductionSnapshotFile(
        "relative-production-snapshot.json",
        snapshot,
      ),
    ).rejects.toThrow(/must be absolute/);
  });
});

function liveSnapshotFixture(): WorkbookCutoverLiveSnapshot {
  const academicFingerprint = {
    transcriptCount: 0,
    transcriptSha256: hash("transcript"),
    enrollmentCount: 0,
    enrollmentSha256: hash("enrollment"),
    gradeSnapshotCount: 0,
    gradeSnapshotSha256: hash("grades"),
    creditsSha256: hash("credits"),
    gpaSha256: hash("gpa"),
  };
  const academicFingerprintSha256 =
    workbookCutoverAcademicFingerprintDigest(academicFingerprint);
  const students = [
    {
      studentId: "student-b",
      personId: "person-b",
      studentNo: "S2026002BB",
      firstName: "Second",
      lastName: "Student",
      loginEmail: null,
      recordStatus: "pending_payment" as const,
      personStatus: "active" as const,
      roles: [] as string[],
    },
    {
      studentId: "student-a",
      personId: "person-a",
      studentNo: "S2026001AA",
      firstName: "First",
      lastName: "Student",
      loginEmail: "first.student@mydaust.com",
      recordStatus: "active" as const,
      personStatus: "active" as const,
      roles: ["student"],
    },
  ].map((identity) => {
    const sourceRecord = { ...identity, academicFingerprintSha256 };
    return {
      sourceKey: workbookCutoverProductionStudentKey(identity.studentId),
      sourceRecordSha256:
        workbookCutoverProductionStudentSourceRecordDigest(sourceRecord),
      ...sourceRecord,
      academicFingerprint,
      financialFingerprintSha256: hash(`finance-${identity.studentId}`),
      pendingRefundIds: [],
      inFlightProofSubmissionIds: [],
      inFlightPaymentLinkIds: [],
      inFlightPiSpiRequestIds: [],
    };
  });
  const applicantSource = {
    applicantId: "applicant-a",
    firstName: "Pending",
    lastName: "Applicant",
    email: "pending.applicant@example.com",
    stage: "review",
  };
  return {
    schemaVersion: 1,
    capturedAt: "2026-09-01T10:00:00.000Z",
    academicYearLabel: "2026-2027",
    students,
    applicants: [
      {
        sourceKey: workbookCutoverApplicantKey(applicantSource.applicantId),
        sourceRecordSha256:
          workbookCutoverApplicantSourceRecordDigest(applicantSource),
        ...applicantSource,
      },
    ],
    feeSchedules: [],
    terms: [],
    billingCatalogFingerprintSha256: hash("catalog"),
    studentNumberSequence: null,
    existingStudentNumbers: students.map((student) => student.studentNo),
    existingLoginEmails: students.flatMap((student) =>
      student.loginEmail ? [student.loginEmail] : [],
    ),
    orphanPendingRefundIds: [],
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString("hex").padEnd(64, "0").slice(0, 64);
}

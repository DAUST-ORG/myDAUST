import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import {
  TrustedLegacyCohortExtractionSchema,
  trustedLegacyCohortExtractionDigest,
} from "./legacy-cohort-import.extraction.js";
import { LegacyCohortManifestSchema } from "./legacy-cohort-import.manifest.js";
import {
  LegacyCohortImportBlockedError,
  executeLegacyCohortImport,
  planLegacyCohortImport,
} from "./legacy-cohort-import.runner.js";

const SCHEMA = `legacy_cohort_import_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

const REVIEW_REASON =
  "Reviewed against the preserved legacy workbook and signed reconciliation.";

let prisma: PrismaClient;
let actorEmail: string;
let academicYearId: string;

async function expectConstraint(
  operation: Promise<unknown>,
  constraintName: string,
): Promise<void> {
  await expect(operation).rejects.toThrow(constraintName);
}

function buildReviewedCohort(input?: {
  workbookSha?: string;
  firstStudentNo?: string;
  secondStudentNo?: string;
  firstStudentEmail?: string;
  firstGuardianEmail?: string | null;
  secondStudentEmail?: string;
  secondGuardianEmail?: string | null;
  programCode?: string | null;
  documentedReference?: string;
  paymentAmountXof?: number;
  onboardingPolicy?:
    | { disposition: "respect_payment_gate" }
    | {
        disposition: "activate_all_legacy_students";
        reviewed: true;
        reason: string;
      };
}) {
  const suffix = randomUUID().slice(0, 8);
  const workbookSha = input?.workbookSha ?? "a".repeat(64);
  const firstFingerprint = "b".repeat(64);
  const secondFingerprint = "c".repeat(64);
  const repeatedFingerprint = "d".repeat(64);
  const firstStudentNo = input?.firstStudentNo ?? "F202600001";
  const secondStudentNo = input?.secondStudentNo ?? "F202600002";
  const firstStudentEmail =
    input?.firstStudentEmail ?? `legacy-paid-${suffix}@test.local`;
  const firstGuardianEmail =
    input?.firstGuardianEmail === undefined ? null : input.firstGuardianEmail;
  const secondStudentEmail =
    input?.secondStudentEmail ?? `legacy-unpaid-${suffix}@test.local`;
  const secondGuardianEmail =
    input?.secondGuardianEmail === undefined ? null : input.secondGuardianEmail;
  const programCode =
    input?.programCode === undefined ? null : input.programCode;
  const paymentAmountXof = input?.paymentAmountXof ?? 1_000_000;
  const guardianEmailDecision = (email: string | null) =>
    email
      ? {
          sourceEmail: email,
          finalEmail: email,
          disposition: "use_source" as const,
        }
      : {
          sourceEmail: null,
          finalEmail: null,
          disposition: "unavailable" as const,
          reason: REVIEW_REASON,
        };
  const extraction = TrustedLegacyCohortExtractionSchema.parse({
    schemaVersion: 1,
    extractor: { name: "legacy-cohort-extractor", version: "1" },
    sourceWorkbookSha256: workbookSha,
    sourceRowCount: 3,
    sourcePaidTotalXof: paymentAmountXof,
    rows: [
      {
        sourceSheet: "PAID",
        sourceRowNumber: 2,
        rowFingerprintSha256: firstFingerprint,
        sourceLabel: "paid",
        sourceLegacyStudentNo: firstStudentNo,
        paymentAmountXof,
      },
      {
        sourceSheet: "UNPAID",
        sourceRowNumber: 2,
        rowFingerprintSha256: secondFingerprint,
        sourceLabel: "unpaid",
        sourceLegacyStudentNo: secondStudentNo,
        paymentAmountXof: null,
      },
      {
        sourceSheet: "UNPAID",
        sourceRowNumber: 3,
        rowFingerprintSha256: repeatedFingerprint,
        sourceLabel: "unpaid",
        sourceLegacyStudentNo: secondStudentNo,
        paymentAmountXof: null,
      },
    ],
  });
  const manifest = LegacyCohortManifestSchema.parse({
    schemaVersion: 1,
    importName: "Reviewed Fall 2026 legacy cohort integration fixture",
    sourceWorkbook: {
      fileName: "New_Students_Fall_2026 - SN.xlsx",
      sha256: workbookSha,
    },
    sourceExtractionSha256: trustedLegacyCohortExtractionDigest(extraction),
    sourceRowCount: 3,
    sourcePaidTotalXof: paymentAmountXof,
    academicYear: { id: academicYearId, label: "2026-2027" },
    currency: "XOF",
    notificationPolicy: "suppress_all",
    onboardingPolicy: input?.onboardingPolicy ?? {
      disposition: "respect_payment_gate",
    },
    guardians: [
      {
        guardianKey: "guardian-paid",
        firstName: "Paid",
        lastName: "Parent",
        phone: "+221700000101",
        address: null,
        email: guardianEmailDecision(firstGuardianEmail),
        identityDecision: {
          disposition: "create_new",
          reviewed: true,
          reason: REVIEW_REASON,
        },
      },
      {
        guardianKey: "guardian-unpaid",
        firstName: "Unpaid",
        lastName: "Parent",
        phone: "+221700000102",
        address: null,
        email: guardianEmailDecision(secondGuardianEmail),
        identityDecision: {
          disposition: "create_new",
          reviewed: true,
          reason: REVIEW_REASON,
        },
      },
    ],
    people: [
      {
        personKey: "person-paid",
        legacyStudentNo: firstStudentNo,
        legacyIdDecision: { disposition: "use_source" },
        groupingReview: { reviewed: true, reason: REVIEW_REASON },
        applicant: {
          firstName: "Paid",
          lastName: "Student",
          dateOfBirth: "2006-03-12",
          programCode,
          phone: "+221700000201",
          term: "Fall 2026",
          studentEmail: {
            sourceEmail: firstStudentEmail,
            finalEmail: firstStudentEmail,
            disposition: "use_source",
          },
        },
        guardianKeys: ["guardian-paid"],
        sources: [
          {
            sourceSheet: "PAID",
            sourceRowNumber: 2,
            rowFingerprintSha256: firstFingerprint,
            disposition: { kind: "cash", paymentKey: "payment-paid" },
          },
        ],
        payments: [
          {
            paymentKey: "payment-paid",
            sourceCoordinates: [{ sourceSheet: "PAID", sourceRowNumber: 2 }],
            amountXof: paymentAmountXof,
            evidence: input?.documentedReference
              ? {
                  status: "documented",
                  settledOn: "2026-08-05",
                  dateAccuracy: "exact",
                  method: "wire",
                  externalReference: input.documentedReference,
                }
              : {
                  status: "reviewed_legacy_gap",
                  settledOn: "2026-08-05",
                  dateAccuracy: "administrative_estimate",
                  method: "legacy_unknown",
                  unknownFields: ["settlement_date", "method", "reference"],
                  deterministicReferenceConsent: true,
                  reason: REVIEW_REASON,
                },
            reviewed: true,
          },
        ],
      },
      {
        personKey: "person-unpaid",
        legacyStudentNo: secondStudentNo,
        legacyIdDecision: { disposition: "use_source" },
        groupingReview: { reviewed: true, reason: REVIEW_REASON },
        applicant: {
          firstName: "Unpaid",
          lastName: "Student",
          dateOfBirth: "2006-04-13",
          programCode,
          phone: "+221700000202",
          term: "Fall 2026",
          studentEmail: {
            sourceEmail: secondStudentEmail,
            finalEmail: secondStudentEmail,
            disposition: "use_source",
          },
        },
        guardianKeys: ["guardian-unpaid"],
        sources: [
          {
            sourceSheet: "UNPAID",
            sourceRowNumber: 2,
            rowFingerprintSha256: secondFingerprint,
            disposition: { kind: "no_cash", reason: REVIEW_REASON },
          },
          {
            sourceSheet: "UNPAID",
            sourceRowNumber: 3,
            rowFingerprintSha256: repeatedFingerprint,
            disposition: {
              kind: "duplicate",
              canonicalSource: {
                sourceSheet: "UNPAID",
                sourceRowNumber: 2,
              },
              reason: REVIEW_REASON,
            },
          },
        ],
        payments: [],
      },
    ],
    reviewNote: REVIEW_REASON,
  });
  return { manifest, extraction };
}

function buildNoCashCohort(input: {
  workbookSha: string;
  studentNo: string;
  guardianEmail?: string;
}) {
  const suffix = randomUUID().slice(0, 8);
  const fingerprint = "d".repeat(64);
  const extraction = TrustedLegacyCohortExtractionSchema.parse({
    schemaVersion: 1,
    extractor: { name: "legacy-cohort-extractor", version: "1" },
    sourceWorkbookSha256: input.workbookSha,
    sourceRowCount: 1,
    sourcePaidTotalXof: 0,
    rows: [
      {
        sourceSheet: "UNPAID",
        sourceRowNumber: 7,
        rowFingerprintSha256: fingerprint,
        sourceLabel: "unpaid",
        sourceLegacyStudentNo: input.studentNo,
        paymentAmountXof: null,
      },
    ],
  });
  const manifest = LegacyCohortManifestSchema.parse({
    schemaVersion: 1,
    importName: "Reviewed rollback cohort fixture",
    sourceWorkbook: {
      fileName: "rollback-cohort.xlsx",
      sha256: input.workbookSha,
    },
    sourceExtractionSha256: trustedLegacyCohortExtractionDigest(extraction),
    sourceRowCount: 1,
    sourcePaidTotalXof: 0,
    academicYear: { id: academicYearId, label: "2026-2027" },
    currency: "XOF",
    notificationPolicy: "suppress_all",
    guardians: [
      {
        guardianKey: "guardian-rollback",
        firstName: "Rollback",
        lastName: "Parent",
        phone: "+221700000301",
        address: null,
        email: {
          sourceEmail:
            input.guardianEmail ?? `rollback-parent-${suffix}@test.local`,
          finalEmail:
            input.guardianEmail ?? `rollback-parent-${suffix}@test.local`,
          disposition: "use_source",
        },
        identityDecision: {
          disposition: "create_new",
          reviewed: true,
          reason: REVIEW_REASON,
        },
      },
    ],
    people: [
      {
        personKey: "person-rollback",
        legacyStudentNo: input.studentNo,
        legacyIdDecision: { disposition: "use_source" },
        groupingReview: { reviewed: true, reason: REVIEW_REASON },
        applicant: {
          firstName: "Rollback",
          lastName: "Student",
          dateOfBirth: "2006-05-14",
          programCode: "BSCS",
          studentEmail: {
            sourceEmail: `rollback-student-${suffix}@test.local`,
            finalEmail: `rollback-student-${suffix}@test.local`,
            disposition: "use_source",
          },
        },
        guardianKeys: ["guardian-rollback"],
        sources: [
          {
            sourceSheet: "UNPAID",
            sourceRowNumber: 7,
            rowFingerprintSha256: fingerprint,
            disposition: { kind: "no_cash", reason: REVIEW_REASON },
          },
        ],
        payments: [],
      },
    ],
    reviewNote: REVIEW_REASON,
  });
  return { manifest, extraction };
}

function buildReviewedCohortWithExcludedSource() {
  const workbookSha = "4".repeat(64);
  const base = buildReviewedCohort({
    workbookSha,
    firstStudentNo: "F202600501",
    secondStudentNo: "F202600502",
  });
  const excludedAmountXof = 250_000;
  const extraction = TrustedLegacyCohortExtractionSchema.parse({
    ...base.extraction,
    sourceRowCount: 4,
    sourcePaidTotalXof: base.extraction.sourcePaidTotalXof + excludedAmountXof,
    rows: [
      ...base.extraction.rows,
      {
        sourceSheet: "HELD",
        sourceRowNumber: 9,
        rowFingerprintSha256: "e".repeat(64),
        sourceLabel: "paid",
        sourceLegacyStudentNo: "F202600599",
        paymentAmountXof: excludedAmountXof,
      },
    ],
  });
  const manifest = LegacyCohortManifestSchema.parse({
    ...base.manifest,
    sourceExtractionSha256: trustedLegacyCohortExtractionDigest(extraction),
    sourceRowCount: 4,
    sourcePaidTotalXof: base.manifest.sourcePaidTotalXof + excludedAmountXof,
    excludedSources: [
      {
        sourceSheet: "HELD",
        sourceRowNumber: 9,
        rowFingerprintSha256: "e".repeat(64),
        holdCodes: ["production_partial_student_candidate"],
        reason:
          "The production read-only reconciliation found a partial Student candidate that requires staff review.",
        reviewed: true,
      },
    ],
    exclusionReview: {
      reviewWorkbook: {
        fileName: "review-v3.xlsx",
        sha256: "6".repeat(64),
      },
      holdNotes: {
        fileName: "hold-notes.json",
        sha256: "7".repeat(64),
      },
    },
  });
  return { manifest, extraction, excludedAmountXof };
}

describe.skipIf(!DB_URL)("legacy cohort importer", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    const actor = await prisma.person.create({
      data: {
        email: `legacy-import-admin-${randomUUID()}@test.local`,
        firstName: "Legacy",
        lastName: "Administrator",
        kind: "staff",
        roles: ["admin"],
      },
    });
    actorEmail = actor.email;
    await prisma.costCenter.upsert({
      where: { code: "9100" },
      update: {},
      create: { code: "9100", name: "Tuition", type: "revenue" },
    });
    const department = await prisma.department.create({
      data: { code: "CSE", name: "Computer Science" },
    });
    await prisma.program.create({
      data: {
        code: "BSCS",
        name: "Computer Science",
        departmentId: department.id,
      },
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        label: "2026-2027",
        status: "active",
        startsOn: new Date("2026-08-01T00:00:00.000Z"),
        endsOn: new Date("2027-07-31T00:00:00.000Z"),
      },
    });
    academicYearId = academicYear.id;
    await prisma.term.create({
      data: {
        name: "Fall 2026",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        academicYearId,
      },
    });
    await prisma.feeSchedule.create({
      data: {
        academicYearLabel: academicYear.label,
        revision: 1,
        status: "approved",
        reason: "Legacy cohort integration fixture",
        createdById: actor.id,
        approvedById: actor.id,
        approvedAt: new Date(),
        components: {
          create: {
            key: "tuition",
            label: "Tuition",
            costCenterCode: "9100",
            annualAmountXof: 4_000_000,
            defaultSelected: true,
          },
        },
        rows: {
          create: [
            [1, "Registration", "2026-08-25"],
            [2, "Fall balance", "2026-11-25"],
            [3, "Spring registration", "2027-01-25"],
            [4, "Spring balance", "2027-04-25"],
          ].map(([sequence, label, dueOn]) => ({
            academicYearLabel: academicYear.label,
            semester: Number(sequence) < 3 ? "Fall" : "Spring",
            label: String(label),
            sequence: Number(sequence),
            dueOn: new Date(String(dueOn)),
            amountFullXof: 1_000_000,
            amountTuitionXof: 1_000_000,
          })),
        },
      },
    });
    await prisma.studentNumberSequence.create({
      data: { academicYearStart: 2026, nextValue: 31 },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("dry-runs without writes, then atomically imports F-IDs, guardians, cash, and gate states", async () => {
    const { manifest, extraction } = buildReviewedCohort();
    const invocation = { actorEmail };
    const before = {
      applicants: await prisma.applicant.count(),
      students: await prisma.student.count(),
      guardians: await prisma.person.count({ where: { kind: "parent" } }),
      batches: await prisma.legacyCohortImportBatch.count(),
    };
    const dryRun = await planLegacyCohortImport(prisma, manifest, invocation);
    expect(dryRun).toMatchObject({
      blockers: [],
      people: 2,
      guardians: 2,
      payments: 1,
      paymentAmountXof: 1_000_000,
      projectedActivations: 1,
      pendingAfterImport: 1,
    });
    expect(dryRun.warnings.map((warning) => warning.code).sort()).toEqual([
      "guardian_email_unavailable",
      "guardian_email_unavailable",
      "legacy_payment_evidence_gap",
      "program_unassigned",
      "program_unassigned",
    ]);
    expect({
      applicants: await prisma.applicant.count(),
      students: await prisma.student.count(),
      guardians: await prisma.person.count({ where: { kind: "parent" } }),
      batches: await prisma.legacyCohortImportBatch.count(),
    }).toEqual(before);

    const results = await Promise.allSettled([
      executeLegacyCohortImport(
        prisma,
        manifest,
        extraction,
        invocation,
        dryRun.planSha256,
      ),
      executeLegacyCohortImport(
        prisma,
        manifest,
        extraction,
        invocation,
        dryRun.planSha256,
      ),
    ]);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected.map((result) => String(result.reason))).toEqual([]);
    const imported = results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof executeLegacyCohortImport>>
        > => result.status === "fulfilled",
      )
      .map((result) => result.value);
    expect(imported.filter((result) => !result.alreadyImported)).toHaveLength(
      1,
    );
    expect(imported.filter((result) => result.alreadyImported)).toHaveLength(1);
    expect(imported.find((result) => !result.alreadyImported)).toMatchObject({
      peopleCreated: 2,
      guardiansCreated: 2,
      guardianLinksCreated: 2,
      paymentsImported: 1,
      importedXof: 1_000_000,
      activatedStudents: 1,
    });
    const concurrentNoop = imported.find((result) => result.alreadyImported)!;
    expect(concurrentNoop).toMatchObject({
      alreadyImported: true,
      activatedStudents: 0,
    });
    expect(concurrentNoop).not.toHaveProperty("activations");
    const recoveryPlan = await planLegacyCohortImport(
      prisma,
      manifest,
      invocation,
    );
    expect(recoveryPlan).toMatchObject({
      alreadyImportedBatchId: expect.any(String),
      planSha256: dryRun.planSha256,
    });
    const inviteCountBeforeNoop = await prisma.studentInvite.count();
    const exactNoop = await executeLegacyCohortImport(
      prisma,
      manifest,
      extraction,
      invocation,
      recoveryPlan.planSha256,
    );
    expect(exactNoop).toMatchObject({
      alreadyImported: true,
      activatedStudents: 0,
    });
    expect(exactNoop).not.toHaveProperty("activations");
    expect(await prisma.studentInvite.count()).toBe(inviteCountBeforeNoop);

    const records = await prisma.legacyCohortImportPerson.findMany({
      include: {
        applicant: { include: { activeOnboardingPaymentLink: true } },
        student: { include: { person: true, guardians: true } },
        invoice: { include: { payments: true } },
        rows: true,
      },
      orderBy: { legacyStudentNo: "asc" },
    });
    expect(records).toHaveLength(2);
    const paid = records[0]!;
    const unpaid = records[1]!;
    expect(paid.legacyStudentNo).toBe("F202600001");
    expect(paid.student.studentNo).toBe("F202600001");
    expect(paid.student.programId).toBeNull();
    expect(paid.applicant.programCode).toBeNull();
    expect(paid.applicant.parentEmail).toBeNull();
    expect(paid.applicant.onboardingStatus).toBe("enrolled");
    expect(paid.student.recordStatus).toBe("active");
    expect(paid.student.person.roles).toEqual(["student"]);
    expect(paid.onboardingStatusAtImport).toBe("enrolled");
    expect(paid.applicant.studentInviteSentAt).toBeNull();
    const suppressedInvites = await prisma.studentInvite.findMany({
      where: { studentPersonId: paid.student.personId },
    });
    expect(suppressedInvites).toHaveLength(1);
    expect(suppressedInvites[0]?.usedAt).toBeTruthy();
    expect(
      await prisma.auditLog.count({
        where: {
          entity: "Applicant",
          entityId: paid.applicantId,
          action: "legacy-cohort-activation-invite-suppressed",
        },
      }),
    ).toBe(1);
    expect(paid.invoice.amountPaid).toBe(1_000_000);
    expect(paid.invoice.payments[0]).toMatchObject({
      amount: 1_000_000,
      method: "legacy_unknown",
      status: "success",
      provider: "historical_import",
      source: "legacy_cohort_import",
    });
    expect(paid.applicant.activatedByPaymentId).toBe(
      paid.invoice.payments[0]?.id,
    );
    expect(paid.rows).toHaveLength(1);
    expect(paid.student.guardians).toHaveLength(1);
    expect(unpaid.legacyStudentNo).toBe("F202600002");
    expect(unpaid.student.programId).toBeNull();
    expect(unpaid.applicant.programCode).toBeNull();
    expect(unpaid.applicant.parentEmail).toBeNull();
    expect(unpaid.applicant.activeOnboardingPaymentLink?.payeeMeta).toBe(
      "F202600002",
    );
    expect(unpaid.applicant.onboardingStatus).toBe("payment_pending");
    expect(unpaid.student.recordStatus).toBe("pending_payment");
    expect(unpaid.student.person.roles).toEqual([]);
    expect(unpaid.onboardingStatusAtImport).toBe("payment_pending");
    expect(unpaid.invoice.amountPaid).toBe(0);
    expect(unpaid.student.guardians).toHaveLength(1);
    expect(unpaid.rows).toHaveLength(2);
    expect(
      unpaid.rows.find((row) => row.disposition === "duplicate")?.duplicateOfId,
    ).toBeTruthy();
    expect(await prisma.guardianProfile.count()).toBe(2);
    expect(
      await prisma.person.count({ where: { kind: "parent", email: null } }),
    ).toBe(2);
    expect(await prisma.guardianInvite.count()).toBe(0);
    expect(
      await prisma.studentNumberSequence.findUniqueOrThrow({
        where: { academicYearStart: 2026 },
      }),
    ).toMatchObject({ nextValue: 31 });
    await expect(
      prisma.$transaction(async (tx) => {
        const person = await tx.person.create({
          data: {
            email: `lowercase-id-${randomUUID()}@test.local`,
            firstName: "Lowercase",
            lastName: "Collision",
            kind: "student",
          },
        });
        await tx.student.create({
          data: { personId: person.id, studentNo: "f202600001" },
        });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.legacyCohortImportBatch.count()).toBe(1);
    expect(await prisma.paymentImportBatch.count()).toBe(1);
    expect(await prisma.legacyCohortImportRow.count()).toBe(3);
    expect(
      await prisma.paymentImportBatch.findUniqueOrThrow({
        where: { sourceSha256: manifest.sourceWorkbook.sha256 },
      }),
    ).toMatchObject({
      sourceGroupCount: 2,
      totalRows: 3,
      importedRows: 1,
      skippedRows: 2,
      excludedSourceGroups: 1,
      sourceTotalXof: 1_000_000n,
      importedXof: 1_000_000n,
      excludedXof: 0n,
      reviewedAdjustmentXof: 0n,
    });
  }, 120_000);

  it("activates every explicitly reviewed legacy Student after canonical cash processing", async () => {
    const { manifest, extraction } = buildReviewedCohort({
      workbookSha: "3".repeat(64),
      firstStudentNo: "F202600401",
      secondStudentNo: "F202600402",
      paymentAmountXof: 500_000,
      onboardingPolicy: {
        disposition: "activate_all_legacy_students",
        reviewed: true,
        reason:
          "The reviewed legacy migration requires every included historical Student to appear in the active registrar directory.",
      },
    });
    const invocation = { actorEmail };
    const dryRun = await planLegacyCohortImport(prisma, manifest, invocation);
    expect(dryRun).toMatchObject({
      blockers: [],
      people: 2,
      payments: 1,
      paymentAmountXof: 500_000,
      projectedActivations: 2,
      pendingAfterImport: 0,
    });
    expect(dryRun.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reviewed_legacy_activation_override",
        }),
      ]),
    );

    const result = await executeLegacyCohortImport(
      prisma,
      manifest,
      extraction,
      invocation,
      dryRun.planSha256,
    );
    expect(result).toMatchObject({
      alreadyImported: false,
      peopleCreated: 2,
      paymentsImported: 1,
      importedXof: 500_000,
      activatedStudents: 2,
    });

    const records = await prisma.legacyCohortImportPerson.findMany({
      where: { batchId: result.batchId },
      include: {
        applicant: true,
        student: { include: { person: true } },
        invoice: { include: { payments: true } },
      },
      orderBy: { legacyStudentNo: "asc" },
    });
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.onboardingStatusAtImport).toBe("enrolled");
      expect(record.applicant.onboardingStatus).toBe("enrolled");
      expect(record.applicant.activatedByPaymentId).toBeNull();
      expect(record.applicant.activeOnboardingPaymentLinkId).toBeNull();
      expect(record.applicant.statusTokenHash).toBeNull();
      expect(record.applicant.statusTokenRevokedAt).not.toBeNull();
      expect(record.applicant.acceptanceEmailSentAt).toBeNull();
      expect(record.applicant.studentInviteSentAt).toBeNull();
      expect(record.student.recordStatus).toBe("active");
      expect(record.student.enrolledAt).not.toBeNull();
      expect(record.student.person.roles).toContain("student");
      expect(record.student.person.passwordHash).toBeNull();
      expect(record.student.person.mustChangePassword).toBe(false);
    }
    expect(records[0]?.invoice.amountPaid).toBe(500_000);
    expect(records[0]?.invoice.payments).toHaveLength(1);
    expect(records[1]?.invoice.amountPaid).toBe(0);
    expect(
      await prisma.studentInvite.count({
        where: {
          studentPersonId: {
            in: records.map((record) => record.student.personId),
          },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.paymentLink.count({
        where: {
          onboardingApplicantId: {
            in: records.map((record) => record.applicantId),
          },
          status: "active",
        },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entity: "Applicant",
          entityId: { in: records.map((record) => record.applicantId) },
          action: "legacy-cohort-onboarding-override-activated",
        },
      }),
    ).toBe(2);
  }, 120_000);

  it("persists explicit exclusion controls and exact reruns remain no-ops", async () => {
    const { manifest, extraction, excludedAmountXof } =
      buildReviewedCohortWithExcludedSource();
    const invocation = { actorEmail };
    const before = {
      applicants: await prisma.applicant.count(),
      students: await prisma.student.count(),
      payments: await prisma.payment.count(),
      rows: await prisma.legacyCohortImportRow.count(),
    };
    const dryRun = await planLegacyCohortImport(prisma, manifest, invocation);
    expect(dryRun).toMatchObject({
      blockers: [],
      sourceRows: 4,
      includedSourceRows: 3,
      excludedSourceRows: 1,
      people: 2,
      payments: 1,
    });

    const imported = await executeLegacyCohortImport(
      prisma,
      manifest,
      extraction,
      invocation,
      dryRun.planSha256,
    );
    expect(imported).toMatchObject({
      alreadyImported: false,
      peopleCreated: 2,
      paymentsImported: 1,
    });
    expect(await prisma.applicant.count()).toBe(before.applicants + 2);
    expect(await prisma.student.count()).toBe(before.students + 2);
    expect(await prisma.payment.count()).toBe(before.payments + 1);
    expect(await prisma.legacyCohortImportRow.count()).toBe(before.rows + 3);
    expect(
      await prisma.student.findFirst({
        where: {
          studentNo: { equals: "F202600599", mode: "insensitive" },
        },
      }),
    ).toBeNull();
    expect(
      await prisma.paymentImportBatch.findUniqueOrThrow({
        where: { sourceSha256: manifest.sourceWorkbook.sha256 },
      }),
    ).toMatchObject({
      totalRows: 4,
      importedRows: 1,
      skippedRows: 3,
      excludedSourceGroups: 2,
      sourceTotalXof: 1_250_000n,
      importedXof: 1_000_000n,
      excludedXof: BigInt(excludedAmountXof),
      reviewedAdjustmentXof: 0n,
      errorSummary: expect.objectContaining({
        explicitlyExcludedSourceRows: 1,
        excludedHoldCodeCounts: {
          production_partial_student_candidate: 1,
        },
      }),
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entity: "LegacyCohortImportBatch",
        entityId: imported.batchId,
        action: "legacy-cohort-imported",
      },
    });
    expect(audit.data).toEqual(
      expect.objectContaining({
        includedSourceRows: 3,
        excludedSourceRows: 1,
        excludedHoldCodeCounts: {
          production_partial_student_candidate: 1,
        },
      }),
    );

    const rerunPlan = await planLegacyCohortImport(
      prisma,
      manifest,
      invocation,
    );
    const rerun = await executeLegacyCohortImport(
      prisma,
      manifest,
      extraction,
      invocation,
      rerunPlan.planSha256,
    );
    expect(rerun).toMatchObject({
      batchId: imported.batchId,
      alreadyImported: true,
      peopleCreated: 0,
      paymentsImported: 0,
    });
    expect(await prisma.applicant.count()).toBe(before.applicants + 2);
    expect(await prisma.student.count()).toBe(before.students + 2);
    expect(await prisma.payment.count()).toBe(before.payments + 1);
    expect(await prisma.legacyCohortImportRow.count()).toBe(before.rows + 3);
  }, 120_000);

  it("enforces contact-only parent email and credential constraints", async () => {
    await expectConstraint(
      prisma.person.create({
        data: {
          firstName: "Missing",
          lastName: "Staff Email",
          kind: "staff",
          roles: ["registrar"],
        },
      }),
      "Person_null_email_parent_only_check",
    );
    await expectConstraint(
      prisma.person.create({
        data: {
          email: "   ",
          firstName: "Blank",
          lastName: "Parent Email",
          kind: "parent",
          roles: ["parent"],
        },
      }),
      "Person_email_nonblank_check",
    );
    await expectConstraint(
      prisma.person.create({
        data: {
          email: null,
          firstName: "Password",
          lastName: "Without Email",
          kind: "parent",
          roles: ["parent"],
          passwordHash: "not-a-real-hash",
        },
      }),
      "Person_null_email_no_password_check",
    );
    await expectConstraint(
      prisma.person.create({
        data: {
          email: null,
          firstName: "Forced Change",
          lastName: "Without Email",
          kind: "parent",
          roles: ["parent"],
          mustChangePassword: true,
        },
      }),
      "Person_null_email_no_forced_change_check",
    );
  });

  it("still blocks an unknown non-null reviewed program", async () => {
    const { manifest } = buildReviewedCohort({
      workbookSha: "2".repeat(64),
      firstStudentNo: "F202600301",
      secondStudentNo: "F202600302",
      programCode: "UNKNOWN",
    });

    const plan = await planLegacyCohortImport(prisma, manifest, { actorEmail });

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "program_not_found" }),
      ]),
    );
  });

  it("blocks a documented reference already retained in canonical ledger evidence", async () => {
    const existing = await prisma.legacyCohortImportPerson.findFirstOrThrow({
      include: { invoice: true },
    });
    await prisma.payment.create({
      data: {
        invoiceId: existing.invoiceId,
        studentId: existing.studentId,
        amount: 1,
        method: "wire",
        status: "success",
        provider: "manual",
        providerRef: `existing-ledger-${randomUUID()}`,
        source: "test",
        settledAt: new Date("2026-08-04T12:00:00.000Z"),
        ipnPayload: { externalReference: "BANK-42" },
      },
    });
    const { manifest } = buildReviewedCohort({
      workbookSha: "f".repeat(64),
      firstStudentNo: "F202600101",
      secondStudentNo: "F202600102",
      documentedReference: "bank42",
    });

    const plan = await planLegacyCohortImport(prisma, manifest, { actorEmail });

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "documented_payment_reference_already_recorded",
        }),
      ]),
    );
  });

  it("blocks a guardian email already reserved by an Applicant", async () => {
    const guardianEmail = `applicant-reserved-${randomUUID()}@test.local`;
    await prisma.applicant.create({
      data: {
        firstName: "Reserved",
        lastName: "Applicant",
        email: guardianEmail,
      },
    });
    const { manifest } = buildNoCashCohort({
      workbookSha: "1".repeat(64),
      studentNo: "F202600201",
      guardianEmail,
    });

    const plan = await planLegacyCohortImport(prisma, manifest, { actorEmail });

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "guardian_email_applicant_collision" }),
      ]),
    );
  });

  it("fails closed after a clean review becomes stale without partial cohort writes", async () => {
    const { manifest, extraction } = buildNoCashCohort({
      workbookSha: "e".repeat(64),
      studentNo: "F202600099",
    });
    const invocation = { actorEmail };
    const dryRun = await planLegacyCohortImport(prisma, manifest, invocation);
    expect(dryRun.blockers).toEqual([]);

    const conflictingPerson = await prisma.person.create({
      data: {
        email: `legacy-conflict-${randomUUID()}@test.local`,
        firstName: "Existing",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    await prisma.student.create({
      data: {
        personId: conflictingPerson.id,
        studentNo: "F202600099",
      },
    });
    const before = {
      applicants: await prisma.applicant.count(),
      guardians: await prisma.person.count({ where: { kind: "parent" } }),
      batches: await prisma.legacyCohortImportBatch.count(),
    };

    await expect(
      executeLegacyCohortImport(
        prisma,
        manifest,
        extraction,
        invocation,
        dryRun.planSha256,
      ),
    ).rejects.toBeInstanceOf(LegacyCohortImportBlockedError);
    expect({
      applicants: await prisma.applicant.count(),
      guardians: await prisma.person.count({ where: { kind: "parent" } }),
      batches: await prisma.legacyCohortImportBatch.count(),
    }).toEqual(before);
    expect(
      await prisma.legacyCohortImportBatch.findUnique({
        where: { sourceSha256: manifest.sourceWorkbook.sha256 },
      }),
    ).toBeNull();
  }, 120_000);
});

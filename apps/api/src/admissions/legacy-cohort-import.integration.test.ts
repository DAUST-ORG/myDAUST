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

function buildReviewedCohort(input?: {
  workbookSha?: string;
  firstStudentNo?: string;
  secondStudentNo?: string;
  firstStudentEmail?: string;
  firstGuardianEmail?: string;
  secondStudentEmail?: string;
  secondGuardianEmail?: string;
  documentedReference?: string;
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
    input?.firstGuardianEmail ?? `legacy-parent-paid-${suffix}@test.local`;
  const secondStudentEmail =
    input?.secondStudentEmail ?? `legacy-unpaid-${suffix}@test.local`;
  const secondGuardianEmail =
    input?.secondGuardianEmail ?? `legacy-parent-unpaid-${suffix}@test.local`;
  const extraction = TrustedLegacyCohortExtractionSchema.parse({
    schemaVersion: 1,
    extractor: { name: "legacy-cohort-extractor", version: "1" },
    sourceWorkbookSha256: workbookSha,
    sourceRowCount: 3,
    sourcePaidTotalXof: 1_000_000,
    rows: [
      {
        sourceSheet: "PAID",
        sourceRowNumber: 2,
        rowFingerprintSha256: firstFingerprint,
        sourceLabel: "paid",
        sourceLegacyStudentNo: firstStudentNo,
        paymentAmountXof: 1_000_000,
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
    sourcePaidTotalXof: 1_000_000,
    academicYear: { id: academicYearId, label: "2026-2027" },
    currency: "XOF",
    notificationPolicy: "suppress_all",
    guardians: [
      {
        guardianKey: "guardian-paid",
        firstName: "Paid",
        lastName: "Parent",
        phone: "+221700000101",
        address: null,
        email: {
          sourceEmail: firstGuardianEmail,
          finalEmail: firstGuardianEmail,
          disposition: "use_source",
        },
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
        email: {
          sourceEmail: secondGuardianEmail,
          finalEmail: secondGuardianEmail,
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
        personKey: "person-paid",
        legacyStudentNo: firstStudentNo,
        legacyIdDecision: { disposition: "use_source" },
        groupingReview: { reviewed: true, reason: REVIEW_REASON },
        applicant: {
          firstName: "Paid",
          lastName: "Student",
          dateOfBirth: "2006-03-12",
          programCode: "BSCS",
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
            amountXof: 1_000_000,
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
          programCode: "BSCS",
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
    expect(dryRun.warnings).toHaveLength(1);
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
        applicant: true,
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
    expect(paid.rows).toHaveLength(1);
    expect(paid.student.guardians).toHaveLength(1);
    expect(unpaid.legacyStudentNo).toBe("F202600002");
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

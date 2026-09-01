import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import { PaymentBalanceImportManifestSchema } from "./payment-balance-import.manifest.js";
import { auditPaymentBalanceImportBatch } from "./payment-balance-import.audit.js";
import { applyHistoricalCashSettlementInTransaction } from "./historical-cash-settlement.js";
import {
  executePaymentBalanceImport,
  planPaymentBalanceImportFromDatabase,
} from "./payment-balance-import.runner.js";

const SCHEMA = `payment_balance_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

function databaseUrl(): string | null {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("schema", SCHEMA);
  return url.toString();
}

const DB_URL = databaseUrl();
const noDb = !DB_URL;
let prisma: PrismaClient;
let actorEmail: string;
let actorId: string;
let termId: string;

const review = {
  reviewedBy: "Finance integration reviewer",
  reviewedAt: "2026-08-31T12:00:00.000Z",
  reason:
    "Finance reviewed the exact student number against institutional records.",
};

function manifest(studentNo: string, targetXof = 1_500) {
  return PaymentBalanceImportManifestSchema.parse({
    schemaVersion: 1,
    importName: "Paid-to-date integration test",
    academicYearLabel: "2026–2027",
    sourceAsOfDate: "2026-08-29",
    currency: "XOF",
    sourceWorkbook: {
      fileName: "DAUST Students & Billing Final as of August 29 2026.xlsx",
      sha256: "a".repeat(64),
    },
    trustedExtraction: {
      fileName: "trusted-extraction.json",
      sha256: "e".repeat(64),
    },
    sourceRowCount: 1,
    sourcePaidTotalXof: targetXof,
    amountPaidAuthority: "workbook_amount_paid",
    rows: [
      {
        sourceRowKey: "Comparison!20",
        sourceSheet: "Comparison",
        sourceRowNumber: 20,
        sourceRecordSha256: "f".repeat(64),
        sourceStudentClaim: "Integration Student",
        amountPaidXof: targetXof,
        installmentDetail: {
          paidXof: targetXof,
          sourceReconcilesClaim: "yes",
        },
        identity: {
          decision: "exact_match",
          studentNo,
          matchMethod: "exact_ordered",
          review,
        },
      },
    ],
    reviewNote: "Every integration source row has one reviewed exact identity.",
  });
}

function reviewedRow(
  sourceRowNumber: number,
  sourceStudentClaim: string,
  amountPaidXof: number,
  identity:
    | {
        decision: "exact_match";
        studentNo: string;
        matchMethod: "exact_ordered";
        review: typeof review;
      }
    | { decision: "hold_unmatched"; review: typeof review },
) {
  return {
    sourceRowKey: `Comparison!${sourceRowNumber}`,
    sourceSheet: "Comparison",
    sourceRowNumber,
    sourceRecordSha256: sourceRowNumber.toString(16).padStart(64, "0"),
    sourceStudentClaim,
    amountPaidXof,
    installmentDetail: {
      paidXof: amountPaidXof,
      sourceReconcilesClaim: "yes" as const,
    },
    identity,
  };
}

function exhaustiveManifest(
  sourceSha256: string,
  rows: ReturnType<typeof reviewedRow>[],
  reviewNote: string,
) {
  return PaymentBalanceImportManifestSchema.parse({
    schemaVersion: 1,
    importName: "Paid-to-date later reviewed pass test",
    academicYearLabel: "2026–2027",
    sourceAsOfDate: "2026-08-29",
    currency: "XOF",
    sourceWorkbook: {
      fileName: "DAUST Students & Billing Final as of August 29 2026.xlsx",
      sha256: sourceSha256,
    },
    trustedExtraction: {
      fileName: "trusted-extraction.json",
      sha256: "e".repeat(64),
    },
    sourceRowCount: rows.length,
    sourcePaidTotalXof: rows.reduce((sum, row) => sum + row.amountPaidXof, 0),
    amountPaidAuthority: "workbook_amount_paid",
    rows,
    reviewNote,
  });
}

async function createStudentInvoice(studentNo: string) {
  const person = await prisma.person.create({
    data: {
      email: `balance-${studentNo.toLowerCase()}-${randomUUID()}@test.local`,
      firstName: "Balance",
      lastName: studentNo,
      kind: "student",
      roles: ["student"],
    },
  });
  const student = await prisma.student.create({
    data: { personId: person.id, studentNo },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: `BAL-${randomUUID()}`,
      studentId: student.id,
      termId,
      totalAmount: 2_000,
      packageType: "standard_full",
      academicYearLabel: "2026–2027",
      costCenterCode: "9100",
      components: {
        create: [
          {
            kind: "tuition",
            label: "Tuition",
            costCenterCode: "9100",
            amountXof: 1_200,
          },
          {
            kind: "housing",
            label: "Housing",
            costCenterCode: "3700",
            amountXof: 800,
          },
        ],
      },
      plan: {
        create: {
          createdById: actorId,
          installments: {
            create: [
              {
                sequence: 1,
                dueDate: new Date("2026-09-05T00:00:00.000Z"),
                amountDue: 1_000,
              },
              {
                sequence: 2,
                dueDate: new Date("2026-11-05T00:00:00.000Z"),
                amountDue: 1_000,
              },
            ],
          },
        },
      },
    },
  });
  return { student, invoice };
}

async function postLaterCash(
  studentId: string,
  invoiceId: string,
  amountXof: number,
) {
  const paymentId = randomUUID();
  await prisma.$transaction((tx) =>
    applyHistoricalCashSettlementInTransaction(tx, {
      paymentId,
      studentId,
      invoiceId,
      amountXof,
      method: "legacy_unknown",
      provider: "integration_test",
      source: "integration_test",
      providerRef: `integration-${paymentId}`,
      settledAt: new Date("2026-08-31T12:00:00.000Z"),
      actorId,
      ipnPayload: { test: true },
      auditAction: "integration-test-payment",
      auditData: { test: true },
    }),
  );
}

describe.skipIf(noDb)("paid-to-date import transaction", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    actorEmail = `balance-import-${randomUUID()}@test.local`;
    const actor = await prisma.person.create({
      data: {
        email: actorEmail,
        firstName: "Balance",
        lastName: "Importer",
        kind: "staff",
        roles: ["admin"],
      },
    });
    actorId = actor.id;
    const person = await prisma.person.create({
      data: {
        email: `balance-student-${randomUUID()}@test.local`,
        firstName: "Integration",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: { personId: person.id, studentNo: "BALANCE-001" },
    });
    const year = await prisma.academicYear.create({
      data: {
        label: "2026–2027",
        startsOn: new Date("2026-08-01T00:00:00.000Z"),
        endsOn: new Date("2027-07-31T00:00:00.000Z"),
      },
    });
    const term = await prisma.term.create({
      data: {
        name: `Balance term ${randomUUID()}`,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        academicYearId: year.id,
      },
    });
    termId = term.id;
    await Promise.all(
      [
        ["9100", "Tuition"],
        ["3700", "Housing"],
      ].map(([code, name]) =>
        prisma.costCenter.upsert({
          where: { code },
          update: {},
          create: { code, name, type: "revenue" },
        }),
      ),
    );
    await prisma.invoice.create({
      data: {
        number: `BAL-${randomUUID()}`,
        studentId: student.id,
        termId: term.id,
        totalAmount: 2_000,
        packageType: "standard_full",
        academicYearLabel: year.label,
        costCenterCode: "9100",
        components: {
          create: [
            {
              kind: "tuition",
              label: "Tuition",
              costCenterCode: "9100",
              amountXof: 1_200,
            },
            {
              kind: "housing",
              label: "Housing",
              costCenterCode: "3700",
              amountXof: 800,
            },
          ],
        },
        plan: {
          create: {
            createdById: actor.id,
            installments: {
              create: [
                {
                  sequence: 1,
                  dueDate: new Date("2026-09-05T00:00:00.000Z"),
                  amountDue: 1_000,
                },
                {
                  sequence: 2,
                  dueDate: new Date("2026-11-05T00:00:00.000Z"),
                  amountDue: 1_000,
                },
              ],
            },
          },
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("dry-runs without writes, posts one exact delta, and replays as a no-op", async () => {
    const reviewed = manifest("BALANCE-001");
    const invocation = { actorEmail };
    const dryRun = await planPaymentBalanceImportFromDatabase(
      prisma,
      reviewed,
      invocation,
    );
    expect(dryRun).toMatchObject({
      alreadyImportedBatchId: null,
      postableRows: 1,
      heldRows: 0,
      importedDeltaXof: 1_500,
    });
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentBalanceImportBatch.count()).toBe(0);

    const result = await executePaymentBalanceImport(prisma, reviewed, {
      ...invocation,
      expectedPlanSha256: dryRun.planSha256,
    });
    expect(result).toMatchObject({
      alreadyImported: false,
      importedRows: 1,
      importedXof: 1_500,
    });

    const payment = await prisma.payment.findFirstOrThrow({
      where: { paymentBalanceImportRow: { batchId: result.batchId } },
      include: {
        allocations: true,
        componentAllocations: true,
        invoice: true,
        paymentBalanceImportRow: true,
      },
    });
    expect(payment).toMatchObject({
      amount: 1_500,
      method: "legacy_unknown",
      status: "success",
      provider: "balance_reconciliation",
      source: "paid_to_date_workbook",
      settledAt: null,
      importBatchId: null,
      importRowKey: null,
      importSheetName: null,
      importRowNumber: null,
      invoice: { amountPaid: 1_500, status: "partial" },
      paymentBalanceImportRow: {
        disposition: "post_delta",
        sourcePaidToDateXof: 1_500n,
        baselineLedgerPaidXof: 0n,
        deltaXof: 1_500n,
      },
    });
    expect(payment.allocations.reduce((sum, row) => sum + row.amount, 0)).toBe(
      1_500,
    );
    expect(
      payment.componentAllocations.reduce((sum, row) => sum + row.amountXof, 0),
    ).toBe(1_500);
    expect(payment.componentAllocations).toHaveLength(2);

    const batch = await prisma.paymentBalanceImportBatch.findUniqueOrThrow({
      where: { id: result.batchId },
    });
    expect(batch).toMatchObject({
      status: "imported",
      sourceAsOfDate: new Date("2026-08-29T00:00:00.000Z"),
      sourceRowCount: 1,
      importedRows: 1,
      alreadyReconciledRows: 0,
      previouslyImportedRows: 0,
      heldRows: 0,
      sourcePaidTotalXof: 1_500n,
      resolvedSourcePaidXof: 1_500n,
      heldSourcePaidXof: 0n,
      baselineLedgerPaidXof: 0n,
      importedDeltaXof: 1_500n,
    });
    expect(
      await prisma.auditLog.count({
        where: {
          OR: [
            { entity: "Payment", entityId: payment.id },
            { entity: "PaymentBalanceImportBatch", entityId: batch.id },
          ],
        },
      }),
    ).toBe(2);

    const replay = await executePaymentBalanceImport(prisma, reviewed, {
      ...invocation,
      expectedPlanSha256: dryRun.planSha256,
    });
    expect(replay).toMatchObject({
      batchId: result.batchId,
      alreadyImported: true,
      importedRows: 0,
      importedXof: 0,
    });
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentBalanceImportBatch.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(2);
    await expect(
      auditPaymentBalanceImportBatch(prisma, result.batchId),
    ).resolves.toMatchObject({
      ok: true,
      sourceRows: 1,
      importedRows: 1,
      importedDeltaXof: 1_500,
    });

    await expect(
      prisma.$executeRaw`UPDATE "PaymentBalanceImportRow" SET "paymentId" = NULL WHERE "id" = ${payment.paymentBalanceImportRow!.id}`,
    ).rejects.toThrow();
  });

  it("resolves a held row in a later exhaustive pass after another student pays again", async () => {
    const firstStudent = await createStudentInvoice("BALANCE-LATER-A");
    const heldStudent = await createStudentInvoice("BALANCE-LATER-B");
    const exact = (studentNo: string) => ({
      decision: "exact_match" as const,
      studentNo,
      matchMethod: "exact_ordered" as const,
      review,
    });
    const initial = exhaustiveManifest(
      "b".repeat(64),
      [
        reviewedRow(30, "Later Student A", 1_000, exact("BALANCE-LATER-A")),
        reviewedRow(31, "Later Student B", 500, {
          decision: "hold_unmatched",
          review,
        }),
      ],
      "The second physical row remains held pending an exact reviewed identity.",
    );
    const firstDryRun = await planPaymentBalanceImportFromDatabase(
      prisma,
      initial,
      { actorEmail },
    );
    expect(firstDryRun).toMatchObject({
      postableRows: 1,
      previouslyImportedRows: 0,
      heldRows: 1,
      importedDeltaXof: 1_000,
    });
    await executePaymentBalanceImport(prisma, initial, {
      actorEmail,
      expectedPlanSha256: firstDryRun.planSha256,
    });

    await postLaterCash(firstStudent.student.id, firstStudent.invoice.id, 200);
    const reviewedLater = exhaustiveManifest(
      "b".repeat(64),
      [
        reviewedRow(30, "Later Student A", 1_000, exact("BALANCE-LATER-A")),
        reviewedRow(31, "Later Student B", 500, exact("BALANCE-LATER-B")),
      ],
      "The formerly held second row now has an exact reviewed student number.",
    );
    const laterDryRun = await planPaymentBalanceImportFromDatabase(
      prisma,
      reviewedLater,
      { actorEmail },
    );
    expect(laterDryRun).toMatchObject({
      postableRows: 1,
      alreadyReconciledRows: 0,
      previouslyImportedRows: 1,
      heldRows: 0,
      baselineLedgerPaidXof: 1_000,
      importedDeltaXof: 500,
      resolvedSourcePaidXof: 1_500,
    });
    expect(
      laterDryRun.rows.find((row) => row.sourceRowKey === "Comparison!30"),
    ).toMatchObject({
      disposition: "previously_imported",
      expectedLedgerPaidXof: 1_000,
      observedLedgerPaidXof: 1_200,
      priorDisposition: "post_delta",
    });

    const laterResult = await executePaymentBalanceImport(
      prisma,
      reviewedLater,
      {
        actorEmail,
        expectedPlanSha256: laterDryRun.planSha256,
      },
    );
    expect(laterResult).toMatchObject({
      importedRows: 1,
      previouslyImportedRows: 1,
      heldRows: 0,
      importedXof: 500,
    });
    await expect(
      auditPaymentBalanceImportBatch(prisma, laterResult.batchId),
    ).resolves.toMatchObject({
      ok: true,
      sourceRows: 2,
      importedRows: 1,
      previouslyImportedRows: 1,
      importedDeltaXof: 500,
    });
    expect(
      await prisma.invoice.findUniqueOrThrow({
        where: { id: heldStudent.invoice.id },
        select: { amountPaid: true },
      }),
    ).toEqual({ amountPaid: 500 });
  });

  it("reserves an already-reconciled source row and rejects a later identity remap", async () => {
    const resolvedStudent = await createStudentInvoice("BALANCE-RESOLVED-A");
    await createStudentInvoice("BALANCE-RESOLVED-B");
    await postLaterCash(
      resolvedStudent.student.id,
      resolvedStudent.invoice.id,
      500,
    );
    const exact = (studentNo: string) => ({
      decision: "exact_match" as const,
      studentNo,
      matchMethod: "exact_ordered" as const,
      review,
    });
    const initial = exhaustiveManifest(
      "c".repeat(64),
      [
        reviewedRow(
          40,
          "Immutable Resolved Student",
          500,
          exact("BALANCE-RESOLVED-A"),
        ),
      ],
      "The source row exactly matches the student whose ledger already equals the target.",
    );
    const firstDryRun = await planPaymentBalanceImportFromDatabase(
      prisma,
      initial,
      { actorEmail },
    );
    expect(firstDryRun).toMatchObject({
      postableRows: 0,
      alreadyReconciledRows: 1,
      importedDeltaXof: 0,
    });
    const firstResult = await executePaymentBalanceImport(prisma, initial, {
      actorEmail,
      expectedPlanSha256: firstDryRun.planSha256,
    });
    const resolvedRow = await prisma.paymentBalanceImportRow.findFirstOrThrow({
      where: { batchId: firstResult.batchId },
    });
    expect(resolvedRow).toMatchObject({
      disposition: "already_reconciled",
      paymentId: null,
      sourceClaimSha256: resolvedRow.sourceRowKeySha256,
    });

    const remapped = exhaustiveManifest(
      "c".repeat(64),
      [
        reviewedRow(
          40,
          "Immutable Resolved Student",
          500,
          exact("BALANCE-RESOLVED-B"),
        ),
      ],
      "A later manifest attempts to remap the already-resolved physical source row.",
    );
    await expect(
      planPaymentBalanceImportFromDatabase(prisma, remapped, { actorEmail }),
    ).rejects.toThrow(/immutable student invoice|conflicts/i);
  });
});

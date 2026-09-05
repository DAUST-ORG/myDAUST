import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import { HistoricalPaymentManifestSchema } from "./historical-payment-import.manifest.js";
import {
  executeHistoricalPaymentImport,
  planHistoricalPaymentImport,
} from "./historical-payment-import.runner.js";

const SCHEMA = `historical_payment_import_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

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

function reviewedManifest(sha = "c".repeat(64)) {
  return HistoricalPaymentManifestSchema.parse({
    schemaVersion: 1,
    importName: "Historical payment integration test",
    academicYearLabel: "2026–2027",
    currency: "XOF",
    allRowsSettled: true,
    notificationPolicy: "suppress",
    sourceWorkbook: { fileName: "payments.xlsx", sha256: sha },
    sourceExtractionSha256: "e".repeat(64),
    sourceGroupCount: 1,
    sourceTotalXof: 315_000,
    rows: [
      {
        sourceGroupKey: "REINSCRIPTIONS!D6",
        sourceSheet: "REINSCRIPTIONS",
        sourceRowNumbers: [6],
        sourceAmountXof: 315_000,
        allocationKey: "student-payment",
        sourceStudentName: "Integration Student",
        identity: { status: "authoritative", studentNo: "PAY-IMPORT-001" },
        sourceSettledOn: "2026-08-04",
        settledOn: "2026-08-04",
        amountXof: 315_000,
        sourceMethod: "CHEQUE N 1001",
        method: "cheque",
        externalReference: "1001",
        status: "settled",
        reviewed: true,
      },
    ],
    excludedGroups: [],
    reviewNote:
      "Finance reviewed the identity and original cheque deposit record.",
  });
}

const invocation = () => ({
  actorEmail,
});

/**
 * Due dates relative to the run, not literals. A fixed past due date turns a
 * partially-paid installment into an overdue one as soon as real time passes
 * it, and the status assertion below then describes the calendar rather than
 * the import.
 */
const DUE_IN_DAYS = (days: number) => new Date(Date.now() + days * 86_400_000);

describe.skipIf(noDb)("historical payment import ledger", () => {
  beforeAll(async () => {
    const url = DB_URL!;
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    actorEmail = `payment-import-admin-${randomUUID()}@test.local`;
    const actor = await prisma.person.create({
      data: {
        email: actorEmail,
        firstName: "Import",
        lastName: "Administrator",
        kind: "staff",
        roles: ["admin"],
      },
    });
    const person = await prisma.person.create({
      data: {
        email: `payment-import-student-${randomUUID()}@test.local`,
        firstName: "Integration",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: { personId: person.id, studentNo: "PAY-IMPORT-001" },
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
        name: `Payment import term ${randomUUID()}`,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        academicYearId: year.id,
      },
    });
    await Promise.all(
      [
        ["9100", "Tuition"],
        ["3700", "Housing"],
        ["3600", "Cafeteria"],
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
        number: `BILL-${randomUUID()}`,
        studentId: student.id,
        termId: term.id,
        totalAmount: 4_285_000,
        costCenterCode: "9100",
        packageType: "standard_full",
        academicYearLabel: year.label,
        components: {
          create: [
            {
              kind: "tuition",
              label: "Tuition",
              costCenterCode: "9100",
              amountXof: 2_975_000,
            },
            {
              kind: "housing",
              label: "Housing",
              costCenterCode: "3700",
              amountXof: 680_000,
            },
            {
              kind: "cafeteria",
              label: "Cafeteria",
              costCenterCode: "3600",
              amountXof: 630_000,
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
                  dueDate: DUE_IN_DAYS(30),
                  amountDue: 1_071_250,
                },
                {
                  sequence: 2,
                  dueDate: DUE_IN_DAYS(90),
                  amountDue: 1_071_250,
                },
                {
                  sequence: 3,
                  dueDate: DUE_IN_DAYS(150),
                  amountDue: 1_071_250,
                },
                {
                  sequence: 4,
                  dueDate: DUE_IN_DAYS(210),
                  amountDue: 1_071_250,
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

  it("dry-runs without writes, commits one atomic ledger entry, and reruns idempotently", async () => {
    const manifest = reviewedManifest();
    const dryRun = await planHistoricalPaymentImport(
      prisma,
      manifest,
      invocation(),
    );
    expect(dryRun.blockers).toEqual([]);
    expect(dryRun.rowsToImport).toBe(1);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentImportBatch.count()).toBe(0);

    const result = await executeHistoricalPaymentImport(
      prisma,
      manifest,
      invocation(),
    );
    expect(result).toMatchObject({
      alreadyImported: false,
      importedRows: 1,
      importedXof: 315_000,
    });

    const payment = await prisma.payment.findFirstOrThrow({
      where: { importBatchId: result.batchId },
      include: { allocations: true, componentAllocations: true, invoice: true },
    });
    expect(payment).toMatchObject({
      amount: 315_000,
      method: "cheque",
      status: "success",
      provider: "historical_import",
      source: "historical_workbook",
      initiatedById: null,
      initiatedByEmail: null,
      importSheetName: "REINSCRIPTIONS",
      importRowNumber: 6,
    });
    expect(payment.settledAt?.toISOString()).toBe("2026-08-04T12:00:00.000Z");
    expect(
      payment.allocations.reduce(
        (sum, allocation) => sum + allocation.amount,
        0,
      ),
    ).toBe(315_000);
    expect(
      payment.componentAllocations.reduce(
        (sum, allocation) => sum + allocation.amountXof,
        0,
      ),
    ).toBe(315_000);
    expect(payment.componentAllocations).toHaveLength(3);
    expect(payment.invoice.amountPaid).toBe(315_000);
    expect(payment.invoice.status).toBe("partial");
    const serializedProvenance = JSON.stringify(payment.ipnPayload);
    expect(serializedProvenance).not.toContain("Integration Student");
    expect(serializedProvenance).not.toContain("CHEQUE N 1001");
    expect(serializedProvenance).not.toContain('"1001"');

    const installment = await prisma.installment.findFirstOrThrow({
      where: { allocations: { some: { paymentId: payment.id } } },
    });
    expect(installment.amountPaid).toBe(315_000);
    expect(installment.status).toBe("partial");
    const batch = await prisma.paymentImportBatch.findUniqueOrThrow({
      where: { id: result.batchId },
    });
    expect(batch).toMatchObject({
      status: "imported",
      sourceGroupCount: 1,
      totalRows: 1,
      importedRows: 1,
      alreadyRecordedRows: 0,
      excludedSourceGroups: 0,
      skippedRows: 0,
      sourceTotalXof: 315_000n,
      importedXof: 315_000n,
      alreadyRecordedXof: 0n,
      excludedXof: 0n,
    });
    expect(
      await prisma.auditLog.count({
        where: {
          OR: [
            { entity: "Payment", entityId: payment.id },
            { entity: "PaymentImportBatch", entityId: batch.id },
          ],
        },
      }),
    ).toBe(2);

    const rerun = await executeHistoricalPaymentImport(
      prisma,
      manifest,
      invocation(),
    );
    expect(rerun).toMatchObject({
      batchId: result.batchId,
      alreadyImported: true,
      importedRows: 0,
    });
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentImportBatch.count()).toBe(1);

    const changedReview = HistoricalPaymentManifestSchema.parse({
      ...manifest,
      reviewNote:
        "Finance changed this reviewed manifest after its first successful import.",
    });
    await expect(
      executeHistoricalPaymentImport(prisma, changedReview, invocation()),
    ).rejects.toThrow(/different reviewed manifest/i);

    await expect(
      prisma.$executeRaw`UPDATE "Payment" SET "importSheetName" = NULL WHERE "id" = ${payment.id}`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "PaymentImportBatch" SET "skippedRows" = 1 WHERE "id" = ${batch.id}`,
    ).rejects.toThrow();
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .importSheetName,
    ).toBe("REINSCRIPTIONS");
  });

  it("refuses a changed workbook whose row is already represented in the ledger", async () => {
    const changedFile = reviewedManifest("d".repeat(64));
    const plan = await planHistoricalPaymentImport(
      prisma,
      changedFile,
      invocation(),
    );
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "possible_existing_payment" }),
      ]),
    );
    await expect(
      executeHistoricalPaymentImport(prisma, changedFile, invocation()),
    ).rejects.toThrow(/unresolved blockers/i);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentImportBatch.count()).toBe(1);
  });

  it("finds an approved wire by its finance-reviewed bank reference outside the date window", async () => {
    const person = await prisma.person.create({
      data: {
        email: `wire-reference-student-${randomUUID()}@test.local`,
        firstName: "Wire",
        lastName: "Reference",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: { personId: person.id, studentNo: "WIRE-IMPORT-001" },
    });
    const term = await prisma.term.findFirstOrThrow({
      where: { academicYear: { label: "2026–2027" } },
    });
    const invoice = await prisma.invoice.create({
      data: {
        number: `WIRE-BILL-${randomUUID()}`,
        studentId: student.id,
        termId: term.id,
        totalAmount: 4_285_000,
        amountPaid: 315_000,
        status: "partial",
        costCenterCode: "9100",
        academicYearLabel: "2026–2027",
      },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: student.id,
        amount: 315_000,
        method: "wire",
        status: "success",
        provider: "wire",
        providerRef: `WIRE-${randomUUID()}`,
        source: "student_portal",
        settledAt: new Date("2026-01-01T12:00:00.000Z"),
      },
    });
    await prisma.paymentSubmission.create({
      data: {
        status: "approved",
        source: "student_portal",
        studentId: student.id,
        invoiceId: invoice.id,
        paymentId: payment.id,
        submittedAmountXof: 315_000,
        confirmedAmountXof: 315_000,
        contactEmail: person.email,
        proofObjectKey: "test/wire-proof.pdf",
        proofFileName: "wire-proof.pdf",
        proofMimeType: "application/pdf",
        proofSize: 100,
        bankSnapshot: {},
        bankReference: "CBAO-DEPOT-8821",
        reviewedAt: new Date("2026-01-02T12:00:00.000Z"),
      },
    });

    const base = reviewedManifest("f".repeat(64));
    const wireManifest = HistoricalPaymentManifestSchema.parse({
      ...base,
      rows: [
        {
          ...base.rows[0],
          sourceStudentName: "Wire Reference",
          identity: {
            status: "authoritative",
            studentNo: "WIRE-IMPORT-001",
          },
          sourceMethod: "CBAO",
          method: "wire",
          externalReference: "cbao depot 8821",
        },
      ],
      reviewNote:
        "Finance reviewed the wire identity and the original bank reference.",
    });
    const plan = await planHistoricalPaymentImport(
      prisma,
      wireManifest,
      invocation(),
    );
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "possible_existing_payment",
          details: { candidatePaymentIds: [payment.id] },
        }),
      ]),
    );
  });
});

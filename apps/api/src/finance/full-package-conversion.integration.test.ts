import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";

const SCHEMA = `package_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;
const DB_DIR = new URL("../../../../packages/db", import.meta.url).pathname;

let prisma: PrismaClient;
let scheduleId: string;
let termId: string;
const ids: Record<string, string> = {};
const legacyInstallmentIds: Record<string, string[]> = {};
const creditIds: string[] = [];
const paymentIds: Record<string, string> = {};

function runConversion(commit = false) {
  return execFileSync(
    "pnpm",
    ["exec", "tsx", "prisma/convert-full-package.ts"],
    {
      cwd: DB_DIR,
      env: {
        ...process.env,
        DATABASE_URL: DB_URL!,
        ...(commit ? { CONFIRM: "1" } : {}),
      },
      encoding: "utf8",
    },
  );
}

async function student(
  label: string,
  recordStatus: "active" | "archived" = "active",
) {
  const person = await prisma.person.create({
    data: {
      email: `${label}-${randomUUID()}@test.local`,
      firstName: label,
      lastName: "Student",
      kind: "student",
      roles: ["student"],
    },
  });
  const created = await prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `PKG-${label.toUpperCase()}-${randomUUID().slice(0, 5)}`,
      recordStatus,
    },
  });
  ids[label] = created.id;
  return created;
}

async function legacyInvoice(
  label: string,
  options: {
    paidXof?: number;
    status?: "open" | "partial" | "paid" | "void";
    uneven?: boolean;
  } = {},
) {
  const paidXof = options.paidXof ?? 0;
  const amounts = options.uneven
    ? [1_000_000, 800_000, 700_000, 475_000]
    : [743_750, 743_750, 743_750, 743_750];
  const invoice = await prisma.invoice.create({
    data: {
      studentId: ids[label]!,
      termId,
      totalAmount: 2_975_000,
      amountPaid: paidXof,
      status:
        options.status ??
        (paidXof >= 2_975_000 ? "paid" : paidXof > 0 ? "partial" : "open"),
      packageType: "standard_tuition_legacy",
      academicYearLabel: "2026–2027",
      feeScheduleId: scheduleId,
      feeScheduleRevision: 1,
      costCenterCode: "9100",
      components: {
        create: {
          kind: "tuition",
          costCenterCode: "9100",
          amountXof: 2_975_000,
        },
      },
      plan: {
        create: {
          installments: {
            create: amounts.map((amountDue, index) => ({
              sequence: index + 1,
              dueDate: new Date(
                `2026-${String(index + 8).padStart(2, "0")}-05`,
              ),
              amountDue,
              amountPaid: Math.max(
                0,
                Math.min(amountDue, paidXof - index * 743_750),
              ),
              status: paidXof >= (index + 1) * 743_750 ? "paid" : "pending",
            })),
          },
        },
      },
    },
    include: {
      components: true,
      plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
    },
  });
  legacyInstallmentIds[label] = invoice
    .plan!.installments.map((row) => row.id)
    .sort();
  if (paidXof > 0) {
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: ids[label]!,
        amount: paidXof,
        method: "card",
        status: "success",
        providerRef: `PKG-${label}-${randomUUID()}`,
        source: "test",
        settledAt: new Date("2026-08-10T10:00:00Z"),
      },
    });
    paymentIds[label] = payment.id;
    let remaining = paidXof;
    for (const installment of invoice.plan!.installments) {
      const allocated = Math.min(remaining, installment.amountDue);
      if (allocated > 0) {
        await prisma.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            installmentId: installment.id,
            amount: allocated,
          },
        });
        remaining -= allocated;
      }
    }
    await prisma.paymentComponentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceComponentId: invoice.components[0]!.id,
        amountXof: paidXof,
      },
    });
  }
  return invoice;
}

async function fullInvoice(label: string) {
  const rows = await prisma.feePlanInstallment.findMany({
    where: { scheduleId },
    orderBy: { sequence: "asc" },
  });
  return prisma.invoice.create({
    data: {
      studentId: ids[label]!,
      termId,
      totalAmount: 4_285_000,
      packageType: "standard_full",
      academicYearLabel: "2026–2027",
      feeScheduleId: scheduleId,
      feeScheduleRevision: 1,
      costCenterCode: "9100",
      components: {
        create: [
          { kind: "tuition", costCenterCode: "9100", amountXof: 2_975_000 },
          { kind: "housing", costCenterCode: "3700", amountXof: 680_000 },
          { kind: "cafeteria", costCenterCode: "3600", amountXof: 630_000 },
        ],
      },
      plan: {
        create: {
          installments: {
            create: rows.map((row) => ({
              sequence: row.sequence,
              label: row.label,
              dueDate: row.dueOn!,
              amountDue: row.amountFullXof,
            })),
          },
        },
      },
    },
  });
}

describe.skipIf(!DB_URL)("full-package conversion command", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: DB_DIR,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
      ],
      skipDuplicates: true,
    });
    const admin = await prisma.person.create({
      data: {
        email: `director-${randomUUID()}@test.local`,
        firstName: "Test",
        lastName: "Director",
        kind: "staff",
        roles: ["admin"],
      },
    });
    const year = await prisma.academicYear.create({
      data: { label: "2026–2027", status: "active" },
    });
    const term = await prisma.term.create({
      data: {
        name: "Fall 2026 package test",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-20"),
        academicYearId: year.id,
      },
    });
    termId = term.id;
    const schedule = await prisma.feeSchedule.create({
      data: {
        academicYearLabel: year.label,
        revision: 1,
        status: "approved",
        approvedById: admin.id,
        approvedAt: new Date(),
        reason: "Explicit package-test approval",
        rows: {
          create: [
            [1, 1_200_000, 800_000, 200_000, 200_000],
            [2, 1_100_000, 750_000, 180_000, 170_000],
            [3, 1_000_000, 725_000, 160_000, 115_000],
            [4, 985_000, 700_000, 140_000, 145_000],
          ].map(([sequence, full, tuition, housing, cafeteria]) => ({
            academicYearLabel: year.label,
            semester: sequence! < 3 ? "Fall" : "Spring",
            label: `Installment ${sequence}`,
            sequence: sequence!,
            dueOn: new Date(
              `2026-${String(sequence! + 8).padStart(2, "0")}-15`,
            ),
            amountFullXof: full!,
            amountTuitionXof: tuition!,
            amountHousingXof: housing!,
            amountCafeteriaXof: cafeteria!,
          })),
        },
      },
    });
    scheduleId = schedule.id;

    await student("unpaid");
    await legacyInvoice("unpaid");
    await student("partial");
    await legacyInvoice("partial", { paidXof: 500_000 });
    await student("paid");
    await legacyInvoice("paid", { paidXof: 2_975_000 });
    await student("credited");
    await legacyInvoice("credited", { paidXof: 300_000 });
    for (const [description, amount] of [
      ["Scholarship — Merit", -200_000],
      ["Discount — Staff decision", -100_000],
    ] as const) {
      const credit = await prisma.invoice.create({
        data: {
          studentId: ids.credited!,
          termId,
          totalAmount: amount,
          status: "paid",
          packageType: "credit",
          academicYearLabel: year.label,
          description,
          costCenterCode: "9100",
        },
      });
      creditIds.push(credit.id);
    }
    await student("missing");
    await student("full");
    const currentFull = await fullInvoice("full");
    // An otherwise-current package with drifted component metadata must be
    // refreshed instead of being incorrectly reported as unchanged.
    await prisma.invoiceComponent.update({
      where: {
        invoiceId_kind: { invoiceId: currentFull.id, kind: "housing" },
      },
      data: { amountXof: 679_999 },
    });
    await student("void");
    await legacyInvoice("void", { status: "void" });
    await student("archived", "archived");
    await legacyInvoice("archived");
    await student("nonstandard");
    await legacyInvoice("nonstandard", { uneven: true });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("fails closed for a tagged plan that does not match the legacy schedule", async () => {
    const dryRun = runConversion();
    expect(dryRun).toContain('"unresolved": 1');
    expect(dryRun).toContain("Installment amounts do not match");
    expect(() => runConversion(true)).toThrow();
    expect(
      await prisma.invoice.count({
        where: {
          studentId: ids.nonstandard,
          packageType: "standard_full",
          status: { not: "void" },
        },
      }),
    ).toBe(0);
    await prisma.invoice.updateMany({
      where: {
        studentId: ids.nonstandard,
        packageType: "standard_tuition_legacy",
      },
      data: {
        packageType: "custom",
        description: "Annual tuition imported before package classification",
      },
    });

    const unclassified = runConversion();
    expect(unclassified).toContain('"unresolved": 1');
    expect(unclassified).toContain(
      "Unclassified current-year tuition-like invoice",
    );
    expect(() => runConversion(true)).toThrow();

    await prisma.invoice.updateMany({
      where: { studentId: ids.nonstandard, packageType: "custom" },
      data: { description: "Independent laboratory charge" },
    });

    const missingAllocation =
      await prisma.paymentComponentAllocation.findFirstOrThrow({
        where: { paymentId: paymentIds.credited },
      });
    await prisma.paymentComponentAllocation.delete({
      where: { id: missingAllocation.id },
    });
    const unreconciled = runConversion();
    expect(unreconciled).toContain('"unresolved": 1');
    expect(unreconciled).toContain("Paid history does not reconcile");
    expect(() => runConversion(true)).toThrow();
    await prisma.paymentComponentAllocation.create({
      data: {
        paymentId: missingAllocation.paymentId,
        invoiceComponentId: missingAllocation.invoiceComponentId,
        amountXof: missingAllocation.amountXof,
        refundedAmountXof: missingAllocation.refundedAmountXof,
      },
    });

    const overlapping = await prisma.invoice.create({
      data: {
        studentId: ids.unpaid!,
        termId,
        totalAmount: 2_975_000,
        packageType: "custom",
        academicYearLabel: "2026–2027",
        description: "Annual tuition imported before classification",
        costCenterCode: "9100",
      },
    });
    const duplicateLooking = runConversion();
    expect(duplicateLooking).toContain('"unresolved": 1');
    expect(duplicateLooking).toContain(
      "standard invoice and unclassified tuition-like invoice",
    );
    await prisma.invoice.delete({ where: { id: overlapping.id } });
  }, 120_000);

  it("converts all safe active cases, preserves history, and reruns idempotently", async () => {
    const dryRun = runConversion();
    expect(dryRun).toContain('"unresolved": 0');
    expect(dryRun).toContain('"convert": 4');
    expect(dryRun).toContain('"create": 3');
    expect(dryRun).toContain('"refresh": 1');
    runConversion(true);

    for (const label of [
      "unpaid",
      "partial",
      "paid",
      "credited",
      "missing",
      "full",
      "void",
      "nonstandard",
    ]) {
      expect(
        await prisma.invoice.count({
          where: {
            studentId: ids[label],
            packageType: "standard_full",
            status: { not: "void" },
          },
        }),
      ).toBe(1);
    }
    expect(
      await prisma.invoice.count({
        where: { studentId: ids.archived, packageType: "standard_full" },
      }),
    ).toBe(0);
    expect(
      await prisma.invoice.count({ where: { id: { in: creditIds } } }),
    ).toBe(2);
    expect(
      await prisma.invoice.count({
        where: { studentId: ids.void, status: "void" },
      }),
    ).toBe(1);
    expect(
      await prisma.invoice.count({
        where: { studentId: ids.nonstandard, packageType: "custom" },
      }),
    ).toBe(1);

    for (const label of ["partial", "paid", "credited"]) {
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: {
          studentId: ids[label],
          packageType: "standard_full",
          status: { not: "void" },
        },
        include: {
          plan: { include: { installments: true } },
          components: true,
        },
      });
      expect(invoice.totalAmount).toBe(4_285_000);
      expect(invoice.plan!.installments.map((row) => row.id).sort()).toEqual(
        legacyInstallmentIds[label],
      );
      expect(
        invoice.components.reduce((sum, row) => sum + row.amountXof, 0),
      ).toBe(invoice.totalAmount);
      const allocations = await prisma.paymentComponentAllocation.findMany({
        where: { paymentId: paymentIds[label] },
        include: { invoiceComponent: true },
      });
      expect(allocations.reduce((sum, row) => sum + row.amountXof, 0)).toBe(
        label === "paid" ? 2_975_000 : label === "partial" ? 500_000 : 300_000,
      );
      expect(
        new Set(allocations.map((row) => row.invoiceComponent.kind)),
      ).toEqual(new Set(["tuition", "housing", "cafeteria"]));
    }
    const fullyPaidTuition = await prisma.invoice.findFirstOrThrow({
      where: { studentId: ids.paid, packageType: "standard_full" },
    });
    expect(fullyPaidTuition.amountPaid).toBe(2_975_000);
    expect(fullyPaidTuition.status).toBe("partial");

    const beforeCount = await prisma.invoice.count({
      where: { packageType: "standard_full", status: { not: "void" } },
    });
    const second = runConversion(true);
    expect(second).toContain('"unchanged": 8');
    expect(
      await prisma.invoice.count({
        where: { packageType: "standard_full", status: { not: "void" } },
      }),
    ).toBe(beforeCount);
  }, 120_000);
});

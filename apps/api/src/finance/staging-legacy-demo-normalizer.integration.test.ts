import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";

const SCHEMA = `staging_demo_normalizer_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
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

const targets = [
  {
    number: "BILL-2026-001",
    studentNo: "DAUST-CE-23-0142",
    firstName: "Aïssatou",
    lastName: "Diallo",
    totalAmount: 3_500_000,
    amounts: [1_500_000, 1_000_000, 1_000_000],
    dueDates: ["2026-09-15", "2026-10-15", "2026-11-15"],
  },
  {
    number: "BILL-2026-002",
    studentNo: "DAUST-EE-24-0210",
    firstName: "Mamadou",
    lastName: "Sy",
    totalAmount: 2_975_000,
    amounts: [1_487_500, 1_487_500],
    dueDates: ["2026-09-15", "2026-11-15"],
  },
  {
    number: "BILL-2026-003",
    studentNo: "DAUST-CS-25-0033",
    firstName: "Bineta",
    lastName: "Faye",
    totalAmount: 3_500_000,
    amounts: [3_500_000],
    dueDates: ["2026-09-30"],
  },
] as const;

let prisma: PrismaClient;
let termId: string;
let scheduleId: string;
const invoiceIds = new Map<string, string>();
const studentIds = new Map<string, string>();
const originalInstallmentIds = new Map<string, Map<number, string>>();
const paymentIds = new Map<string, string>();

function runNormalizer(
  options: {
    commit?: boolean;
    targetEnv?: string;
  } = {},
) {
  return execFileSync(
    "pnpm",
    ["exec", "tsx", "prisma/normalize-staging-legacy-demo.ts"],
    {
      cwd: DB_DIR,
      env: {
        ...process.env,
        DATABASE_URL: DB_URL!,
        TARGET_ENV: options.targetEnv ?? "staging",
        ...(options.commit ? { CONFIRM: "1" } : { CONFIRM: "" }),
      },
      encoding: "utf8",
      stdio: "pipe",
    },
  );
}

async function readTargets() {
  return prisma.invoice.findMany({
    where: { number: { in: targets.map((target) => target.number) } },
    orderBy: { number: "asc" },
    include: {
      plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      payments: {
        orderBy: { providerRef: "asc" },
        include: { allocations: true, componentAllocations: true },
      },
      components: { orderBy: { kind: "asc" } },
    },
  });
}

async function createPayment(
  number: string,
  status: "success" | "refunded",
  amount: number,
  suffix: string,
  installmentAmounts: number[],
  source: "legacy" | "payment_link",
) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { number },
    include: {
      student: true,
      components: true,
      plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
    },
  });
  const payment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      amount,
      method: "wave",
      status,
      providerRef: `NORMALIZER-${suffix}-${randomUUID()}`,
      source,
      settledAt: new Date("2026-08-10T10:00:00Z"),
      refundedAt:
        status === "refunded" ? new Date("2026-08-11T10:00:00Z") : null,
    },
  });
  paymentIds.set(suffix, payment.id);
  for (const [index, allocationAmount] of installmentAmounts.entries()) {
    if (allocationAmount <= 0) continue;
    await prisma.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        installmentId: invoice.plan!.installments[index]!.id,
        amount: allocationAmount,
      },
    });
  }
  const component = invoice.components[0]!;
  await prisma.paymentComponentAllocation.create({
    data: {
      paymentId: payment.id,
      invoiceComponentId: component.id,
      amountXof: amount,
      refundedAmountXof: status === "refunded" ? amount : 0,
    },
  });
  return payment;
}

describe.skipIf(!DB_URL)("staging legacy demo normalizer", () => {
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
        email: `normalizer-admin-${randomUUID()}@test.local`,
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
        name: "Fall 2026",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-20"),
        academicYearId: year.id,
      },
    });
    termId = term.id;
    const schedule = await prisma.feeSchedule.create({
      data: {
        academicYearLabel: year.label,
        revision: 7,
        status: "approved",
        approvedById: admin.id,
        approvedAt: new Date("2026-08-01T10:00:00Z"),
        reason: "Explicit staging test approval",
        rows: {
          create: [
            [1, 1_200_000, 800_000, 200_000, 200_000, "2026-09-15"],
            [2, 1_100_000, 750_000, 180_000, 170_000, "2026-10-15"],
            [3, 1_000_000, 725_000, 160_000, 115_000, "2026-11-15"],
            [4, 985_000, 700_000, 140_000, 145_000, "2026-12-15"],
          ].map(([sequence, full, tuition, housing, cafeteria, dueOn]) => ({
            academicYearLabel: year.label,
            semester: sequence! < 3 ? "Fall" : "Spring",
            label: `Installment ${sequence}`,
            sequence: sequence as number,
            dueOn: new Date(dueOn as string),
            amountFullXof: full as number,
            amountTuitionXof: tuition as number,
            amountHousingXof: housing as number,
            amountCafeteriaXof: cafeteria as number,
          })),
        },
      },
    });
    scheduleId = schedule.id;

    for (const target of targets) {
      const person = await prisma.person.create({
        data: {
          email: `${target.studentNo.toLowerCase()}-${randomUUID()}@test.local`,
          firstName: target.firstName,
          lastName: target.lastName,
          kind: "student",
          roles: ["student"],
        },
      });
      const student = await prisma.student.create({
        data: { personId: person.id, studentNo: target.studentNo },
      });
      studentIds.set(target.studentNo, student.id);
      const invoice = await prisma.invoice.create({
        data: {
          number: target.number,
          studentId: student.id,
          termId,
          totalAmount: target.totalAmount,
          amountPaid: target.totalAmount,
          status: "paid",
          packageType: "custom",
          costCenterCode: "9100",
          components: {
            create: {
              kind: "tuition",
              costCenterCode: "9100",
              amountXof: target.totalAmount,
            },
          },
          plan: {
            create: {
              installments: {
                create: target.amounts.map((amountDue, index) => ({
                  sequence: index + 1,
                  dueDate: new Date(target.dueDates[index]!),
                  amountDue,
                  amountPaid: amountDue,
                  status: "paid",
                })),
              },
            },
          },
        },
        include: { plan: { include: { installments: true } } },
      });
      invoiceIds.set(target.number, invoice.id);
      originalInstallmentIds.set(
        target.number,
        new Map(
          invoice.plan!.installments.map((row) => [row.sequence, row.id]),
        ),
      );
    }

    await createPayment(
      "BILL-2026-001",
      "success",
      1_500_000,
      "AISS-SUCCESS-1",
      [1_500_000, 0, 0],
      "legacy",
    );
    await createPayment(
      "BILL-2026-001",
      "success",
      2_000_000,
      "AISS-SUCCESS-2",
      [0, 1_000_000, 1_000_000],
      "legacy",
    );
    await createPayment(
      "BILL-2026-001",
      "refunded",
      1_500_000,
      "AISS-REFUND",
      [],
      "legacy",
    );
    await createPayment(
      "BILL-2026-002",
      "success",
      2_975_000,
      "MAM-SUCCESS",
      [1_487_500, 1_487_500],
      "payment_link",
    );
    await createPayment(
      "BILL-2026-002",
      "refunded",
      991_666,
      "MAM-REFUND",
      [],
      "legacy",
    );
    await createPayment(
      "BILL-2026-003",
      "success",
      3_500_000,
      "BINETA-SUCCESS",
      [3_500_000],
      "payment_link",
    );
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("enforces staging and rejects every unsafe signature/history class", async () => {
    expect(() => runNormalizer({ targetEnv: "prod" })).toThrow();

    const binetaId = studentIds.get("DAUST-CS-25-0033")!;
    await prisma.student.update({
      where: { id: binetaId },
      data: { studentNo: "WRONG-STUDENT-NO" },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.student.update({
      where: { id: binetaId },
      data: { studentNo: "DAUST-CS-25-0033" },
    });
    await prisma.student.update({
      where: { id: binetaId },
      data: { recordStatus: "archived" },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.student.update({
      where: { id: binetaId },
      data: { recordStatus: "active" },
    });

    const binetaInvoiceId = invoiceIds.get("BILL-2026-003")!;
    await prisma.invoice.update({
      where: { id: binetaInvoiceId },
      data: { totalAmount: 3_499_999 },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.invoice.update({
      where: { id: binetaInvoiceId },
      data: { totalAmount: 3_500_000 },
    });

    const duplicate = await prisma.invoice.create({
      data: {
        studentId: binetaId,
        termId,
        totalAmount: 4_285_000,
        packageType: "standard_full",
        academicYearLabel: "2026–2027",
        feeScheduleId: scheduleId,
        feeScheduleRevision: 7,
        costCenterCode: "9100",
      },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.invoice.delete({ where: { id: duplicate.id } });

    const paymentId = paymentIds.get("MAM-SUCCESS")!;
    await prisma.payment.update({
      where: { id: paymentId },
      data: { source: "legacy" },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.payment.update({
      where: { id: paymentId },
      data: { source: "payment_link" },
    });
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "refund_pending" },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "success" },
    });

    const overpayment = await prisma.payment.create({
      data: {
        invoiceId: invoiceIds.get("BILL-2026-003")!,
        studentId: binetaId,
        amount: 4_285_001,
        method: "card",
        status: "success",
        providerRef: `NORMALIZER-OVER-${randomUUID()}`,
      },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.payment.delete({ where: { id: overpayment.id } });

    const pending = await prisma.payment.create({
      data: {
        invoiceId: invoiceIds.get("BILL-2026-003")!,
        studentId: binetaId,
        amount: 10_000,
        method: "card",
        status: "pending",
        providerRef: `NORMALIZER-PENDING-${randomUUID()}`,
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        paymentId: pending.id,
        installmentId: originalInstallmentIds.get("BILL-2026-003")!.get(1)!,
        amount: 10_000,
      },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.paymentAllocation.deleteMany({
      where: { paymentId: pending.id },
    });
    await prisma.payment.delete({ where: { id: pending.id } });
  }, 120_000);

  it("dry-runs without writes, commits atomically, and preserves identities", async () => {
    const before = await readTargets();
    const beforeAuditCount = await prisma.auditLog.count();
    const dryRun = runNormalizer();
    expect(dryRun).toContain('"mode": "dry-run"');
    expect(dryRun).toContain('"normalize": 3');
    expect(dryRun).toContain('"unresolved": 0');
    expect(await readTargets()).toEqual(before);
    expect(await prisma.auditLog.count()).toBe(beforeAuditCount);

    const committed = runNormalizer({ commit: true });
    expect(committed).toContain("normalization committed successfully");
    const normalized = await readTargets();
    expect(normalized).toHaveLength(3);
    for (const invoice of normalized) {
      expect(invoice.id).toBe(invoiceIds.get(invoice.number!));
      expect(invoice.packageType).toBe("standard_full");
      expect(invoice.totalAmount).toBe(4_285_000);
      expect(invoice.academicYearLabel).toBe("2026–2027");
      expect(invoice.feeScheduleId).toBe(scheduleId);
      expect(invoice.feeScheduleRevision).toBe(7);
      expect(invoice.plan!.installments).toHaveLength(4);
      expect(invoice.plan!.installments.map((row) => row.sequence)).toEqual([
        1, 2, 3, 4,
      ]);
      for (const [sequence, id] of originalInstallmentIds.get(
        invoice.number!,
      )!) {
        expect(
          invoice.plan!.installments.find((row) => row.sequence === sequence)
            ?.id,
        ).toBe(id);
      }
      expect(
        invoice.components.reduce((sum, row) => sum + row.amountXof, 0),
      ).toBe(4_285_000);
      expect(new Set(invoice.components.map((row) => row.kind))).toEqual(
        new Set(["tuition", "housing", "cafeteria"]),
      );
    }

    const aissatou = normalized.find(
      (invoice) => invoice.number === "BILL-2026-001",
    )!;
    expect(aissatou.amountPaid).toBe(3_500_000);
    expect(aissatou.status).toBe("partial");
    expect(aissatou.plan!.installments.map((row) => row.amountPaid)).toEqual([
      1_200_000, 1_100_000, 1_000_000, 200_000,
    ]);
    const refunded = aissatou.payments.find(
      (payment) => payment.id === paymentIds.get("AISS-REFUND"),
    )!;
    expect(refunded.status).toBe("refunded");
    expect(refunded.allocations).toHaveLength(0);
    expect(
      refunded.componentAllocations.reduce(
        (sum, row) => sum + row.amountXof - row.refundedAmountXof,
        0,
      ),
    ).toBe(0);
    expect(
      refunded.componentAllocations.reduce(
        (sum, row) => sum + row.amountXof,
        0,
      ),
    ).toBe(1_500_000);

    const mamadou = normalized.find(
      (invoice) => invoice.number === "BILL-2026-002",
    )!;
    expect(mamadou.amountPaid).toBe(2_975_000);
    expect(mamadou.plan!.installments.map((row) => row.amountPaid)).toEqual([
      1_200_000, 1_100_000, 675_000, 0,
    ]);
    const bineta = normalized.find(
      (invoice) => invoice.number === "BILL-2026-003",
    )!;
    expect(bineta.amountPaid).toBe(3_500_000);
    expect(bineta.status).toBe("partial");
    expect(
      new Set(
        normalized.flatMap((invoice) => invoice.payments.map((row) => row.id)),
      ),
    ).toEqual(new Set(paymentIds.values()));

    const audits = await prisma.auditLog.findMany({
      where: { action: "staging-legacy-demo-normalized" },
    });
    expect(audits).toHaveLength(3);
    for (const audit of audits) {
      expect(audit.data).toMatchObject({
        before: { invoice: { id: audit.entityId } },
        after: {
          invoice: {
            id: audit.entityId,
            packageType: "standard_full",
            totalAmount: 4_285_000,
          },
        },
        feeScheduleId: scheduleId,
        feeScheduleRevision: 7,
      });
    }

    const driftAllocation =
      await prisma.paymentComponentAllocation.findFirstOrThrow({
        where: { paymentId: paymentIds.get("BINETA-SUCCESS") },
      });
    await prisma.paymentComponentAllocation.update({
      where: { id: driftAllocation.id },
      data: { amountXof: driftAllocation.amountXof - 1 },
    });
    expect(() => runNormalizer()).toThrow();
    await prisma.paymentComponentAllocation.update({
      where: { id: driftAllocation.id },
      data: { amountXof: driftAllocation.amountXof },
    });

    const rerun = runNormalizer({ commit: true });
    expect(rerun).toContain('"unchanged": 3');
    expect(
      await prisma.auditLog.count({
        where: { action: "staging-legacy-demo-normalized" },
      }),
    ).toBe(3);
  }, 120_000);
});

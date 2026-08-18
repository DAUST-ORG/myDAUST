import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import { FinanceService } from "./finance.service.js";
import { assignStandardPackageInTransaction } from "./standard-package.js";

const SCHEMA = `fee_component_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

let prisma: PrismaClient;
let approvals: FinanceApprovalsService;
let admin: AuthUser;
let bursar: AuthUser;

type FixtureOptions = {
  optionalComponent?: boolean;
  includeOptionalOverride?: boolean;
};

async function createFixture(name: string, options: FixtureOptions = {}) {
  const label = `AY-${name}-${randomUUID().slice(0, 6)}`;
  const year = await prisma.academicYear.create({
    data: { label, status: "archived" },
  });
  const term = await prisma.term.create({
    data: {
      name: `${name} term`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-05-31"),
      academicYearId: year.id,
    },
  });
  const person = await prisma.person.create({
    data: {
      email: `${name}-${randomUUID()}@test.local`,
      firstName: "Fee",
      lastName: "Student",
      kind: "student",
      roles: ["student"],
    },
  });
  const student = await prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `FEE-${randomUUID().slice(0, 8)}`,
    },
  });
  const schedule = await prisma.feeSchedule.create({
    data: {
      academicYearLabel: label,
      revision: 1,
      status: "approved",
      reason: "Fee component test",
      createdById: admin.personId,
      approvedById: admin.personId,
      approvedAt: new Date(),
      rows: {
        create: [
          [1, "Registration", "2026-09-05"],
          [2, "Fall balance", "2026-11-05"],
          [3, "Spring registration", "2027-01-05"],
          [4, "Spring balance", "2027-03-05"],
        ].map(([sequence, rowLabel, dueOn]) => ({
          academicYearLabel: label,
          semester: Number(sequence) < 3 ? "Fall" : "Spring",
          label: String(rowLabel),
          sequence: Number(sequence),
          dueOn: new Date(String(dueOn)),
          amountFullXof: 1_071_250,
          amountTuitionXof: 743_750,
          amountHousingXof: 170_000,
          amountCafeteriaXof: 157_500,
        })),
      },
      components: {
        create: [
          {
            key: "tuition",
            label: "Tuition",
            description: "Annual tuition",
            costCenterCode: "9100",
            annualAmountXof: 2_975_000,
            defaultSelected: true,
            sortOrder: 0,
          },
          {
            key: "housing",
            label: "Housing",
            description: "Annual housing",
            costCenterCode: "3700",
            annualAmountXof: 680_000,
            defaultSelected: true,
            sortOrder: 1,
          },
          {
            key: "cafeteria",
            label: "Cafeteria",
            description: "Annual cafeteria plan",
            costCenterCode: "3600",
            annualAmountXof: 630_000,
            defaultSelected: true,
            sortOrder: 2,
          },
          ...(options.optionalComponent
            ? [
                {
                  key: "technology_lab",
                  label: "Technology lab",
                  description: "Optional laboratory access",
                  costCenterCode: "9100",
                  annualAmountXof: 80_000,
                  defaultSelected: false,
                  sortOrder: 3,
                },
              ]
            : []),
        ],
      },
    },
    include: {
      rows: { orderBy: { sequence: "asc" } },
      components: { orderBy: { sortOrder: "asc" } },
    },
  });
  const includedOptional =
    options.optionalComponent && options.includeOptionalOverride;
  const total = 4_285_000 + (includedOptional ? 80_000 : 0);
  const installmentAmounts = [
    Math.ceil(total / 4),
    Math.floor(total / 4),
    Math.floor(total / 4),
    Math.floor(total / 4),
  ];
  const components = schedule.components.filter(
    (component) => component.defaultSelected || includedOptional,
  );
  const invoice = await prisma.invoice.create({
    data: {
      studentId: student.id,
      termId: term.id,
      totalAmount: total,
      packageType: "standard_full",
      academicYearLabel: label,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      costCenterCode: "9100",
      components: {
        create: components.map((component) => ({
          scheduleComponentId: component.id,
          kind: component.key,
          label: component.label,
          costCenterCode: component.costCenterCode,
          amountXof: component.annualAmountXof,
        })),
      },
      ...(includedOptional
        ? {
            componentOverrides: {
              create: {
                componentKey: "technology_lab",
                included: true,
                createdById: bursar.personId,
              },
            },
          }
        : {}),
      plan: {
        create: {
          createdById: bursar.personId,
          installments: {
            create: schedule.rows.map((row, index) => ({
              sequence: row.sequence,
              label: row.label,
              dueDate: row.dueOn!,
              amountDue: installmentAmounts[index]!,
            })),
          },
        },
      },
    },
  });
  return { label, schedule, student, invoice };
}

function schedulePayload(
  schedule: Awaited<ReturnType<typeof prisma.feeSchedule.findFirstOrThrow>> & {
    rows: Array<{
      id: string;
      label: string;
      dueOn: Date | null;
      amountFullXof: number;
      amountTuitionXof: number;
      amountHousingXof: number;
      amountCafeteriaXof: number;
    }>;
    components: Array<{
      id: string;
      key: string;
      label: string;
      description: string | null;
      costCenterCode: string;
      annualAmountXof: number;
      defaultSelected: boolean;
      sortOrder: number;
    }>;
  },
) {
  return {
    rows: schedule.rows.map((row) => ({
      id: row.id,
      label: row.label,
      dueOn: row.dueOn!.toISOString().slice(0, 10),
      amountFullXof: row.amountFullXof,
      amountTuitionXof: row.amountTuitionXof,
      amountHousingXof: row.amountHousingXof,
      amountCafeteriaXof: row.amountCafeteriaXof,
    })),
    components: schedule.components.map((component) => ({
      id: component.id,
      key: component.key,
      label: component.label,
      description: component.description,
      costCenterCode: component.costCenterCode,
      annualAmountXof: component.annualAmountXof,
      defaultSelected: component.defaultSelected,
      sortOrder: component.sortOrder,
    })),
  };
}

describe.skipIf(!DB_URL)("fee component approvals", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    process.env.DATABASE_URL = DB_URL!;
    process.env.PORTAL_ORIGIN = "https://portal.test.daust.net";
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    approvals = new FinanceApprovalsService(prisma as never);
    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
      ],
      skipDuplicates: true,
    });
    const [adminPerson, bursarPerson] = await Promise.all([
      prisma.person.create({
        data: {
          email: `admin-${randomUUID()}@test.local`,
          firstName: "Ada",
          lastName: "Admin",
          kind: "staff",
          roles: ["admin"],
        },
      }),
      prisma.person.create({
        data: {
          email: `bursar-${randomUUID()}@test.local`,
          firstName: "Binta",
          lastName: "Bursar",
          kind: "staff",
          roles: ["bursar"],
        },
      }),
    ]);
    admin = {
      personId: adminPerson.id,
      roles: ["admin"],
      email: adminPerson.email,
      name: "Ada Admin",
    };
    bursar = {
      personId: bursarPerson.id,
      roles: ["bursar"],
      email: bursarPerson.email,
      name: "Binta Bursar",
    };
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("preserves an exclusion and custom dates when global charges change", async () => {
    const fixture = await createFixture("propagation");
    const remove = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "Student does not use cafeteria",
      after: { mode: "remove_component", componentKey: "cafeteria" },
    });
    await expect(
      approvals.approve(remove.request.id, admin),
    ).resolves.toMatchObject({
      ok: true,
      result: { total: 3_655_000, individualComponentOverride: true },
    });
    const afterRemoval = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoice.id },
      include: {
        components: true,
        componentOverrides: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    expect(afterRemoval.components.map((row) => row.kind).sort()).toEqual([
      "housing",
      "tuition",
    ]);
    expect(afterRemoval.componentOverrides).toMatchObject([
      { componentKey: "cafeteria", included: false },
    ]);
    expect(afterRemoval.plan!.installments.map((row) => row.amountDue)).toEqual(
      [913_750, 913_750, 913_750, 913_750],
    );

    const first = afterRemoval.plan!.installments[0]!;
    const customDate = "2026-10-19";
    const customPlan = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "Approved family date arrangement",
      after: {
        mode: "update",
        installments: [
          {
            id: first.id,
            sequence: first.sequence,
            dueDate: customDate,
            amountDue: first.amountDue,
            label: "Individual registration date",
          },
        ],
      },
    });
    expect(customPlan.applied).toBe(true);

    const current = await prisma.feeSchedule.findFirstOrThrow({
      where: { academicYearLabel: fixture.label, status: "approved" },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: { sortOrder: "asc" } },
      },
    });
    const after = schedulePayload(current);
    after.rows[0]!.dueOn = "2026-10-30";
    after.components = [
      ...after.components.map((component) =>
        component.key === "tuition"
          ? { ...component, annualAmountXof: 3_000_000 }
          : component,
      ),
      {
        id: "",
        key: "technology_lab",
        label: "Technology lab",
        description: "Annual technology and laboratory access",
        costCenterCode: "9100",
        annualAmountXof: 80_000,
        defaultSelected: true,
        sortOrder: 3,
      },
    ];
    const global = await approvals.request(admin, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: current.id,
      academicYearLabel: fixture.label,
      reason: "Raise tuition and add the technology charge",
      after,
    });
    expect(global).toMatchObject({
      applied: true,
      result: { revision: 2, linkedPlansUpdated: 1 },
    });

    const propagated = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoice.id },
      include: {
        components: { orderBy: { kind: "asc" } },
        componentOverrides: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    expect(propagated).toMatchObject({
      totalAmount: 3_760_000,
      feeScheduleRevision: 2,
      paymentPlanOverride: true,
    });
    expect(propagated.components).toMatchObject([
      { kind: "housing", amountXof: 680_000 },
      { kind: "technology_lab", amountXof: 80_000 },
      { kind: "tuition", amountXof: 3_000_000 },
    ]);
    expect(propagated.plan!.installments.map((row) => row.amountDue)).toEqual([
      940_000, 940_000, 940_000, 940_000,
    ]);
    expect(
      propagated.plan!.installments[0]!.dueDate.toISOString().slice(0, 10),
    ).toBe(customDate);
    expect(propagated.plan!.installments[0]!.label).toBe(
      "Individual registration date",
    );
    expect(propagated.componentOverrides).toMatchObject([
      { componentKey: "cafeteria", included: false },
    ]);
  });

  it("stores a separate per-student component grid and isolates it from global amounts", async () => {
    const fixture = await createFixture("individual-grid");
    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoice.id },
      include: {
        components: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    const componentByKind = new Map(
      before.components.map((component) => [component.kind, component]),
    );
    const amounts = {
      tuition: [1_000_000, 800_000, 700_000, 475_000],
      housing: [200_000, 180_000, 150_000, 150_000],
      cafeteria: [200_000, 150_000, 150_000, 130_000],
    };
    const request = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "Approved family-specific component schedule",
      after: {
        mode: "update",
        installments: before.plan!.installments.map((installment, index) => {
          const components = Object.entries(amounts).map(([kind, values]) => ({
            invoiceComponentId: componentByKind.get(kind)!.id,
            amountXof: values[index]!,
          }));
          return {
            id: installment.id,
            sequence: installment.sequence,
            label: `Individual payment ${installment.sequence}`,
            dueDate: installment.dueDate.toISOString().slice(0, 10),
            amountDue: components.reduce(
              (sum, component) => sum + component.amountXof,
              0,
            ),
            components,
          };
        }),
      },
    });
    expect(request).toMatchObject({
      applied: true,
      result: { total: 4_285_000, individualOverride: true },
    });

    const individual = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoice.id },
      include: {
        components: { orderBy: { kind: "asc" } },
        plan: {
          include: {
            installments: {
              orderBy: { sequence: "asc" },
              include: { components: true },
            },
          },
        },
      },
    });
    expect(individual.paymentPlanOverride).toBe(true);
    expect(individual.plan!.installments.map((row) => row.amountDue)).toEqual([
      1_400_000, 1_130_000, 1_000_000, 755_000,
    ]);
    expect(
      individual.plan!.installments.map((row) => row.components.length),
    ).toEqual([3, 3, 3, 3]);
    expect(individual.components).toMatchObject([
      { kind: "cafeteria", amountXof: 630_000 },
      { kind: "housing", amountXof: 680_000 },
      { kind: "tuition", amountXof: 2_975_000 },
    ]);

    const current = await prisma.feeSchedule.findFirstOrThrow({
      where: { academicYearLabel: fixture.label, status: "approved" },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: { sortOrder: "asc" } },
      },
    });
    const globalPayload = schedulePayload(current);
    globalPayload.components = globalPayload.components.map((component) =>
      component.key === "tuition"
        ? { ...component, annualAmountXof: 3_100_000 }
        : component,
    );
    await approvals.request(admin, {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: current.id,
      academicYearLabel: fixture.label,
      reason: "Global tuition revision",
      after: globalPayload,
    });

    const isolated = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoice.id },
      include: {
        components: { orderBy: { kind: "asc" } },
        plan: {
          include: {
            installments: {
              orderBy: { sequence: "asc" },
              include: { components: true },
            },
          },
        },
      },
    });
    expect(isolated.totalAmount).toBe(4_285_000);
    expect(isolated.feeScheduleRevision).toBe(2);
    expect(
      isolated.components.find((row) => row.kind === "tuition")?.amountXof,
    ).toBe(2_975_000);
    expect(isolated.plan!.installments.map((row) => row.amountDue)).toEqual([
      1_400_000, 1_130_000, 1_000_000, 755_000,
    ]);

    const restore = await approvals.request(admin, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "Return student to the approved global plan",
      after: { mode: "restore_standard" },
    });
    expect(restore).toMatchObject({ applied: true });
    const restored = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoice.id },
      include: {
        components: true,
        plan: {
          include: {
            installments: {
              orderBy: { sequence: "asc" },
              include: { components: true },
            },
          },
        },
      },
    });
    expect(restored).toMatchObject({
      totalAmount: 4_410_000,
      paymentPlanOverride: false,
    });
    expect(
      restored.plan!.installments.flatMap((row) => row.components),
    ).toHaveLength(0);
  });

  it("blocks removal when a component has a net settled allocation", async () => {
    const fixture = await createFixture("allocated");
    const cafeteria = await prisma.invoiceComponent.findUniqueOrThrow({
      where: {
        invoiceId_kind: {
          invoiceId: fixture.invoice.id,
          kind: "cafeteria",
        },
      },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: fixture.invoice.id,
        studentId: fixture.student.id,
        amount: 10_000,
        method: "wire",
        status: "success",
        provider: "manual-test",
        providerRef: `allocation-${randomUUID()}`,
        settledAt: new Date(),
      },
    });
    await prisma.paymentComponentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceComponentId: cafeteria.id,
        amountXof: 10_000,
      },
    });
    const request = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "Invalid removal after settlement",
      after: { mode: "remove_component", componentKey: "cafeteria" },
    });
    await expect(approvals.approve(request.request.id, admin)).rejects.toThrow(
      "10000 XOF collected",
    );
    await expect(
      prisma.invoiceComponent.findUniqueOrThrow({
        where: {
          invoiceId_kind: {
            invoiceId: fixture.invoice.id,
            kind: "cafeteria",
          },
        },
      }),
    ).resolves.toMatchObject({ amountXof: 630_000 });
    await expect(
      prisma.invoiceComponentOverride.count({
        where: { invoiceId: fixture.invoice.id },
      }),
    ).resolves.toBe(0);
    await approvals.cancel(request.request.id, bursar, "Test cleanup");
  });

  it("rejects cost-center mutation for an existing catalog key", async () => {
    const fixture = await createFixture("cost-center");
    const current = await prisma.feeSchedule.findUniqueOrThrow({
      where: { id: fixture.schedule.id },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: { sortOrder: "asc" } },
      },
    });
    const after = schedulePayload(current);
    after.components = after.components.map((component) =>
      component.key === "housing"
        ? { ...component, costCenterCode: "9100" }
        : component,
    );
    await expect(
      approvals.request(admin, {
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: current.id,
        academicYearLabel: fixture.label,
        reason: "Invalid historical reclassification",
        after,
      }),
    ).rejects.toThrow("cost center cannot be changed");
    await expect(
      prisma.feeSchedule.count({ where: { academicYearLabel: fixture.label } }),
    ).resolves.toBe(1);

    const omittedId = schedulePayload(current);
    omittedId.components = omittedId.components.map((component) =>
      component.key === "housing"
        ? { ...component, id: "", costCenterCode: "9100" }
        : component,
    );
    await expect(
      approvals.request(admin, {
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: current.id,
        academicYearLabel: fixture.label,
        reason: "Attempt reclassification while omitting the catalog id",
        after: omittedId,
      }),
    ).rejects.toThrow("cost center cannot be changed");
  });

  it("rejects an oversized package before request persistence and defends assignment", async () => {
    const fixture = await createFixture("package-total-limit");
    await prisma.invoice.update({
      where: { id: fixture.invoice.id },
      data: { feeScheduleId: null, feeScheduleRevision: null },
    });
    await prisma.invoiceComponent.updateMany({
      where: { invoiceId: fixture.invoice.id },
      data: { scheduleComponentId: null },
    });
    await expect(
      prisma.invoice.count({ where: { feeScheduleId: fixture.schedule.id } }),
    ).resolves.toBe(0);

    const current = await prisma.feeSchedule.findUniqueOrThrow({
      where: { id: fixture.schedule.id },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: { sortOrder: "asc" } },
      },
    });
    const after = schedulePayload(current);
    after.components = [
      ...after.components.map((component) => ({
        ...component,
        annualAmountXof: 100_000_000,
        defaultSelected: true,
      })),
      ...Array.from({ length: 18 }, (_, index) => ({
        id: "",
        key: `additional_${index}`,
        label: `Additional charge ${index + 1}`,
        description: null,
        costCenterCode: "9100",
        annualAmountXof: 100_000_000,
        defaultSelected: true,
        sortOrder: index + 3,
      })),
    ];
    const requestCount = await prisma.approvalRequest.count({
      where: { academicYearLabel: fixture.label },
    });
    await expect(
      approvals.request(bursar, {
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: current.id,
        academicYearLabel: fixture.label,
        reason: "Invalid oversized annual package",
        after,
      }),
    ).rejects.toThrow("cannot exceed 2,000,000,000 XOF");
    await expect(
      prisma.approvalRequest.count({
        where: { academicYearLabel: fixture.label },
      }),
    ).resolves.toBe(requestCount);
    await expect(
      prisma.feeSchedule.count({ where: { academicYearLabel: fixture.label } }),
    ).resolves.toBe(1);

    // A legacy or manually-corrupted approved schedule must still fail closed
    // before an INTEGER-backed invoice or installment is written.
    await prisma.academicYear.update({
      where: { label: current.academicYearLabel },
      data: { status: "active" },
    });
    await prisma.feeScheduleComponent.updateMany({
      where: { scheduleId: current.id },
      data: { annualAmountXof: 100_000_000, defaultSelected: true },
    });
    await prisma.feeScheduleComponent.createMany({
      data: Array.from({ length: 18 }, (_, index) => ({
        scheduleId: current.id,
        key: `additional_${index}`,
        label: `Additional charge ${index + 1}`,
        costCenterCode: "9100",
        annualAmountXof: 100_000_000,
        defaultSelected: true,
        sortOrder: index + 3,
      })),
    });
    const assignmentPerson = await prisma.person.create({
      data: {
        email: `assignment-${randomUUID()}@test.local`,
        firstName: "Limit",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    const assignmentStudent = await prisma.student.create({
      data: {
        personId: assignmentPerson.id,
        studentNo: `LIMIT-${randomUUID().slice(0, 8)}`,
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        assignStandardPackageInTransaction(
          tx,
          assignmentStudent.id,
          admin.personId,
        ),
      ),
    ).rejects.toThrow("cannot exceed 2,000,000,000 XOF");
    await expect(
      prisma.invoice.count({ where: { studentId: assignmentStudent.id } }),
    ).resolves.toBe(0);
    await prisma.academicYear.update({
      where: { label: current.academicYearLabel },
      data: { status: "archived" },
    });
  });

  it("protects an individually included optional component from catalog deletion", async () => {
    const fixture = await createFixture("protected-delete", {
      optionalComponent: true,
      includeOptionalOverride: true,
    });
    await prisma.student.update({
      where: { id: fixture.student.id },
      data: { recordStatus: "pending_payment" },
    });
    const current = await prisma.feeSchedule.findUniqueOrThrow({
      where: { id: fixture.schedule.id },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: { sortOrder: "asc" } },
      },
    });
    const after = schedulePayload(current);
    after.components = after.components.filter(
      (component) => component.key !== "technology_lab",
    );
    await expect(
      approvals.request(admin, {
        kind: "global_fee_schedule",
        targetType: "FeeSchedule",
        targetId: current.id,
        academicYearLabel: fixture.label,
        reason: "Invalid optional charge deletion",
        after,
      }),
    ).rejects.toThrow("explicitly included on a student account");
    await expect(
      prisma.feeSchedule.count({ where: { academicYearLabel: fixture.label } }),
    ).resolves.toBe(1);
    await expect(
      prisma.invoiceComponentOverride.findUniqueOrThrow({
        where: {
          invoiceId_componentKey: {
            invoiceId: fixture.invoice.id,
            componentKey: "technology_lab",
          },
        },
      }),
    ).resolves.toMatchObject({ included: true });
  });

  it("fails closed on in-flight cash evidence, then resynchronizes the gate", async () => {
    const fixture = await createFixture("pending-global");
    const year = await prisma.academicYear.findUniqueOrThrow({
      where: { label: fixture.label },
    });
    await prisma.$transaction([
      prisma.student.update({
        where: { id: fixture.student.id },
        data: { recordStatus: "pending_payment" },
      }),
      prisma.person.update({
        where: { id: fixture.student.personId },
        data: { roles: [] },
      }),
    ]);
    const applicant = await prisma.applicant.create({
      data: {
        firstName: "Pending",
        lastName: "Student",
        email: `pending-${randomUUID()}@test.local`,
        programCode: "BSCS",
        stage: "accepted",
        onboardingStatus: "payment_pending",
        studentId: fixture.student.id,
        admissionAcademicYearId: year.id,
        enrollmentInvoiceId: fixture.invoice.id,
        requiredEnrollmentCashXof: 1_071_250,
        acceptedAt: new Date(),
        paymentPendingAt: new Date(),
      },
    });
    const oldLink = await prisma.paymentLink.create({
      data: {
        token: randomUUID().replaceAll("-", ""),
        amountXof: 1_071_250,
        purpose: "First enrollment installment",
        payeeName: "Pending Student",
        payeeMeta: fixture.student.studentNo,
        studentId: fixture.student.id,
        invoiceId: fixture.invoice.id,
        costCenterCode: "9100",
        onboardingApplicantId: applicant.id,
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { activeOnboardingPaymentLinkId: oldLink.id },
    });
    const staleProof = await prisma.paymentSubmission.create({
      data: {
        source: "payment_link",
        status: "submitted",
        method: "wave",
        studentId: fixture.student.id,
        invoiceId: fixture.invoice.id,
        paymentLinkId: oldLink.id,
        submittedAmountXof: 1_071_250,
        contactEmail: applicant.email,
        bankSnapshot: {},
      },
    });
    const stalePiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `pending-global-${randomUUID()}`,
        status: "sent",
        source: "payment_link",
        payerAlias: randomUUID(),
        amountXof: 1_071_250,
        motif: "First enrollment installment",
        studentId: fixture.student.id,
        paymentLinkId: oldLink.id,
      },
    });

    const current = await prisma.feeSchedule.findUniqueOrThrow({
      where: { id: fixture.schedule.id },
      include: {
        rows: { orderBy: { sequence: "asc" } },
        components: { orderBy: { sortOrder: "asc" } },
      },
    });
    const after = schedulePayload(current);
    after.components = after.components.map((component) =>
      component.key === "tuition"
        ? { ...component, annualAmountXof: 3_375_000 }
        : component,
    );

    const revisionRequest = {
      kind: "global_fee_schedule",
      targetType: "FeeSchedule",
      targetId: current.id,
      academicYearLabel: fixture.label,
      reason: "Revise the approved package for the pending cohort",
      after,
    } as const;

    await expect(approvals.request(admin, revisionRequest)).rejects.toThrow(
      "proof is under Finance review",
    );
    await expect(
      prisma.paymentLink.findUniqueOrThrow({ where: { id: oldLink.id } }),
    ).resolves.toMatchObject({ status: "active" });
    await expect(
      prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: staleProof.id },
      }),
    ).resolves.toMatchObject({ status: "submitted" });
    await expect(
      prisma.piSpiRequest.findUniqueOrThrow({ where: { id: stalePiSpi.id } }),
    ).resolves.toMatchObject({ status: "sent" });

    await prisma.paymentSubmission.update({
      where: { id: staleProof.id },
      data: { status: "rejected", activeKey: null },
    });
    await expect(approvals.request(admin, revisionRequest)).rejects.toThrow(
      "PI-SPI payment request is active",
    );
    await expect(
      prisma.paymentLink.findUniqueOrThrow({ where: { id: oldLink.id } }),
    ).resolves.toMatchObject({ status: "active" });

    await prisma.piSpiRequest.update({
      where: { id: stalePiSpi.id },
      data: { status: "cancelled", statusReason: "Payer cancelled request" },
    });
    await expect(
      approvals.request(admin, revisionRequest),
    ).resolves.toMatchObject({ applied: true });

    const refreshed = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
      include: { activeOnboardingPaymentLink: true },
    });
    expect(refreshed).toMatchObject({
      onboardingStatus: "payment_pending",
      requiredEnrollmentCashXof: 1_171_250,
      activeOnboardingPaymentLink: {
        status: "active",
        amountXof: 1_171_250,
      },
    });
    expect(refreshed.activeOnboardingPaymentLinkId).not.toBe(oldLink.id);
    await expect(
      prisma.paymentLink.findUniqueOrThrow({ where: { id: oldLink.id } }),
    ).resolves.toMatchObject({ status: "cancelled" });
    await expect(
      prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: staleProof.id },
      }),
    ).resolves.toMatchObject({ status: "rejected", activeKey: null });
    await expect(
      prisma.piSpiRequest.findUniqueOrThrow({ where: { id: stalePiSpi.id } }),
    ).resolves.toMatchObject({ status: "cancelled" });
  });

  it("activates after an approved component change lowers the cash threshold", async () => {
    const fixture = await createFixture("pending-component-activation");
    const year = await prisma.academicYear.findUniqueOrThrow({
      where: { label: fixture.label },
    });
    await prisma.$transaction([
      prisma.student.update({
        where: { id: fixture.student.id },
        data: { recordStatus: "pending_payment" },
      }),
      prisma.person.update({
        where: { id: fixture.student.personId },
        data: { roles: [] },
      }),
      prisma.invoice.update({
        where: { id: fixture.invoice.id },
        // Allocation is deliberately zero: an older account credit consumed the
        // payable lines, but the successful Payment below is still verified cash
        // explicitly initiated against this enrollment invoice.
        data: { amountPaid: 0, status: "open" },
      }),
    ]);
    await prisma.invoice.create({
      data: {
        studentId: fixture.student.id,
        termId: fixture.invoice.termId,
        totalAmount: -1_000_000,
        status: "paid",
        description: "Approved scholarship credit",
        costCenterCode: "9100",
        packageType: "credit",
        academicYearLabel: fixture.label,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: fixture.invoice.id,
        studentId: fixture.student.id,
        amount: 1_000_000,
        method: "wire",
        status: "success",
        provider: "manual-test",
        providerRef: `component-threshold-${randomUUID()}`,
        settledAt: new Date(),
      },
    });
    await prisma.payment.create({
      data: {
        invoiceId: fixture.invoice.id,
        studentId: fixture.student.id,
        amount: 2_000_000,
        method: "wire",
        status: "refunded",
        provider: "manual-test",
        providerRef: `refunded-component-threshold-${randomUUID()}`,
        settledAt: new Date(),
        refundedAt: new Date(),
      },
    });
    const applicant = await prisma.applicant.create({
      data: {
        firstName: "Threshold",
        lastName: "Student",
        email: `threshold-${randomUUID()}@test.local`,
        stage: "accepted",
        onboardingStatus: "payment_pending",
        studentId: fixture.student.id,
        admissionAcademicYearId: year.id,
        enrollmentInvoiceId: fixture.invoice.id,
        requiredEnrollmentCashXof: 1_071_250,
        acceptedAt: new Date(),
        paymentPendingAt: new Date(),
      },
    });
    const link = await prisma.paymentLink.create({
      data: {
        token: randomUUID().replaceAll("-", ""),
        amountXof: 71_250,
        purpose: "Remaining enrollment installment",
        payeeName: "Threshold Student",
        payeeMeta: fixture.student.studentNo,
        studentId: fixture.student.id,
        invoiceId: fixture.invoice.id,
        costCenterCode: "9100",
        onboardingApplicantId: applicant.id,
      },
    });
    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { activeOnboardingPaymentLinkId: link.id },
    });
    const finance = new FinanceService(
      prisma as never,
      { send: async () => ({ sent: true }) } as never,
      {} as never,
      new Map() as never,
    );
    const approvalsWithDelivery = new FinanceApprovalsService(
      prisma as never,
      undefined,
      finance,
    );

    const request = await approvalsWithDelivery.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "The accepted student will not use cafeteria services",
      after: { mode: "remove_component", componentKey: "cafeteria" },
    });
    await expect(
      approvalsWithDelivery.approve(request.request.id, admin),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } }),
    ).resolves.toMatchObject({
      onboardingStatus: "enrolled",
      requiredEnrollmentCashXof: 913_750,
      activatedByPaymentId: payment.id,
      activeOnboardingPaymentLinkId: null,
      studentInviteSentAt: expect.any(Date),
    });
    await expect(
      prisma.student.findUniqueOrThrow({
        where: { id: fixture.student.id },
        include: { person: true },
      }),
    ).resolves.toMatchObject({
      recordStatus: "active",
      person: { roles: ["student"] },
    });
    await expect(
      prisma.paymentLink.findUniqueOrThrow({ where: { id: link.id } }),
    ).resolves.toMatchObject({ status: "cancelled" });
    await expect(
      prisma.studentInvite.count({
        where: { studentPersonId: fixture.student.personId, usedAt: null },
      }),
    ).resolves.toBe(1);
  });

  it("fails closed for an unreconciled legacy package", async () => {
    const fixture = await createFixture("legacy");
    await prisma.invoice.update({
      where: { id: fixture.invoice.id },
      data: { feeScheduleId: null, feeScheduleRevision: null },
    });
    const request = await approvals.request(bursar, {
      kind: "payment_plan",
      targetType: "Invoice",
      targetId: fixture.invoice.id,
      reason: "Legacy package mutation",
      after: { mode: "remove_component", componentKey: "cafeteria" },
    });
    await expect(approvals.approve(request.request.id, admin)).rejects.toThrow(
      "not reconciled to an approved fee catalog",
    );
    await approvals.cancel(request.request.id, bursar, "Test cleanup");
  });
});

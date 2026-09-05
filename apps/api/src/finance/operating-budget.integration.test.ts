import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { FinanceApprovalsService } from "./finance-approvals.service.js";
import {
  OperatingBudgetService,
  type OperatingBudgetDraftInput,
} from "./operating-budget.service.js";

const SCHEMA = `operating_budget_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
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
let budgets: OperatingBudgetService;
let approvals: FinanceApprovalsService;
let admin: AuthUser;
let bursar: AuthUser;
let academicYearId: string;
let nonCoreInvoiceId: string;
let budgetStudentId: string;

async function saveAgainstCurrent(
  actor: AuthUser,
  input: Omit<
    OperatingBudgetDraftInput,
    "expectedBudgetId" | "expectedContentVersion"
  >,
) {
  const current = await budgets.getOperatingBudget(input.academicYear);
  return budgets.saveDraft(actor, {
    ...input,
    expectedBudgetId: current.revision?.id ?? null,
    expectedContentVersion: current.revision?.contentVersion ?? null,
  });
}

/** Always genuinely in the future, whenever the suite happens to run. */
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/** Start of the fixture academic year, so every month it covers stays a forecast. */
const FORECAST_AS_OF = new Date("2026-08-01T00:00:00.000Z");

describe.skipIf(!DB_URL)("operating budget PostgreSQL flow", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    budgets = new OperatingBudgetService(prisma as never);
    approvals = new FinanceApprovalsService(prisma as never, budgets);
    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
        { code: "1000", name: "Operations", type: "operating" },
      ],
      skipDuplicates: true,
    });
    const [adminPerson, bursarPerson, studentPerson] = await Promise.all([
      prisma.person.create({
        data: {
          email: `budget-admin-${randomUUID()}@test.local`,
          firstName: "Awa",
          lastName: "Admin",
          kind: "staff",
          roles: ["admin"],
        },
      }),
      prisma.person.create({
        data: {
          email: `budget-bursar-${randomUUID()}@test.local`,
          firstName: "Binta",
          lastName: "Bursar",
          kind: "staff",
          roles: ["bursar"],
        },
      }),
      prisma.person.create({
        data: {
          email: `budget-student-${randomUUID()}@test.local`,
          firstName: "Saliou",
          lastName: "Student",
          kind: "student",
          roles: ["student"],
        },
      }),
    ]);
    admin = {
      personId: adminPerson.id,
      roles: ["admin"],
      email: adminPerson.email,
      name: "Awa Admin",
    };
    bursar = {
      personId: bursarPerson.id,
      roles: ["bursar"],
      email: bursarPerson.email,
      name: "Binta Bursar",
    };
    const year = await prisma.academicYear.create({
      data: {
        label: "2026–2027",
        status: "active",
        startsOn: new Date("2026-08-01"),
        endsOn: new Date("2027-07-31"),
      },
    });
    academicYearId = year.id;
    const term = await prisma.term.create({
      data: {
        name: `Budget Fall ${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-12-20"),
        academicYearId: year.id,
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: studentPerson.id,
        studentNo: `BUD-${randomUUID().slice(0, 8)}`,
      },
    });
    budgetStudentId = student.id;
    const invoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: 1_000,
        amountPaid: 600,
        status: "partial",
        academicYearLabel: year.label,
        costCenterCode: "9100",
        components: {
          create: {
            kind: "tuition",
            label: "Tuition",
            costCenterCode: "9100",
            amountXof: 1_000,
          },
        },
      },
      include: { components: true },
    });
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: student.id,
        amount: 1_000,
        method: "card",
        status: "refunded",
        providerRef: `budget-pay-${randomUUID()}`,
        settledAt: new Date("2026-08-05T10:00:00Z"),
        refundedAt: new Date("2026-09-10T10:00:00Z"),
        componentAllocations: {
          create: {
            invoiceComponentId: invoice.components[0]!.id,
            amountXof: 600,
            refundedAmountXof: 600,
          },
        },
      },
    });
    const otherInvoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: 200,
        amountPaid: 200,
        status: "paid",
        academicYearLabel: year.label,
        costCenterCode: "1000",
        components: {
          create: {
            kind: "laboratory_fee",
            label: "Laboratory fee",
            costCenterCode: "1000",
            amountXof: 200,
          },
        },
      },
      include: { components: true },
    });
    nonCoreInvoiceId = otherInvoice.id;
    await prisma.payment.create({
      data: {
        invoiceId: otherInvoice.id,
        studentId: student.id,
        amount: 200,
        method: "card",
        status: "success",
        providerRef: `budget-other-pay-${randomUUID()}`,
        settledAt: new Date("2026-08-04T10:00:00Z"),
        componentAllocations: {
          create: {
            invoiceComponentId: otherInvoice.components[0]!.id,
            amountXof: 200,
          },
        },
      },
    });
    await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: 2_000,
        status: "open",
        academicYearLabel: year.label,
        costCenterCode: "9100",
        plan: {
          create: {
            installments: {
              create: [
                {
                  sequence: 1,
                  label: "Registration",
                  dueDate: new Date("2026-08-25"),
                  amountDue: 1_000,
                },
                {
                  sequence: 2,
                  label: "Final balance",
                  dueDate: new Date("2027-07-31"),
                  amountDue: 1_000,
                },
              ],
            },
          },
        },
      },
    });
    // An old approved record stays in cash totals but is never guessed into a
    // seeded plan category.
    await prisma.expense.create({
      data: {
        costCenterCode: "1000",
        category: "Legacy mystery",
        description: "Imported legacy expense",
        payee: "Legacy vendor",
        amount: 250,
        isEstimate: false,
        incurredOn: new Date("2026-08-06"),
        status: "approved",
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("publishes a bursar draft exactly once through administrator approval", async () => {
    const saved = await saveAgainstCurrent(bursar, {
      academicYear: "2026–2027",
      reason: "Initial operating plan",
      openingBalanceXof: -100,
      lines: [
        { categoryKey: "bursar", month: "2026-08", amountXof: 5_000 },
        { categoryKey: "taxes", month: "2026-08", amountXof: 1_000 },
      ],
    });
    const budgetId = saved.revision!.id;
    const submitted = await approvals.request(bursar, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: budgetId,
      academicYearLabel: "2026–2027",
      reason: "Publish initial plan",
      after: {
        mode: "publish_budget",
        budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    expect(submitted.applied).toBe(false);
    expect(
      await prisma.operatingBudget.findUniqueOrThrow({
        where: { id: budgetId },
      }),
    ).toMatchObject({ status: "pending", openingBalanceXof: -100n });

    await expect(
      approvals.approve(submitted.request.id, bursar),
    ).rejects.toThrow(/Only a Director/);

    const decision = await approvals.approve(submitted.request.id, admin);
    expect(decision).toMatchObject({ ok: true, status: "approved" });
    // A settled request refuses a second decision outright; the budget
    // assertions below prove the publish happened exactly once.
    await expect(
      approvals.approve(submitted.request.id, admin),
    ).rejects.toThrow("already approved");
    const view = await budgets.getOperatingBudget("2026–2027");
    expect(view.revision).toMatchObject({
      id: budgetId,
      status: "approved",
      openingBalanceXof: -100,
    });
    expect(view.budget.income.totalXof).toBe(5_000);
    expect(view.budget.expense.totalXof).toBe(1_000);
  });

  it("auto-approves an admin revision and supersedes the old immutable version", async () => {
    const saved = await saveAgainstCurrent(admin, {
      academicYear: "2026–2027",
      reason: "Reforecast",
      openingBalanceXof: -100,
      lines: [
        { categoryKey: "bursar", month: "2026-08", amountXof: 6_000 },
        { categoryKey: "taxes", month: "2026-08", amountXof: 1_200 },
      ],
    });
    const budgetId = saved.revision!.id;
    const response = await approvals.request(admin, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: budgetId,
      academicYearLabel: "2026–2027",
      reason: "Approve reforecast",
      after: {
        mode: "publish_budget",
        budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    expect(response.applied).toBe(true);
    const revisions = await prisma.operatingBudget.findMany({
      where: { academicYearId },
      orderBy: { revision: "asc" },
    });
    expect(revisions.map((row) => row.status)).toEqual([
      "superseded",
      "approved",
    ]);
    // Pinned: this fixture's months are all in the 2026-2027 year, and once real
    // time passes one of them the service reclassifies it from forecast to actual
    // and the assertions below stop describing anything.
    const forecast = await budgets.forecast({
      academicYear: "2026–2027",
      scenario: "base",
      asOf: FORECAST_AS_OF,
    });
    expect(forecast.metadata).toMatchObject({
      basisStatus: "approved",
      basisRevision: 2,
    });
    expect(
      forecast.months.find((month) => month.month === "2026-08"),
    ).toMatchObject({
      incomeXof: 2_200,
      source: "forecast",
    });
    expect(
      forecast.months.find((month) => month.month === "2027-07"),
    ).toMatchObject({
      incomeXof: 1_000,
      source: "forecast",
    });
  });

  it("carries the prior approved actual closing into a zero-data year", async () => {
    const previous = await prisma.academicYear.create({
      data: { label: "2024–2025", status: "archived" },
    });
    await prisma.operatingBudget.create({
      data: {
        academicYearId: previous.id,
        revision: 1,
        status: "approved",
        openingBalanceXof: 3_000_000_000n,
        reason: "Prior approved plan",
        createdById: admin.personId,
        reviewedById: admin.personId,
        approvedAt: new Date("2024-08-01"),
      },
    });
    await prisma.managementActualEntry.create({
      data: {
        academicYearId: previous.id,
        categoryKey: "research_grants",
        costCenterCode: "1000",
        type: "manual_income",
        status: "approved",
        amountXof: 500n,
        occurredOn: new Date("2025-02-01"),
        description: "Prior grant",
        createdById: admin.personId,
        approvedById: admin.personId,
        approvedAt: new Date("2025-02-01"),
      },
    });
    await prisma.expense.create({
      data: {
        academicYearId: previous.id,
        managementCategoryKey: "taxes",
        costCenterCode: "1000",
        category: "Taxes",
        amount: 200,
        isEstimate: false,
        incurredOn: new Date("2025-03-01"),
        status: "approved",
      },
    });
    await prisma.academicYear.create({
      data: { label: "2025–2026", status: "archived" },
    });
    const view = await budgets.getOperatingBudget("2025–2026");
    expect(view).toMatchObject({
      revision: null,
      openingBalanceXof: 3_000_000_300,
      openingBalanceSource: "carry_forward",
      summary: {
        openingBalanceXof: 3_000_000_300,
        actualIncomeXof: 0,
        actualExpenseXof: 0,
        actualClosingBalanceXof: 3_000_000_300,
      },
    });
  });

  it("persists, approves and adjusts whole-XOF values above PostgreSQL Int range", async () => {
    await prisma.academicYear.create({
      data: { label: "2023–2024", status: "archived" },
    });
    const saved = await saveAgainstCurrent(admin, {
      academicYear: "2023–2024",
      reason: "Large institution plan",
      openingBalanceXof: 3_000_000_000,
      lines: [
        {
          categoryKey: "research_grants",
          month: "2023-08",
          amountXof: 3_200_000_000,
        },
      ],
    });
    await approvals.request(admin, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: saved.savedClaim.budgetId,
      academicYearLabel: "2023–2024",
      reason: "Approve large institution plan",
      after: {
        mode: "publish_budget",
        budgetId: saved.savedClaim.budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    let view = await budgets.getOperatingBudget("2023–2024");
    expect(view).toMatchObject({
      revision: { status: "approved", openingBalanceXof: 3_000_000_000 },
      budget: { income: { totalXof: 3_200_000_000 } },
    });

    const income = await budgets.prepareActualCreate(
      {
        academicYear: "2023–2024",
        kind: "income",
        categoryKey: "research_grants",
        costCenterCode: "1000",
        amountXof: 3_000_000_000,
        occurredOn: "2023-08-10",
        description: "Large research award",
      },
      "create_income",
    );
    await approvals.request(admin, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: "2023–2024",
      reason: "Record large research award",
      after: income,
    });
    const adjustment = await budgets.adjustmentRequest({
      academicYear: "2023–2024",
      kind: "income",
      categoryKey: "research_grants",
      costCenterCode: "1000",
      month: "2023-08",
      requestedActualXof: 3_500_000_000,
      description: "Correct large award total",
    });
    await approvals.request(admin, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: "2023–2024",
      reason: "Approve large award correction",
      after: adjustment,
    });
    view = await budgets.getOperatingBudget("2023–2024");
    expect(view.actual.income.totalXof).toBe(3_500_000_000);
    expect(
      await prisma.managementActualEntry.findFirstOrThrow({
        where: { academicYear: { label: "2023–2024" }, type: "adjustment" },
      }),
    ).toMatchObject({
      amountXof: 500_000_000n,
      baseActualXof: 3_000_000_000n,
      targetActualXof: 3_500_000_000n,
    });
  });

  it("rejects actual approvals that would poison aggregates and keeps requests recoverable", async () => {
    const year = await prisma.academicYear.create({
      data: { label: "2020–2021", status: "archived" },
    });
    const first = await budgets.prepareActualCreate(
      {
        academicYear: year.label,
        kind: "income",
        categoryKey: "research_grants",
        costCenterCode: "1000",
        amountXof: Number.MAX_SAFE_INTEGER,
        occurredOn: "2020-08-10",
        description: "Maximum safe grant",
      },
      "create_income",
    );
    await approvals.request(admin, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: year.label,
      reason: "Approve maximum safe grant",
      after: first,
    });
    expect(await budgets.getOperatingBudget(year.label)).toMatchObject({
      actual: { income: { totalXof: Number.MAX_SAFE_INTEGER } },
    });

    const overflow = await budgets.prepareActualCreate(
      {
        academicYear: year.label,
        kind: "income",
        categoryKey: "donations_sponsorships",
        costCenterCode: "1000",
        amountXof: 1,
        occurredOn: "2020-08-11",
        description: "Would overflow actual income",
      },
      "create_income",
    );
    const pending = await approvals.request(bursar, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: year.label,
      reason: "Bursar aggregate overflow request",
      after: overflow,
    });
    const rejectedApply = await approvals
      .approve(pending.request.id, admin)
      .catch(
        (error: unknown) => error as { getStatus(): number; message: string },
      );
    expect(rejectedApply.getStatus()).toBe(400);
    expect(rejectedApply.message).toMatch(/safely supported whole-XOF/);
    expect(
      await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: pending.request.id },
      }),
    ).toMatchObject({ status: "pending", appliedAt: null });
    expect(
      await prisma.managementActualEntry.count({
        where: { academicYearId: year.id },
      }),
    ).toBe(1);
    await approvals.reject(
      pending.request.id,
      admin,
      "Aggregate would exceed reporting capacity",
    );
    expect(
      await prisma.approvalRequest.findUniqueOrThrow({
        where: { id: pending.request.id },
      }),
    ).toMatchObject({ status: "rejected", appliedAt: null });

    const autoReason = `Admin overflow ${randomUUID()}`;
    await expect(
      approvals.request(admin, {
        kind: "management_actual",
        targetType: "ManagementActualEntry",
        academicYearLabel: year.label,
        reason: autoReason,
        after: overflow,
      }),
    ).rejects.toThrow(/safely supported whole-XOF/);
    const cancelled = await prisma.approvalRequest.findFirstOrThrow({
      where: { reason: autoReason },
      include: { events: true },
    });
    expect(cancelled).toMatchObject({ status: "cancelled", appliedAt: null });
    expect(cancelled.events.map((event) => event.action)).toHaveLength(2);
    expect(cancelled.events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["submitted", "cancelled"]),
    );
    expect(
      await prisma.managementActualEntry.count({
        where: { academicYearId: year.id },
      }),
    ).toBe(1);
    expect(await budgets.getOperatingBudget(year.label)).toMatchObject({
      actual: { income: { totalXof: Number.MAX_SAFE_INTEGER } },
    });
  });

  it("rejects an actual that would overflow an approved opening balance", async () => {
    await prisma.academicYear.create({
      data: { label: "2021–2022", status: "archived" },
    });
    const saved = await saveAgainstCurrent(admin, {
      academicYear: "2021–2022",
      reason: "Maximum opening balance",
      openingBalanceXof: Number.MAX_SAFE_INTEGER,
      lines: [],
    });
    await approvals.request(admin, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: saved.savedClaim.budgetId,
      academicYearLabel: "2021–2022",
      reason: "Approve maximum opening balance",
      after: {
        mode: "publish_budget",
        budgetId: saved.savedClaim.budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    const income = await budgets.prepareActualCreate(
      {
        academicYear: "2021–2022",
        kind: "income",
        categoryKey: "others",
        costCenterCode: "1000",
        amountXof: 1,
        occurredOn: "2021-08-10",
        description: "Would overflow actual cash",
      },
      "create_income",
    );
    const reason = `Opening overflow ${randomUUID()}`;
    await expect(
      approvals.request(admin, {
        kind: "management_actual",
        targetType: "ManagementActualEntry",
        academicYearLabel: "2021–2022",
        reason,
        after: income,
      }),
    ).rejects.toThrow(/actual cash balance/);
    expect(
      await prisma.approvalRequest.findFirstOrThrow({ where: { reason } }),
    ).toMatchObject({ status: "cancelled", appliedAt: null });
    expect(
      await prisma.managementActualEntry.count({
        where: { academicYear: { label: "2021–2022" } },
      }),
    ).toBe(0);
    expect(await budgets.getOperatingBudget("2021–2022")).toMatchObject({
      summary: {
        openingBalanceXof: Number.MAX_SAFE_INTEGER,
        actualIncomeXof: 0,
        actualClosingBalanceXof: Number.MAX_SAFE_INTEGER,
      },
    });
  });

  it("reconciles allocated cash, unallocated account credit and its refund", async () => {
    const asOfToday = await budgets.getOperatingBudget("2026–2027");
    expect(asOfToday.actual.income.totalXof).toBe(1_200);
    expect(
      asOfToday.actual.income.rows.find((row) => row.categoryKey === "bursar")
        ?.months["2026-09"],
    ).toBe(0);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    try {
      const bursarRows = await budgets.listActuals({
        academicYear: "2026–2027",
        source: "bursar",
      });
      expect(bursarRows.items.map((row) => row.amountXof)).toEqual([600]);
      const unclassifiedCash = await budgets.listActuals({
        academicYear: "2026–2027",
        categoryKey: "unclassified_collections",
      });
      expect(unclassifiedCash.items.map((row) => row.amountXof)).toEqual([
        -400, 400, 200,
      ]);
      const refunds = await budgets.listActuals({
        academicYear: "2026–2027",
        source: "refund",
      });
      expect(
        refunds.items.map((row) => row.amountXof).sort((a, b) => a - b),
      ).toEqual([-600, -400]);
      const view = await budgets.getOperatingBudget("2026–2027");
      expect(view.actual.income.totalXof).toBe(200);
      const bursar = view.actual.income.rows.find(
        (row) => row.categoryKey === "bursar",
      )!;
      expect(bursar.months).toMatchObject({
        "2026-08": 600,
        "2026-09": -600,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns when legacy backfill makes settlement and refund timing ambiguous", async () => {
    await prisma.payment.create({
      data: {
        invoiceId: nonCoreInvoiceId,
        studentId: budgetStudentId,
        amount: 50,
        method: "card",
        status: "refunded",
        providerRef: `budget-ambiguous-${randomUUID()}`,
        settledAt: new Date("2026-08-09T10:00:00Z"),
        refundedAt: new Date("2026-08-09T10:00:00Z"),
      },
    });
    const view = await budgets.getOperatingBudget("2026–2027");
    expect(view.integrityWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ambiguous_legacy_payment_dates",
          count: 1,
          amountXof: 50,
        }),
      ]),
    );
  });

  it("recognizes paid-to-date deltas on the reviewed source date without a settlement timestamp", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: nonCoreInvoiceId },
      include: { components: true },
    });
    const digest = randomUUID().replaceAll("-", "").repeat(2);
    const batch = await prisma.paymentBalanceImportBatch.create({
      data: {
        sourceFileName: "paid-to-date.xlsx",
        sourceSha256: digest,
        sourceExtractionSha256: digest,
        manifestSha256: digest,
        confirmationPlanSha256: digest,
        status: "imported",
        academicYearLabel: "2026–2027",
        sourceAsOfDate: new Date("2026-08-29T00:00:00.000Z"),
        sourceSheet: "Comparison",
        sourceRowCount: 1,
        sourcePaidTotalXof: 75n,
        importedRows: 1,
        resolvedSourcePaidXof: 75n,
        importedDeltaXof: 75n,
        createdById: admin.personId,
        importedAt: new Date("2026-08-31T00:00:00.000Z"),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: budgetStudentId,
        amount: 75,
        method: "legacy_unknown",
        status: "success",
        provider: "balance_reconciliation",
        providerRef: `budget-balance-${randomUUID()}`,
        source: "paid_to_date_workbook",
        settledAt: null,
        componentAllocations: {
          create: {
            invoiceComponentId: invoice.components[0]!.id,
            amountXof: 75,
          },
        },
      },
    });
    const sourceClaimSha256 = randomUUID().replaceAll("-", "").repeat(2);
    const importedRow = await prisma.paymentBalanceImportRow.create({
      data: {
        batchId: batch.id,
        sourceSheet: "Comparison",
        sourceRowNumber: 29,
        sourceRowKey: "Comparison!29",
        sourceRowKeySha256: sourceClaimSha256,
        rowFingerprintSha256: sourceClaimSha256,
        sourcePaidToDateXof: 75n,
        disposition: "post_delta",
        identityDecision: "exact_match",
        matchMethod: "exact_ordered",
        studentId: budgetStudentId,
        invoiceId: invoice.id,
        invoiceRevision: invoice.revision,
        baselineLedgerPaidXof: 0n,
        deltaXof: 75n,
        paymentId: payment.id,
        sourceClaimSha256,
      },
    });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    try {
      const actuals = await budgets.listActuals({
        academicYear: "2026–2027",
        source: "balance_reconciliation",
      });
      expect(actuals).toMatchObject({ total: 1, totalXof: 75 });
      expect(actuals.items[0]).toMatchObject({
        source: "balance_reconciliation",
        occurredOn: new Date("2026-08-29T00:00:00.000Z"),
        amountXof: 75,
      });
      expect(
        (await budgets.getOperatingBudget("2026–2027")).integrityWarnings,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "source_as_of_balance_reconciliations",
            count: 1,
            amountXof: 75,
          }),
        ]),
      );
    } finally {
      vi.useRealTimers();
      await prisma.paymentBalanceImportRow.delete({
        where: { id: importedRow.id },
      });
      await prisma.paymentComponentAllocation.deleteMany({
        where: { paymentId: payment.id },
      });
      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.paymentBalanceImportBatch.delete({
        where: { id: batch.id },
      });
    }
  });

  it("keeps unclassified legacy expenses visible and drillable", async () => {
    const view = await budgets.getOperatingBudget("2026–2027");
    expect(view.integrityWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unclassified_expenses",
          count: 1,
          amountXof: 250,
        }),
      ]),
    );
    const row = view.actual.expense.rows.find(
      (candidate) => candidate.categoryKey === "unclassified_expenses",
    );
    expect(row?.totalXof).toBe(250);
    const drilldown = await budgets.listActuals({
      academicYear: "2026–2027",
      categoryKey: "unclassified_expenses",
    });
    expect(drilldown).toMatchObject({ total: 1, totalXof: 250 });
    expect(drilldown.items[0]).toMatchObject({
      payee: "Legacy vendor",
      source: "expense",
    });
  });

  it("approves manual income, excludes estimates and rejects stale signed adjustments", async () => {
    await expect(
      budgets.prepareActualCreate(
        {
          academicYear: "2026–2027",
          kind: "income",
          categoryKey: "bursar",
          costCenterCode: "9100",
          amountXof: 1,
          occurredOn: "2026-08-07",
          description: "Must come from payments",
        },
        "create_income",
      ),
    ).rejects.toThrow(/derived from settled payments/);
    await expect(
      budgets.prepareActualCreate(
        {
          academicYear: "2026–2027",
          kind: "expense",
          categoryKey: "taxes",
          costCenterCode: "1000",
          amountXof: 10,
          // Relative, not a literal: a hardcoded date stops being future-dated
          // the moment real time passes it, and the guard then correctly allows
          // what this case exists to prove it rejects.
          occurredOn: TOMORROW,
          description: "Future actual",
        },
        "create_expense",
      ),
    ).rejects.toThrow(/cannot be future-dated/);
    await expect(
      budgets.prepareActualCreate(
        {
          academicYear: "2026–2027",
          kind: "expense",
          categoryKey: "taxes",
          costCenterCode: "1000",
          amountXof: 10,
          occurredOn: "2026-09-01",
          description: "Future estimate",
          isEstimate: true,
        },
        "create_expense",
      ),
    ).resolves.toMatchObject({ isEstimate: true });
    const income = await budgets.prepareActualCreate(
      {
        academicYear: "2026–2027",
        kind: "income",
        categoryKey: "research_grants",
        costCenterCode: "1000",
        amountXof: 500,
        occurredOn: "2026-08-07",
        description: "Research award",
      },
      "create_income",
    );
    const pending = await approvals.request(bursar, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: "2026–2027",
      reason: "Record grant",
      after: income,
    });
    await approvals.approve(pending.request.id, admin);

    const estimate = await budgets.prepareActualCreate(
      {
        academicYear: "2026–2027",
        kind: "expense",
        categoryKey: "taxes",
        costCenterCode: "1000",
        amountXof: 999,
        occurredOn: "2026-08-07",
        description: "Tax estimate",
        isEstimate: true,
      },
      "create_expense",
    );
    await approvals.request(admin, {
      kind: "management_actual",
      targetType: "Expense",
      academicYearLabel: "2026–2027",
      reason: "Record estimate",
      after: estimate,
    });
    const estimateRegister = await budgets.listActuals({
      academicYear: "2026–2027",
      categoryKey: "taxes",
    });
    expect(estimateRegister).toMatchObject({
      totalXof: 0,
      excludedEstimateXof: 999,
    });
    expect(estimateRegister.items[0]).toMatchObject({
      isEstimate: true,
      amountXof: 999,
    });
    let view = await budgets.getOperatingBudget("2026–2027");
    expect(view.actual.income.totalXof).toBe(1_700);
    expect(
      view.actual.expense.rows.find((row) => row.categoryKey === "taxes")
        ?.totalXof,
    ).toBe(0);

    const adjustment = await budgets.adjustmentRequest({
      academicYear: "2026–2027",
      kind: "income",
      categoryKey: "research_grants",
      costCenterCode: "1000",
      month: "2026-08",
      requestedActualXof: -50,
      description: "Signed correction",
    });
    const adjustmentPending = await approvals.request(bursar, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: "2026–2027",
      reason: "Correct grant total",
      after: adjustment,
    });
    const secondIncome = await budgets.prepareActualCreate(
      {
        academicYear: "2026–2027",
        kind: "income",
        categoryKey: "research_grants",
        costCenterCode: "1000",
        amountXof: 1,
        occurredOn: "2026-08-08",
        description: "Late grant item",
      },
      "create_income",
    );
    await approvals.request(admin, {
      kind: "management_actual",
      targetType: "ManagementActualEntry",
      academicYearLabel: "2026–2027",
      reason: "Record late grant item",
      after: secondIncome,
    });
    const stale = await approvals.approve(adjustmentPending.request.id, admin);
    expect(stale).toMatchObject({ ok: false, status: "stale" });
    view = await budgets.getOperatingBudget("2026–2027");
    expect(view.actual.income.totalXof).toBe(1_701);
  });

  it("corrects and voids approved expenses without deleting history or payroll provenance", async () => {
    const employee = await prisma.person.create({
      data: {
        email: `budget-employee-${randomUUID()}@test.local`,
        firstName: "Moussa",
        lastName: "Employee",
        kind: "staff",
        roles: ["staff"],
      },
    });
    const original = await prisma.expense.create({
      data: {
        academicYearId,
        managementCategoryKey: "permanent_staff_salaries",
        costCenterCode: "1000",
        category: "Salary",
        description: "August payroll",
        payee: "Moussa Employee",
        personId: employee.id,
        amount: 100,
        isEstimate: false,
        incurredOn: new Date("2026-08-08"),
        status: "approved",
      },
    });
    const replacement = await budgets.prepareExpenseUpdate(original.id, {
      amountXof: 125,
    });
    const corrected = await approvals.request(admin, {
      kind: "management_actual",
      targetType: "Expense",
      targetId: original.id,
      academicYearLabel: "2026–2027",
      reason: "Correct payroll",
      after: replacement,
    });
    const replacementId = String(
      (corrected.result as { expenseId: string }).expenseId,
    );
    const [oldRow, newRow] = await Promise.all([
      prisma.expense.findUniqueOrThrow({ where: { id: original.id } }),
      prisma.expense.findUniqueOrThrow({ where: { id: replacementId } }),
    ]);
    expect(oldRow.status).toBe("corrected");
    expect(newRow).toMatchObject({
      status: "approved",
      category: "Salary",
      personId: employee.id,
      payee: "Moussa Employee",
      amount: 125,
      correctionOfId: original.id,
    });
    await approvals.request(admin, {
      kind: "management_actual",
      targetType: "Expense",
      targetId: replacementId,
      reason: "Void duplicate payroll",
      after: { mode: "void_expense" },
    });
    expect(
      await prisma.expense.findUniqueOrThrow({ where: { id: replacementId } }),
    ).toMatchObject({ status: "void", voidReason: "Void duplicate payroll" });
    expect(await prisma.expense.count({ where: { id: replacementId } })).toBe(
      1,
    );
  });

  it("restores a cancelled submission to draft and records a rejected revision", async () => {
    const saved = await saveAgainstCurrent(bursar, {
      academicYear: "2026–2027",
      reason: "Decision lifecycle",
      lines: [{ categoryKey: "taxes", month: "2026-08", amountXof: 20 }],
    });
    const budgetId = saved.revision!.id;
    const first = await approvals.request(bursar, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: budgetId,
      academicYearLabel: "2026–2027",
      reason: "Submit then cancel",
      after: {
        mode: "publish_budget",
        budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    await approvals.cancel(first.request.id, bursar, "Needs another review");
    expect(
      await prisma.operatingBudget.findUniqueOrThrow({
        where: { id: budgetId },
      }),
    ).toMatchObject({ status: "draft", approvalRequestId: null });
    const second = await approvals.request(bursar, {
      kind: "operating_budget",
      targetType: "OperatingBudget",
      targetId: budgetId,
      academicYearLabel: "2026–2027",
      reason: "Submit for decision",
      after: {
        mode: "publish_budget",
        budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    await approvals.reject(second.request.id, admin, "Revise the assumptions");
    expect(
      await prisma.operatingBudget.findUniqueOrThrow({
        where: { id: budgetId },
      }),
    ).toMatchObject({ status: "rejected", reviewedById: admin.personId });
    expect(
      await budgets.forecast({
        academicYear: "2026–2027",
        scenario: "base",
      }),
    ).toMatchObject({
      metadata: { basisStatus: "approved", basisRevision: 2 },
    });
  });

  it("atomically rejects a submit when draft content changed after its snapshot", async () => {
    const saved = await saveAgainstCurrent(bursar, {
      academicYear: "2026–2027",
      reason: "Concurrent draft",
      lines: [{ categoryKey: "taxes", month: "2026-08", amountXof: 10 }],
    });
    const budgetId = saved.revision!.id;
    const snapshot = await budgets.approvalSnapshot({
      kind: "operating_budget",
      targetId: budgetId,
      academicYearLabel: "2026–2027",
      after: {
        mode: "publish_budget",
        budgetId,
        expectedContentVersion: saved.savedClaim.contentVersion,
        expectedContentHash: saved.savedClaim.contentHash,
      },
    });
    const after = snapshot!.after as Record<string, unknown>;
    const request = await prisma.approvalRequest.create({
      data: {
        kind: "operating_budget",
        targetType: "OperatingBudget",
        targetId: budgetId,
        academicYearLabel: "2026–2027",
        reason: "Concurrent submit test",
        beforeJson: null,
        afterJson: after as never,
        baseRevision: snapshot!.baseRevision,
        requestedById: bursar.personId,
      },
    });
    await prisma.operatingBudget.update({
      where: { id: budgetId },
      data: { openingBalanceXof: { increment: 1 } },
    });
    const conflict = await prisma
      .$transaction((tx) =>
        budgets.markSubmitted(
          tx,
          budgetId,
          request.id,
          Number(after.draftContentVersion),
          String(after.draftContentHash),
        ),
      )
      .catch(
        (error: unknown) => error as { getStatus(): number; message: string },
      );
    expect(conflict.message).toMatch(/changed while it was being submitted/);
    expect(conflict.getStatus()).toBe(409);
    expect(
      await prisma.operatingBudget.findUniqueOrThrow({
        where: { id: budgetId },
      }),
    ).toMatchObject({ status: "draft", approvalRequestId: null });
    await prisma.approvalRequest.delete({ where: { id: request.id } });
  });

  it("keeps the submitting writer's immutable claim across the post-save read window", async () => {
    await prisma.academicYear.create({
      data: { label: "2031–2032", status: "draft" },
    });
    const originalGet = budgets.getOperatingBudget.bind(budgets);
    let interleaved = false;
    budgets.getOperatingBudget = async (...args) => {
      if (args[1] && !interleaved) {
        interleaved = true;
        const current = await originalGet(...args);
        await budgets.saveDraft(admin, {
          academicYear: "2031–2032",
          reason: "Writer B after Writer A commit",
          lines: [
            {
              categoryKey: "research_grants",
              month: "2031-08",
              amountXof: 222,
            },
          ],
          expectedBudgetId: current.revision!.id,
          expectedContentVersion: current.revision!.contentVersion,
        });
      }
      return originalGet(...args);
    };
    let saved: Awaited<ReturnType<OperatingBudgetService["saveDraft"]>>;
    try {
      saved = await budgets.saveDraft(bursar, {
        academicYear: "2031–2032",
        reason: "Writer A submit candidate",
        lines: [
          {
            categoryKey: "research_grants",
            month: "2031-08",
            amountXof: 111,
          },
        ],
        expectedBudgetId: null,
        expectedContentVersion: null,
      });
    } finally {
      budgets.getOperatingBudget = originalGet;
    }
    expect(saved.savedClaim.contentVersion).toBe(1);
    expect(saved.revision).toMatchObject({ contentVersion: 2 });
    const conflict = await approvals
      .request(bursar, {
        kind: "operating_budget",
        targetType: "OperatingBudget",
        targetId: saved.savedClaim.budgetId,
        academicYearLabel: "2031–2032",
        reason: "Submit Writer A values only",
        after: {
          mode: "publish_budget",
          budgetId: saved.savedClaim.budgetId,
          expectedContentVersion: saved.savedClaim.contentVersion,
          expectedContentHash: saved.savedClaim.contentHash,
        },
      })
      .catch((error: unknown) => error as { getStatus(): number });
    expect(conflict.getStatus()).toBe(409);
    expect(
      await prisma.operatingBudget.findUniqueOrThrow({
        where: { id: saved.savedClaim.budgetId },
      }),
    ).toMatchObject({ status: "draft", contentVersion: 2 });
  });

  it("uses strict content-version CAS for first writers and concurrent draft edits", async () => {
    await prisma.academicYear.create({
      data: { label: "2030–2031", status: "draft" },
    });
    const firstWriterInput: OperatingBudgetDraftInput = {
      academicYear: "2030–2031",
      reason: "First writer",
      lines: [
        { categoryKey: "research_grants", month: "2030-08", amountXof: 100 },
      ],
      expectedBudgetId: null,
      expectedContentVersion: null,
    };
    const firstWriters = await Promise.allSettled([
      budgets.saveDraft(bursar, firstWriterInput),
      budgets.saveDraft(admin, {
        ...firstWriterInput,
        reason: "Competing first writer",
        lines: [
          {
            categoryKey: "research_grants",
            month: "2030-08",
            amountXof: 150,
          },
        ],
      }),
    ]);
    expect(
      firstWriters.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const firstConflict = firstWriters.find(
      (result) => result.status === "rejected",
    );
    expect(firstConflict).toMatchObject({
      status: "rejected",
      reason: { response: { statusCode: 409 } },
    });

    const loaded = await budgets.getOperatingBudget("2030–2031");
    expect(loaded.revision).toMatchObject({ contentVersion: 1 });
    const candidate = await budgets.saveDraft(bursar, {
      academicYear: "2030–2031",
      reason: "Submit candidate",
      lines: [
        { categoryKey: "research_grants", month: "2030-08", amountXof: 175 },
      ],
      expectedBudgetId: loaded.revision!.id,
      expectedContentVersion: loaded.revision!.contentVersion,
    });
    const newer = await budgets.saveDraft(admin, {
      academicYear: "2030–2031",
      reason: "Interleaved newer edit",
      lines: [
        { categoryKey: "research_grants", month: "2030-08", amountXof: 180 },
      ],
      expectedBudgetId: candidate.revision!.id,
      expectedContentVersion: candidate.revision!.contentVersion,
    });
    const staleSubmit = await approvals
      .request(bursar, {
        kind: "operating_budget",
        targetType: "OperatingBudget",
        targetId: candidate.revision!.id,
        academicYearLabel: "2030–2031",
        reason: "Stale interleaved submit",
        after: {
          mode: "publish_budget",
          budgetId: candidate.revision!.id,
          expectedContentVersion: candidate.savedClaim.contentVersion,
          expectedContentHash: candidate.savedClaim.contentHash,
        },
      })
      .catch((error: unknown) => error as { getStatus(): number });
    expect(staleSubmit.getStatus()).toBe(409);
    expect(
      await prisma.approvalRequest.count({
        where: {
          kind: "operating_budget",
          targetId: candidate.revision!.id,
          status: "pending",
        },
      }),
    ).toBe(0);

    const expectedBudgetId = newer.revision!.id;
    const expectedContentVersion = newer.revision!.contentVersion;
    const edits = await Promise.allSettled([
      budgets.saveDraft(bursar, {
        academicYear: "2030–2031",
        reason: "Writer A",
        lines: [
          {
            categoryKey: "research_grants",
            month: "2030-08",
            amountXof: 200,
          },
        ],
        expectedBudgetId,
        expectedContentVersion,
      }),
      budgets.saveDraft(admin, {
        academicYear: "2030–2031",
        reason: "Writer B",
        lines: [
          {
            categoryKey: "research_grants",
            month: "2030-08",
            amountXof: 300,
          },
        ],
        expectedBudgetId,
        expectedContentVersion,
      }),
    ]);
    expect(
      edits.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const editConflict = edits.find((result) => result.status === "rejected");
    expect(editConflict).toMatchObject({
      status: "rejected",
      reason: { response: { statusCode: 409 } },
    });
    const after = await budgets.getOperatingBudget("2030–2031");
    expect(after.revision).toMatchObject({
      id: expectedBudgetId,
      contentVersion: expectedContentVersion + 1,
    });
    expect([200, 300]).toContain(after.budget.income.totalXof);

    const missingToken = await budgets
      .saveDraft(bursar, {
        academicYear: "2030–2031",
        reason: "Legacy caller",
        lines: [],
      } as OperatingBudgetDraftInput)
      .catch((error: unknown) => error as { getStatus(): number });
    expect(missingToken.getStatus()).toBe(400);
  });

  it("rejects unsafe aggregate drafts before persistence and preserves the readable revision", async () => {
    await prisma.academicYear.create({
      data: { label: "2032–2033", status: "draft" },
    });
    const initial = await budgets.saveDraft(bursar, {
      academicYear: "2032–2033",
      reason: "Readable baseline",
      openingBalanceXof: 0,
      lines: [
        { categoryKey: "research_grants", month: "2032-08", amountXof: 50 },
      ],
      expectedBudgetId: null,
      expectedContentVersion: null,
    });
    const baseline = await prisma.operatingBudget.findUniqueOrThrow({
      where: { id: initial.savedClaim.budgetId },
      include: { lines: true },
    });

    const annualOverflow = await budgets
      .saveDraft(admin, {
        academicYear: "2032–2033",
        reason: "Unsafe annual total",
        openingBalanceXof: 0,
        lines: [
          {
            categoryKey: "research_grants",
            month: "2032-08",
            amountXof: Number.MAX_SAFE_INTEGER,
          },
          {
            categoryKey: "donations_sponsorships",
            month: "2032-08",
            amountXof: 1,
          },
        ],
        expectedBudgetId: initial.revision!.id,
        expectedContentVersion: initial.revision!.contentVersion,
      })
      .catch(
        (error: unknown) => error as { getStatus(): number; message: string },
      );
    expect(annualOverflow.getStatus()).toBe(400);
    expect(annualOverflow.message).toMatch(/safely supported whole-XOF/);

    const cashIntermediateOverflow = await budgets
      .saveDraft(admin, {
        academicYear: "2032–2033",
        reason: "Unsafe cash intermediate",
        openingBalanceXof: Number.MAX_SAFE_INTEGER,
        lines: [
          {
            categoryKey: "research_grants",
            month: "2032-08",
            amountXof: 1,
          },
          { categoryKey: "taxes", month: "2032-08", amountXof: 1 },
        ],
        expectedBudgetId: initial.revision!.id,
        expectedContentVersion: initial.revision!.contentVersion,
      })
      .catch(
        (error: unknown) => error as { getStatus(): number; message: string },
      );
    expect(cashIntermediateOverflow.getStatus()).toBe(400);
    expect(cashIntermediateOverflow.message).toMatch(/planned cash balance/);

    const after = await prisma.operatingBudget.findUniqueOrThrow({
      where: { id: initial.savedClaim.budgetId },
      include: { lines: true },
    });
    expect(after).toMatchObject({
      id: baseline.id,
      contentVersion: baseline.contentVersion,
      openingBalanceXof: baseline.openingBalanceXof,
      reason: baseline.reason,
    });
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]).toMatchObject({
      categoryKey: "research_grants",
      amountXof: 50n,
    });
    expect(
      await prisma.operatingBudget.count({
        where: { academicYear: { label: "2032–2033" } },
      }),
    ).toBe(1);
    const readable = await budgets.getOperatingBudget("2032–2033");
    expect(readable).toMatchObject({
      revision: {
        id: baseline.id,
        contentVersion: baseline.contentVersion,
        reason: "Readable baseline",
      },
      budget: { income: { totalXof: 50 } },
    });
  });
});

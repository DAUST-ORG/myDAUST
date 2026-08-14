import { describe, expect, it } from "vitest";
import {
  academicYearBounds,
  forecastOperatingBudget,
  matrixFromCells,
  monthKeyInDakar,
  operatingBudgetMonths,
  validateBudgetCells,
  validateOperatingBudgetAggregateBounds,
} from "./operating-budget.js";

describe("operating budget calculations", () => {
  it("uses August through July for a consecutive academic year", () => {
    const bounds = academicYearBounds("2026–2027");
    expect(bounds.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2027-08-01T00:00:00.000Z");
    expect(
      operatingBudgetMonths("2026-2027").map((month) => month.key),
    ).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
    ]);
  });

  it("assigns timestamps to the Dakar calendar month", () => {
    expect(monthKeyInDakar(new Date("2026-08-25T23:59:59.999Z"))).toBe(
      "2026-08",
    );
    expect(monthKeyInDakar(new Date("2026-09-01T00:00:00.000Z"))).toBe(
      "2026-09",
    );
  });

  it("rejects duplicates, unknown categories and July/August boundary errors", () => {
    expect(() =>
      validateBudgetCells("2026-2027", [
        {
          categoryKey: "taxes",
          month: "2027-08",
          amountXof: 1,
        },
      ]),
    ).toThrow(/outside academic year/);
    expect(() =>
      validateBudgetCells("2026-2027", [
        { categoryKey: "taxes", month: "2026-08", amountXof: 1 },
        { categoryKey: "taxes", month: "2026-08", amountXof: 2 },
      ]),
    ).toThrow(/Duplicate/);
    expect(() =>
      validateBudgetCells("2026-2027", [
        { categoryKey: "unknown", month: "2026-08", amountXof: 1 },
      ]),
    ).toThrow(/Unknown/);
  });

  it("reconciles budget, actual and signed adjustment totals", () => {
    const matrix = matrixFromCells(
      "2026-2027",
      [{ categoryKey: "taxes", month: "2026-08", amountXof: 1_000 }],
      [
        {
          kind: "expense",
          categoryKey: "taxes",
          month: "2026-08",
          amountXof: 800,
        },
        {
          kind: "expense",
          categoryKey: "taxes",
          month: "2026-08",
          amountXof: -50,
        },
        {
          kind: "expense",
          categoryKey: "debts",
          month: "2026-08",
          amountXof: 50,
        },
      ],
    );
    const taxes = matrix.expense.rows.find((row) => row.key === "taxes")!;
    expect(taxes.budgetTotalXof).toBe(1_000);
    expect(taxes.actualTotalXof).toBe(750);
    expect(taxes.deviationXof).toBe(-250);
    expect(taxes.months[0]!.deviationPercent).toBe(-25);
    expect(taxes.months[0]!.unbudgeted).toBe(false);
    const unbudgeted = matrix.expense.rows.find((row) => row.key === "debts")!
      .months[0]!;
    expect(unbudgeted.deviationPercent).toBeNull();
    expect(unbudgeted.unbudgeted).toBe(true);
  });

  it("surfaces unclassified expenses without assigning them to a plan category", () => {
    const matrix = matrixFromCells(
      "2026-2027",
      [],
      [
        {
          kind: "expense",
          categoryKey: "unclassified_expenses",
          month: "2026-08",
          amountXof: 75_000,
        },
      ],
    );
    const unclassified = matrix.expense.rows.find(
      (row) => row.key === "unclassified_expenses",
    );
    expect(unclassified).toMatchObject({
      label: "Unclassified legacy expenses",
      actualOnly: true,
      budgetTotalXof: 0,
      actualTotalXof: 75_000,
    });
    expect(matrix.expense.actualTotalXof).toBe(75_000);
    expect(() =>
      validateBudgetCells("2026-2027", [
        {
          categoryKey: "unclassified_expenses",
          month: "2026-08",
          amountXof: 75_000,
        },
      ]),
    ).toThrow(/Unknown operating-budget category/);
  });

  it("keeps large whole-XOF matrix totals exact beyond a 32-bit aggregate", () => {
    const matrix = matrixFromCells(
      "2026-2027",
      [
        { categoryKey: "taxes", month: "2026-08", amountXof: 2_000_000_000 },
        { categoryKey: "debts", month: "2027-07", amountXof: 2_000_000_000 },
      ],
      [],
    );
    expect(matrix.expense.budgetTotalXof).toBe(4_000_000_000);
  });

  it("rejects aggregate values above the safe JSON whole-XOF boundary", () => {
    expect(() =>
      matrixFromCells(
        "2026-2027",
        [
          {
            categoryKey: "taxes",
            month: "2026-08",
            amountXof: Number.MAX_SAFE_INTEGER,
          },
          { categoryKey: "debts", month: "2026-08", amountXof: 1 },
        ],
        [],
      ),
    ).toThrow(/maximum safely supported whole-XOF value/);
  });

  it("rejects an unsafe cumulative cash intermediate even when expenses cancel it", () => {
    expect(() =>
      validateOperatingBudgetAggregateBounds(
        "2026-2027",
        Number.MAX_SAFE_INTEGER,
        [
          {
            categoryKey: "research_grants",
            month: "2026-08",
            amountXof: 1,
          },
          { categoryKey: "taxes", month: "2026-08", amountXof: 1 },
        ],
      ),
    ).toThrow(/planned cash balance/);
  });

  it("uses exact past actuals and spreads overdue collections across future buckets", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 500,
      case: "stress",
      today: new Date("2026-09-15T12:00:00Z"),
      scheduledBursarByMonth: { "2026-08": 1_000 },
      planned: [
        {
          categoryKey: "research_grants",
          month: "2026-09",
          amountXof: 100,
        },
        { categoryKey: "taxes", month: "2026-09", amountXof: 100 },
      ],
      actual: [
        {
          kind: "income",
          categoryKey: "bursar",
          month: "2026-08",
          amountXof: 200,
        },
      ],
    });
    expect(result.months[0]).toMatchObject({
      month: "2026-08",
      state: "recorded_actual",
      projectedIncomeXof: 200,
    });
    expect(result.months[1]).toMatchObject({
      projectedStudentCollectionsXof: 450,
      projectedOtherIncomeXof: 100,
      projectedIncomeXof: 550,
      projectedExpenseXof: 105,
    });
    expect(
      result.months
        .slice(1, 5)
        .map((month) => month.projectedStudentCollectionsXof),
    ).toEqual([450, 225, 135, 90]);
    expect(result.summary).toMatchObject({
      projectedYearEndCashXof: 1_595,
      endingReceivablesXof: 100,
      projectedUncollectibleXof: 100,
    });
  });

  it("anchors pre-year custom-plan debt as overdue but retains post-year debt", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "approved_plan",
      today: new Date("2026-09-15T12:00:00Z"),
      scheduledBursarByMonth: {
        "2026-07": 100,
        "2027-08": 200,
      },
      planned: [],
      actual: [],
    });
    expect(result.months[1]).toMatchObject({
      month: "2026-09",
      projectedStudentCollectionsXof: 100,
    });
    expect(result.summary.endingReceivablesXof).toBe(200);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "collections_outside_year",
          amountXof: 200,
        }),
      ]),
    );
  });

  it("preserves whole-XOF timing totals and caps collections at receivables", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "custom",
      customAssumptions: {
        eventualRealizationPercent: 100,
        collectionTimingPercent: {
          due: 25,
          plus30: 25,
          plus60: 25,
          plus90OrLater: 25,
        },
        remainingExpenseVariancePercent: 0,
      },
      today: new Date("2026-09-15T12:00:00Z"),
      scheduledBursarByMonth: { "2026-08": 7 },
      planned: [],
      actual: [],
    });
    expect(
      result.months
        .slice(1, 5)
        .map((month) => month.projectedStudentCollectionsXof),
    ).toEqual([2, 2, 2, 1]);
    expect(result.driverBridge.projectedStudentCollectionsXof).toBe(7);
    expect(result.summary.endingReceivablesXof).toBe(0);
  });

  it("guards safe-XOF receivable aggregates without floating-point multiplication", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "approved_plan",
      today: new Date("2026-08-25T12:00:00Z"),
      scheduledBursarByMonth: {
        "2026-08": Number.MAX_SAFE_INTEGER,
      },
      planned: [],
      actual: [],
    });
    expect(result.driverBridge.projectedStudentCollectionsXof).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() =>
      forecastOperatingBudget({
        label: "2026-2027",
        openingBalanceXof: 0,
        case: "approved_plan",
        today: new Date("2026-08-25T12:00:00Z"),
        scheduledBursarByMonth: {
          "2026-08": Number.MAX_SAFE_INTEGER,
          "2026-09": 1,
        },
        planned: [],
        actual: [],
      }),
    ).toThrow(/maximum safely supported whole-XOF value/);
  });

  it("uses a one-time expense variance without monthly compounding", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "custom",
      customAssumptions: {
        eventualRealizationPercent: 100,
        collectionTimingPercent: {
          due: 100,
          plus30: 0,
          plus60: 0,
          plus90OrLater: 0,
        },
        remainingExpenseVariancePercent: 10,
      },
      today: new Date("2026-08-25T12:00:00Z"),
      planned: [
        { categoryKey: "taxes", month: "2026-08", amountXof: 1_000 },
        { categoryKey: "taxes", month: "2026-09", amountXof: 1_000 },
      ],
      actual: [
        {
          kind: "expense",
          categoryKey: "taxes",
          month: "2026-08",
          amountXof: 200,
        },
      ],
    });
    expect(result.months[0]!.projectedExpenseXof).toBe(1_080);
    expect(result.months[1]!.projectedExpenseXof).toBe(1_100);
    expect(result.driverBridge).toMatchObject({
      remainingApprovedExpensesXof: 1_800,
      expenseVarianceImpactXof: -180,
    });
  });

  it("keeps the upside case at or above the approved plan without shocks", () => {
    const common = {
      label: "2026-2027",
      openingBalanceXof: 100,
      today: new Date("2026-08-25T12:00:00Z"),
      scheduledBursarByMonth: {
        "2026-08": 1_000,
        "2027-07": 1_000,
      },
      planned: [
        { categoryKey: "taxes", month: "2026-08", amountXof: 600 },
        { categoryKey: "taxes", month: "2027-07", amountXof: 600 },
      ],
      actual: [],
    } as const;
    const approvedPlan = forecastOperatingBudget({
      ...common,
      planned: [...common.planned],
      actual: [...common.actual],
      case: "approved_plan",
    });
    const upside = forecastOperatingBudget({
      ...common,
      planned: [...common.planned],
      actual: [...common.actual],
      case: "upside",
    });
    expect(upside.summary.projectedYearEndCashXof).toBeGreaterThanOrEqual(
      approvedPlan.summary.projectedYearEndCashXof,
    );
    expect(upside.summary.lowestBalanceXof).toBeGreaterThanOrEqual(
      approvedPlan.summary.lowestBalanceXof,
    );
    expect(upside.driverBridge.projectedStudentCollectionsXof).toBe(
      approvedPlan.driverBridge.projectedStudentCollectionsXof,
    );
  });

  it("forecasts the current-month remainder per category without cross-row netting", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "approved_plan",
      today: new Date("2026-08-25T12:00:00Z"),
      planned: [
        {
          categoryKey: "research_grants",
          month: "2026-08",
          amountXof: 100,
        },
        {
          categoryKey: "donations_sponsorships",
          month: "2026-08",
          amountXof: 100,
        },
        { categoryKey: "taxes", month: "2026-08", amountXof: 100 },
        { categoryKey: "rent", month: "2026-08", amountXof: 100 },
      ],
      actual: [
        {
          kind: "income",
          categoryKey: "research_grants",
          month: "2026-08",
          amountXof: 150,
        },
        {
          kind: "income",
          categoryKey: "unclassified_collections",
          month: "2026-08",
          amountXof: 1_000,
        },
        {
          kind: "expense",
          categoryKey: "taxes",
          month: "2026-08",
          amountXof: 150,
        },
      ],
    });
    expect(result.months[0]).toMatchObject({
      actualIncomeXof: 1_150,
      projectedIncomeXof: 1_250,
      actualExpenseXof: 150,
      projectedExpenseXof: 250,
    });
  });

  it("retains delayed July collections and unscheduled debt as ending receivables", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "custom",
      customAssumptions: {
        eventualRealizationPercent: 80,
        collectionTimingPercent: {
          due: 25,
          plus30: 25,
          plus60: 25,
          plus90OrLater: 25,
        },
        remainingExpenseVariancePercent: 0,
      },
      today: new Date("2026-08-25T12:00:00Z"),
      scheduledBursarByMonth: { "2027-07": 1_000 },
      unscheduledBursarXof: 500,
      planned: [],
      actual: [],
    });
    expect(result.months.at(-1)!.projectedStudentCollectionsXof).toBe(200);
    expect(result.summary).toMatchObject({
      endingReceivablesXof: 1_300,
      projectedUncollectibleXof: 300,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unscheduled_receivables",
          amountXof: 500,
        }),
        expect.objectContaining({
          code: "collections_outside_year",
          amountXof: 600,
        }),
      ]),
    );
  });

  it("returns reserve, deficit, shock and signed driver-bridge metrics", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 1_000,
      case: "custom",
      customAssumptions: {
        eventualRealizationPercent: 80,
        collectionTimingPercent: {
          due: 100,
          plus30: 0,
          plus60: 0,
          plus90OrLater: 0,
        },
        remainingExpenseVariancePercent: 25,
      },
      minimumReserveXof: 2_000,
      shock: {
        kind: "expense",
        amountXof: 100,
        month: "2026-08",
        label: "Emergency repair",
      },
      today: new Date("2026-08-25T12:00:00Z"),
      scheduledBursarByMonth: { "2026-08": 1_000 },
      planned: [
        {
          categoryKey: "research_grants",
          month: "2026-08",
          amountXof: 500,
        },
        { categoryKey: "taxes", month: "2026-08", amountXof: 400 },
      ],
      actual: [],
    });
    expect(result.summary).toMatchObject({
      projectedYearEndCashXof: 1_700,
      lowestBalanceXof: 1_700,
      lowestBalanceMonth: "2026-08",
      deficitMonthCount: 0,
      reserveBreachMonthCount: 12,
      firstReserveBreachMonth: "2026-08",
      peakFundingGapXof: 300,
      approvedPlanYearEndCashXof: 1_100,
      varianceToApprovedPlanXof: 600,
    });
    expect(result.driverBridge).toMatchObject({
      openingBalanceXof: 1_000,
      projectedStudentCollectionsXof: 800,
      projectedOtherIncomeXof: 500,
      remainingApprovedExpensesXof: 400,
      expenseVarianceImpactXof: -100,
      shockImpactXof: -100,
    });
    const bridge = result.driverBridge;
    expect(
      bridge.openingBalanceXof +
        bridge.actualIncomeXof -
        bridge.actualExpenseXof +
        bridge.projectedStudentCollectionsXof +
        bridge.projectedOtherIncomeXof -
        bridge.remainingApprovedExpensesXof +
        bridge.expenseVarianceImpactXof +
        bridge.shockImpactXof,
    ).toBe(result.summary.projectedYearEndCashXof);
  });

  it("measures cash-risk months from the current projection horizon", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      case: "approved_plan",
      today: new Date("2026-09-15T12:00:00Z"),
      planned: [
        {
          categoryKey: "research_grants",
          month: "2026-09",
          amountXof: 200,
        },
      ],
      actual: [
        {
          kind: "expense",
          categoryKey: "taxes",
          month: "2026-08",
          amountXof: 100,
        },
      ],
    });
    expect(result.months[0]!.projectedBalanceXof).toBe(-100);
    expect(result.summary).toMatchObject({
      lowestBalanceXof: 100,
      lowestBalanceMonth: "2026-09",
      deficitMonthCount: 0,
      firstDeficitMonth: null,
    });
  });

  it("rejects invalid timing totals and shocks in recorded months", () => {
    expect(() =>
      forecastOperatingBudget({
        label: "2026-2027",
        openingBalanceXof: 0,
        case: "custom",
        customAssumptions: {
          eventualRealizationPercent: 100,
          collectionTimingPercent: {
            due: 50,
            plus30: 20,
            plus60: 20,
            plus90OrLater: 20,
          },
          remainingExpenseVariancePercent: 0,
        },
        today: new Date("2026-09-15T12:00:00Z"),
        planned: [],
        actual: [],
      }),
    ).toThrow(/total exactly 100/);
    expect(() =>
      forecastOperatingBudget({
        label: "2026-2027",
        openingBalanceXof: 0,
        case: "approved_plan",
        today: new Date("2026-09-15T12:00:00Z"),
        shock: { kind: "income", amountXof: 1, month: "2026-08" },
        planned: [],
        actual: [],
      }),
    ).toThrow(/cannot change a recorded actual month/);
  });
});

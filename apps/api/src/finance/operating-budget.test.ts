import { describe, expect, it } from "vitest";
import {
  academicYearBounds,
  forecastOperatingBudget,
  matrixFromCells,
  monthKeyInDakar,
  operatingBudgetMonths,
  scheduledReceivableForecastMonth,
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

  it("rolls an overdue installment into the current forecast month", () => {
    const months = new Set(
      operatingBudgetMonths("2026-2027").map((row) => row.key),
    );
    expect(scheduledReceivableForecastMonth("2026-08", "2026-09", months)).toBe(
      "2026-09",
    );
    expect(scheduledReceivableForecastMonth("2027-07", "2026-09", months)).toBe(
      "2027-07",
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

  it("uses actual past months and scenario-adjusted plans for future months", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 500,
      scenario: "conservative",
      today: new Date("2026-09-15T12:00:00Z"),
      collectionRatePercent: 80,
      expenseGrowthPercent: 10,
      scheduledBursarByMonth: { "2026-09": 1_000 },
      planned: [
        {
          categoryKey: "bursar",
          month: "2026-09",
          amountXof: 100_000,
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
      isActual: true,
      forecastIncomeXof: 200,
    });
    expect(result.months[1]).toMatchObject({
      month: "2026-09",
      isActual: false,
      forecastIncomeXof: 720,
      forecastExpenseXof: 116,
    });
    expect(result.projectedClosingBalanceXof).toBe(1_304);
  });

  it("combines current-month actuals with remaining live installments", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      scenario: "base",
      today: new Date("2026-08-25T12:00:00Z"),
      collectionRatePercent: 100,
      expenseGrowthPercent: 10,
      scheduledBursarByMonth: { "2026-08": 700, "2026-09": 1_000 },
      planned: [
        { categoryKey: "taxes", month: "2026-08", amountXof: 1_000 },
        { categoryKey: "taxes", month: "2026-09", amountXof: 1_000 },
      ],
      actual: [
        {
          kind: "income",
          categoryKey: "bursar",
          month: "2026-08",
          amountXof: 300,
        },
        {
          kind: "expense",
          categoryKey: "taxes",
          month: "2026-08",
          amountXof: 200,
        },
      ],
    });
    expect(result.months[0]).toMatchObject({
      forecastIncomeXof: 1_000,
      forecastExpenseXof: 1_080,
      source: "forecast",
    });
    // September is the second future planning step: 1,000 * 1.10^2.
    expect(result.months[1]!.forecastExpenseXof).toBe(1_210);
  });

  it("forecasts current-month remainder per category without cross-row netting", () => {
    const result = forecastOperatingBudget({
      label: "2026-2027",
      openingBalanceXof: 0,
      scenario: "base",
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
      forecastIncomeXof: 1_250,
      actualExpenseXof: 150,
      forecastExpenseXof: 250,
    });
  });
});

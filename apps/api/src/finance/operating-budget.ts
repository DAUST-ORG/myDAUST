import { BadRequestException } from "@nestjs/common";

export const OPERATING_BUDGET_KINDS = ["income", "expense"] as const;
export type OperatingBudgetKind = (typeof OPERATING_BUDGET_KINDS)[number];

export const OPERATING_BUDGET_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const;
export type OperatingBudgetStatus = (typeof OPERATING_BUDGET_STATUSES)[number];

export const OPERATING_BUDGET_CATEGORIES = [
  {
    key: "bursar",
    label: "Tuition, dining & housing (Bursar)",
    kind: "income",
    sortOrder: 0,
  },
  {
    key: "research_grants",
    label: "Research Grants",
    kind: "income",
    sortOrder: 1,
  },
  {
    key: "service_contracts",
    label: "Service Contracts",
    kind: "income",
    sortOrder: 2,
  },
  {
    key: "donations_sponsorships",
    label: "Donations & Sponsorships",
    kind: "income",
    sortOrder: 3,
  },
  {
    key: "scholarships",
    label: "Scholarships",
    kind: "income",
    sortOrder: 4,
  },
  {
    key: "others",
    label: "Others",
    kind: "income",
    sortOrder: 5,
  },
  {
    key: "taxes",
    label: "Taxes",
    kind: "expense",
    sortOrder: 0,
  },
  {
    key: "debts",
    label: "Debts",
    kind: "expense",
    sortOrder: 1,
  },
  {
    key: "rent",
    label: "Rent",
    kind: "expense",
    sortOrder: 2,
  },
  {
    key: "permanent_staff_salaries",
    label: "Permanent Staff Salaries",
    kind: "expense",
    sortOrder: 3,
  },
  {
    key: "cafeteria_restaurant",
    label: "Cafeteria & Restaurant",
    kind: "expense",
    sortOrder: 4,
  },
  {
    key: "capital_other_expenses",
    label: "Capital & Other Expenses",
    kind: "expense",
    sortOrder: 5,
  },
  {
    key: "contract_vacataire_salaries",
    label: "Contract (Vacataire) Salaries",
    kind: "expense",
    sortOrder: 6,
  },
  {
    key: "service_providers",
    label: "Service Providers",
    kind: "expense",
    sortOrder: 7,
  },
  {
    key: "utilities",
    label: "Utilities",
    kind: "expense",
    sortOrder: 8,
  },
  {
    key: "facilities_it_maintenance",
    label: "Facilities, IT & Maintenance",
    kind: "expense",
    sortOrder: 9,
  },
  {
    key: "departments_events",
    label: "Departments & Events",
    kind: "expense",
    sortOrder: 10,
  },
  {
    key: "insurance",
    label: "Insurance",
    kind: "expense",
    sortOrder: 11,
  },
  {
    key: "travel_transportation",
    label: "Travel & Transportation",
    kind: "expense",
    sortOrder: 12,
  },
] as const satisfies readonly {
  key: string;
  label: string;
  kind: OperatingBudgetKind;
  sortOrder: number;
}[];

export type OperatingBudgetCategoryKey =
  (typeof OPERATING_BUDGET_CATEGORIES)[number]["key"];

/** Legacy approved expenses that have not been classified by Finance. */
export const UNCLASSIFIED_EXPENSE_CATEGORY = {
  key: "unclassified_expenses",
  label: "Unclassified legacy expenses",
  kind: "expense",
  sortOrder: 999,
  actualOnly: true,
} as const;

/** Settled cash not attributable to tuition, housing or cafeteria components. */
export const UNCLASSIFIED_COLLECTION_CATEGORY = {
  key: "unclassified_collections",
  label: "Unclassified settled collections",
  kind: "income",
  sortOrder: 999,
  actualOnly: true,
} as const;

export type BudgetCell = {
  categoryKey: string;
  month: string;
  amountXof: number;
};

export type ActualCell = BudgetCell & {
  kind: OperatingBudgetKind;
};

export function academicYearBounds(label: string): {
  start: Date;
  endExclusive: Date;
} {
  const years = label.match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/);
  if (!years) {
    throw new BadRequestException(
      "Academic year must look like 2026-2027 or 2026–2027",
    );
  }
  const startYear = Number(years[1]);
  const endYear = Number(years[2]);
  if (endYear !== startYear + 1) {
    throw new BadRequestException(
      "Academic year must contain consecutive years",
    );
  }
  return {
    start: new Date(Date.UTC(startYear, 7, 1)),
    endExclusive: new Date(Date.UTC(endYear, 7, 1)),
  };
}

export function operatingBudgetMonths(label: string) {
  const { start } = academicYearBounds(label);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1),
    );
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });
}

export function assertWholeXof(value: number, label = "Amount") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException(
      `${label} must be a non-negative whole XOF value`,
    );
  }
  return value;
}

function assertSignedSafeXof(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new BadRequestException(
      `${label} exceeds the maximum safely supported whole-XOF value`,
    );
  }
  return value;
}

function addXof(left: number, right: number, label: string) {
  return assertSignedSafeXof(left + right, label);
}

export function validateBudgetCells(label: string, cells: BudgetCell[]) {
  const allowedMonths = new Set(
    operatingBudgetMonths(label).map((month) => month.key),
  );
  const categories = new Set(
    OPERATING_BUDGET_CATEGORIES.map((category) => category.key),
  );
  const seen = new Set<string>();
  return cells.map((cell) => {
    if (!categories.has(cell.categoryKey as OperatingBudgetCategoryKey)) {
      throw new BadRequestException(
        `Unknown operating-budget category ${cell.categoryKey}`,
      );
    }
    if (!allowedMonths.has(cell.month)) {
      throw new BadRequestException(
        `${cell.month} is outside academic year ${label}`,
      );
    }
    const key = `${cell.categoryKey}:${cell.month}`;
    if (seen.has(key)) {
      throw new BadRequestException(`Duplicate budget cell ${key}`);
    }
    seen.add(key);
    return { ...cell, amountXof: assertWholeXof(cell.amountXof) };
  });
}

export function monthKeyInDakar(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Africa/Dakar",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not derive Dakar month");
  return `${year}-${month}`;
}

/** Past-due collectible obligations remain forecastable in the current month. */
export function scheduledReceivableForecastMonth(
  dueMonth: string,
  currentMonth: string,
  academicYearMonths: ReadonlySet<string>,
) {
  const result =
    dueMonth < currentMonth && academicYearMonths.has(currentMonth)
      ? currentMonth
      : dueMonth;
  return academicYearMonths.has(result) ? result : null;
}

export function matrixFromCells(
  label: string,
  cells: BudgetCell[],
  actuals: ActualCell[],
) {
  const months = operatingBudgetMonths(label);
  const planned = new Map(
    cells.map((cell) => [`${cell.categoryKey}:${cell.month}`, cell.amountXof]),
  );
  const actual = new Map<string, number>();
  for (const cell of actuals) {
    const key = `${cell.categoryKey}:${cell.month}`;
    actual.set(
      key,
      addXof(actual.get(key) ?? 0, cell.amountXof, "Actual cell total"),
    );
  }
  const byKind = (kind: OperatingBudgetKind) => {
    const definitions = [
      ...OPERATING_BUDGET_CATEGORIES.filter(
        (category) => category.kind === kind,
      ),
      ...(kind === "expense" &&
      actuals.some(
        (cell) => cell.categoryKey === UNCLASSIFIED_EXPENSE_CATEGORY.key,
      )
        ? [UNCLASSIFIED_EXPENSE_CATEGORY]
        : []),
      ...(kind === "income" &&
      actuals.some(
        (cell) => cell.categoryKey === UNCLASSIFIED_COLLECTION_CATEGORY.key,
      )
        ? [UNCLASSIFIED_COLLECTION_CATEGORY]
        : []),
    ];
    const rows = definitions.map((category) => {
      const values = months.map((month) => {
        const key = `${category.key}:${month.key}`;
        const budgetXof = planned.get(key) ?? 0;
        const actualXof = actual.get(key) ?? 0;
        return {
          month: month.key,
          budgetXof,
          actualXof,
          deviationXof: assertSignedSafeXof(
            actualXof - budgetXof,
            "Budget deviation",
          ),
          unbudgeted: budgetXof === 0 && actualXof !== 0,
          deviationPercent:
            budgetXof === 0
              ? null
              : Math.round(((actualXof - budgetXof) / budgetXof) * 10_000) /
                100,
        };
      });
      return {
        ...category,
        months: values,
        budgetTotalXof: values.reduce(
          (sum, cell) => addXof(sum, cell.budgetXof, "Annual budget total"),
          0,
        ),
        actualTotalXof: values.reduce(
          (sum, cell) => addXof(sum, cell.actualXof, "Annual actual total"),
          0,
        ),
        deviationXof: values.reduce(
          (sum, cell) => addXof(sum, cell.deviationXof, "Annual deviation"),
          0,
        ),
      };
    });
    return {
      rows,
      budgetTotalXof: rows.reduce(
        (sum, row) => addXof(sum, row.budgetTotalXof, "Budget matrix total"),
        0,
      ),
      actualTotalXof: rows.reduce(
        (sum, row) => addXof(sum, row.actualTotalXof, "Actual matrix total"),
        0,
      ),
    };
  };
  return { income: byKind("income"), expense: byKind("expense") };
}

/**
 * Validate every aggregate that the budget read path will calculate before a
 * draft is persisted. Individual cells can each be safe while their monthly,
 * annual or cumulative cash totals are not.
 */
export function validateOperatingBudgetAggregateBounds(
  label: string,
  openingBalanceXof: number,
  cells: BudgetCell[],
  actuals: ActualCell[] = [],
) {
  let plannedBalanceXof = assertSignedSafeXof(
    openingBalanceXof,
    "Opening balance",
  );
  let actualBalanceXof = plannedBalanceXof;
  const matrix = matrixFromCells(label, cells, actuals);
  const months = operatingBudgetMonths(label);
  for (const [index, month] of months.entries()) {
    const incomeXof = matrix.income.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[index]!.budgetXof,
          `${month.label} planned income`,
        ),
      0,
    );
    const expenseXof = matrix.expense.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[index]!.budgetXof,
          `${month.label} planned expense`,
        ),
      0,
    );
    plannedBalanceXof = addXof(
      addXof(
        plannedBalanceXof,
        incomeXof,
        `${month.label} planned cash balance`,
      ),
      -expenseXof,
      `${month.label} planned cash balance`,
    );
    const actualIncomeXof = matrix.income.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[index]!.actualXof,
          `${month.label} actual income`,
        ),
      0,
    );
    const actualExpenseXof = matrix.expense.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[index]!.actualXof,
          `${month.label} actual expense`,
        ),
      0,
    );
    actualBalanceXof = addXof(
      addXof(
        actualBalanceXof,
        actualIncomeXof,
        `${month.label} actual cash balance`,
      ),
      -actualExpenseXof,
      `${month.label} actual cash balance`,
    );
  }
  return {
    plannedIncomeXof: matrix.income.budgetTotalXof,
    plannedExpenseXof: matrix.expense.budgetTotalXof,
    plannedClosingBalanceXof: plannedBalanceXof,
    actualIncomeXof: matrix.income.actualTotalXof,
    actualExpenseXof: matrix.expense.actualTotalXof,
    actualClosingBalanceXof: actualBalanceXof,
  };
}

export type ForecastScenario = "conservative" | "base" | "optimistic";

const SCENARIO_FACTORS: Record<
  ForecastScenario,
  { income: number; expense: number }
> = {
  conservative: { income: 0.9, expense: 1.05 },
  base: { income: 1, expense: 1 },
  optimistic: { income: 1.08, expense: 0.97 },
};

export function forecastOperatingBudget(input: {
  label: string;
  openingBalanceXof: number;
  planned: BudgetCell[];
  actual: ActualCell[];
  scenario: ForecastScenario;
  today: Date;
  collectionRatePercent?: number;
  expenseGrowthPercent?: number;
  /** Remaining installment obligations after account-wide credits, by due month. */
  scheduledBursarByMonth?: Readonly<Record<string, number>>;
}) {
  const months = operatingBudgetMonths(input.label);
  const currentMonth = monthKeyInDakar(input.today);
  const factors = SCENARIO_FACTORS[input.scenario];
  const collectionFactor =
    input.collectionRatePercent === undefined
      ? 1
      : input.collectionRatePercent / 100;
  const monthlyExpenseGrowth = (input.expenseGrowthPercent ?? 0) / 100;
  const matrix = matrixFromCells(input.label, input.planned, input.actual);
  let balance = input.openingBalanceXof;
  const currentMonthIndex = months.findIndex(
    (month) => month.key === currentMonth,
  );
  const series = months.map((month, monthIndex) => {
    const isPast = month.key < currentMonth;
    const isCurrent = month.key === currentMonth;
    const plannedIncomeXof = matrix.income.rows.reduce(
      (sum, row) =>
        addXof(sum, row.months[monthIndex]!.budgetXof, "Monthly plan income"),
      0,
    );
    const plannedExpenseXof = matrix.expense.rows.reduce(
      (sum, row) =>
        addXof(sum, row.months[monthIndex]!.budgetXof, "Monthly plan expense"),
      0,
    );
    const actualIncomeXof = matrix.income.rows.reduce(
      (sum, row) =>
        addXof(sum, row.months[monthIndex]!.actualXof, "Monthly actual income"),
      0,
    );
    const actualExpenseXof = matrix.expense.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[monthIndex]!.actualXof,
          "Monthly actual expense",
        ),
      0,
    );
    const otherIncomeRows = matrix.income.rows.filter(
      (row) =>
        row.key !== "bursar" &&
        !("actualOnly" in row && row.actualOnly === true),
    );
    const scheduledBursarXof = Math.max(
      0,
      input.scheduledBursarByMonth?.[month.key] ?? 0,
    );
    const remainingOtherIncomeXof = isCurrent
      ? otherIncomeRows.reduce(
          (sum, row) =>
            addXof(
              sum,
              Math.max(
                0,
                row.months[monthIndex]!.budgetXof -
                  row.months[monthIndex]!.actualXof,
              ),
              "Remaining monthly income",
            ),
          0,
        )
      : otherIncomeRows.reduce(
          (sum, row) =>
            addXof(
              sum,
              row.months[monthIndex]!.budgetXof,
              "Remaining monthly income",
            ),
          0,
        );
    const projectedRemainderIncomeXof = assertSignedSafeXof(
      Math.round(
        (scheduledBursarXof * collectionFactor + remainingOtherIncomeXof) *
          factors.income,
      ),
      "Forecast income",
    );
    const futureOffset = Math.max(
      1,
      monthIndex - (currentMonthIndex < 0 ? 0 : currentMonthIndex) + 1,
    );
    const compoundedExpenseFactor = Math.pow(
      1 + monthlyExpenseGrowth,
      futureOffset,
    );
    const remainingExpenseXof = isCurrent
      ? matrix.expense.rows
          .filter((row) => !("actualOnly" in row && row.actualOnly === true))
          .reduce(
            (sum, row) =>
              addXof(
                sum,
                Math.max(
                  0,
                  row.months[monthIndex]!.budgetXof -
                    row.months[monthIndex]!.actualXof,
                ),
                "Remaining monthly expense",
              ),
            0,
          )
      : plannedExpenseXof;
    const projectedRemainderExpenseXof = assertSignedSafeXof(
      Math.round(
        remainingExpenseXof * factors.expense * compoundedExpenseFactor,
      ),
      "Forecast expense",
    );
    const forecastIncomeXof = isPast
      ? actualIncomeXof
      : addXof(
          actualIncomeXof,
          projectedRemainderIncomeXof,
          "Monthly forecast income",
        );
    const forecastExpenseXof = isPast
      ? actualExpenseXof
      : addXof(
          actualExpenseXof,
          projectedRemainderExpenseXof,
          "Monthly forecast expense",
        );
    balance = addXof(
      addXof(balance, forecastIncomeXof, "Forecast cash balance"),
      -forecastExpenseXof,
      "Forecast cash balance",
    );
    return {
      month: month.key,
      isActual: isPast,
      source: isPast ? ("actual" as const) : ("forecast" as const),
      plannedIncomeXof,
      plannedExpenseXof,
      actualIncomeXof,
      actualExpenseXof,
      forecastIncomeXof,
      forecastExpenseXof,
      forecastBalanceXof: balance,
    };
  });
  return {
    scenario: input.scenario,
    metadata: {
      incomeFactor: factors.income,
      expenseFactor: factors.expense,
      collectionRatePercent: input.collectionRatePercent ?? 100,
      expenseGrowthPercent: input.expenseGrowthPercent ?? 0,
      generatedAt: input.today.toISOString(),
      persisted: false,
    },
    months: series,
    projectedClosingBalanceXof: balance,
  };
}

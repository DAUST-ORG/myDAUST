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

export const CASHFLOW_SIMULATION_CASES = [
  "approved_plan",
  "stress",
  "upside",
  "custom",
] as const;
export type CashflowSimulationCase = (typeof CASHFLOW_SIMULATION_CASES)[number];

export type CollectionTimingPercent = {
  due: number;
  plus30: number;
  plus60: number;
  plus90OrLater: number;
};

export type CashflowSimulationAssumptions = {
  eventualRealizationPercent: number;
  collectionTimingPercent: CollectionTimingPercent;
  remainingExpenseVariancePercent: number;
};

export type CashflowSimulationShock = {
  kind: OperatingBudgetKind;
  amountXof: number;
  month: string;
  label?: string;
};

export const CASHFLOW_SIMULATION_PRESETS: Record<
  Exclude<CashflowSimulationCase, "custom">,
  CashflowSimulationAssumptions
> = {
  approved_plan: {
    eventualRealizationPercent: 100,
    collectionTimingPercent: {
      due: 100,
      plus30: 0,
      plus60: 0,
      plus90OrLater: 0,
    },
    remainingExpenseVariancePercent: 0,
  },
  stress: {
    eventualRealizationPercent: 90,
    collectionTimingPercent: {
      due: 50,
      plus30: 25,
      plus60: 15,
      plus90OrLater: 10,
    },
    remainingExpenseVariancePercent: 5,
  },
  upside: {
    eventualRealizationPercent: 100,
    collectionTimingPercent: {
      due: 100,
      plus30: 0,
      plus60: 0,
      plus90OrLater: 0,
    },
    remainingExpenseVariancePercent: -3,
  },
};

function assertPercent(value: number, label: string, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum || value > 100) {
    throw new BadRequestException(
      `${label} must be between ${minimum} and 100`,
    );
  }
  return value;
}

const PERCENT_PRECISION = 1_000_000;
const ONE_HUNDRED_PERCENT_UNITS = BigInt(100 * PERCENT_PRECISION);

function percentUnits(value: number, label: string) {
  const scaled = value * PERCENT_PRECISION;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 0.000_001) {
    throw new BadRequestException(
      `${label} supports at most six decimal places`,
    );
  }
  return BigInt(rounded);
}

function multiplyWholeXofByPercent(
  totalXof: number,
  percent: number,
  label: string,
) {
  assertWholeXof(totalXof, label);
  const numerator = BigInt(totalXof) * percentUnits(percent, label);
  const rounded =
    (numerator + ONE_HUNDRED_PERCENT_UNITS / 2n) / ONE_HUNDRED_PERCENT_UNITS;
  return assertWholeXof(Number(rounded), label);
}

export function resolveCashflowSimulationAssumptions(
  simulationCase: CashflowSimulationCase,
  custom?: CashflowSimulationAssumptions,
) {
  const assumptions =
    simulationCase === "custom"
      ? custom
      : CASHFLOW_SIMULATION_PRESETS[simulationCase];
  if (!assumptions) {
    throw new BadRequestException(
      "Custom cashflow assumptions are required for a custom case",
    );
  }
  assertPercent(assumptions.eventualRealizationPercent, "Eventual realization");
  assertPercent(
    assumptions.remainingExpenseVariancePercent,
    "Remaining expense variance",
    -100,
  );
  const timing = assumptions.collectionTimingPercent;
  for (const [key, value] of Object.entries(timing)) {
    assertPercent(value, `Collection timing ${key}`);
  }
  const timingTotal = Object.entries(timing).reduce(
    (sum, [key, value]) =>
      sum + percentUnits(value, `Collection timing ${key}`),
    0n,
  );
  if (timingTotal !== ONE_HUNDRED_PERCENT_UNITS) {
    throw new BadRequestException(
      "Collection timing percentages must total exactly 100",
    );
  }
  return {
    eventualRealizationPercent: assumptions.eventualRealizationPercent,
    collectionTimingPercent: { ...timing },
    remainingExpenseVariancePercent:
      assumptions.remainingExpenseVariancePercent,
  };
}

/** Allocate a whole-XOF total across percentages without losing a franc. */
function allocateWholeXof(
  totalXof: number,
  percentages: readonly number[],
  label: string,
) {
  assertWholeXof(totalXof, label);
  const products = percentages.map(
    (percent, index) =>
      BigInt(totalXof) * percentUnits(percent, `${label} bucket ${index + 1}`),
  );
  const result = products.map((value) =>
    Number(value / ONE_HUNDRED_PERCENT_UNITS),
  );
  const remainder = totalXof - result.reduce((sum, value) => sum + value, 0);
  const priority = products
    .map((value, index) => ({
      index,
      fraction: value % ONE_HUNDRED_PERCENT_UNITS,
    }))
    .sort(
      (left, right) =>
        (left.fraction === right.fraction
          ? 0
          : left.fraction > right.fraction
            ? -1
            : 1) || left.index - right.index,
    );
  for (let index = 0; index < remainder; index += 1) {
    result[priority[index % priority.length]!.index]! += 1;
  }
  return result.map((value) => assertWholeXof(value, label));
}

export function forecastOperatingBudget(input: {
  label: string;
  openingBalanceXof: number;
  planned: BudgetCell[];
  actual: ActualCell[];
  case: CashflowSimulationCase;
  customAssumptions?: CashflowSimulationAssumptions;
  today: Date;
  /** Remaining installment obligations after account-wide credits, by due month. */
  scheduledBursarByMonth?: Readonly<Record<string, number>>;
  /** Positive invoices with no usable installment date remain visible as ending AR. */
  unscheduledBursarXof?: number;
  minimumReserveXof?: number;
  shock?: CashflowSimulationShock;
}) {
  const months = operatingBudgetMonths(input.label);
  const monthIndex = new Map(
    months.map((month, index) => [month.key, index] as const),
  );
  const currentMonth = monthKeyInDakar(input.today);
  const currentMonthIndex = monthIndex.get(currentMonth) ?? -1;
  const assumptions = resolveCashflowSimulationAssumptions(
    input.case,
    input.customAssumptions,
  );
  const minimumReserveXof = assertWholeXof(
    input.minimumReserveXof ?? 0,
    "Minimum reserve",
  );
  const unscheduledBursarXof = assertWholeXof(
    input.unscheduledBursarXof ?? 0,
    "Unscheduled receivables",
  );
  if (input.shock) {
    assertWholeXof(input.shock.amountXof, "One-time shock");
    if (!monthIndex.has(input.shock.month)) {
      throw new BadRequestException(
        `Shock month ${input.shock.month} is outside academic year ${input.label}`,
      );
    }
    if (input.shock.month < currentMonth) {
      throw new BadRequestException(
        "A simulation shock cannot change a recorded actual month",
      );
    }
  }

  const matrix = matrixFromCells(input.label, input.planned, input.actual);
  const otherIncomeRows = matrix.income.rows.filter(
    (row) =>
      row.key !== "bursar" && !("actualOnly" in row && row.actualOnly === true),
  );
  const expenseRows = matrix.expense.rows.filter(
    (row) => !("actualOnly" in row && row.actualOnly === true),
  );
  const projectedStudentCollectionsByMonth = Array<number>(12).fill(0);
  const timingPercentages = [
    assumptions.collectionTimingPercent.due,
    assumptions.collectionTimingPercent.plus30,
    assumptions.collectionTimingPercent.plus60,
    assumptions.collectionTimingPercent.plus90OrLater,
  ];
  let remainingScheduledReceivablesXof = 0;
  let projectedUncollectibleXof = 0;
  let projectedCollectionsOutsideYearXof = 0;

  const scheduledEntries = Object.entries(
    input.scheduledBursarByMonth ?? {},
  ).sort(([left], [right]) => left.localeCompare(right));
  for (const [dueMonth, rawOutstandingXof] of scheduledEntries) {
    const outstandingXof = assertWholeXof(
      rawOutstandingXof,
      `Scheduled receivables for ${dueMonth}`,
    );
    remainingScheduledReceivablesXof = addXof(
      remainingScheduledReceivablesXof,
      outstandingXof,
      "Remaining scheduled receivables",
    );
    const realizedXof = multiplyWholeXofByPercent(
      outstandingXof,
      assumptions.eventualRealizationPercent,
      "Realized receivables",
    );
    projectedUncollectibleXof = addXof(
      projectedUncollectibleXof,
      outstandingXof - realizedXof,
      "Projected uncollectible receivables",
    );
    const dueIndex = monthIndex.get(dueMonth);
    let anchorIndex = dueIndex;
    if (dueMonth < months[0]!.key) {
      // Custom plans may legitimately date a target-year installment before
      // August. Once the simulation horizon begins it is overdue debt, not a
      // future-year receivable that should disappear from in-year cash.
      anchorIndex = currentMonthIndex >= 0 ? currentMonthIndex : 0;
    } else if (
      dueIndex !== undefined &&
      currentMonthIndex >= 0 &&
      dueIndex < currentMonthIndex
    ) {
      // The missed due-month cash is still outstanding. Recover it from now
      // forward instead of pretending that it arrived in a recorded month.
      anchorIndex = currentMonthIndex;
    }
    if (anchorIndex === undefined || currentMonth > months.at(-1)!.key) {
      projectedCollectionsOutsideYearXof = addXof(
        projectedCollectionsOutsideYearXof,
        realizedXof,
        "Collections outside academic year",
      );
      continue;
    }
    const allocations = allocateWholeXof(
      realizedXof,
      timingPercentages,
      "Collection timing allocation",
    );
    for (const [offset, amountXof] of allocations.entries()) {
      const targetIndex = anchorIndex + offset;
      if (targetIndex >= months.length) {
        projectedCollectionsOutsideYearXof = addXof(
          projectedCollectionsOutsideYearXof,
          amountXof,
          "Collections outside academic year",
        );
        continue;
      }
      projectedStudentCollectionsByMonth[targetIndex] = addXof(
        projectedStudentCollectionsByMonth[targetIndex]!,
        amountXof,
        `${months[targetIndex]!.label} projected student collections`,
      );
    }
  }

  const unscheduledRealizedXof = multiplyWholeXofByPercent(
    unscheduledBursarXof,
    assumptions.eventualRealizationPercent,
    "Realized unscheduled receivables",
  );
  projectedUncollectibleXof = addXof(
    projectedUncollectibleXof,
    unscheduledBursarXof - unscheduledRealizedXof,
    "Projected uncollectible receivables",
  );

  let approvedPlanBalanceXof = input.openingBalanceXof;
  let projectedBalanceXof = input.openingBalanceXof;
  let projectedIncomeXof = 0;
  let projectedExpenseXof = 0;
  let actualIncomeXof = 0;
  let actualExpenseXof = 0;
  let projectedStudentCollectionsXof = 0;
  let projectedOtherIncomeXof = 0;
  let remainingApprovedExpensesXof = 0;
  let projectedRemainingExpensesXof = 0;

  const series = months.map((month, index) => {
    const state =
      month.key < currentMonth
        ? ("recorded_actual" as const)
        : month.key === currentMonth
          ? ("actual_plus_projection" as const)
          : ("future_projection" as const);
    const isRecorded = state === "recorded_actual";
    const approvedPlanIncomeXof = matrix.income.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[index]!.budgetXof,
          "Monthly approved-plan income",
        ),
      0,
    );
    const approvedPlanExpenseXof = matrix.expense.rows.reduce(
      (sum, row) =>
        addXof(
          sum,
          row.months[index]!.budgetXof,
          "Monthly approved-plan expense",
        ),
      0,
    );
    const monthActualIncomeXof = matrix.income.rows.reduce(
      (sum, row) =>
        addXof(sum, row.months[index]!.actualXof, "Monthly actual income"),
      0,
    );
    const monthActualExpenseXof = matrix.expense.rows.reduce(
      (sum, row) =>
        addXof(sum, row.months[index]!.actualXof, "Monthly actual expense"),
      0,
    );
    actualIncomeXof = addXof(
      actualIncomeXof,
      monthActualIncomeXof,
      "Actual income",
    );
    actualExpenseXof = addXof(
      actualExpenseXof,
      monthActualExpenseXof,
      "Actual expense",
    );
    const monthOtherIncomeXof = isRecorded
      ? 0
      : otherIncomeRows.reduce(
          (sum, row) =>
            addXof(
              sum,
              state === "actual_plus_projection"
                ? Math.max(
                    0,
                    row.months[index]!.budgetXof - row.months[index]!.actualXof,
                  )
                : row.months[index]!.budgetXof,
              "Remaining other income",
            ),
          0,
        );
    const monthStudentCollectionsXof = isRecorded
      ? 0
      : projectedStudentCollectionsByMonth[index]!;
    const monthRemainingApprovedExpensesXof = isRecorded
      ? 0
      : expenseRows.reduce(
          (sum, row) =>
            addXof(
              sum,
              state === "actual_plus_projection"
                ? Math.max(
                    0,
                    row.months[index]!.budgetXof - row.months[index]!.actualXof,
                  )
                : row.months[index]!.budgetXof,
              "Remaining approved expenses",
            ),
          0,
        );
    const monthRemainingExpenseXof = multiplyWholeXofByPercent(
      monthRemainingApprovedExpensesXof,
      100 + assumptions.remainingExpenseVariancePercent,
      "Projected remaining expense",
    );
    const shockIncomeXof =
      input.shock?.month === month.key && input.shock.kind === "income"
        ? input.shock.amountXof
        : 0;
    const shockExpenseXof =
      input.shock?.month === month.key && input.shock.kind === "expense"
        ? input.shock.amountXof
        : 0;
    const monthProjectedIncomeXof = isRecorded
      ? monthActualIncomeXof
      : addXof(
          addXof(
            addXof(
              monthActualIncomeXof,
              monthStudentCollectionsXof,
              "Monthly projected income",
            ),
            monthOtherIncomeXof,
            "Monthly projected income",
          ),
          shockIncomeXof,
          "Monthly projected income",
        );
    const monthProjectedExpenseXof = isRecorded
      ? monthActualExpenseXof
      : addXof(
          addXof(
            monthActualExpenseXof,
            monthRemainingExpenseXof,
            "Monthly projected expense",
          ),
          shockExpenseXof,
          "Monthly projected expense",
        );

    projectedStudentCollectionsXof = addXof(
      projectedStudentCollectionsXof,
      monthStudentCollectionsXof,
      "Projected student collections",
    );
    projectedOtherIncomeXof = addXof(
      projectedOtherIncomeXof,
      monthOtherIncomeXof,
      "Projected other income",
    );
    remainingApprovedExpensesXof = addXof(
      remainingApprovedExpensesXof,
      monthRemainingApprovedExpensesXof,
      "Remaining approved expenses",
    );
    projectedRemainingExpensesXof = addXof(
      projectedRemainingExpensesXof,
      monthRemainingExpenseXof,
      "Projected remaining expenses",
    );
    projectedIncomeXof = addXof(
      projectedIncomeXof,
      monthProjectedIncomeXof,
      "Projected annual income",
    );
    projectedExpenseXof = addXof(
      projectedExpenseXof,
      monthProjectedExpenseXof,
      "Projected annual expense",
    );
    approvedPlanBalanceXof = addXof(
      addXof(
        approvedPlanBalanceXof,
        approvedPlanIncomeXof,
        "Approved-plan cash balance",
      ),
      -approvedPlanExpenseXof,
      "Approved-plan cash balance",
    );
    projectedBalanceXof = addXof(
      addXof(
        projectedBalanceXof,
        monthProjectedIncomeXof,
        "Projected cash balance",
      ),
      -monthProjectedExpenseXof,
      "Projected cash balance",
    );
    return {
      month: month.key,
      state,
      approvedPlanIncomeXof,
      approvedPlanExpenseXof,
      approvedPlanBalanceXof,
      actualIncomeXof: monthActualIncomeXof,
      actualExpenseXof: monthActualExpenseXof,
      projectedStudentCollectionsXof: monthStudentCollectionsXof,
      projectedOtherIncomeXof: monthOtherIncomeXof,
      projectedIncomeXof: monthProjectedIncomeXof,
      projectedExpenseXof: monthProjectedExpenseXof,
      projectedBalanceXof,
    };
  });

  const remainingReceivablesXof = addXof(
    remainingScheduledReceivablesXof,
    unscheduledBursarXof,
    "Remaining receivables",
  );
  const endingReceivablesXof = assertWholeXof(
    remainingReceivablesXof - projectedStudentCollectionsXof,
    "Ending receivables",
  );
  const decisionHorizon = series.some(
    (month) => month.state !== "recorded_actual",
  )
    ? series.filter((month) => month.state !== "recorded_actual")
    : series;
  const lowest = decisionHorizon.reduce((current, month) =>
    month.projectedBalanceXof < current.projectedBalanceXof ? month : current,
  );
  const deficitMonths = decisionHorizon.filter(
    (month) => month.projectedBalanceXof < 0,
  );
  const reserveBreachMonths = decisionHorizon.filter(
    (month) => month.projectedBalanceXof < minimumReserveXof,
  );
  const approvedPlanYearEndCashXof = series.at(-1)!.approvedPlanBalanceXof;
  const shockImpactXof = input.shock
    ? input.shock.kind === "income"
      ? input.shock.amountXof
      : -input.shock.amountXof
    : 0;
  const warnings: {
    code: string;
    message: string;
    amountXof?: number;
  }[] = [
    {
      code: "assumption_based_simulation",
      message:
        "This is an assumption-based simulation, not a statistically calibrated prediction.",
    },
  ];
  if (unscheduledBursarXof > 0) {
    warnings.push({
      code: "unscheduled_receivables",
      message:
        "Receivables without an approved due date remain in ending receivables and are not projected as cash.",
      amountXof: unscheduledBursarXof,
    });
  }
  if (projectedCollectionsOutsideYearXof > 0) {
    warnings.push({
      code: "collections_outside_year",
      message:
        "Realizable collections whose due date or assumed timing cannot be placed inside August–July remain in ending receivables.",
      amountXof: projectedCollectionsOutsideYearXof,
    });
  }
  if (projectedOtherIncomeXof > 0) {
    warnings.push({
      code: "planned_other_income_assumed",
      message:
        "Remaining non-student income follows the approved budget dates without a probability adjustment.",
      amountXof: projectedOtherIncomeXof,
    });
  }

  return {
    case: input.case,
    assumptions: {
      source:
        input.case === "custom" ? ("custom" as const) : ("preset" as const),
      ...assumptions,
      minimumReserveXof,
      shock: input.shock ?? null,
    },
    summary: {
      projectedYearEndCashXof: projectedBalanceXof,
      lowestBalanceXof: lowest.projectedBalanceXof,
      lowestBalanceMonth: lowest.month,
      deficitMonthCount: deficitMonths.length,
      firstDeficitMonth: deficitMonths[0]?.month ?? null,
      reserveBreachMonthCount: reserveBreachMonths.length,
      firstReserveBreachMonth: reserveBreachMonths[0]?.month ?? null,
      peakFundingGapXof: Math.max(
        0,
        assertSignedSafeXof(
          minimumReserveXof - lowest.projectedBalanceXof,
          "Peak funding gap",
        ),
      ),
      endingReceivablesXof,
      projectedUncollectibleXof,
      projectedIncomeXof,
      projectedExpenseXof,
      approvedPlanYearEndCashXof,
      varianceToApprovedPlanXof: assertSignedSafeXof(
        projectedBalanceXof - approvedPlanYearEndCashXof,
        "Variance to approved plan",
      ),
    },
    driverBridge: {
      openingBalanceXof: input.openingBalanceXof,
      actualIncomeXof,
      actualExpenseXof,
      remainingScheduledReceivablesXof,
      unscheduledReceivablesXof: unscheduledBursarXof,
      projectedStudentCollectionsXof,
      projectedUncollectibleXof,
      projectedOtherIncomeXof,
      remainingApprovedExpensesXof,
      expenseVarianceImpactXof: assertSignedSafeXof(
        remainingApprovedExpensesXof - projectedRemainingExpensesXof,
        "Expense variance impact",
      ),
      shockImpactXof,
      endingReceivablesXof,
    },
    months: series,
    warnings,
  };
}

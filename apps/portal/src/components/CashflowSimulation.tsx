"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  CircleGauge,
  CircleHelp,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type OperatingBudgetCollectionTiming,
  type OperatingBudgetForecast,
  type OperatingBudgetForecastCase,
  type OperatingBudgetForecastShock,
  type OperatingBudgetView,
  forecastOperatingBudget,
} from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";
import {
  MAX_SAFE_MILLIONS_INPUT,
  parseMillionsToWholeXof,
} from "@/lib/xof-input";
import { BudgetCashflowChart } from "./BudgetCashflowChart";
import styles from "./CashflowSimulation.module.css";

type EditableAssumptions = {
  eventualRealizationPercent: number;
  collectionTimingPercent: OperatingBudgetCollectionTiming;
  remainingExpenseVariancePercent: number;
};

const CASE_ORDER: OperatingBudgetForecastCase[] = [
  "approved_plan",
  "stress",
  "upside",
  "custom",
];

const CASE_LABEL: Record<OperatingBudgetForecastCase, string> = {
  approved_plan: "Approved-plan case",
  stress: "Stress case",
  upside: "Upside case",
  custom: "Custom case",
};

const CASE_SHORT_LABEL: Record<OperatingBudgetForecastCase, string> = {
  approved_plan: "Approved plan",
  stress: "Stress",
  upside: "Upside",
  custom: "Custom",
};

const PRESET_ASSUMPTIONS: Record<
  Exclude<OperatingBudgetForecastCase, "custom">,
  EditableAssumptions
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

const DEFAULT_CUSTOM: EditableAssumptions = {
  eventualRealizationPercent: 92,
  collectionTimingPercent: {
    due: 60,
    plus30: 20,
    plus60: 12,
    plus90OrLater: 8,
  },
  remainingExpenseVariancePercent: 3,
};

function timingTotal(timing: OperatingBudgetCollectionTiming): number {
  return timing.due + timing.plus30 + timing.plus60 + timing.plus90OrLater;
}

function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function signedXof(value: number): string {
  if (value === 0) return formatXof(0);
  return `${value > 0 ? "+" : "−"}${formatXof(Math.abs(value))}`;
}

function signedCompactXof(value: number): string {
  if (value === 0) return formatXofCompact(0);
  return `${value > 0 ? "+" : "−"}${formatXofCompact(Math.abs(value))}`;
}

function formatAsOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dakar",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function currentDateInDakar(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dakar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function currentMonthInDakar(): string {
  return currentDateInDakar().slice(0, 7);
}

function monthLabel(view: OperatingBudgetView, month: string | null): string {
  if (!month) return "—";
  return (
    view.months.find((candidate) => candidate.key === month)?.label ?? month
  );
}

function timingSentence(timing: OperatingBudgetCollectionTiming): string {
  return `${timing.due}% due · ${timing.plus30}% +30 · ${timing.plus60}% +60 · ${timing.plus90OrLater}% +90`;
}

function simulationInputError(input: {
  simulationCase: OperatingBudgetForecastCase;
  custom: EditableAssumptions;
  reserveMillions: string;
  shockEnabled: boolean;
  shockAmountMillions: string;
}): string | null {
  if (
    input.simulationCase === "custom" &&
    timingTotal(input.custom.collectionTimingPercent) !== 100
  ) {
    return "Collection timing must total exactly 100%.";
  }
  if (
    input.reserveMillions !== "" &&
    parseMillionsToWholeXof(input.reserveMillions, { allowNegative: false }) ===
      null
  ) {
    return "Minimum reserve must be a non-negative amount with at most six decimal places.";
  }
  if (
    input.shockEnabled &&
    (parseMillionsToWholeXof(input.shockAmountMillions, {
      allowNegative: false,
    }) ?? 0) <= 0
  ) {
    return "Enter a positive one-time shock amount.";
  }
  return null;
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = "neutral",
  title,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "warning" | "danger" | "neutral";
  title?: string;
  icon: React.ReactNode;
}) {
  return (
    <article className={styles.outcome} data-tone={tone}>
      <span className={styles.outcomeLabel}>
        {icon}
        {label}
      </span>
      <strong title={title}>{value}</strong>
      <span className={styles.outcomeDetail}>{detail}</span>
    </article>
  );
}

export function CashflowSimulation({ data }: { data: OperatingBudgetView }) {
  const requestVersion = useRef(0);
  const completedAcademicYear =
    data.academicYear.endDate < currentDateInDakar();
  const [simulationCase, setSimulationCase] =
    useState<OperatingBudgetForecastCase>("approved_plan");
  const [custom, setCustom] = useState<EditableAssumptions>(DEFAULT_CUSTOM);
  const [reserveMillions, setReserveMillions] = useState("0");
  const [shockEnabled, setShockEnabled] = useState(false);
  const [shockKind, setShockKind] =
    useState<OperatingBudgetForecastShock["kind"]>("expense");
  const [shockAmountMillions, setShockAmountMillions] = useState("");
  const [shockMonth, setShockMonth] = useState(
    data.months.find((month) => month.key >= currentMonthInDakar())?.key ?? "",
  );
  const [shockLabel, setShockLabel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [simulation, setSimulation] = useState<OperatingBudgetForecast | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const shockMonths = useMemo(
    () => data.months.filter((month) => month.key >= currentMonthInDakar()),
    [data.months],
  );

  useEffect(() => {
    if (!shockMonths.some((month) => month.key === shockMonth)) {
      setShockMonth(shockMonths[0]?.key ?? "");
      if (shockMonths.length === 0) setShockEnabled(false);
    }
  }, [shockMonth, shockMonths]);

  const inputError = simulationInputError({
    simulationCase,
    custom,
    reserveMillions,
    shockEnabled,
    shockAmountMillions,
  });
  const reserveXof =
    parseMillionsToWholeXof(reserveMillions || "0", {
      allowNegative: false,
    }) ?? 0;
  const shockAmountXof =
    parseMillionsToWholeXof(shockAmountMillions, { allowNegative: false }) ?? 0;

  useEffect(() => {
    if (completedAcademicYear || !data.revision) {
      requestVersion.current += 1;
      setSimulation(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (inputError) {
      requestVersion.current += 1;
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError(null);
      try {
        const result = await forecastOperatingBudget({
          academicYear: data.academicYear.label,
          case: simulationCase,
          customAssumptions: simulationCase === "custom" ? custom : undefined,
          minimumReserveXof: reserveXof,
          shock:
            shockEnabled && shockAmountXof > 0 && shockMonth
              ? {
                  kind: shockKind,
                  amountXof: shockAmountXof,
                  month: shockMonth,
                  label: shockLabel.trim() || undefined,
                }
              : undefined,
        });
        if (version === requestVersion.current) {
          if (!result.summary || !result.driverBridge || !result.months) {
            throw new Error(
              "The simulation service is finishing its update. Refresh shortly.",
            );
          }
          setSimulation(result);
        }
      } catch (cause) {
        if (version === requestVersion.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Cashflow simulation is unavailable.",
          );
        }
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }, 320);
    return () => {
      requestVersion.current += 1;
      window.clearTimeout(timer);
    };
  }, [
    custom,
    completedAcademicYear,
    data.academicYear.label,
    data.revision,
    inputError,
    reserveXof,
    retryToken,
    shockAmountXof,
    shockEnabled,
    shockKind,
    shockLabel,
    shockMonth,
    simulationCase,
  ]);

  const comparisonAssumptions = useMemo(
    () =>
      new Map(
        (simulation?.comparison ?? []).map((item) => [
          item.case,
          item.assumptions,
        ]),
      ),
    [simulation?.comparison],
  );
  const assumptionsForCase = (
    value: OperatingBudgetForecastCase,
  ): EditableAssumptions =>
    value === "custom"
      ? custom
      : (comparisonAssumptions.get(value) ?? PRESET_ASSUMPTIONS[value]);
  const selectedAssumptions = assumptionsForCase(simulationCase);
  const controlAssumptions =
    simulationCase === "custom" ? custom : selectedAssumptions;
  const selectedSummary = simulation?.summary;
  const riskThreshold = reserveXof;
  const riskMonths = selectedSummary?.reserveBreachMonthCount ?? 0;
  const bridgeItems = useMemo(() => {
    if (!simulation) return [];
    const bridge = simulation.driverBridge;
    return [
      {
        label: "Opening cash",
        value: bridge.openingBalanceXof,
        tone: "base" as const,
      },
      {
        label: "Recorded income",
        value: bridge.actualIncomeXof,
        tone: "positive" as const,
      },
      {
        label: "Recorded expenses",
        value: -bridge.actualExpenseXof,
        tone: "negative" as const,
      },
      {
        label: "Student collections",
        value: bridge.projectedStudentCollectionsXof,
        tone: "positive" as const,
      },
      {
        label: "Other planned income",
        value: bridge.projectedOtherIncomeXof,
        tone: "positive" as const,
      },
      {
        label: "Remaining planned expenses",
        value: -bridge.remainingApprovedExpensesXof,
        tone: "negative" as const,
      },
      ...(bridge.expenseVarianceImpactXof !== 0
        ? [
            {
              label: "Expense assumption",
              value: bridge.expenseVarianceImpactXof,
              tone:
                bridge.expenseVarianceImpactXof >= 0
                  ? ("positive" as const)
                  : ("negative" as const),
            },
          ]
        : []),
      ...(bridge.shockImpactXof !== 0
        ? [
            {
              label: simulation.assumptions.shock?.label || "One-time shock",
              value: bridge.shockImpactXof,
              tone:
                bridge.shockImpactXof >= 0
                  ? ("positive" as const)
                  : ("negative" as const),
            },
          ]
        : []),
    ];
  }, [simulation]);
  const bridgeMax = Math.max(
    1,
    ...bridgeItems.map((item) => Math.abs(item.value)),
  );

  function resetSimulation() {
    setSimulationCase("approved_plan");
    setCustom(DEFAULT_CUSTOM);
    setReserveMillions("0");
    setShockEnabled(false);
    setShockKind("expense");
    setShockAmountMillions("");
    setShockMonth(shockMonths[0]?.key ?? "");
    setShockLabel("");
    setAdvancedOpen(false);
  }

  function updateTiming(
    key: keyof OperatingBudgetCollectionTiming,
    value: number,
  ) {
    setCustom((current) => ({
      ...current,
      collectionTimingPercent: {
        ...current.collectionTimingPercent,
        [key]: Math.max(0, Math.min(100, value)),
      },
    }));
  }

  if (completedAcademicYear) {
    return (
      <section className={styles.simulation} aria-labelledby="simulation-title">
        <header className={styles.header}>
          <div className={styles.headingLockup}>
            <span className={styles.headingIcon} aria-hidden="true">
              <CircleGauge size={20} />
            </span>
            <div>
              <div className={styles.titleLine}>
                <h2 id="simulation-title">Cashflow simulation</h2>
                <span className={styles.exploratoryBadge}>
                  Current &amp; future years
                </span>
              </div>
              <p>
                Simulations use today&apos;s live receivables and are available
                only for current or future academic years.
              </p>
            </div>
          </div>
        </header>
        <div className={styles.completedState} role="status">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>{data.academicYear.label} is complete</strong>
            <p>
              A completed year&apos;s historical receivables cannot be safely
              reconstructed from today&apos;s account balances. Budget, Actual
              and Deviation below remain available for historical review.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.simulation} aria-labelledby="simulation-title">
      <header className={styles.header}>
        <div className={styles.headingLockup}>
          <span className={styles.headingIcon} aria-hidden="true">
            <CircleGauge size={20} />
          </span>
          <div>
            <div className={styles.titleLine}>
              <h2 id="simulation-title">Cashflow simulation</h2>
              <span className={styles.exploratoryBadge}>Simulation only</span>
            </div>
            <p>
              Test collection timing, spending pressure and liquidity shocks.
              Results are private, temporary and never change the approved
              budget or financial ledger.
            </p>
          </div>
        </div>
        <button
          type="button"
          className={styles.resetButton}
          onClick={resetSimulation}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset assumptions
        </button>
      </header>

      <div className={styles.basisBar}>
        <span>
          <ShieldCheck size={14} aria-hidden="true" />
          {simulation
            ? `Based on approved revision ${simulation.metadata.basisRevision}`
            : `Based on ${data.revision ? `revision ${data.revision.revision}` : "the approved operating plan"}`}
        </span>
        <span>
          Actuals{" "}
          {simulation
            ? `through ${formatAsOf(simulation.metadata.asOfDate)}`
            : "remain ledger-derived"}
        </span>
        <span>Currency · XOF</span>
      </div>

      <fieldset className={styles.casePicker}>
        <legend>Choose a case</legend>
        <div className={styles.caseGrid}>
          {CASE_ORDER.map((value) => {
            const assumptions = assumptionsForCase(value);
            const active = value === simulationCase;
            return (
              <button
                key={value}
                type="button"
                className={styles.caseCard}
                data-case={value}
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => {
                  setSimulationCase(value);
                  if (value === "custom") setAdvancedOpen(true);
                }}
              >
                <span className={styles.caseTopline}>
                  <strong>{CASE_LABEL[value]}</strong>
                  <span className={styles.caseRadio} aria-hidden="true" />
                </span>
                <span className={styles.caseFact}>
                  {assumptions.eventualRealizationPercent}% eventual student
                  collections
                </span>
                <span className={styles.caseFact}>
                  Expenses{" "}
                  {signedPercent(assumptions.remainingExpenseVariancePercent)}
                </span>
                <span className={styles.caseTiming}>
                  {timingSentence(assumptions.collectionTimingPercent)}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.assumptionStrip} aria-label="Active assumptions">
        <span>
          <strong>{selectedAssumptions.eventualRealizationPercent}%</strong>
          eventual realization
        </span>
        <span>
          <strong>{selectedAssumptions.collectionTimingPercent.due}%</strong>
          collected when due
        </span>
        <span>
          <strong>
            {signedPercent(selectedAssumptions.remainingExpenseVariancePercent)}
          </strong>
          remaining expense variance
        </span>
        <span>
          <strong>{formatXofCompact(riskThreshold)}</strong>
          minimum reserve
        </span>
        <button
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
          aria-expanded={advancedOpen}
          aria-controls="simulation-assumptions"
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          {simulationCase === "custom"
            ? "Edit assumptions"
            : "Advanced assumptions"}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>

      <div
        id="simulation-assumptions"
        className={styles.advancedDisclosure}
        data-open={advancedOpen ? "true" : "false"}
        aria-hidden={!advancedOpen}
        inert={!advancedOpen}
      >
        <div className={styles.advancedInner}>
          <div className={styles.advancedHead}>
            <div>
              <h3>Assumptions</h3>
              <p>
                Reserve and one-time shocks can be tested in every case. Choose
                Custom to edit collection behavior and expense variance.
              </p>
            </div>
            {simulationCase !== "custom" && (
              <button
                type="button"
                className={styles.customizeButton}
                onClick={() => setSimulationCase("custom")}
              >
                Use custom assumptions <ArrowRight size={14} />
              </button>
            )}
          </div>

          <div className={styles.assumptionGrid}>
            <label className={styles.controlCard}>
              <span className={styles.controlLabel}>
                Eventual student collection
                <output>
                  {controlAssumptions.eventualRealizationPercent}%
                </output>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={controlAssumptions.eventualRealizationPercent}
                disabled={simulationCase !== "custom"}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    eventualRealizationPercent: Number(event.target.value),
                  }))
                }
              />
              <small>
                Share of remaining scheduled student receivables expected to
                become cash. Uncollected value remains receivable.
              </small>
            </label>

            <label className={styles.controlCard}>
              <span className={styles.controlLabel}>
                Remaining expense variance
                <output>
                  {signedPercent(
                    controlAssumptions.remainingExpenseVariancePercent,
                  )}
                </output>
              </span>
              <input
                type="range"
                min="-50"
                max="100"
                step="1"
                value={controlAssumptions.remainingExpenseVariancePercent}
                disabled={simulationCase !== "custom"}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    remainingExpenseVariancePercent: Number(event.target.value),
                  }))
                }
              />
              <small>
                One-time percentage adjustment to the remaining approved expense
                plan; it does not compound month over month.
              </small>
            </label>

            <label className={styles.controlCard}>
              <span className={styles.controlLabel}>
                Minimum operating reserve
                <output>{formatXofCompact(reserveXof)}</output>
              </span>
              <span className={styles.moneyInput}>
                <input
                  type="number"
                  min="0"
                  max={MAX_SAFE_MILLIONS_INPUT}
                  step="0.000001"
                  value={reserveMillions}
                  onChange={(event) => setReserveMillions(event.target.value)}
                  aria-describedby="reserve-help"
                />
                <span>M FCFA</span>
              </span>
              <small id="reserve-help">
                A decision threshold only. The simulation flags months below it
                but never reserves or moves money.
              </small>
            </label>
          </div>

          <fieldset className={styles.timingEditor}>
            <legend>
              Collection timing curve
              <span
                className={
                  timingTotal(controlAssumptions.collectionTimingPercent) ===
                  100
                    ? styles.totalValid
                    : styles.totalInvalid
                }
              >
                {timingTotal(controlAssumptions.collectionTimingPercent)}%
                allocated
              </span>
            </legend>
            <p>
              Distribute eventually collected student receivables by delay from
              each approved installment date. Delays are placed into monthly
              buckets, not predicted as exact receipt dates.
            </p>
            <div className={styles.timingGrid}>
              {(
                [
                  ["due", "When due"],
                  ["plus30", "+30 days"],
                  ["plus60", "+60 days"],
                  ["plus90OrLater", "+90 days or later"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <span className={styles.percentInput}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={controlAssumptions.collectionTimingPercent[key]}
                      disabled={simulationCase !== "custom"}
                      onChange={(event) =>
                        updateTiming(key, Number(event.target.value))
                      }
                    />
                    <span>%</span>
                  </span>
                </label>
              ))}
            </div>
            <div className={styles.timingTrack} aria-hidden="true">
              {(
                [
                  ["due", "var(--success-500)"],
                  ["plus30", "var(--daust-navy-700)"],
                  ["plus60", "var(--daust-orange)"],
                  ["plus90OrLater", "var(--error-500)"],
                ] as const
              ).map(([key, color]) => (
                <span
                  key={key}
                  style={{
                    width: `${controlAssumptions.collectionTimingPercent[key]}%`,
                    background: color,
                  }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.shockEditor}>
            <legend>
              <label className={styles.switchLabel}>
                <input
                  type="checkbox"
                  checked={shockEnabled}
                  disabled={shockMonths.length === 0}
                  onChange={(event) => setShockEnabled(event.target.checked)}
                />
                <span>Test one-time cash shock</span>
              </label>
            </legend>
            <p>
              {shockMonths.length === 0
                ? "This academic year has no current or future month available for a hypothetical shock."
                : "Add one hypothetical receipt or payment in the current or a future month. It remains outside the budget and ledger."}
            </p>
            {shockEnabled && (
              <div className={styles.shockGrid}>
                <label>
                  Type
                  <select
                    value={shockKind}
                    onChange={(event) =>
                      setShockKind(
                        event.target
                          .value as OperatingBudgetForecastShock["kind"],
                      )
                    }
                  >
                    <option value="expense">Unexpected expense</option>
                    <option value="income">Unexpected income</option>
                  </select>
                </label>
                <label>
                  Month
                  <select
                    value={shockMonth}
                    onChange={(event) => setShockMonth(event.target.value)}
                  >
                    {shockMonths.map((month) => (
                      <option key={month.key} value={month.key}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <span className={styles.moneyInput}>
                    <input
                      type="number"
                      min="0.000001"
                      max={MAX_SAFE_MILLIONS_INPUT}
                      step="0.000001"
                      value={shockAmountMillions}
                      onChange={(event) =>
                        setShockAmountMillions(event.target.value)
                      }
                    />
                    <span>M FCFA</span>
                  </span>
                </label>
                <label>
                  Label <span className={styles.optional}>Optional</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={shockLabel}
                    placeholder="e.g. Generator replacement"
                    onChange={(event) => setShockLabel(event.target.value)}
                  />
                </label>
              </div>
            )}
          </fieldset>
        </div>
      </div>

      {inputError && (
        <div className={styles.inputError} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          {inputError} The last complete simulation remains visible.
        </div>
      )}

      {error && (
        <div className={styles.serviceError} role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Simulation could not update</strong>
            <p>{error} No approved budget or ledger value was changed.</p>
          </div>
          <button
            type="button"
            onClick={() => setRetryToken((value) => value + 1)}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {simulation && selectedSummary && (
        <div className={styles.results} aria-busy={loading}>
          <div className={styles.resultHead}>
            <div>
              <span className={styles.sectionEyebrow}>Decision outlook</span>
              <h3>{CASE_LABEL[simulation.case]}</h3>
            </div>
            {loading && (
              <span className={styles.updating} role="status">
                <RefreshCw size={13} aria-hidden="true" /> Updating…
              </span>
            )}
          </div>

          <section className={styles.outcomes} aria-label="Simulation outcomes">
            <SummaryMetric
              label="Year-end cash"
              value={formatXofCompact(selectedSummary.projectedYearEndCashXof)}
              title={formatXof(selectedSummary.projectedYearEndCashXof)}
              detail={`Approved-plan case ${formatXofCompact(selectedSummary.approvedPlanYearEndCashXof)}`}
              tone={
                selectedSummary.projectedYearEndCashXof >= riskThreshold
                  ? "positive"
                  : "danger"
              }
              icon={<WalletCards size={14} />}
            />
            <SummaryMetric
              label="Lowest cash point"
              value={formatXofCompact(selectedSummary.lowestBalanceXof)}
              title={formatXof(selectedSummary.lowestBalanceXof)}
              detail={monthLabel(data, selectedSummary.lowestBalanceMonth)}
              tone={
                selectedSummary.lowestBalanceXof < 0
                  ? "danger"
                  : selectedSummary.lowestBalanceXof < riskThreshold
                    ? "warning"
                    : "neutral"
              }
              icon={<TrendingDown size={14} />}
            />
            <SummaryMetric
              label={
                riskThreshold > 0 ? "Reserve exposure" : "Cash deficit risk"
              }
              value={
                riskMonths === 0
                  ? "No breach"
                  : `${riskMonths} month${riskMonths === 1 ? "" : "s"}`
              }
              detail={
                riskMonths === 0
                  ? `Stays above ${formatXofCompact(riskThreshold)}`
                  : `${formatXofCompact(selectedSummary.peakFundingGapXof)} peak funding gap`
              }
              tone={riskMonths === 0 ? "positive" : "danger"}
              icon={<AlertTriangle size={14} />}
            />
            <SummaryMetric
              label="Compared with approved"
              value={signedCompactXof(
                selectedSummary.varianceToApprovedPlanXof,
              )}
              title={signedXof(selectedSummary.varianceToApprovedPlanXof)}
              detail={
                selectedSummary.varianceToApprovedPlanXof === 0
                  ? "Same year-end cash"
                  : selectedSummary.varianceToApprovedPlanXof > 0
                    ? "More year-end cash"
                    : "Less year-end cash"
              }
              tone={
                selectedSummary.varianceToApprovedPlanXof > 0
                  ? "positive"
                  : selectedSummary.varianceToApprovedPlanXof < 0
                    ? "danger"
                    : "neutral"
              }
              icon={
                selectedSummary.varianceToApprovedPlanXof >= 0 ? (
                  <TrendingUp size={14} />
                ) : (
                  <TrendingDown size={14} />
                )
              }
            />
          </section>

          {riskMonths > 0 && (
            <div className={styles.decisionCallout}>
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>
                  {riskThreshold > 0 ? "Reserve threshold" : "Cash balance"} is
                  first breached in{" "}
                  {monthLabel(data, selectedSummary.firstReserveBreachMonth)}.
                </strong>
                <p>
                  The largest modeled funding need is{" "}
                  {formatXof(selectedSummary.peakFundingGapXof)}. Compare cases
                  below or adjust realization, timing and expenses.
                </p>
              </div>
            </div>
          )}

          <BudgetCashflowChart
            months={data.months}
            forecast={simulation}
            forecastLoading={loading}
          />

          <div className={styles.analysisGrid}>
            <section className={styles.bridge} aria-labelledby="driver-title">
              <div className={styles.analysisHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Cash bridge</span>
                  <h3 id="driver-title">What drives the result</h3>
                </div>
                <strong
                  title={formatXof(selectedSummary.projectedYearEndCashXof)}
                >
                  {formatXofCompact(selectedSummary.projectedYearEndCashXof)}
                </strong>
              </div>
              <div className={styles.bridgeRows}>
                {bridgeItems.map((item) => (
                  <div className={styles.bridgeRow} key={item.label}>
                    <span>{item.label}</span>
                    <div className={styles.bridgeTrack} aria-hidden="true">
                      <span
                        data-tone={item.tone}
                        style={{
                          width: `${
                            item.value === 0
                              ? 0
                              : Math.max(
                                  2,
                                  (Math.abs(item.value) / bridgeMax) * 100,
                                )
                          }%`,
                        }}
                      />
                    </div>
                    <strong title={signedXof(item.value)}>
                      {signedCompactXof(item.value)}
                    </strong>
                  </div>
                ))}
              </div>
              <div className={styles.receivableNote}>
                <CircleHelp size={16} aria-hidden="true" />
                <p>
                  <strong>
                    {formatXofCompact(
                      simulation.driverBridge.endingReceivablesXof,
                    )}
                  </strong>{" "}
                  remains receivable at year end, including{" "}
                  {formatXofCompact(
                    simulation.driverBridge.unscheduledReceivablesXof,
                  )}{" "}
                  without an approved installment schedule. The selected
                  realization assumption includes an estimated uncollectible
                  allowance of{" "}
                  {formatXofCompact(
                    simulation.driverBridge.projectedUncollectibleXof,
                  )}
                  ; that allowance is already part of ending receivables.
                </p>
              </div>
            </section>

            <section
              className={styles.comparison}
              aria-labelledby="compare-title"
            >
              <div className={styles.analysisHead}>
                <div>
                  <span className={styles.sectionEyebrow}>Case comparison</span>
                  <h3 id="compare-title">Compare before deciding</h3>
                </div>
                <BarChart3 size={18} aria-hidden="true" />
              </div>
              <div className={styles.comparisonScroller}>
                <table>
                  <caption className={styles.srOnly}>
                    Exact cashflow simulation case comparison in XOF
                  </caption>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Realization</th>
                      <th>Expenses</th>
                      <th>Lowest cash</th>
                      <th>Year-end cash</th>
                      <th>Reserve breaches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.comparison.map((item) => (
                      <tr
                        key={item.case}
                        data-selected={
                          item.case === simulation.case ? "true" : "false"
                        }
                      >
                        <th scope="row">{CASE_SHORT_LABEL[item.case]}</th>
                        <td>{item.assumptions.eventualRealizationPercent}%</td>
                        <td>
                          {signedPercent(
                            item.assumptions.remainingExpenseVariancePercent,
                          )}
                        </td>
                        <td title={formatXof(item.summary.lowestBalanceXof)}>
                          {formatXofCompact(item.summary.lowestBalanceXof)}
                        </td>
                        <td
                          title={formatXof(
                            item.summary.projectedYearEndCashXof,
                          )}
                        >
                          {formatXofCompact(
                            item.summary.projectedYearEndCashXof,
                          )}
                        </td>
                        <td>{item.summary.reserveBreachMonthCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {simulation.warnings.length > 0 && (
            <section
              className={styles.warnings}
              aria-labelledby="warning-title"
            >
              <h3 id="warning-title">Read these assumptions with the result</h3>
              <ul>
                {simulation.warnings.map((warning) => (
                  <li key={`${warning.code}-${warning.message}`}>
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span>
                      {warning.message}
                      {warning.amountXof !== undefined
                        ? ` (${formatXof(warning.amountXof)})`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className={styles.exploratoryFooter}>
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              <strong>Exploratory result.</strong> Generated from approved
              revision {simulation.metadata.basisRevision} and ledger data as of{" "}
              {formatAsOf(simulation.metadata.asOfDate)}. Assumptions reset when
              you leave; no revision, approval request or journal entry is
              created.
            </p>
          </footer>
        </div>
      )}

      {!data.revision && (
        <div className={styles.initialLoading} role="status">
          <ShieldCheck size={18} aria-hidden="true" />
          Approve an operating budget revision before running a cashflow
          simulation.
        </div>
      )}

      {data.revision && !simulation && !error && !inputError && (
        <div className={styles.initialLoading} role="status">
          <RefreshCw size={18} aria-hidden="true" />
          Building a read-only simulation from the approved plan…
        </div>
      )}
    </section>
  );
}

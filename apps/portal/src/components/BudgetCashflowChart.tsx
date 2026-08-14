"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type {
  OperatingBudgetForecast,
  OperatingBudgetForecastMonth,
  OperatingBudgetMonth,
} from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";
import styles from "./BudgetCashflowChart.module.css";

const WIDTH = 1080;
const HEIGHT = 408;
const PLOT = { left: 76, right: 88, top: 54, bottom: 66 };

type ChartPoint = OperatingBudgetForecastMonth & { label: string };
type VisibleSeries = {
  income: boolean;
  expense: boolean;
  selectedCash: boolean;
  approvedCash: boolean;
};

function compactTick(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000)
    return `${sign}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${value}`;
}

function stateLabel(state: OperatingBudgetForecastMonth["state"]): string {
  if (state === "recorded_actual") return "Recorded actual";
  if (state === "actual_plus_projection")
    return "Actual through today + projected remainder";
  return "Future projection";
}

function pathForIndexes(
  points: ChartPoint[],
  indexes: number[],
  value: (point: ChartPoint) => number,
  x: (index: number) => number,
  y: (amount: number) => number,
): string {
  return indexes
    .map(
      (index, pathIndex) =>
        `${pathIndex === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value(points[index]!)).toFixed(1)}`,
    )
    .join(" ");
}

function signedCompact(value: number): string {
  if (value === 0) return formatXofCompact(0);
  return `${value > 0 ? "+" : "−"}${formatXofCompact(Math.abs(value))}`;
}

export function BudgetCashflowChart({
  months,
  forecast,
  forecastLoading = false,
}: {
  months: OperatingBudgetMonth[];
  forecast: OperatingBudgetForecast;
  forecastLoading?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const interactionId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [visible, setVisible] = useState<VisibleSeries>({
    income: true,
    expense: true,
    selectedCash: true,
    approvedCash: true,
  });

  const points = useMemo<ChartPoint[]>(() => {
    const labels = new Map(months.map((month) => [month.key, month.label]));
    return forecast.months.map((point) => ({
      ...point,
      label: labels.get(point.month) ?? point.month,
    }));
  }, [forecast.months, months]);

  if (points.length === 0) {
    return (
      <section className={styles.chartCard}>
        <h3>Monthly cash outlook</h3>
        <p>Monthly results will appear when the simulation has plan data.</p>
      </section>
    );
  }

  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const step = plotWidth / points.length;
  const x = (index: number) => PLOT.left + step * index + step / 2;
  const flowValues = points.flatMap((point) => [
    point.projectedIncomeXof,
    point.projectedExpenseXof,
  ]);
  const flowMin = Math.min(0, ...flowValues);
  const flowMax = Math.max(1, ...flowValues);
  const flowSpan = Math.max(1, flowMax - flowMin);
  const flowY = (value: number) =>
    PLOT.top + ((flowMax - value) / flowSpan) * plotHeight;
  const flowZeroY = flowY(0);
  const reserveXof = forecast.assumptions.minimumReserveXof;
  const balanceValues = points.flatMap((point) => [
    point.projectedBalanceXof,
    point.approvedPlanBalanceXof,
  ]);
  balanceValues.push(0, reserveXof);
  const balanceMin = Math.min(0, ...balanceValues);
  const balanceMax = Math.max(1, ...balanceValues);
  const balanceSpan = Math.max(1, balanceMax - balanceMin);
  const balanceY = (value: number) =>
    PLOT.top + ((balanceMax - value) / balanceSpan) * plotHeight;
  const barWidth = Math.min(20, step * 0.27);
  const flowTicks = [
    ...new Set(
      [0, 0.25, 0.5, 0.75, 1]
        .map((ratio) => Math.round(flowMin + flowSpan * ratio))
        .concat(0),
    ),
  ]
    .sort((left, right) => left - right)
    .map((value) => ({ value, y: flowY(value) }));
  const balanceTicks = [0, 0.5, 1].map((ratio) => {
    const value = balanceMin + balanceSpan * ratio;
    return { value, y: balanceY(value) };
  });
  const currentIndex = points.findIndex(
    (point) => point.state === "actual_plus_projection",
  );
  const firstFutureIndex = points.findIndex(
    (point) => point.state === "future_projection",
  );
  const firstProjectedIndex = points.findIndex(
    (point) => point.state !== "recorded_actual",
  );
  const recordedIndexes = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.state === "recorded_actual")
    .map(({ index }) => index);
  const projectedIndexes =
    firstProjectedIndex < 0
      ? []
      : points
          .map((_, index) => index)
          .filter((index) => index >= Math.max(0, firstProjectedIndex - 1));
  const allIndexes = points.map((_, index) => index);
  const defaultIndex =
    currentIndex >= 0
      ? currentIndex
      : Math.max(0, recordedIndexes.at(-1) ?? firstFutureIndex ?? 0);
  const selectedIndex = activeIndex ?? pinnedIndex;
  const detailIndex = selectedIndex ?? defaultIndex;
  const selected = points[detailIndex]!;

  function moveSelection(nextIndex: number) {
    setActiveIndex(Math.min(points.length - 1, Math.max(0, nextIndex)));
  }

  function indexFromPointer(
    clientX: number,
    bounds: Pick<DOMRect, "left" | "width">,
  ): number {
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - bounds.left) / bounds.width),
    );
    return Math.min(
      points.length - 1,
      Math.max(0, Math.floor(ratio * points.length)),
    );
  }

  function handleKeyDown(event: KeyboardEvent<SVGRectElement>) {
    const current = selectedIndex ?? defaultIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(current - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(current + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveSelection(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveSelection(points.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPinnedIndex(current);
      setActiveIndex(current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(null);
      setPinnedIndex(null);
    }
  }

  return (
    <section
      className={styles.chartCard}
      aria-labelledby={titleId}
      aria-busy={forecastLoading}
    >
      <div className={styles.chartHead}>
        <div>
          <span className={styles.eyebrow}>Monthly outlook</span>
          <h3 id={titleId}>Actual cash and simulated path</h3>
          <p id={descriptionId}>
            Monthly income and expense use the left scale; cash balances use the
            right. The approved-plan line remains visible for comparison.
          </p>
        </div>
        <div className={styles.legend} role="group" aria-label="Chart series">
          {(
            [
              ["income", "Income", "income"],
              ["expense", "Expense", "expense"],
              ["selectedCash", "Selected cash", "selected"],
              ["approvedCash", "Approved plan", "approved"],
            ] as const
          ).map(([key, label, swatch]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={visible[key]}
                onChange={(event) =>
                  setVisible((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
              <span className={styles.legendSwatch} data-swatch={swatch} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.stateKey} aria-label="Time-state key">
        <span data-state="actual">Recorded actual</span>
        <span data-state="current">Actual + projected remainder</span>
        <span data-state="future">Future projection</span>
        {reserveXof > 0 && (
          <span data-state="reserve">
            Reserve threshold {formatXofCompact(reserveXof)}
          </span>
        )}
      </div>

      <div className={styles.plotScroller}>
        {forecastLoading && (
          <span className={styles.loadingPill} role="status">
            Updating simulation…
          </span>
        )}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-labelledby={`${titleId} ${descriptionId}`}
          className={styles.chart}
        >
          {currentIndex >= 0 && (
            <g aria-hidden="true">
              <rect
                x={x(currentIndex) - step / 2}
                y={PLOT.top}
                width={step}
                height={plotHeight}
                fill="var(--daust-orange)"
                opacity="0.055"
              />
              <text
                x={x(currentIndex)}
                y={PLOT.top + 14}
                textAnchor="middle"
                fill="var(--chart-warning)"
                fontSize="8.5"
                fontWeight="700"
                letterSpacing=".05em"
              >
                ACTUAL + PROJECTION
              </text>
            </g>
          )}
          {firstFutureIndex >= 0 && (
            <g aria-hidden="true">
              <rect
                x={x(firstFutureIndex) - step / 2}
                y={PLOT.top}
                width={WIDTH - PLOT.right - (x(firstFutureIndex) - step / 2)}
                height={plotHeight}
                fill="var(--accent-bg)"
                opacity="0.58"
              />
              <text
                x={x(firstFutureIndex) - step / 2 + 9}
                y={PLOT.top + 14}
                fill="var(--fg3)"
                fontSize="8.5"
                fontWeight="700"
                letterSpacing=".06em"
              >
                FUTURE PROJECTION
              </text>
            </g>
          )}

          {flowTicks.map((tick) => (
            <g key={tick.value} aria-hidden="true">
              <line
                x1={PLOT.left}
                x2={WIDTH - PLOT.right}
                y1={tick.y}
                y2={tick.y}
                stroke={
                  tick.value === 0 ? "var(--border-strong)" : "var(--divider)"
                }
                strokeWidth={tick.value === 0 ? 1.4 : 1}
              />
              <text
                x={PLOT.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                fill="var(--fg3)"
                fontSize="10"
              >
                {compactTick(tick.value)}
              </text>
            </g>
          ))}
          {balanceTicks.map((tick) => (
            <text
              key={tick.value}
              x={WIDTH - PLOT.right + 10}
              y={tick.y + 4}
              fill="var(--fg3)"
              fontSize="10"
              aria-hidden="true"
            >
              {compactTick(tick.value)}
            </text>
          ))}

          {reserveXof > 0 && (
            <g aria-hidden="true">
              <line
                x1={PLOT.left}
                x2={WIDTH - PLOT.right}
                y1={balanceY(reserveXof)}
                y2={balanceY(reserveXof)}
                stroke="var(--error-500)"
                strokeWidth="1.4"
                strokeDasharray="4 4"
              />
              <text
                x={WIDTH - PLOT.right - 5}
                y={balanceY(reserveXof) - 6}
                textAnchor="end"
                fill="var(--chart-danger)"
                fontSize="9"
                fontWeight="700"
              >
                RESERVE
              </text>
            </g>
          )}

          {points.map((point, index) => {
            const center = x(index);
            const projected = point.state !== "recorded_actual";
            return (
              <g key={point.month} aria-hidden="true">
                {visible.income && (
                  <rect
                    x={center - barWidth - 2}
                    y={Math.min(flowZeroY, flowY(point.projectedIncomeXof))}
                    width={barWidth}
                    height={Math.abs(
                      flowZeroY - flowY(point.projectedIncomeXof),
                    )}
                    rx="2.5"
                    fill="var(--success-500)"
                    opacity={projected ? 0.42 : 0.86}
                    stroke={projected ? "var(--success-500)" : "none"}
                    strokeDasharray={projected ? "3 2" : undefined}
                  />
                )}
                {visible.expense && (
                  <rect
                    x={center + 2}
                    y={Math.min(flowZeroY, flowY(point.projectedExpenseXof))}
                    width={barWidth}
                    height={Math.abs(
                      flowZeroY - flowY(point.projectedExpenseXof),
                    )}
                    rx="2.5"
                    fill="var(--daust-orange-600)"
                    opacity={projected ? 0.4 : 0.84}
                    stroke={projected ? "var(--daust-orange-600)" : "none"}
                    strokeDasharray={projected ? "3 2" : undefined}
                  />
                )}
                <text
                  x={center}
                  y={HEIGHT - 30}
                  textAnchor="middle"
                  fill="var(--fg3)"
                  fontSize="10"
                  fontWeight={detailIndex === index ? "700" : "500"}
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          {visible.approvedCash && (
            <path
              d={pathForIndexes(
                points,
                allIndexes,
                (point) => point.approvedPlanBalanceXof,
                x,
                balanceY,
              )}
              fill="none"
              stroke="var(--fg-faint)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            />
          )}
          {visible.selectedCash && (
            <g aria-hidden="true">
              {recordedIndexes.length > 0 && (
                <path
                  d={pathForIndexes(
                    points,
                    recordedIndexes,
                    (point) => point.projectedBalanceXof,
                    x,
                    balanceY,
                  )}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {projectedIndexes.length > 0 && (
                <path
                  d={pathForIndexes(
                    points,
                    projectedIndexes,
                    (point) => point.projectedBalanceXof,
                    x,
                    balanceY,
                  )}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeDasharray="7 6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.map((point, index) => (
                <circle
                  key={point.month}
                  cx={x(index)}
                  cy={balanceY(point.projectedBalanceXof)}
                  r={detailIndex === index ? 4.8 : 3}
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}

          {selectedIndex !== null && (
            <g aria-hidden="true">
              <line
                x1={x(detailIndex)}
                x2={x(detailIndex)}
                y1={PLOT.top}
                y2={PLOT.top + plotHeight}
                stroke="var(--fg3)"
                strokeDasharray="2 4"
              />
              <rect
                x={Math.min(
                  WIDTH - 316,
                  Math.max(PLOT.left, x(detailIndex) - 130),
                )}
                y={PLOT.top + 20}
                width="274"
                height="120"
                rx="9"
                fill="var(--surface)"
                stroke="var(--border-strong)"
              />
              <text
                x={
                  Math.min(
                    WIDTH - 316,
                    Math.max(PLOT.left, x(detailIndex) - 130),
                  ) + 14
                }
                y={PLOT.top + 42}
                fill="var(--fg1)"
                fontSize="11.5"
                fontWeight="700"
              >
                {selected.label} · {stateLabel(selected.state)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 316,
                    Math.max(PLOT.left, x(detailIndex) - 130),
                  ) + 14
                }
                y={PLOT.top + 63}
                fill="var(--success-500)"
                fontSize="10.5"
              >
                Income {formatXofCompact(selected.projectedIncomeXof)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 316,
                    Math.max(PLOT.left, x(detailIndex) - 130),
                  ) + 14
                }
                y={PLOT.top + 82}
                fill="var(--chart-warning)"
                fontSize="10.5"
              >
                Expense {formatXofCompact(selected.projectedExpenseXof)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 316,
                    Math.max(PLOT.left, x(detailIndex) - 130),
                  ) + 14
                }
                y={PLOT.top + 101}
                fill="var(--accent)"
                fontSize="10.5"
                fontWeight="700"
              >
                Selected cash {formatXofCompact(selected.projectedBalanceXof)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 316,
                    Math.max(PLOT.left, x(detailIndex) - 130),
                  ) + 14
                }
                y={PLOT.top + 120}
                fill="var(--fg3)"
                fontSize="10"
              >
                vs approved{" "}
                {signedCompact(
                  selected.projectedBalanceXof -
                    selected.approvedPlanBalanceXof,
                )}
              </text>
            </g>
          )}

          <rect
            className={styles.interactionTarget}
            x={PLOT.left}
            y={PLOT.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            tabIndex={0}
            role="slider"
            aria-label="Cashflow chart month"
            aria-describedby={interactionId}
            aria-valuemin={1}
            aria-valuemax={points.length}
            aria-valuenow={detailIndex + 1}
            aria-valuetext={`${selected.label}. ${stateLabel(selected.state)}. Income ${formatXof(selected.projectedIncomeXof)}. Expense ${formatXof(selected.projectedExpenseXof)}. Selected closing cash ${formatXof(selected.projectedBalanceXof)}. Approved-plan closing cash ${formatXof(selected.approvedPlanBalanceXof)}.`}
            aria-orientation="horizontal"
            onKeyDown={handleKeyDown}
            onFocus={() =>
              setActiveIndex(
                (current) => current ?? pinnedIndex ?? defaultIndex,
              )
            }
            onBlur={() => setActiveIndex(null)}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setActiveIndex(indexFromPointer(event.clientX, bounds));
            }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const clickedIndex = indexFromPointer(event.clientX, bounds);
              setActiveIndex(clickedIndex);
              setPinnedIndex(clickedIndex);
              event.currentTarget.focus();
            }}
          />
        </svg>
      </div>

      <div className={styles.mobileMonthDetail} aria-live="polite">
        <strong>{selected.label}</strong>
        <span>{stateLabel(selected.state)}</span>
        <dl>
          <div>
            <dt>Income</dt>
            <dd>{formatXof(selected.projectedIncomeXof)}</dd>
          </div>
          <div>
            <dt>Expense</dt>
            <dd>{formatXof(selected.projectedExpenseXof)}</dd>
          </div>
          <div>
            <dt>Closing cash</dt>
            <dd>{formatXof(selected.projectedBalanceXof)}</dd>
          </div>
        </dl>
      </div>

      <p id={interactionId} className={styles.srOnly}>
        Use the arrow keys to move between months. Home and End jump to the
        first or last month. Enter or Space pins a month. Escape clears it.
      </p>
      <p role="status" aria-live="polite" className={styles.srOnly}>
        {selectedIndex === null
          ? ""
          : `${selected.label}. ${stateLabel(selected.state)}. Income ${formatXof(selected.projectedIncomeXof)}. Expense ${formatXof(selected.projectedExpenseXof)}. Selected closing cash ${formatXof(selected.projectedBalanceXof)}.`}
      </p>

      <div className={styles.tableDisclosure}>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          aria-expanded={showTable}
        >
          {showTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showTable ? "Hide" : "Show"} exact monthly data
        </button>
        {showTable && (
          <div className={styles.tableScroller}>
            <table>
              <caption>Monthly cashflow simulation in exact XOF</caption>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Time state</th>
                  <th>Income</th>
                  <th>Expense</th>
                  <th>Selected closing cash</th>
                  <th>Approved-plan closing cash</th>
                  <th>Difference</th>
                  <th>Reserve status</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => {
                  const difference =
                    point.projectedBalanceXof - point.approvedPlanBalanceXof;
                  return (
                    <tr key={point.month}>
                      <th scope="row">{point.label}</th>
                      <td>{stateLabel(point.state)}</td>
                      <td>{formatXof(point.projectedIncomeXof)}</td>
                      <td>{formatXof(point.projectedExpenseXof)}</td>
                      <td>{formatXof(point.projectedBalanceXof)}</td>
                      <td>{formatXof(point.approvedPlanBalanceXof)}</td>
                      <td>
                        {difference === 0
                          ? formatXof(0)
                          : `${difference > 0 ? "+" : "−"}${formatXof(Math.abs(difference))}`}
                      </td>
                      <td>
                        {point.projectedBalanceXof >= reserveXof
                          ? "At or above reserve"
                          : `Below reserve by ${formatXof(reserveXof - point.projectedBalanceXof)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  OperatingBudgetCashflowMonth,
  OperatingBudgetForecast,
  OperatingBudgetMonth,
} from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";
import styles from "./BudgetCashflowChart.module.css";

const WIDTH = 980;
const HEIGHT = 390;
const PLOT = { left: 76, right: 78, top: 46, bottom: 62 };
const BAR_BOTTOM = HEIGHT - PLOT.bottom;

type ChartPoint = {
  month: string;
  label: string;
  incomeXof: number;
  expenseXof: number;
  balanceXof: number;
  source: "actual" | "forecast";
};

type VisibleSeries = {
  income: boolean;
  expense: boolean;
  balance: boolean;
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

function linePath(
  points: ChartPoint[],
  source: "actual" | "forecast",
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  const firstForecast = points.findIndex(
    (point) => point.source === "forecast",
  );
  const matching = points
    .map((point, index) => ({ point, index }))
    .filter(({ point, index }) => {
      if (source === "actual") return point.source === "actual";
      return firstForecast >= 0 && index >= Math.max(0, firstForecast - 1);
    });

  return matching
    .map(
      ({ point, index }, pathIndex) =>
        `${pathIndex === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.balanceXof).toFixed(1)}`,
    )
    .join(" ");
}

function sourceLabel(source: ChartPoint["source"]): string {
  return source === "actual" ? "Recorded actual" : "Forecast";
}

export function BudgetCashflowChart({
  months,
  cashflow,
  forecast,
  forecastLoading = false,
}: {
  months: OperatingBudgetMonth[];
  cashflow: OperatingBudgetCashflowMonth[];
  forecast: OperatingBudgetForecast | null;
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
    balance: true,
  });

  const points = useMemo<ChartPoint[]>(() => {
    const base = new Map(cashflow.map((point) => [point.month, point]));
    const projected = new Map(
      (forecast?.months ?? []).map((point) => [point.month, point]),
    );

    return months.map((month) => {
      const raw = base.get(month.key);
      const projection = projected.get(month.key);
      const source =
        projection?.source ??
        (raw?.actualBalanceXof === null ? "forecast" : "actual");
      return {
        month: month.key,
        label: month.label,
        incomeXof:
          projection?.incomeXof ??
          (source === "forecast"
            ? (raw?.forecastIncomeXof ?? raw?.plannedIncomeXof ?? 0)
            : (raw?.actualIncomeXof ?? 0)),
        expenseXof:
          projection?.expenseXof ??
          (source === "forecast"
            ? (raw?.forecastExpenseXof ?? raw?.plannedExpenseXof ?? 0)
            : (raw?.actualExpenseXof ?? 0)),
        balanceXof:
          projection?.balanceXof ??
          (source === "forecast"
            ? (raw?.forecastBalanceXof ?? raw?.plannedBalanceXof ?? 0)
            : (raw?.actualBalanceXof ?? 0)),
        source,
      };
    });
  }, [cashflow, forecast?.months, months]);

  if (points.length === 0) {
    return (
      <section className="card" style={{ margin: 0 }}>
        <h2 className="h1" style={{ fontSize: 17 }}>
          Monthly cashflow
        </h2>
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
          Cashflow will appear after this academic year has budget or actual
          entries.
        </p>
      </section>
    );
  }

  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const step = plotWidth / points.length;
  const x = (index: number) => PLOT.left + step * index + step / 2;
  const flowValues = points.flatMap((point) => [
    point.incomeXof,
    point.expenseXof,
  ]);
  const flowMin = Math.min(0, ...flowValues);
  const flowMax = Math.max(1, ...flowValues);
  const flowSpan = Math.max(1, flowMax - flowMin);
  const balanceValues = points.map((point) => point.balanceXof);
  const balanceMin = Math.min(0, ...balanceValues);
  const balanceMax = Math.max(1, ...balanceValues);
  const balanceSpan = Math.max(1, balanceMax - balanceMin);
  const flowY = (value: number) =>
    PLOT.top + ((flowMax - value) / flowSpan) * plotHeight;
  const flowZeroY = flowY(0);
  const balanceY = (value: number) =>
    PLOT.top + ((balanceMax - value) / balanceSpan) * plotHeight;
  const barWidth = Math.min(18, step * 0.25);
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
  const firstForecast = points.findIndex(
    (point) => point.source === "forecast",
  );
  const selectedIndex = activeIndex ?? pinnedIndex;
  const selected = selectedIndex === null ? null : points[selectedIndex];
  const accessibleIndex = selectedIndex ?? 0;
  const accessiblePoint = points[accessibleIndex]!;

  function moveSelection(nextIndex: number) {
    setActiveIndex(Math.min(points.length - 1, Math.max(0, nextIndex)));
  }

  function handleKeyDown(event: KeyboardEvent<SVGRectElement>) {
    const current = selectedIndex ?? 0;
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
      className="card"
      style={{ margin: 0, padding: 0, overflow: "hidden" }}
      aria-labelledby={titleId}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 18,
          flexWrap: "wrap",
          padding: "18px 18px 8px",
        }}
      >
        <div>
          <h2 id={titleId} className="h1" style={{ fontSize: 17 }}>
            Monthly cashflow
          </h2>
          <p
            id={descriptionId}
            className="muted"
            style={{ margin: "4px 0 0", fontSize: 12.5 }}
          >
            Signed income and expense use the left scale; closing cash uses the
            right. Negative net flows extend below zero. Future months follow
            the selected scenario.
          </p>
        </div>
        <div
          role="group"
          aria-label="Chart series"
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {(
            [
              ["income", "Income", "var(--success-500)"],
              ["expense", "Expense", "var(--daust-orange-600)"],
              ["balance", "Closing cash", "var(--accent)"],
            ] as const
          ).map(([key, label, color]) => (
            <label
              key={key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--fg2)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={visible[key]}
                onChange={(event) =>
                  setVisible((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
                style={{
                  width: 14,
                  height: 14,
                  padding: 0,
                  accentColor: color,
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: key === "balance" ? 16 : 8,
                  height: key === "balance" ? 2 : 8,
                  borderRadius: key === "balance" ? 999 : 2,
                  background: color,
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", overflowX: "auto" }}>
        {forecastLoading && (
          <div
            role="status"
            style={{
              position: "absolute",
              right: 18,
              top: 6,
              zIndex: 2,
              padding: "5px 9px",
              borderRadius: 999,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg3)",
              fontSize: 11,
            }}
          >
            Updating forecast…
          </div>
        )}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-labelledby={`${titleId} ${descriptionId}`}
          style={{ display: "block", width: "100%", minWidth: 720 }}
        >
          {firstForecast >= 0 && (
            <g aria-hidden="true">
              <rect
                x={Math.max(PLOT.left, x(firstForecast) - step / 2)}
                y={PLOT.top}
                width={
                  WIDTH -
                  PLOT.right -
                  Math.max(PLOT.left, x(firstForecast) - step / 2)
                }
                height={plotHeight}
                fill="var(--bg-tint)"
                opacity="0.58"
              />
              <text
                x={Math.max(PLOT.left + 8, x(firstForecast) - step / 2 + 9)}
                y={PLOT.top + 15}
                fill="var(--fg3)"
                fontSize="10.5"
                fontWeight="700"
                letterSpacing=".06em"
              >
                FORECAST
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
                strokeWidth={tick.value === 0 ? "1.4" : "1"}
              />
              <text
                x={PLOT.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                fill="var(--fg3)"
                fontSize="10.5"
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
              fontSize="10.5"
              aria-hidden="true"
            >
              {compactTick(tick.value)}
            </text>
          ))}

          {points.map((point, index) => {
            const center = x(index);
            return (
              <g key={point.month} aria-hidden="true">
                {visible.income && (
                  <rect
                    x={center - barWidth - 2}
                    y={Math.min(flowZeroY, flowY(point.incomeXof))}
                    width={barWidth}
                    height={Math.abs(flowZeroY - flowY(point.incomeXof))}
                    rx="3"
                    fill="var(--success-500)"
                    opacity={point.source === "forecast" ? 0.44 : 0.88}
                    stroke={
                      point.source === "forecast"
                        ? "var(--success-500)"
                        : "none"
                    }
                    strokeDasharray="3 2"
                  />
                )}
                {visible.expense && (
                  <rect
                    x={center + 2}
                    y={Math.min(flowZeroY, flowY(point.expenseXof))}
                    width={barWidth}
                    height={Math.abs(flowZeroY - flowY(point.expenseXof))}
                    rx="3"
                    fill="var(--daust-orange-600)"
                    opacity={point.source === "forecast" ? 0.42 : 0.86}
                    stroke={
                      point.source === "forecast"
                        ? "var(--daust-orange-600)"
                        : "none"
                    }
                    strokeDasharray="3 2"
                  />
                )}
                <text
                  x={center}
                  y={HEIGHT - 30}
                  textAnchor="middle"
                  fill="var(--fg3)"
                  fontSize="10.5"
                  fontWeight={selectedIndex === index ? "700" : "500"}
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          {visible.balance && (
            <g aria-hidden="true">
              <path
                d={linePath(points, "actual", x, balanceY)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={linePath(points, "forecast", x, balanceY)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="7 6"
              />
              {points.map((point, index) => (
                <circle
                  key={point.month}
                  cx={x(index)}
                  cy={balanceY(point.balanceXof)}
                  r={selectedIndex === index ? 5 : 3}
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}

          {selected && selectedIndex !== null && (
            <g aria-hidden="true">
              <line
                x1={x(selectedIndex)}
                x2={x(selectedIndex)}
                y1={PLOT.top}
                y2={BAR_BOTTOM}
                stroke="var(--fg3)"
                strokeDasharray="2 4"
              />
              <rect
                x={Math.min(
                  WIDTH - 282,
                  Math.max(PLOT.left, x(selectedIndex) - 120),
                )}
                y={PLOT.top + 12}
                width="248"
                height="96"
                rx="10"
                fill="var(--surface)"
                stroke="var(--border-strong)"
              />
              <text
                x={
                  Math.min(
                    WIDTH - 282,
                    Math.max(PLOT.left, x(selectedIndex) - 120),
                  ) + 14
                }
                y={PLOT.top + 34}
                fill="var(--fg1)"
                fontSize="12"
                fontWeight="700"
              >
                {selected.label} · {sourceLabel(selected.source)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 282,
                    Math.max(PLOT.left, x(selectedIndex) - 120),
                  ) + 14
                }
                y={PLOT.top + 55}
                fill="var(--success-500)"
                fontSize="11"
              >
                Income {formatXofCompact(selected.incomeXof)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 282,
                    Math.max(PLOT.left, x(selectedIndex) - 120),
                  ) + 14
                }
                y={PLOT.top + 74}
                fill="var(--daust-orange-600)"
                fontSize="11"
              >
                Expense {formatXofCompact(selected.expenseXof)}
              </text>
              <text
                x={
                  Math.min(
                    WIDTH - 282,
                    Math.max(PLOT.left, x(selectedIndex) - 120),
                  ) + 14
                }
                y={PLOT.top + 93}
                fill="var(--fg2)"
                fontSize="11"
                fontWeight="700"
              >
                Closing cash {formatXofCompact(selected.balanceXof)}
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
            aria-label="Chart month"
            aria-describedby={interactionId}
            aria-valuemin={1}
            aria-valuemax={points.length}
            aria-valuenow={accessibleIndex + 1}
            aria-valuetext={`${accessiblePoint.label}. ${sourceLabel(accessiblePoint.source)}. Income ${formatXof(accessiblePoint.incomeXof)}. Expense ${formatXof(accessiblePoint.expenseXof)}. Closing cash ${formatXof(accessiblePoint.balanceXof)}.`}
            aria-orientation="horizontal"
            onKeyDown={handleKeyDown}
            onFocus={() =>
              setActiveIndex((current) => current ?? pinnedIndex ?? 0)
            }
            onBlur={() => setActiveIndex(null)}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const ratio = Math.max(
                0,
                Math.min(1, (event.clientX - bounds.left) / bounds.width),
              );
              setActiveIndex(
                Math.min(
                  points.length - 1,
                  Math.max(0, Math.floor(ratio * points.length)),
                ),
              );
            }}
            onClick={(event) => {
              event.currentTarget.focus();
              if (activeIndex !== null) setPinnedIndex(activeIndex);
            }}
          />
        </svg>
      </div>

      <p
        id={interactionId}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        Use the left and right arrow keys to move between months. Home and End
        jump to the first or last month. Press Enter or Space to pin a month.
        Press Escape to clear the pinned month.
      </p>

      <p
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {selected
          ? `${selected.label}. ${sourceLabel(selected.source)}. Income ${formatXof(selected.incomeXof)}. Expense ${formatXof(selected.expenseXof)}. Closing cash ${formatXof(selected.balanceXof)}.`
          : ""}
      </p>

      <div style={{ borderTop: "1px solid var(--divider)" }}>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          aria-expanded={showTable}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            width: "100%",
            padding: "10px 18px",
            border: 0,
            borderRadius: 0,
            background: "transparent",
            color: "var(--fg2)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {showTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showTable ? "Hide" : "Show"} accessible data table
        </button>
        {showTable && (
          <div style={{ overflowX: "auto", padding: "0 18px 16px" }}>
            <table>
              <caption
                style={{
                  textAlign: "left",
                  color: "var(--fg3)",
                  fontSize: 12,
                  padding: "6px 0 10px",
                }}
              >
                Monthly cashflow figures in FCFA
              </caption>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Income</th>
                  <th style={{ textAlign: "right" }}>Expense</th>
                  <th style={{ textAlign: "right" }}>Closing cash</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.month}>
                    <td>{point.label}</td>
                    <td>{sourceLabel(point.source)}</td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(point.incomeXof)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(point.expenseXof)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(point.balanceXof)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

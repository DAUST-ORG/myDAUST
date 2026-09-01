"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { CollectionsTimeline, CollectionsTimelinePoint } from "@/lib/api";
import {
  formatDate,
  formatDateShort,
  formatXof,
  formatXofCompact,
} from "@/lib/format";

const WIDTH = 820;
const HEIGHT = 330;
const MARGIN = { top: 24, right: 24, bottom: 42, left: 76 };
const TOOLTIP_WIDTH = 254;

type SeriesKey =
  "expectedCumulativeXof" | "actualCumulativeXof" | "forecastCumulativeXof";

const SERIES: {
  key: SeriesKey;
  label: string;
  color: string;
  dashed?: boolean;
}[] = [
  {
    key: "expectedCumulativeXof",
    label: "Approved expected schedule",
    color: "var(--fg3)",
  },
  {
    key: "actualCumulativeXof",
    label: "Actual collected",
    color: "var(--accent)",
  },
  {
    key: "forecastCumulativeXof",
    label: "Run-rate forecast",
    color: "var(--daust-orange-600)",
    dashed: true,
  },
];

const DEFAULT_SERIES_VISIBILITY: Record<SeriesKey, boolean> = {
  expectedCumulativeXof: true,
  actualCumulativeXof: true,
  forecastCumulativeXof: true,
};

const VISUALLY_HIDDEN_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function time(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function linePath(
  points: CollectionsTimelinePoint[],
  key: SeriesKey,
  x: (date: string) => number,
  y: (value: number) => number,
): string {
  let active = false;
  return points
    .map((point) => {
      const value = point[key];
      if (value === null) {
        active = false;
        return "";
      }
      const command = active ? "L" : "M";
      active = true;
      return `${command}${x(point.date).toFixed(1)},${y(value).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}

function forecastLabel(status: CollectionsTimeline["forecast"]["status"]) {
  if (status === "trailing_30_days") return "Trailing 30-day run rate";
  if (status === "academic_year_to_date") return "Academic-year run rate";
  return "Insufficient collection history";
}

function nearestPointIndex(
  points: CollectionsTimelinePoint[],
  targetTime: number,
): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  points.forEach((point, index) => {
    const distance = Math.abs(time(point.date) - targetTime);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  });

  return closestIndex;
}

function shortSeriesLabel(key: SeriesKey): string {
  if (key === "expectedCumulativeXof") return "Expected";
  if (key === "actualCumulativeXof") return "Actual";
  return "Forecast";
}

function pointValueLabel(value: number | null): string {
  return value === null ? "Not available" : formatXof(value);
}

function pointAnnouncement(
  point: CollectionsTimelinePoint,
  visibility: Record<SeriesKey, boolean>,
): string {
  const values = SERIES.filter((series) => visibility[series.key]).map(
    (series) =>
      `${shortSeriesLabel(series.key)} ${pointValueLabel(point[series.key])}`,
  );

  return `${formatDateShort(point.date)}. ${values.length > 0 ? values.join(". ") : "All series hidden"}.`;
}

export function CollectionsTimelineChart({
  data,
}: {
  data: CollectionsTimeline;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const interactionId = useId();
  const shadowId = `${titleId.replaceAll(":", "")}-chart-shadow`;
  const [seriesVisibility, setSeriesVisibility] = useState(() => ({
    ...DEFAULT_SERIES_VISIBILITY,
  }));
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [interactionAcademicYear, setInteractionAcademicYear] = useState(
    data.academicYear,
  );
  const [plotFocused, setPlotFocused] = useState(false);
  const points = useMemo(
    () => [...data.points].sort((a, b) => a.date.localeCompare(b.date)),
    [data.points],
  );

  if (points.length === 0) {
    return (
      <div className="card" style={{ margin: 0 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>Expected vs. collected</p>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
          No scheduled or settled collections exist for {data.academicYear}.
        </p>
      </div>
    );
  }

  const minTime = time(points[0]!.date);
  const maxTime = Math.max(minTime + 86_400_000, time(points.at(-1)!.date));
  const values = points.flatMap((point) =>
    SERIES.map((series) => point[series.key]).filter(
      (value): value is number => value !== null,
    ),
  );
  const maxValue = Math.max(1, ...values);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (date: string) =>
    MARGIN.left + ((time(date) - minTime) / (maxTime - minTime)) * plotWidth;
  const y = (value: number) =>
    MARGIN.top + plotHeight - (value / maxValue) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: Math.round(maxValue * ratio),
    y: y(maxValue * ratio),
  }));
  const xTicks = [
    points[0]!,
    points[Math.floor((points.length - 1) / 2)]!,
    points.at(-1)!,
  ].filter(
    (point, index, all) =>
      all.findIndex((p) => p.date === point.date) === index,
  );
  const variance = data.summary.varianceXof;
  const defaultIndex = nearestPointIndex(points, time(data.asOfDate));
  const interactionIsCurrent = interactionAcademicYear === data.academicYear;
  const currentPinnedIndex =
    interactionIsCurrent && pinnedIndex !== null
      ? Math.min(points.length - 1, Math.max(0, pinnedIndex))
      : null;
  const rawActiveIndex = interactionIsCurrent
    ? (hoveredIndex ?? keyboardIndex ?? currentPinnedIndex)
    : null;
  const activeIndex =
    rawActiveIndex === null
      ? null
      : Math.min(points.length - 1, Math.max(0, rawActiveIndex));
  const activePoint = activeIndex === null ? null : points[activeIndex]!;
  const visibleSeries = SERIES.filter((series) => seriesVisibility[series.key]);
  const activeValues = activePoint
    ? visibleSeries
        .map((series) => ({ series, value: activePoint[series.key] }))
        .filter(
          (
            entry,
          ): entry is {
            series: (typeof SERIES)[number];
            value: number;
          } => entry.value !== null,
        )
    : [];
  const tooltipHeight = 66 + Math.max(1, visibleSeries.length) * 24;
  const activeX = activePoint ? x(activePoint.date) : 0;
  const activeAnchorY =
    activeValues.length > 0
      ? y(Math.max(...activeValues.map((entry) => entry.value)))
      : MARGIN.top + plotHeight / 2;
  const tooltipX = Math.min(
    WIDTH - MARGIN.right - TOOLTIP_WIDTH,
    Math.max(
      MARGIN.left,
      activeX + 16 + TOOLTIP_WIDTH > WIDTH - MARGIN.right
        ? activeX - TOOLTIP_WIDTH - 16
        : activeX + 16,
    ),
  );
  const tooltipY = Math.min(
    MARGIN.top + plotHeight - tooltipHeight - 6,
    Math.max(MARGIN.top + 6, activeAnchorY - tooltipHeight / 2),
  );

  const indexFromClientX = (clientX: number, target: SVGRectElement) => {
    const bounds = target.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / Math.max(bounds.width, 1)),
    );
    return nearestPointIndex(points, minTime + ratio * (maxTime - minTime));
  };

  const moveKeyboardSelection = (nextIndex: number) => {
    setHoveredIndex(null);
    setKeyboardIndex(Math.min(points.length - 1, Math.max(0, nextIndex)));
  };

  const handlePlotKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    const currentIndex = interactionIsCurrent
      ? (keyboardIndex ?? currentPinnedIndex ?? defaultIndex)
      : defaultIndex;
    setInteractionAcademicYear(data.academicYear);

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      moveKeyboardSelection(currentIndex - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      moveKeyboardSelection(currentIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveKeyboardSelection(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveKeyboardSelection(points.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPinnedIndex(currentIndex);
      setKeyboardIndex(currentIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setPinnedIndex(null);
      setHoveredIndex(null);
      setKeyboardIndex(null);
    }
  };

  return (
    <section className="card" style={{ margin: 0 }} aria-labelledby={titleId}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p id={titleId} className="h1" style={{ fontSize: 17, margin: 0 }}>
            Expected vs. collected
          </p>
          <p
            id={descriptionId}
            className="muted"
            style={{ fontSize: 12.5, margin: "5px 0 0" }}
          >
            Cumulative cash position · {data.academicYear} · as of{" "}
            {formatDateShort(data.asOfDate)}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              color: variance >= 0 ? "var(--success)" : "var(--danger)",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            {variance >= 0 ? "+" : ""}
            {formatXofCompact(variance)}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            variance to approved schedule
          </div>
        </div>
      </div>

      {data.balanceReconciliation.paymentCount > 0 && (
        <p
          className="muted"
          style={{ fontSize: 12.5, margin: "12px 0 0", lineHeight: 1.55 }}
        >
          Includes {data.balanceReconciliation.paymentCount} paid-to-date
          balance reconciliation
          {data.balanceReconciliation.paymentCount === 1
            ? ""
            : "s"} totaling {formatXof(data.balanceReconciliation.amountXof)},
          recognized on the reviewed source date
          {data.balanceReconciliation.sourceAsOfDates.length === 1
            ? ""
            : "s"}{" "}
          {data.balanceReconciliation.sourceAsOfDates
            .map(formatDateShort)
            .join(", ")}
          . Individual settlement dates remain unknown and are excluded from the
          run-rate calculation.
        </p>
      )}

      <div
        role="group"
        aria-label="Chart series"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 18,
        }}
      >
        {SERIES.map((series) => {
          const isVisible = seriesVisibility[series.key];
          return (
            <button
              key={series.key}
              type="button"
              className="sis-btn"
              aria-pressed={isVisible}
              aria-label={`${series.label}, ${isVisible ? "shown" : "hidden"}. Toggle series.`}
              onClick={() =>
                setSeriesVisibility((current) => ({
                  ...current,
                  [series.key]: !current[series.key],
                }))
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                minHeight: 34,
                padding: "6px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-pill)",
                background: isVisible ? "var(--accent-bg)" : "transparent",
                color: isVisible ? "var(--fg1)" : "var(--fg3)",
                cursor: "pointer",
                filter: "none",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: isVisible ? 700 : 600,
                opacity: isVisible ? 1 : 0.72,
                transform: "none",
                transition: "none",
              }}
            >
              <svg width="24" height="8" aria-hidden="true">
                <line
                  x1="1"
                  x2="23"
                  y1="4"
                  y2="4"
                  stroke={series.color}
                  strokeWidth="2.5"
                  strokeDasharray={series.dashed ? "5 4" : undefined}
                  opacity={isVisible ? 1 : 0.42}
                />
              </svg>
              <span>{series.label}</span>
              <span
                aria-hidden="true"
                style={{
                  paddingLeft: 2,
                  color: isVisible ? "var(--accent)" : "var(--fg3)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {isVisible ? "Shown" : "Hidden"}
              </span>
            </button>
          );
        })}
      </div>

      <p id={interactionId} style={VISUALLY_HIDDEN_STYLE}>
        Use the left and right arrow keys to move between dates. Press Enter or
        Space to pin a date. Press Escape to clear the pinned date.
      </p>

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <svg
          role="group"
          aria-labelledby={`${titleId} ${descriptionId}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{
            display: "block",
            width: "100%",
            minWidth: 620,
            height: "auto",
            fontFamily: "var(--font-body)",
          }}
        >
          <defs>
            <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="5"
                floodColor="#0f2c50"
                floodOpacity="0.16"
              />
            </filter>
          </defs>
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 12}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--fg3)"
              >
                {formatXofCompact(tick.value).replace(" FCFA", "")}
              </text>
            </g>
          ))}
          {xTicks.map((point) => (
            <text
              key={point.date}
              x={x(point.date)}
              y={HEIGHT - 12}
              textAnchor="middle"
              fontSize="11"
              fill="var(--fg3)"
            >
              {formatDateShort(point.date)}
            </text>
          ))}
          {visibleSeries.map((series) => (
            <path
              key={series.key}
              d={linePath(points, series.key, x, y)}
              fill="none"
              stroke={series.color}
              strokeWidth={series.key === "actualCumulativeXof" ? 3 : 2.5}
              strokeDasharray={series.dashed ? "8 7" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <rect
            role="slider"
            aria-label="Chart date"
            aria-describedby={interactionId}
            aria-valuemin={1}
            aria-valuemax={points.length}
            aria-valuenow={(activeIndex ?? defaultIndex) + 1}
            aria-valuetext={pointAnnouncement(
              points[activeIndex ?? defaultIndex]!,
              seriesVisibility,
            )}
            aria-orientation="horizontal"
            tabIndex={0}
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            rx="4"
            fill="transparent"
            stroke={plotFocused ? "var(--accent)" : "transparent"}
            strokeWidth="2"
            style={{ cursor: "crosshair", outline: "none" }}
            onPointerMove={(event) => {
              if (event.pointerType !== "touch") {
                setInteractionAcademicYear(data.academicYear);
                setHoveredIndex(
                  indexFromClientX(event.clientX, event.currentTarget),
                );
              }
            }}
            onPointerLeave={() => setHoveredIndex(null)}
            onClick={(event) => {
              const index = indexFromClientX(
                event.clientX,
                event.currentTarget,
              );
              event.currentTarget.focus();
              setInteractionAcademicYear(data.academicYear);
              setHoveredIndex(null);
              setKeyboardIndex(index);
              setPinnedIndex(index);
            }}
            onFocus={() => {
              setPlotFocused(true);
              setInteractionAcademicYear(data.academicYear);
              setKeyboardIndex((current) =>
                interactionIsCurrent
                  ? (current ?? currentPinnedIndex ?? defaultIndex)
                  : defaultIndex,
              );
            }}
            onBlur={() => {
              setPlotFocused(false);
              setKeyboardIndex(null);
            }}
            onKeyDown={handlePlotKeyDown}
          />

          {activePoint ? (
            <g aria-hidden="true" pointerEvents="none">
              <line
                x1={activeX}
                x2={activeX}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeDasharray="3 4"
                opacity="0.62"
              />
              {activeValues.map(({ series, value }) => (
                <circle
                  key={series.key}
                  cx={activeX}
                  cy={y(value)}
                  r={series.key === "actualCumulativeXof" ? 5 : 4.5}
                  fill="var(--surface)"
                  stroke={series.color}
                  strokeWidth="3"
                />
              ))}

              <g
                transform={`translate(${tooltipX}, ${tooltipY})`}
                filter={`url(#${shadowId})`}
              >
                <rect
                  width={TOOLTIP_WIDTH}
                  height={tooltipHeight}
                  rx="7"
                  fill="var(--surface)"
                  stroke="var(--border-strong)"
                />
                <text
                  x="14"
                  y="22"
                  fill="var(--fg1)"
                  fontSize="12"
                  fontWeight="800"
                >
                  {formatDate(activePoint.date)}
                </text>
                {currentPinnedIndex === activeIndex ? (
                  <g transform={`translate(${TOOLTIP_WIDTH - 70}, 9)`}>
                    <rect
                      width="56"
                      height="19"
                      rx="9.5"
                      fill="var(--accent-bg)"
                    />
                    <text
                      x="28"
                      y="13.5"
                      textAnchor="middle"
                      fill="var(--accent)"
                      fontSize="8.5"
                      fontWeight="800"
                      letterSpacing="0.07em"
                    >
                      PINNED
                    </text>
                  </g>
                ) : null}
                <line
                  x1="14"
                  x2={TOOLTIP_WIDTH - 14}
                  y1="35"
                  y2="35"
                  stroke="var(--divider)"
                />
                {visibleSeries.length > 0 ? (
                  visibleSeries.map((series, index) => {
                    const value = activePoint[series.key];
                    const rowY = 54 + index * 24;
                    return (
                      <g key={series.key}>
                        <line
                          x1="14"
                          x2="28"
                          y1={rowY - 4}
                          y2={rowY - 4}
                          stroke={series.color}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={series.dashed ? "4 3" : undefined}
                        />
                        <text
                          x="35"
                          y={rowY}
                          fill="var(--fg2)"
                          fontSize="10.5"
                          fontWeight="600"
                        >
                          {shortSeriesLabel(series.key)}
                        </text>
                        <text
                          x={TOOLTIP_WIDTH - 14}
                          y={rowY}
                          textAnchor="end"
                          fill={value === null ? "var(--fg3)" : "var(--fg1)"}
                          fontSize="10.5"
                          fontWeight="800"
                        >
                          {value === null ? "—" : formatXof(value)}
                        </text>
                      </g>
                    );
                  })
                ) : (
                  <text x="14" y="58" fill="var(--fg3)" fontSize="11">
                    All chart series are hidden.
                  </text>
                )}
                <text
                  x="14"
                  y={tooltipHeight - 12}
                  fill="var(--fg3)"
                  fontSize="9.5"
                  fontWeight="600"
                >
                  {currentPinnedIndex === activeIndex
                    ? "Pinned · Press Escape to clear"
                    : "Click or tap to pin this date"}
                </text>
              </g>
            </g>
          ) : null}
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          minHeight: 34,
          padding: "8px 10px",
          background: "var(--bg-subtle)",
          borderRadius: 4,
          fontSize: 12.5,
        }}
      >
        <div aria-live="polite" style={{ flex: "1 1 520px" }}>
          {activePoint ? (
            <span>
              <strong>{formatDate(activePoint.date)}</strong>
              {currentPinnedIndex === activeIndex ? (
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: 7,
                    padding: "2px 7px",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--accent-bg)",
                    color: "var(--accent)",
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Pinned
                </span>
              ) : null}
              {visibleSeries.map((series) => (
                <span key={series.key}>
                  {" · "}
                  {shortSeriesLabel(series.key).toLowerCase()}{" "}
                  <strong>{pointValueLabel(activePoint[series.key])}</strong>
                </span>
              ))}
              {visibleSeries.length === 0 ? " · all series hidden" : null}
            </span>
          ) : (
            <span className="muted">
              Hover or focus the plot for exact values. Click or tap to pin a
              date; use arrow keys to navigate.
            </span>
          )}
        </div>
        {currentPinnedIndex !== null ? (
          <button
            type="button"
            className="sis-btn"
            onClick={() => {
              setInteractionAcademicYear(data.academicYear);
              setPinnedIndex(null);
              setHoveredIndex(null);
              setKeyboardIndex(null);
            }}
            style={{
              padding: "3px 8px",
              border: 0,
              background: "transparent",
              color: "var(--accent)",
              cursor: "pointer",
              filter: "none",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
              transform: "none",
              transition: "none",
            }}
          >
            Clear selection
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        <Callout label="Approved expected" value={data.summary.scheduledXof} />
        <Callout label="Actual collected" value={data.summary.collectedXof} />
        <Callout
          label="Unscheduled debt"
          value={data.summary.unscheduledDebtXof}
          warning
        />
        <Callout
          label={forecastLabel(data.forecast.status)}
          value={data.forecast.dailyRateXof}
          suffix={data.forecast.dailyRateXof === null ? undefined : " / day"}
        />
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12.5 }}>
          View exact chart data
        </summary>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table>
            <caption style={{ textAlign: "left", paddingBottom: 8 }}>
              Cumulative expected, actual, and forecast collections in XOF
            </caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <td>{formatDateShort(point.date)}</td>
                  <td>{formatXof(point.expectedCumulativeXof)}</td>
                  <td>
                    {point.actualCumulativeXof === null
                      ? "—"
                      : formatXof(point.actualCumulativeXof)}
                  </td>
                  <td>
                    {point.forecastCumulativeXof === null
                      ? "—"
                      : formatXof(point.forecastCumulativeXof)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Callout({
  label,
  value,
  suffix,
  warning = false,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${warning ? "#a85f16" : "var(--daust-navy)"}`,
        paddingLeft: 10,
      }}
    >
      <div className="muted" style={{ fontSize: 11.5 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 3,
          fontWeight: 800,
          color: warning ? "#8a4d12" : "var(--fg1)",
        }}
      >
        {value === null ? "—" : formatXofCompact(value)}
        {suffix}
      </div>
    </div>
  );
}

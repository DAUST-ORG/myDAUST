"use client";

import { useId, useMemo, useState } from "react";
import type { CollectionsTimeline, CollectionsTimelinePoint } from "@/lib/api";
import { formatDateShort, formatXof, formatXofCompact } from "@/lib/format";

const WIDTH = 820;
const HEIGHT = 330;
const MARGIN = { top: 24, right: 24, bottom: 42, left: 76 };

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
    color: "#738297",
  },
  {
    key: "actualCumulativeXof",
    label: "Actual collected",
    color: "#173f70",
  },
  {
    key: "forecastCumulativeXof",
    label: "Run-rate forecast",
    color: "#d66f16",
    dashed: true,
  },
];

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

export function CollectionsTimelineChart({
  data,
}: {
  data: CollectionsTimeline;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [focus, setFocus] = useState<CollectionsTimelinePoint | null>(null);
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

      <div
        aria-label="Chart legend"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 18px",
          marginTop: 18,
        }}
      >
        {SERIES.map((series) => (
          <span
            key={series.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
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
              />
            </svg>
            {series.label}
          </span>
        ))}
      </div>

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{
            display: "block",
            width: "100%",
            minWidth: 620,
            height: "auto",
          }}
        >
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#dfe4eb"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 12}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#637083"
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
              fill="#637083"
            >
              {formatDateShort(point.date)}
            </text>
          ))}
          {SERIES.map((series) => (
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
          {points.map((point) => (
            <circle
              key={point.date}
              cx={x(point.date)}
              cy={y(
                point.actualCumulativeXof ??
                  point.forecastCumulativeXof ??
                  point.expectedCumulativeXof,
              )}
              r="7"
              fill="transparent"
              stroke="transparent"
              tabIndex={0}
              onMouseEnter={() => setFocus(point)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(point)}
              onBlur={() => setFocus(null)}
            >
              <title>{`${formatDateShort(point.date)}: expected ${formatXof(point.expectedCumulativeXof)}, actual ${point.actualCumulativeXof === null ? "not available" : formatXof(point.actualCumulativeXof)}, forecast ${point.forecastCumulativeXof === null ? "not available" : formatXof(point.forecastCumulativeXof)}`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div
        aria-live="polite"
        style={{
          minHeight: 34,
          padding: "8px 10px",
          background: "var(--bg-subtle)",
          borderRadius: 4,
          fontSize: 12.5,
        }}
      >
        {focus ? (
          <>
            <strong>{formatDateShort(focus.date)}</strong> · expected{" "}
            {formatXof(focus.expectedCumulativeXof)} · actual{" "}
            {focus.actualCumulativeXof === null
              ? "—"
              : formatXof(focus.actualCumulativeXof)}{" "}
            · forecast{" "}
            {focus.forecastCumulativeXof === null
              ? "—"
              : formatXof(focus.forecastCumulativeXof)}
          </>
        ) : (
          <span className="muted">
            Focus or hover a point for exact values.
          </span>
        )}
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

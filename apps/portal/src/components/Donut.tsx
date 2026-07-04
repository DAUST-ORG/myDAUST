export interface DonutSegment {
  value: number;
  color: string;
  label?: string;
}

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export function Donut({ segments, size = 120, thickness = 12, centerLabel, centerSub }: DonutProps) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "inline-flex", position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {(centerLabel || centerSub) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          {centerLabel && (
            <div style={{ fontFamily: "var(--font-display)", fontSize: size / 6.5, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg1)" }}>{centerLabel}</div>
          )}
          {centerSub && <div className="muted" style={{ fontSize: 11 }}>{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

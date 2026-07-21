"use client";

import { useEffect, useState } from "react";
import { type MyAttendance, getCurrentTerm, getMyAttendance } from "@/lib/api";
import { Card, EmptyState, PageHeader, Progress } from "@/components/ui";
import { COURSE_COLORS } from "@/lib/student-schedule";

function rateTone(pct: number): string {
  if (pct >= 90) return "var(--success-500)";
  if (pct >= 75) return "var(--warning-500)";
  return "var(--error-500)";
}

export default function StudentAttendance() {
  const [data, setData] = useState<MyAttendance | null>(null);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyAttendance().then(setData).catch((e: Error) => setError(e.message));
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const overall = data?.overall;
  const subtitle = [term || null, overall === null || overall === undefined ? null : `Overall attendance ${overall}%`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader title="Attendance" subtitle={subtitle || undefined} />

      {!data && <p className="muted">Loading…</p>}

      {data && data.rows.length === 0 && (
        <EmptyState
          title="No attendance recorded yet"
          note="Your rate appears once instructors begin taking attendance."
        />
      )}

      {data && data.rows.length > 0 && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.rows.map((r, i) => (
              <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span
                  style={{
                    width: 5,
                    height: 44,
                    borderRadius: 3,
                    background: COURSE_COLORS[i % COURSE_COLORS.length],
                    flexShrink: 0,
                  }}
                />
                <div style={{ width: 210, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.code}</div>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <Progress pct={r.pct ?? 0} height={9} tone={r.pct === null ? "var(--gray-200)" : rateTone(r.pct)} />
                </div>
                <div style={{ display: "flex", gap: 18, width: 270, justifyContent: "flex-end" }}>
                  <Col label="Present" value={r.present} tone="var(--success-500)" />
                  <Col label="Late" value={r.late} tone="var(--warning-500)" />
                  <Col label="Absent" value={r.absent} tone="var(--error-500)" />
                  <Col
                    label="Rate"
                    value={r.pct === null ? "—" : `${r.pct}%`}
                    tone={r.pct === null ? "var(--fg3)" : rateTone(r.pct)}
                    big
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "18px 0 0" }}>
            A late arrival counts as half a present when your rate is calculated.
          </p>
        </Card>
      )}
    </>
  );
}

function Col({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
  big?: boolean;
}) {
  return (
    <div style={{ textAlign: "right", minWidth: 52 }}>
      <div
        style={{
          fontSize: big ? 16 : 14,
          fontWeight: 700,
          color: tone,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--fg3)", fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
}

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
              <details key={r.code} style={{ borderBottom: "1px solid var(--divider)", paddingBottom: 12 }}>
              <summary style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", cursor: r.sessions.length ? "pointer" : "default", listStyle: "none" }}>
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
              </summary>
              {r.sessions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 0 0 19px" }}>
                  {r.sessions.map((ss) => (
                    <span
                      key={ss.date}
                      title={ss.status}
                      style={{
                        fontSize: 11.5,
                        padding: "3px 9px",
                        borderRadius: "var(--radius-pill)",
                        fontWeight: 600,
                        background:
                          ss.status === "present"
                            ? "rgba(46,125,82,.12)"
                            : ss.status === "late"
                              ? "rgba(237,132,37,.14)"
                              : "rgba(163,41,27,.12)",
                        color:
                          ss.status === "present"
                            ? "var(--success-500)"
                            : ss.status === "late"
                              ? "var(--warning-500)"
                              : "var(--error-500)",
                      }}
                    >
                      {new Date(`${ss.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  ))}
                </div>
              )}
              </details>
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

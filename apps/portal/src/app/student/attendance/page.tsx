"use client";

import { useEffect, useState } from "react";
import { type MyAttendance, getMyAttendance } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui";

function rateTone(pct: number): string {
  if (pct >= 90) return "var(--success-500)";
  if (pct >= 75) return "var(--daust-orange)";
  return "var(--error-500)";
}

export default function StudentAttendance() {
  const [data, setData] = useState<MyAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyAttendance().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <>
      <PageHeader
        eyebrow="This term"
        title="Attendance"
        actions={
          data?.overall !== null && data?.overall !== undefined ? (
            <Badge tone={data.overall >= 90 ? "success" : data.overall >= 75 ? "warning" : "error"}>
              {data.overall}% overall
            </Badge>
          ) : undefined
        }
      />

      {!data && <p className="muted">Loading…</p>}

      {data && data.rows.length === 0 && (
        <EmptyState
          title="No attendance recorded yet"
          note="Your rate appears once instructors begin taking attendance."
        />
      )}

      {data && data.rows.length > 0 && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {data.rows.map((r) => (
              <div key={r.code}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{r.title}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{r.code}</span>
                  <span style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {r.present} present · {r.late} late · {r.absent} absent
                  </span>
                  <strong style={{ fontVariantNumeric: "tabular-nums", color: r.pct === null ? "var(--fg3)" : rateTone(r.pct) }}>
                    {r.pct === null ? "—" : `${r.pct}%`}
                  </strong>
                </div>
                <Progress pct={r.pct ?? 0} tone={r.pct === null ? "var(--gray-200)" : rateTone(r.pct)} />
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "16px 0 0" }}>
            A late arrival counts as half a present when your rate is calculated.
          </p>
        </Card>
      )}
    </>
  );
}

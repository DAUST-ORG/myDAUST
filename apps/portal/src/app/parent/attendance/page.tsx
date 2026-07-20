"use client";

import { useEffect, useState } from "react";
import { type ChildAttendance, getChildAttendance } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui";
import { ChildSwitcher } from "../ChildSwitcher";
import { useChildren } from "../useChildren";

/** Green at or above 90%, amber at or above 75%, red below. */
function rateTone(pct: number): string {
  if (pct >= 90) return "var(--success-500)";
  if (pct >= 75) return "var(--daust-orange)";
  return "var(--error-500)";
}

export default function ParentAttendance() {
  const { children, active, activeId, select, error } = useChildren();
  const [data, setData] = useState<ChildAttendance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId) return;
    setData(null);
    setLoadError(null);
    getChildAttendance(activeId).then(setData).catch((e: Error) => setLoadError(e.message));
  }, [activeId]);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0) return <EmptyState title="No students linked to your account" />;

  return (
    <>
      <PageHeader
        eyebrow="Attendance record"
        title="Attendance"
        subtitle={active ? `${active.name} · this term` : undefined}
        actions={
          data?.overall !== null && data?.overall !== undefined ? (
            <Badge tone={data.overall >= 90 ? "success" : data.overall >= 75 ? "warning" : "error"}>
              {data.overall}% overall
            </Badge>
          ) : undefined
        }
      />

      <ChildSwitcher children={children} activeId={activeId} onSelect={select} />

      {loadError && <p className="card" style={{ color: "var(--danger)" }}>{loadError}</p>}
      {!data && !loadError && <p className="muted">Loading attendance…</p>}

      {data && data.rows.length === 0 && (
        <EmptyState
          title="No attendance recorded yet"
          note="Rates appear once instructors begin taking attendance this term."
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
                  <strong
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: r.pct === null ? "var(--fg3)" : rateTone(r.pct),
                    }}
                  >
                    {r.pct === null ? "—" : `${r.pct}%`}
                  </strong>
                </div>
                <Progress pct={r.pct ?? 0} tone={r.pct === null ? "var(--gray-200)" : rateTone(r.pct)} />
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "16px 0 0" }}>
            A late arrival counts as half a present when the rate is calculated.
          </p>
        </Card>
      )}
    </>
  );
}

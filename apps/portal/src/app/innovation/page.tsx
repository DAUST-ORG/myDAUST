"use client";

import { useEffect, useState } from "react";
import { type InnovationOverview, getInnovationOverview } from "@/lib/api";
import { type AdminGlobalTask, getGlobalTasks } from "@/lib/api-innovation";

export default function InnovationOverviewPage() {
  const [o, setO] = useState<InnovationOverview | null>(null);
  const [globalTasks, setGlobalTasks] = useState<AdminGlobalTask[]>([]);
  useEffect(() => {
    getInnovationOverview().then(setO).catch(() => {});
    getGlobalTasks().then(setGlobalTasks).catch(() => {});
  }, []);
  if (!o) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...o.phases.map((p) => p.count));

  const dueDates = globalTasks.filter((t) => t.dueDate).map((t) => new Date(t.dueDate as string).getTime());
  const latestDue = dueDates.length > 0 ? Math.max(...dueDates) : null;
  const daysLeft = latestDue === null ? null : Math.max(0, Math.ceil((latestDue - Date.now()) / 86_400_000));

  return (
    <>
      <p className="eyebrow">Innovation Studio</p>
      <h1 className="page-title">Overview</h1>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Active projects</div><div className="value">{o.total}</div></div>
        <div className="kpi"><div className="label">Pending reviews</div><div className="value">{o.pendingReviews}</div><div className="trend">submissions awaiting grade</div></div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 2 }}>
          <p className="h1" style={{ fontSize: 16 }}>Projects by phase</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 180, padding: "12px 8px 0" }}>
            {o.phases.map((p) => (
              <div key={p.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{p.count}</span>
                <div style={{ width: "100%", maxWidth: 48, height: (p.count / max) * 120 + 4, background: "var(--daust-navy)", borderRadius: 8 }} />
                <span style={{ fontSize: 12, color: "var(--fg3)" }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Impact countdown (design: shell.jsx ImpactCountdown) */}
        <div
          className="card"
          style={{
            flex: 1,
            minWidth: 240,
            background: "linear-gradient(110deg, #0d2743 0%, var(--daust-navy) 55%, #1d4d87 120%)",
            border: "none",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
          <div style={{ position: "absolute", top: -70, right: -40, width: 240, height: 240, borderRadius: 999, background: "radial-gradient(circle, rgba(237,132,37,.32), transparent 68%)" }} />
          <div style={{ position: "relative" }}>
            <p className="eyebrow" style={{ color: "#f0b27a", marginBottom: 10 }}>Counting down to</p>
            {daysLeft === null ? (
              <p style={{ color: "#cdd6e3", fontSize: 13.5, margin: 0 }}>No global deadlines set yet. Create one under Global Tasks.</p>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 64, lineHeight: 1, color: "var(--daust-orange)", fontVariantNumeric: "tabular-nums" }}>
                  {daysLeft}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginTop: 6 }}>
                  day{daysLeft === 1 ? "" : "s"} until final handover
                </div>
                <div style={{ fontSize: 12.5, color: "#cdd6e3", marginTop: 8 }}>
                  {new Date(latestDue as number).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {" · "}applies to all {o.total} projects
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

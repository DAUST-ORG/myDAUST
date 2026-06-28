"use client";

import { useEffect, useState } from "react";
import { type InnovationOverview, getInnovationOverview } from "@/lib/api";

export default function InnovationOverviewPage() {
  const [o, setO] = useState<InnovationOverview | null>(null);
  useEffect(() => {
    getInnovationOverview().then(setO).catch(() => {});
  }, []);
  if (!o) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...o.phases.map((p) => p.count));

  return (
    <>
      <p className="eyebrow">Innovation Studio</p>
      <h1 className="page-title">Overview</h1>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Active projects</div><div className="value">{o.total}</div></div>
        <div className="kpi"><div className="label">Pending reviews</div><div className="value">{o.pendingReviews}</div><div className="trend">submissions awaiting grade</div></div>
      </div>

      <div className="card">
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
    </>
  );
}

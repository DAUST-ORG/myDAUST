"use client";

import { useEffect, useState } from "react";
import { type DiningReports, getDiningReports } from "@/lib/api-dining";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

export default function DiningReportsPage() {
  const [data, setData] = useState<DiningReports | null>(null);

  useEffect(() => {
    getDiningReports().then(setData).catch(() => {});
  }, []);

  const max = Math.max(1, ...(data?.last7days.map((d) => d.served + d.turnedAway) ?? []));

  return (
    <>
      <p className="eyebrow">Analytics</p>
      <h1 className="page-title">Reports</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 16 }}>Meals served · last 7 days</p>
        <div style={{ marginTop: 12 }}>
          {data?.last7days.map((d) => (
            <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
              <span className="muted" style={{ width: 44, fontSize: 12 }}>{dayLabel(d.date)}</span>
              <div style={{ flex: 1, display: "flex", height: 18, borderRadius: 6, overflow: "hidden", background: "var(--gray-100)" }}>
                <div style={{ width: `${(d.served / max) * 100}%`, background: "var(--daust-navy)" }} title={`Served: ${d.served}`} />
                <div style={{ width: `${(d.turnedAway / max) * 100}%`, background: "var(--daust-orange)" }} title={`Turned away: ${d.turnedAway}`} />
              </div>
              <span style={{ width: 90, fontSize: 12, textAlign: "right" }}>
                <strong>{d.served}</strong> <span className="muted">/ {d.turnedAway} away</span>
              </span>
            </div>
          ))}
          {!data && <p className="muted">Loading…</p>}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--daust-navy)", marginRight: 6 }} />Served</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--daust-orange)", marginRight: 6 }} />Turned away</span>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1 }}>
          <p className="h1" style={{ fontSize: 16 }}>Plan mix</p>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Plan</th><th>Active students</th></tr></thead>
            <tbody>
              {data?.planMix.map((p) => (
                <tr key={p.type}><td style={{ textTransform: "capitalize" }}>{p.type}</td><td><strong>{p.count}</strong></td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: "1px solid var(--divider)", marginTop: 14, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
            <span className="muted">Weekend revenue</span>
            <strong>{xof(data?.weekendRevenue ?? 0)}</strong>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Cost center 3600 · Dining / Auxiliary Services</p>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <p className="h1" style={{ fontSize: 16 }}>Top weekend items</p>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Item</th><th>Qty sold</th></tr></thead>
            <tbody>
              {data?.topItems.map((t) => (
                <tr key={t.name}><td>{t.name}</td><td><strong>{t.qty}</strong></td></tr>
              ))}
            </tbody>
          </table>
          {data && data.topItems.length === 0 && <p className="muted">No orders yet.</p>}
        </div>
      </div>
    </>
  );
}

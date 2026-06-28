"use client";

import { useEffect, useState } from "react";
import { type DiningOverview, getDiningOverview } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

export default function DiningOverviewPage() {
  const [o, setO] = useState<DiningOverview | null>(null);
  useEffect(() => {
    getDiningOverview().then(setO).catch(() => {});
  }, []);
  if (!o) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Today</p>
      <h1 className="page-title">Dining Overview</h1>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Active meal plans</div><div className="value">{o.activePlans}</div></div>
        <div className="kpi"><div className="label">Open weekend orders</div><div className="value">{o.openOrders}</div></div>
        <div className="kpi"><div className="label">Weekend revenue</div><div className="value" style={{ fontSize: 22 }}>{xof(o.weekendRevenue)}</div></div>
        <div className="kpi"><div className="label">Meals served today</div><div className="value">{o.periods.reduce((s, p) => s + p.served, 0)}</div></div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: 2 }}>
          <p className="h1" style={{ fontSize: 16 }}>Service by period</p>
          <table>
            <thead><tr><th>Period</th><th>Served</th><th>Turned away</th></tr></thead>
            <tbody>
              {o.periods.map((p) => (
                <tr key={p.period}>
                  <td style={{ textTransform: "capitalize" }}>{p.period}</td>
                  <td><span className="badge completed">{p.served}</span></td>
                  <td>{p.turnedAway > 0 ? <span className="badge overdue">{p.turnedAway}</span> : <span className="muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p className="h1" style={{ fontSize: 16 }}>Plan mix</p>
          <table>
            <tbody>
              {o.planMix.map((p) => (
                <tr key={p.type}><td style={{ textTransform: "capitalize" }}>{p.type}</td><td><strong>{p.count}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { type DirectorOverview, getDirectorOverview } from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";

export default function DirectorPage() {
  const [d, setD] = useState<DirectorOverview | null>(null);
  useEffect(() => {
    getDirectorOverview().then(setD).catch(() => {});
  }, []);
  if (!d) return <p className="muted">Loading…</p>;

  const maxFlow = Math.max(1, ...d.groups.map((g) => Math.max(g.revenue, g.expense)));

  return (
    <>
      <p className="eyebrow">Operations · {d.fiscalYear}</p>
      <h1 className="page-title">Director — money in & out</h1>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Money in (collected)</div><div className="value">{formatXofCompact(d.totals.moneyIn)}</div></div>
        <div className="kpi"><div className="label">Money out (expenses)</div><div className="value">{formatXofCompact(d.totals.moneyOut)}</div></div>
        <div className="kpi"><div className="label">Net</div><div className="value" style={{ color: d.totals.net >= 0 ? "var(--success)" : "var(--danger)" }}>{formatXofCompact(d.totals.net)}</div></div>
        <div className="kpi"><div className="label">Cash position</div><div className="value">{formatXofCompact(d.totals.cashPosition)}</div></div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>By division (cost-center group)</p>
        <table>
          <thead><tr><th>Division</th><th>In</th><th>Out</th><th style={{ width: 220 }}>Flow</th><th>Net</th></tr></thead>
          <tbody>
            {d.groups.map((g) => (
              <tr key={g.code}>
                <td>{g.name}</td>
                <td style={{ color: "var(--success)" }}>{formatXof(g.revenue)}</td>
                <td style={{ color: "var(--danger)" }}>{formatXof(g.expense)}</td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div className="bar"><span style={{ width: `${(g.revenue / maxFlow) * 100}%`, background: "var(--success)" }} /></div>
                    <div className="bar"><span style={{ width: `${(g.expense / maxFlow) * 100}%`, background: "var(--danger)" }} /></div>
                  </div>
                </td>
                <td style={{ fontWeight: 600, color: g.net >= 0 ? "var(--success)" : "var(--danger)" }}>{formatXof(g.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          <span style={{ color: "var(--success)" }}>■</span> in (collected tuition/fees) ·{" "}
          <span style={{ color: "var(--danger)" }}>■</span> out (expenses, incl. estimates)
        </p>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Budget vs actual (FY)</p>
        <table>
          <thead><tr><th>Cost center</th><th>Allocated</th><th>Spent</th><th style={{ width: 200 }}>Used</th></tr></thead>
          <tbody>
            {d.budget.map((b) => (
              <tr key={b.code}>
                <td>{b.code} {b.name}</td>
                <td>{formatXof(b.allocated)}</td>
                <td>{formatXof(b.spent)}</td>
                <td>
                  <div className="bar"><span style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct > 90 ? "var(--danger)" : "var(--daust-orange)" }} /></div>
                  <span className="muted" style={{ fontSize: 12 }}>{b.pct}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

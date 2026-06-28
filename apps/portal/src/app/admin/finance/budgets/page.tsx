"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CostCenter,
  type DirectorOverview,
  getCostCenters,
  getDirectorOverview,
  setBudget,
} from "@/lib/api";
import { formatXof } from "@/lib/format";

export default function BudgetsPage() {
  const [d, setD] = useState<DirectorOverview | null>(null);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [cc, setCc] = useState("1100");
  const [amount, setAmount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getDirectorOverview().then(setD).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    getCostCenters().then((c) => setCenters(c.filter((x) => x.type !== "group"))).catch(() => {});
  }, [load]);

  async function save() {
    setMsg(null);
    try {
      await setBudget(cc, d?.fiscalYear ?? "FY2026", Number(amount));
      setMsg("Budget saved.");
      setAmount(0);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <>
      <p className="eyebrow">Finance · {d?.fiscalYear ?? "FY2026"}</p>
      <h1 className="page-title">Budgets</h1>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Set an allocation</p>
        {msg && <p className="muted">{msg}</p>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={cc} onChange={(e) => setCc(e.target.value)}>
            {centers.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
          <input type="number" placeholder="Allocated XOF" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: 160 }} />
          <button className="primary" disabled={amount <= 0} onClick={save}>Save budget</button>
        </div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Budget vs actual</p>
        <table>
          <thead><tr><th>Cost center</th><th>Allocated</th><th>Spent</th><th style={{ width: 220 }}>Used</th></tr></thead>
          <tbody>
            {(d?.budget ?? []).map((b) => (
              <tr key={b.code}>
                <td>{b.code} {b.name}</td>
                <td>{formatXof(b.allocated)}</td>
                <td>{formatXof(b.spent)}</td>
                <td>
                  <div className="bar"><span style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct > 90 ? "var(--danger)" : "var(--daust-orange)" }} /></div>
                  <span className="muted" style={{ fontSize: 12 }}>{b.pct}% used</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

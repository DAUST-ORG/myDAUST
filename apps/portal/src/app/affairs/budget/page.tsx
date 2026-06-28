"use client";

import { useEffect, useState } from "react";
import { type CoCurricularLine, getCoCurricularBudget } from "@/lib/api";

const xof = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;

export default function BudgetPage() {
  const [lines, setLines] = useState<CoCurricularLine[]>([]);
  useEffect(() => {
    getCoCurricularBudget().then(setLines).catch(() => {});
  }, []);

  const allocated = lines.reduce((s, l) => s + l.allocated, 0);
  const spent = lines.reduce((s, l) => s + l.spent, 0);

  return (
    <>
      <p className="eyebrow">Finance</p>
      <h1 className="page-title">Co-curricular Budget</h1>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Allocated</div><div className="value" style={{ fontSize: 22 }}>{xof(allocated)} FCFA</div></div>
        <div className="kpi"><div className="label">Spent</div><div className="value" style={{ fontSize: 22 }}>{xof(spent)} FCFA</div></div>
        <div className="kpi"><div className="label">Utilization</div><div className="value">{allocated ? Math.round((spent / allocated) * 100) : 0}%</div></div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>By line</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          {lines.map((l) => (
            <div key={l.line}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <strong>{l.line}</strong>
                <span className="muted">{xof(l.spent)} / {xof(l.allocated)} FCFA · {l.pct}%</span>
              </div>
              <div style={{ background: "var(--gray-100)", borderRadius: 6, height: 12, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, l.pct)}%`, height: "100%", background: l.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

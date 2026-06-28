"use client";

import { useEffect, useState } from "react";
import { type ArAging, getArAging } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

const BUCKET_COLOR: Record<string, string> = {
  current: "#2e7d52",
  "1-30": "var(--daust-navy-700)",
  "31-60": "var(--daust-orange)",
  "61-90": "#c4660f",
  "90+": "#c0392b",
};

export default function AgingPage() {
  const [data, setData] = useState<ArAging | null>(null);
  useEffect(() => {
    getArAging().then(setData).catch(() => {});
  }, []);

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Receivables</p>
      <h1 className="page-title">A/R Aging</h1>

      <div className="row" style={{ marginBottom: 16 }}>
        {data.buckets.map((b) => (
          <div key={b.key} className="kpi" style={{ borderTop: `3px solid ${BUCKET_COLOR[b.key]}` }}>
            <div className="label">{b.label}</div>
            <div className="value" style={{ fontSize: 20 }}>{xof(b.amount)}</div>
            <div className="trend">{b.count} account(s)</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <p className="h1" style={{ fontSize: 16, flex: 1 }}>Outstanding installments</p>
          <span className="badge overdue">{xof(data.totalOutstanding)} total</span>
        </div>
        <table>
          <thead><tr><th>Student</th><th>Student #</th><th>Term</th><th>Days overdue</th><th>Outstanding</th></tr></thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.student}</td>
                <td>{r.studentNo}</td>
                <td>{r.term}</td>
                <td>{r.daysOverdue === 0 ? <span className="muted">not due</span> : `${r.daysOverdue}d`}</td>
                <td>{xof(r.outstanding)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={5} className="muted">No outstanding balances. 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

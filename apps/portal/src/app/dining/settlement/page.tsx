"use client";

import { useEffect, useState } from "react";
import { getDiningSettlement } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

export default function SettlementPage() {
  const [s, setS] = useState<{ orders: number; revenue: number; settledTo: string } | null>(null);
  useEffect(() => {
    getDiningSettlement().then(setS).catch(() => {});
  }, []);
  if (!s) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Finance</p>
      <h1 className="page-title">Settlement</h1>
      <div className="kpi-grid">
        <div className="kpi"><div className="label">Paid orders</div><div className="value">{s.orders}</div></div>
        <div className="kpi"><div className="label">Weekend revenue</div><div className="value" style={{ fontSize: 22 }}>{xof(s.revenue)}</div></div>
      </div>
      <div className="card">
        <p className="h1" style={{ fontSize: 15 }}>Revenue routing</p>
        <p className="muted">Dining revenue settles to <strong>{s.settledTo}</strong>, feeding the director money-in/out dashboard automatically.</p>
      </div>
    </>
  );
}

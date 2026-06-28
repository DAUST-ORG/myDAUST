"use client";

import { useEffect, useState } from "react";
import { Building2, ClipboardList, Gavel, Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { type AffairsDashboard, type Hall, getAffairsDashboard, getHalls } from "@/lib/api";

const xof = (n: number) => `${(n / 1_000_000).toFixed(1)}M FCFA`;

export default function AffairsDashboardPage() {
  const [d, setD] = useState<AffairsDashboard | null>(null);
  const [halls, setHalls] = useState<Hall[]>([]);
  useEffect(() => {
    getAffairsDashboard().then(setD).catch(() => {});
    getHalls().then(setHalls).catch(() => {});
  }, []);
  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Student Affairs</p>
      <h1 className="page-title">Dashboard</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <StatCard value={`${d.occupancy.pct}%`} label={`Residence occupancy · ${d.occupancy.filled}/${d.occupancy.beds} beds`} icon={Building2} color="var(--daust-navy)" />
        <StatCard value={d.pendingAssignments} label="Pending assignments" icon={ClipboardList} color="var(--daust-orange)" />
        <StatCard value={d.openConductCases} label="Open conduct cases" icon={Gavel} color="#c0392b" />
        <StatCard value={`${d.budget.pct}%`} label={`Co-curricular budget · ${xof(d.budget.spent)} of ${xof(d.budget.allocated)}`} icon={Wallet} color="#2e7d52" />
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Residence halls</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {halls.map((h) => {
            const pct = Math.round((h.filled / h.beds) * 100);
            return (
              <div key={h.id} style={{ border: "1px solid var(--gray-100)", borderRadius: 13, overflow: "hidden" }}>
                <div style={{ height: 4, background: h.color }} />
                <div style={{ padding: 15 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{h.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{h.kind}</div>
                  <div style={{ marginTop: 10, background: "var(--gray-100)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: h.color }} />
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{h.filled}/{h.beds} beds · {pct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

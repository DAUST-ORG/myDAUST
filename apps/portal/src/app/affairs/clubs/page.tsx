"use client";

import { useCallback, useEffect, useState } from "react";
import { type Club, getClubs, setClubStatus } from "@/lib/api";

const xof = (n: number) => `${(n / 1_000_000).toFixed(1)}M FCFA`;

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const load = useCallback(() => {
    getClubs().then(setClubs).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  return (
    <>
      <p className="eyebrow">Engagement</p>
      <h1 className="page-title">Clubs & Organizations</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {clubs.map((c) => (
          <div key={c.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{c.category} · {c.lead}</div>
              </div>
              <span className={`badge ${c.status === "active" ? "completed" : "pending"}`}>{c.status}</span>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
              <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{c.members}</div><div className="muted" style={{ fontSize: 11 }}>members</div></div>
              <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{xof(c.budgetXof)}</div><div className="muted" style={{ fontSize: 11 }}>budget</div></div>
            </div>
            {c.status === "review" && <button className="primary" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setClubStatus(c.id, "active").then(load)}>Approve</button>}
          </div>
        ))}
      </div>
      {clubs.length === 0 && <p className="muted">No clubs registered.</p>}
    </>
  );
}

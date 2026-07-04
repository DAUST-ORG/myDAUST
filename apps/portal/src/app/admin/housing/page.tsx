"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Hall, type HousingRequest, getHalls, getHousingRequests } from "@/lib/api";
import { type MaintenanceTicket, getMaintenanceTickets } from "@/lib/api-affairs";

export default function AdminHousingPage() {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [requests, setRequests] = useState<HousingRequest[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);

  useEffect(() => {
    getHalls().then(setHalls).catch(() => {});
    getHousingRequests().then(setRequests).catch(() => {});
    getMaintenanceTickets().then(setTickets).catch(() => {});
  }, []);

  const beds = halls.reduce((s, h) => s + h.beds, 0);
  const filled = halls.reduce((s, h) => s + h.filled, 0);
  const occupancyPct = beds === 0 ? 0 : Math.round((filled / beds) * 100);
  const openTickets = tickets.filter((t) => t.status === "open");

  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1 className="page-title">Housing</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Read-only view of residential life. Day-to-day management happens in the Student Affairs portal.
      </p>

      <div className="row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div className="kpi">
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Beds occupied</p>
          <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)" }}>{occupancyPct}%</p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>{filled} of {beds} beds</p>
        </div>
        <div className="kpi">
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Pending assignments</p>
          <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", color: requests.length > 0 ? "var(--daust-orange)" : undefined }}>{requests.length}</p>
          <Link href="/affairs/housing" style={{ fontSize: 12 }}>Manage in Student Affairs →</Link>
        </div>
        <div className="kpi">
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Open maintenance</p>
          <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", color: openTickets.some((t) => t.severity === "high") ? "#b02a37" : undefined }}>{openTickets.length}</p>
          <Link href="/affairs/maintenance" style={{ fontSize: 12 }}>Manage in Student Affairs →</Link>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p className="h1" style={{ fontSize: 16, margin: 0 }}>Hall occupancy</p>
          <Link href="/affairs/housing" style={{ fontSize: 12.5 }}>Manage in Student Affairs →</Link>
        </div>
        {halls.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>No halls configured.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {halls.map((h) => {
              const pct = h.beds === 0 ? 0 : Math.round((h.filled / h.beds) * 100);
              return (
                <div key={h.id}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: h.color ?? "var(--daust-navy)" }} />
                      {h.name}
                      <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{h.kind}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{h.filled}/{h.beds} · {pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--gray-100)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct >= 97 ? "var(--daust-orange)" : (h.color ?? "var(--daust-navy)") }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

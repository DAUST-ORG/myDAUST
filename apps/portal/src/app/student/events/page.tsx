"use client";

import { useEffect, useState } from "react";
import { type CampusEvent, getEvents } from "@/lib/api";

const CAT_COLOR: Record<string, string> = {
  Campus: "var(--daust-navy)",
  Academics: "var(--daust-navy-700)",
  Career: "var(--daust-orange)",
  Sports: "#2e7d52",
  Arts: "#7c3aed",
};

export default function EventsPage() {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  useEffect(() => {
    getEvents().then(setEvents).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Campus life</p>
      <h1 className="page-title">Events</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {events.map((e) => {
          const d = new Date(e.startsAt);
          const color = CAT_COLOR[e.category] ?? "var(--daust-navy)";
          return (
            <div key={e.id} className="card" style={{ display: "flex", gap: 14, padding: 16 }}>
              <div style={{ width: 56, textAlign: "center", flexShrink: 0 }}>
                <div style={{ background: color, color: "#fff", borderRadius: 10, padding: "6px 0", fontFamily: "var(--font-display)" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.85 }}>{d.toLocaleDateString(undefined, { month: "short" })}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: ".06em", textTransform: "uppercase" }}>{e.category}</span>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{e.title}</div>
                {e.description && <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{e.description}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  🕐 {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  {e.location ? ` · 📍 ${e.location}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {events.length === 0 && <p className="muted">No upcoming events.</p>}
    </>
  );
}

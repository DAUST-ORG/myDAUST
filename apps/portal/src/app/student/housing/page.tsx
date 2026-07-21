"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { type MyHousing, getCurrentTerm, getMyHousing } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function StudentHousing() {
  const [h, setH] = useState<MyHousing | null>(null);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyHousing().then(setH).catch((e: Error) => setError(e.message));
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  const subtitle = ["Residential Life", term || null].filter(Boolean).join(" · ");

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!h) return <p className="muted">Loading…</p>;

  if (!h.assigned) {
    return (
      <>
        <PageHeader title="Housing" subtitle={subtitle} />
        <EmptyState
          icon={<Building2 size={22} />}
          title="No housing assignment"
          note="You are not currently assigned a room. Contact student affairs about on-campus accommodation."
        />
      </>
    );
  }

  const fields: [string, string | null][] = [
    ["Building", h.building],
    ["Room", h.room],
    ["Room type", h.kind],
    ["Roommate", h.roommates.length > 0 ? h.roommates.join(", ") : "None assigned"],
    ["Assignment status", h.status],
    ["Note", h.note],
  ];

  return (
    <>
      <PageHeader
        title="Housing"
        subtitle={subtitle}
        actions={<Badge tone={h.status === "assigned" ? "success" : "warning"}>{h.status}</Badge>}
      />

      <div
        style={{
          background: "var(--grad-brand)",
          color: "#fff",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          padding: "34px 26px",
          boxShadow: "var(--shadow-navy)",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>
          Assignment
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginTop: 6 }}>
          {h.building ?? "Campus residence"}
        </div>
        {h.room && <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2 }}>Room {h.room}</div>}
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg3)", fontWeight: 700 }}>
                {label}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 3 }}>
                {value ? value : <span className="muted">—</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

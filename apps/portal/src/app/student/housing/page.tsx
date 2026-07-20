"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { type MyHousing, getMyHousing } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function StudentHousing() {
  const [h, setH] = useState<MyHousing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyHousing().then(setH).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!h) return <p className="muted">Loading…</p>;

  if (!h.assigned) {
    return (
      <>
        <PageHeader eyebrow="Campus" title="Housing" />
        <EmptyState
          icon={<Building2 size={22} />}
          title="No housing assignment"
          note="You are not currently assigned a room. Contact student affairs about on-campus accommodation."
        />
      </>
    );
  }

  const rows: [string, string | null][] = [
    ["Building", h.building],
    ["Room", h.room],
    ["Room type", h.kind],
    ["Roommates", h.roommates.length > 0 ? h.roommates.join(", ") : "None assigned"],
    ["Note", h.note],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Campus"
        title="Housing"
        actions={<Badge tone={h.status === "assigned" ? "success" : "warning"}>{h.status}</Badge>}
      />

      <div
        style={{
          background: "var(--grad-brand)",
          color: "#fff",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          marginBottom: 18,
          boxShadow: "var(--shadow-navy)",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>
          Your assignment
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginTop: 6 }}>
          {h.building ?? "Campus residence"}
        </div>
        {h.room && <div style={{ fontSize: 15, opacity: 0.9, marginTop: 2 }}>Room {h.room}</div>}
      </div>

      <Card title="Details">
        <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13.5 }}>
              <dt className="muted" style={{ margin: 0 }}>{k}</dt>
              <dd style={{ margin: 0, fontWeight: 500, textAlign: "right" }}>
                {v ? v : <span className="muted">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

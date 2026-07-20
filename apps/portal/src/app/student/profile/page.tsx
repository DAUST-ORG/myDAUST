"use client";

import { useEffect, useState } from "react";
import { type MyProfile, getMyProfile } from "@/lib/api";
import { Avatar, Badge, Card, PageHeader, Stat } from "@/components/ui";

/** Turns a camelCase field name into a human label ("preferredName" -> "Preferred name"). */
function humanise(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function DetailCard({
  title,
  fields,
}: {
  title: string;
  fields: Record<string, string | number | null>;
}) {
  const entries = Object.entries(fields);
  return (
    <Card title={title}>
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13.5 }}>
            <dt className="muted" style={{ margin: 0 }}>{humanise(k)}</dt>
            <dd style={{ margin: 0, fontWeight: 500, textAlign: "right" }}>
              {v === null || v === "" ? <span className="muted">—</span> : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default function StudentProfile() {
  const [p, setP] = useState<MyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile().then(setP).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!p) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader eyebrow="Account" title="My profile" />

      <div
        style={{
          background: "var(--grad-brand)",
          color: "#fff",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
          boxShadow: "var(--shadow-navy)",
        }}
      >
        <Avatar name={p.name} size={62} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>{p.name}</div>
          <div style={{ opacity: 0.85, fontSize: 13.5 }}>
            {p.studentNo} · {p.email}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="info">{p.program ?? "No programme"}</Badge>
            <Badge tone="success">{p.standing}</Badge>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <Stat label="Cumulative GPA" value={p.gpa.toFixed(2)} sub={p.standing} />
        <Stat label="Credits earned" value={p.completedCredits} sub="toward the degree" />
        <Stat label="Programme" value={<span style={{ fontSize: 15 }}>{p.program ?? "—"}</span>} />
        <Stat label="Student ID" value={<span style={{ fontSize: 15 }}>{p.studentNo}</span>} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <DetailCard title="Personal details" fields={p.personal} />
        <DetailCard title="Contact" fields={p.contact} />
        <DetailCard title="Academic" fields={p.academic} />
        <DetailCard title="Emergency & health" fields={p.emergency} />
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Your record is maintained by the registrar. Contact them to request a correction.
      </p>
    </>
  );
}

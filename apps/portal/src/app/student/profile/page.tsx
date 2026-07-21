"use client";

import { useEffect, useState } from "react";
import { GraduationCap, HeartPulse, MapPin, User } from "lucide-react";
import { type MyProfile, getMyProfile } from "@/lib/api";
import { Avatar, Card, PageHeader, Tabs } from "@/components/ui";

type FieldMap = Record<string, string | number | null>;

/** "preferredName" -> "Preferred name". */
function humanise(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "personal", label: "Personal" },
  { value: "academic", label: "Academic" },
  { value: "emergency", label: "Emergency & Health" },
];

export default function StudentProfile() {
  const [p, setP] = useState<MyProfile | null>(null);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile().then(setP).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!p) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader title="My Profile" subtitle="Student record" />

      <div
        style={{
          background: "var(--grad-brand)",
          color: "#fff",
          borderRadius: "var(--radius-lg)",
          padding: 26,
          marginBottom: 18,
          boxShadow: "var(--shadow-navy)",
          display: "flex",
          gap: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Avatar name={p.name} size={84} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>{p.name}</h2>
            <span
              style={{
                padding: "3px 11px",
                borderRadius: "var(--radius-pill)",
                background: "rgba(255,255,255,.18)",
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {p.standing}
            </span>
          </div>
          <div style={{ opacity: 0.85, fontSize: 13.5, marginTop: 2 }}>{p.program ?? "No programme"}</div>

          <div style={{ display: "flex", gap: 30, marginTop: 16, flexWrap: "wrap" }}>
            <HeroStat label="Student ID" value={p.studentNo} />
            <HeroStat label="Cum. GPA" value={p.gpa.toFixed(2)} />
            <HeroStat label="Credits" value={`${p.completedCredits} earned`} />
            <HeroStat label="Email" value={p.email} />
          </div>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
          <RecordCard icon={<User size={15} />} title="Personal" fields={p.personal} />
          <RecordCard icon={<GraduationCap size={15} />} title="Academic" fields={p.academic} />
          <RecordCard icon={<MapPin size={15} />} title="Contact & residence" fields={p.contact} />
          <RecordCard icon={<HeartPulse size={15} />} title="Emergency & health" fields={p.emergency} />
        </div>
      )}

      {tab === "personal" && <DetailCard title="Personal Information" fields={p.personal} />}
      {tab === "academic" && <DetailCard title="Academic Information" fields={p.academic} />}
      {tab === "emergency" && <DetailCard title="Emergency & Health" fields={p.emergency} />}

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Your record is maintained by the registrar. Contact them to request a correction.
      </p>
    </>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.65, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function RecordCard({ icon, title, fields }: { icon: React.ReactNode; title: string; fields: FieldMap }) {
  return (
    <Card
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--daust-navy)" }}>{icon}</span>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700 }}>{title}</h3>
        </div>
      }
    >
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
        {Object.entries(fields).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13.5 }}>
            <dt className="muted" style={{ margin: 0 }}>{humanise(k)}</dt>
            <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>
              {v === null || v === "" ? <span className="muted">—</span> : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function DetailCard({ title, fields }: { title: string; fields: FieldMap }) {
  return (
    <Card title={title}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
        {Object.entries(fields).map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg3)", fontWeight: 700 }}>
              {humanise(k)}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 3 }}>
              {v === null || v === "" ? <span className="muted">—</span> : String(v)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

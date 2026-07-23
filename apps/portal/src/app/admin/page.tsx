"use client";

import { useEffect, useState } from "react";
import { type AdminStats, getAdminStats, getCurrentTerm } from "@/lib/api";
import { Stat } from "@/components/ui";

/**
 * Registrar dashboard, per the SIS design's `roleDashes.admin`: enrollment and
 * academic operations only. Money KPIs deliberately live in the bursar's portal —
 * a plain registrar cannot read the finance endpoints anyway.
 */
export default function RegistrarDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminStats().then(setStats).catch((e: Error) => setError(e.message));
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  const programs = (stats?.byProgram ?? []).filter((p) => p.students > 0);
  const dash = (v: number | undefined) => (v === undefined ? "—" : String(v));

  return (
    <>
      <p className="eyebrow">{term ? `Operations · ${term}` : "Operations"}</p>
      <h1 className="page-title">Registrar Dashboard</h1>
      <p className="muted" style={{ marginBottom: 22 }}>Enrollment and academic operations at a glance.</p>

      {error && (
        <div className="card" style={{ marginBottom: 18, color: "var(--danger)" }}>
          Could not load dashboard figures — {error}
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <Stat label="Total enrollment" value={dash(stats?.totalStudents)} sub="active students" />
        <Stat label="Programs" value={dash(programs.length)} sub="with enrollment" />
        <Stat label="Accounts with holds" value={dash(stats?.holdsCount)} sub="unpaid balance" tone="var(--daust-orange)" />
        <Stat label="Applications" value={dash(stats?.openApplications)} sub="in pipeline" />
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16, marginBottom: 2 }}>Enrollment by program</p>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 18px" }}>{term ? `${term} headcount` : "Headcount"}</p>
        {programs.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No programs carry enrollment yet.</p>}
        {programs.map((p) => (
          <div
            key={p.code}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 8px", borderBottom: "1px solid var(--divider)" }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg-tint)", color: "var(--daust-navy)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {p.code.slice(0, 2).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{p.code}</div>
            </div>
            <span className="badge pending">{p.students}</span>
          </div>
        ))}
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type AdminStats,
  type Admissions,
  type CollectionSummary,
  type DirectorOverview,
  getAdmissions,
  getAdminStats,
  getAdminSummary,
  getDirectorOverview,
  getMe,
} from "@/lib/api";
import { formatXof } from "@/lib/format";

export default function AdminDashboard() {
  const [name, setName] = useState("");
  const [fin, setFin] = useState<CollectionSummary | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [dir, setDir] = useState<DirectorOverview | null>(null);
  const [adm, setAdm] = useState<Admissions | null>(null);

  useEffect(() => {
    getMe().then((m) => setName(m.name)).catch(() => {});
    getAdminSummary().then(setFin).catch(() => {});
    getAdminStats().then(setStats).catch(() => {});
    getDirectorOverview().then(setDir).catch(() => {});
    getAdmissions().then(setAdm).catch(() => {});
  }, []);

  const openApps = adm?.funnel
    .filter((f) => !["accepted", "rejected"].includes(f.stage))
    .reduce((s, f) => s + f.count, 0);

  return (
    <>
      <p className="eyebrow">Operations overview</p>
      <h1 className="page-title">Welcome back, {name || "Director"}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>How DAUST is running today.</p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Total enrollment</div><div className="value">{stats?.totalStudents ?? "—"}</div><div className="trend">students</div></div>
        <div className="kpi"><div className="label">Tuition collected</div><div className="value">{fin ? formatXof(fin.collected) : "—"}</div><div className="trend up">{fin?.collectionRate ?? 0}% of billed</div></div>
        <div className="kpi"><div className="label">Outstanding fees</div><div className="value">{fin ? formatXof(fin.outstanding) : "—"}</div><div className="trend down">to collect</div></div>
        <div className="kpi"><div className="label">Open applications</div><div className="value">{openApps ?? "—"}</div><div className="trend">in pipeline</div></div>
        <div className="kpi"><div className="label">Money out (FY)</div><div className="value">{dir ? formatXof(dir.totals.moneyOut) : "—"}</div><div className="trend down">expenses</div></div>
        <div className="kpi"><div className="label">Cash position</div><div className="value" style={{ color: (dir?.totals.cashPosition ?? 0) >= 0 ? "var(--success)" : "var(--danger)" }}>{dir ? formatXof(dir.totals.cashPosition) : "—"}</div><div className="trend">in − out</div></div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: "1 1 320px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <p className="h1" style={{ fontSize: 16 }}>Money in vs out — by division</p>
            <span style={{ flex: 1 }} />
            <Link href="/admin/finance/director">Details →</Link>
          </div>
          <table>
            <thead><tr><th>Division</th><th>In</th><th>Out</th></tr></thead>
            <tbody>
              {(dir?.groups ?? []).filter((g) => g.revenue || g.expense).map((g) => (
                <tr key={g.code}>
                  <td>{g.name}</td>
                  <td style={{ color: "var(--success)" }}>{formatXof(g.revenue)}</td>
                  <td style={{ color: "var(--danger)" }}>{formatXof(g.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ flex: "1 1 320px" }}>
          <p className="h1" style={{ fontSize: 16 }}>Enrollment by program</p>
          <table>
            <thead><tr><th>Program</th><th>Code</th><th>Students</th></tr></thead>
            <tbody>
              {(stats?.byProgram ?? []).map((p) => (
                <tr key={p.code}><td>{p.name}</td><td>{p.code}</td><td>{p.students}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

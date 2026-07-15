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
import { CalendarPlus, FileBarChart2, type LucideIcon, Megaphone, Receipt, UserCog, UserPlus } from "lucide-react";
import { formatXof, formatXofCompact } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { Donut } from "@/components/Donut";

const QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/students", label: "Enroll student", icon: UserPlus },
  { href: "/admin/finance/links", label: "Create invoice", icon: Receipt },
  { href: "/admin/announcements", label: "Post announcement", icon: Megaphone },
  { href: "/admin/programs", label: "Schedule course", icon: CalendarPlus },
  { href: "/admin/reports", label: "Run report", icon: FileBarChart2 },
  { href: "/admin/settings", label: "Manage roles", icon: UserCog },
];

function QuickAction({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="lift"
      style={{
        flex: "1 1 150px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        alignItems: "flex-start",
        padding: "15px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--bg-tint)", color: "var(--daust-navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg1)" }}>{label}</span>
    </Link>
  );
}

const DIVISION_COLORS = ["#153b6a", "#ed8425", "#1d4a82", "#2e7d52", "#9da6ae", "#c4660f"];

/* Illustrative 6-point cumulative trend derived from a single total. */
const trendSeries = (total: number) =>
  [0.16, 0.31, 0.49, 0.64, 0.83, 1].map((f) => Math.round(total * f));

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

  const expenseGroups = (dir?.groups ?? []).filter((g) => g.expense > 0);
  const expenseSegments = expenseGroups.map((g, i) => ({
    value: g.expense,
    color: DIVISION_COLORS[i % DIVISION_COLORS.length]!,
    label: g.name,
  }));

  return (
    <>
      <p className="eyebrow">Operations overview</p>
      <h1 className="page-title">Welcome back, {name || "Director"}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>How DAUST is running today.</p>

      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Quick actions</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {QUICK_ACTIONS.map((a) => (
          <QuickAction key={a.href} {...a} />
        ))}
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Total enrollment</div><div className="value">{stats?.totalStudents ?? "—"}</div><div className="trend">students</div></div>
        <div className="kpi">
          <div className="label">Tuition collected</div>
          <div className="value">{fin ? formatXofCompact(fin.collected) : "—"}</div>
          <div className="trend up">{fin?.collectionRate ?? 0}% of billed</div>
          {fin && fin.collected > 0 && (
            <div style={{ marginTop: 8 }} title="Trend illustration — cumulative to date">
              <Sparkline data={trendSeries(fin.collected)} color="#2e7d52" />
              <div className="muted" style={{ fontSize: 10 }}>trend illustration</div>
            </div>
          )}
        </div>
        <div className="kpi"><div className="label">Outstanding fees</div><div className="value">{fin ? formatXofCompact(fin.outstanding) : "—"}</div><div className="trend down">to collect</div></div>
        <div className="kpi"><div className="label">Open applications</div><div className="value">{openApps ?? "—"}</div><div className="trend">in pipeline</div></div>
        <div className="kpi">
          <div className="label">Money out (FY)</div>
          <div className="value">{dir ? formatXofCompact(dir.totals.moneyOut) : "—"}</div>
          <div className="trend down">expenses</div>
          {dir && dir.totals.moneyOut > 0 && (
            <div style={{ marginTop: 8 }} title="Trend illustration — cumulative to date">
              <Sparkline data={trendSeries(dir.totals.moneyOut)} color="var(--danger)" />
              <div className="muted" style={{ fontSize: 10 }}>trend illustration</div>
            </div>
          )}
        </div>
        <div className="kpi"><div className="label">Cash position</div><div className="value" style={{ color: (dir?.totals.cashPosition ?? 0) >= 0 ? "var(--success)" : "var(--danger)" }}>{dir ? formatXofCompact(dir.totals.cashPosition) : "—"}</div><div className="trend">in − out</div></div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: "1 1 320px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <p className="h1" style={{ fontSize: 16 }}>Money in vs out — by division</p>
            <span style={{ flex: 1 }} />
            <Link href="/admin/finance/director">Details →</Link>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <table style={{ flex: "1 1 260px" }}>
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
            {expenseSegments.length > 0 && (
              <div style={{ flex: "0 0 auto", paddingTop: 8 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Expense share</div>
                <Donut
                  segments={expenseSegments}
                  centerLabel={dir ? formatXofCompact(dir.totals.moneyOut) : ""}
                  centerSub="out (FY)"
                />
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {expenseSegments.map((s) => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <span style={{ color: "var(--fg2)" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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

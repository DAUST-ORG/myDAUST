"use client";

import { useEffect, useState } from "react";
import { type FinanceReports, getFinanceReports } from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <p className="h1" style={{ fontSize: 15 }}>{title}</p>
      {children}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 110, fontSize: 12, color: "var(--fg3)", textTransform: "capitalize" }}>{r.label}</span>
          <div style={{ flex: 1, background: "var(--gray-100)", borderRadius: 6, height: 18, overflow: "hidden" }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: "var(--daust-navy)" }} />
          </div>
          <span style={{ width: 120, textAlign: "right", fontSize: 12, fontWeight: 600 }}>{xof(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [r, setR] = useState<FinanceReports | null>(null);
  useEffect(() => {
    getFinanceReports().then(setR).catch(() => {});
  }, []);

  if (!r) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Management reporting</p>
      <h1 className="page-title">Reports</h1>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Money in (FY)</div><div className="value" style={{ fontSize: 22 }}>{xof(r.totals.moneyIn)}</div></div>
        <div className="kpi"><div className="label">Money out (FY)</div><div className="value" style={{ fontSize: 22 }}>{xof(r.totals.moneyOut)}</div></div>
        <div className="kpi"><div className="label">Net position</div><div className="value" style={{ fontSize: 22 }}>{xof(r.totals.net)}</div></div>
        <div className="kpi"><div className="label">Outstanding A/R</div><div className="value" style={{ fontSize: 22 }}>{xof(r.aging.totalOutstanding)}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
        <Card title="1 · Tuition collections">
          <Bars rows={[{ label: "Billed", value: r.collections.billed }, { label: "Collected", value: r.collections.collected }, { label: "Outstanding", value: r.collections.outstanding }]} />
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Collection rate: {r.collections.collectionRate}%</p>
        </Card>

        <Card title="2 · A/R aging">
          <table>
            <thead><tr><th>Bucket</th><th>Accounts</th><th>Outstanding</th></tr></thead>
            <tbody>
              {r.aging.buckets.map((b) => (
                <tr key={b.key}><td>{b.label}</td><td>{b.count}</td><td>{xof(b.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="3 · Payments by method">
          <Bars rows={r.paymentsByMethod.map((m) => ({ label: m.method, value: m.amount }))} />
        </Card>

        <Card title="4 · Revenue by term">
          <Bars rows={r.revenueByTerm.map((t) => ({ label: t.term, value: t.amount }))} />
        </Card>

        <Card title="5 · Cash by cost center">
          <table>
            <thead><tr><th>Center</th><th>Revenue</th><th>Expense</th><th>Net</th></tr></thead>
            <tbody>
              {r.cashByCostCenter.map((c) => (
                <tr key={c.code}><td>{c.name}</td><td>{xof(c.revenue)}</td><td>{xof(c.expense)}</td><td>{xof(c.net)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="6 · Budget vs actual">
          <table>
            <thead><tr><th>Center</th><th>Allocated</th><th>Spent</th><th>%</th></tr></thead>
            <tbody>
              {r.budgetVsActual.map((b) => (
                <tr key={b.code}><td>{b.name}</td><td>{xof(b.allocated)}</td><td>{xof(b.spent)}</td><td>{b.pct}%</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="7 · Invoices by status">
          <table>
            <thead><tr><th>Status</th><th>Count</th></tr></thead>
            <tbody>
              {r.collections.invoicesByStatus.map((s) => (
                <tr key={s.status}><td style={{ textTransform: "capitalize" }}>{s.status}</td><td>{s.count}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="8 · Recent payments">
          <table>
            <thead><tr><th>Student</th><th>Method</th><th>Amount</th></tr></thead>
            <tbody>
              {r.recentPayments.map((p) => (
                <tr key={p.id}><td>{p.student}</td><td>{p.method}</td><td>{xof(p.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

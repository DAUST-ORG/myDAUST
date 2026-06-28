"use client";

import { useEffect, useState } from "react";
import {
  type AdminPayment,
  type CollectionSummary,
  getAdminPayments,
  getAdminSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { formatDate, formatXof } from "@/lib/format";

export default function BursarPage() {
  const { me, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me) return;
    Promise.all([getAdminSummary(), getAdminPayments()])
      .then(([s, p]) => {
        setSummary(s);
        setPayments(p);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [me]);

  if (authLoading || (me && loading)) return <main className="container">Loading…</main>;
  if (!me) return <main className="container">Redirecting…</main>;
  if (error)
    return (
      <main className="container">
        <p className="card" style={{ color: "var(--bad)" }}>Error: {error}</p>
      </main>
    );

  return (
    <main className="container">
      <p className="h1">Payment tracking</p>

      {summary && (
        <>
          <div className="row">
            <div className="kpi"><div className="label">Billed</div><div className="value">{formatXof(summary.billed)}</div></div>
            <div className="kpi"><div className="label">Collected</div><div className="value">{formatXof(summary.collected)}</div></div>
            <div className="kpi"><div className="label">Outstanding</div><div className="value">{formatXof(summary.outstanding)}</div></div>
            <div className="kpi"><div className="label">Collection rate</div><div className="value">{summary.collectionRate}%</div></div>
          </div>

          {summary.byMethod.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <p className="muted" style={{ fontWeight: 600 }}>Collected by method</p>
              <table>
                <thead><tr><th>Method</th><th>Payments</th><th>Amount</th></tr></thead>
                <tbody>
                  {summary.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td>{m.method}</td>
                      <td>{m.count}</td>
                      <td>{formatXof(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card">
        <p className="muted" style={{ fontWeight: 600 }}>All payments</p>
        {payments.length === 0 ? (
          <p className="muted">No payments yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Student</th><th>Term</th><th>Amount</th><th>Method</th><th>Status</th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{p.student}<br /><span className="muted" style={{ fontSize: 12 }}>{p.studentNo}</span></td>
                  <td>{p.term}</td>
                  <td>{formatXof(p.amount)}</td>
                  <td>{p.method}</td>
                  <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

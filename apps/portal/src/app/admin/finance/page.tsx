"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AdminPayment,
  type CollectionSummary,
  type OverdueRow,
  getAdminPayments,
  getAdminSummary,
  getOverdue,
  reconcilePayments,
  refundPayment,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";

const STATUSES = ["all", "success", "pending", "failed", "cancelled", "refunded"];

export default function AdminFinancePage() {
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);
  const [status, setStatus] = useState("all");
  const [note, setNote] = useState<string | null>(null);

  const loadPayments = useCallback((s: string) => {
    getAdminPayments(s === "all" ? undefined : s).then(setPayments).catch(() => {});
  }, []);

  useEffect(() => {
    getAdminSummary().then(setSummary).catch(() => {});
    getOverdue().then(setOverdue).catch(() => {});
    loadPayments(status);
  }, [loadPayments, status]);

  function exportCsv() {
    const header = "date,student,studentNo,term,amount_xof,method,status,ref";
    const lines = payments.map((p) =>
      [p.createdAt, p.student, p.studentNo, p.term, p.amount, p.method, p.status, p.providerRef]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${status}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function reconcile() {
    setNote(null);
    const { reconciled } = await reconcilePayments();
    setNote(`Reconciled ${reconciled} stale pending payment(s).`);
    loadPayments(status);
  }

  async function refund(id: string) {
    setNote(null);
    try {
      const res = await refundPayment(id, "Admin-initiated refund");
      setNote(`Refunded ${formatXof(res.refundedAmount)}${res.gatewayRefund ? " (gateway confirmed)" : " (recorded internally)"}.`);
      getAdminSummary().then(setSummary).catch(() => {});
      loadPayments(status);
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1 className="page-title">Finance — collections</h1>

      {summary && (
        <div className="kpi-grid">
          <div className="kpi"><div className="label">Billed</div><div className="value">{formatXof(summary.billed)}</div></div>
          <div className="kpi"><div className="label">Collected</div><div className="value">{formatXof(summary.collected)}</div><div className="trend up">{summary.collectionRate}%</div></div>
          <div className="kpi"><div className="label">Outstanding</div><div className="value">{formatXof(summary.outstanding)}</div><div className="trend down">to collect</div></div>
          <div className="kpi"><div className="label">Overdue installments</div><div className="value">{overdue.length}</div><div className="trend down">{formatXof(overdue.reduce((s, o) => s + o.outstanding, 0))}</div></div>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="card">
          <p className="h1" style={{ fontSize: 16 }}>Overdue installments</p>
          <table>
            <thead><tr><th>Student</th><th>Term</th><th>#</th><th>Due</th><th>Outstanding</th></tr></thead>
            <tbody>
              {overdue.map((o) => (
                <tr key={o.installmentId}>
                  <td>{o.student}<br /><span className="muted" style={{ fontSize: 12 }}>{o.studentNo}</span></td>
                  <td>{o.term}</td>
                  <td>{o.sequence}</td>
                  <td>{formatDate(o.dueDate)}</td>
                  <td><span className="badge overdue">{formatXof(o.outstanding)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <p className="h1" style={{ fontSize: 16, margin: 0 }}>Payments</p>
          <span style={{ flex: 1 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={exportCsv}>Export CSV</button>
          <button onClick={reconcile}>Reconcile</button>
        </div>
        {note && <p className="muted">{note}</p>}
        {payments.length === 0 ? (
          <p className="muted">No payments.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Student</th><th>Term</th><th>Amount</th><th>Method</th><th>Status</th><th /></tr>
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
                  <td>{p.status === "success" && <button onClick={() => refund(p.id)} style={{ fontSize: 12 }}>Refund</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

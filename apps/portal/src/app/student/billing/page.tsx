"use client";

import { useEffect, useState } from "react";
import { type BillingInvoice, getMyBilling, initiatePayment } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { formatDate, formatXof } from "@/lib/format";

const METHODS = [
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "card", label: "Bank card" },
];

export default function BillingPage() {
  const { me, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!me) return;
    getMyBilling()
      .then(setInvoices)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [me]);

  if (authLoading || (me && loading)) return <main>Loading…</main>;
  if (!me) return <main>Redirecting…</main>;
  if (error)
    return (
      <main>
        <p className="card" style={{ color: "var(--bad)" }}>Error: {error}</p>
      </main>
    );

  return (
    <main>
      <p className="h1">Billing & payments</p>
      {invoices.length === 0 && <p className="card muted">No invoices yet.</p>}
      {invoices.map((inv) => (
        <InvoiceCard key={inv.id} invoice={inv} />
      ))}
    </main>
  );
}

function InvoiceCard({ invoice }: { invoice: BillingInvoice }) {
  const [amount, setAmount] = useState<number>(
    invoice.installments.find((i) => i.status !== "paid")?.amountDue ?? invoice.balance,
  );
  const [method, setMethod] = useState("wave");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pct = invoice.total === 0 ? 0 : Math.round((invoice.paid / invoice.total) * 100);

  async function pay() {
    setBusy(true);
    setErr(null);
    try {
      const { redirectUrl } = await initiatePayment(invoice.id, amount, method);
      window.location.href = redirectUrl; // hand off to PayTech checkout
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <p className="h1" style={{ fontSize: 18 }}>Tuition — {invoice.term}</p>
        <span className={`badge ${invoice.status}`}>{invoice.status}</span>
      </div>

      <div className="row" style={{ margin: "12px 0" }}>
        <div className="kpi"><div className="label">Total</div><div className="value">{formatXof(invoice.total)}</div></div>
        <div className="kpi"><div className="label">Paid</div><div className="value">{formatXof(invoice.paid)}</div></div>
        <div className="kpi"><div className="label">Balance</div><div className="value">{formatXof(invoice.balance)}</div></div>
      </div>
      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
      <p className="muted" style={{ fontSize: 13 }}>{pct}% paid</p>

      {invoice.installments.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 14, fontWeight: 600 }}>Payment schedule</p>
          <table>
            <thead>
              <tr><th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Status</th></tr>
            </thead>
            <tbody>
              {invoice.installments.map((i) => (
                <tr key={i.id}>
                  <td>{i.sequence}</td>
                  <td>{formatDate(i.dueDate)}</td>
                  <td>{formatXof(i.amountDue)}</td>
                  <td>{formatXof(i.amountPaid)}</td>
                  <td><span className={`badge ${i.status}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {invoice.balance > 0 && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            value={amount}
            min={1}
            max={invoice.balance}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ width: 160 }}
          />
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button className="primary" disabled={busy || amount <= 0 || amount > invoice.balance} onClick={pay}>
            {busy ? "Redirecting…" : `Pay ${formatXof(amount)}`}
          </button>
          {err && <span style={{ color: "var(--bad)" }}>{err}</span>}
        </div>
      )}

      {invoice.payments.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 16, fontWeight: 600 }}>Payment history</p>
          <table>
            <thead>
              <tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr>
            </thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{formatXof(p.amount)}</td>
                  <td>{p.method}</td>
                  <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

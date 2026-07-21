"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type BillingInvoice,
  type MyProfile,
  getCurrentTerm,
  getMyBilling,
  getMyProfile,
  initiatePayment,
} from "@/lib/api";
import { Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { formatDate, formatXof } from "@/lib/format";

const METHODS = [
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "card", label: "Bank card" },
];

interface ChargeRow {
  id: string;
  invoiceId: string;
  description: string;
  note: string;
  amount: number;
  outstanding: number;
  dueDate: string;
  status: string;
}

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  if (status === "paid") return { bg: "rgba(46,125,82,.12)", fg: "#1f6b42", label: "Paid" };
  if (status === "overdue") return { bg: "rgba(192,57,43,.10)", fg: "var(--error-500)", label: "Overdue" };
  if (status === "partial") return { bg: "rgba(237,132,37,.14)", fg: "#a85f16", label: "Partial" };
  return { bg: "rgba(237,132,37,.14)", fg: "#a85f16", label: "Due" };
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [term, setTerm] = useState("");
  const [method, setMethod] = useState("wave");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMyBilling()
      .then(setInvoices)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
    getMyProfile().then(setProfile).catch(() => {});
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  const charges: ChargeRow[] = useMemo(
    () =>
      invoices
        .flatMap((inv) =>
          inv.installments.map<ChargeRow>((i) => ({
            id: i.id,
            invoiceId: inv.id,
            description: `Installment ${i.sequence} — ${inv.term}`,
            note: `Installment ${i.sequence} of ${inv.installments.length}`,
            amount: i.amountDue,
            outstanding: i.amountDue - i.amountPaid,
            dueDate: i.dueDate,
            status: i.status,
          })),
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [invoices],
  );

  const balance = invoices.reduce((s, i) => s + i.balance, 0);
  const nextCharge = charges.find((c) => c.outstanding > 0);
  const settled = balance <= 0;

  async function pay() {
    if (!nextCharge) return;
    setBusy(true);
    setError(null);
    try {
      const { redirectUrl } = await initiatePayment(nextCharge.invoiceId, nextCharge.outstanding, method);
      window.location.href = redirectUrl; // hand off to PayTech checkout
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Billing & Financials"
        subtitle={[term || null, profile ? `Account ${profile.studentNo}` : null].filter(Boolean).join(" · ")}
      />

      {error && <p className="card" style={{ color: "var(--error-500)" }}>{error}</p>}

      {loaded && invoices.length === 0 ? (
        <EmptyState title="No invoices yet" note="Charges appear here once the bursar issues them." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(0, 1.6fr)", gap: 18, alignItems: "start" }}>
          <div
            style={{
              background: "var(--grad-brand)",
              color: "#fff",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              boxShadow: "var(--shadow-navy)",
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.8 }}>Current balance</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, marginTop: 4 }}>
              {formatXof(balance)}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, color: settled ? "rgba(180,240,200,.9)" : "#ffb3a8" }}>
              {settled
                ? "Account settled — thank you"
                : nextCharge
                  ? `${nextCharge.note} due`
                  : "Payment outstanding"}
            </div>

            {!settled && nextCharge && (
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <Select value={method} onChange={setMethod} options={METHODS} style={{ width: "100%" }} />
                <button
                  disabled={busy}
                  onClick={pay}
                  style={{
                    width: "100%",
                    padding: "11px 18px",
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid transparent",
                    background: "var(--daust-orange)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13.5,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? "Redirecting…" : `Pay ${formatXof(nextCharge.outstanding)}`}
                </button>
              </div>
            )}

            <div style={{ borderTop: "1px solid rgba(255,255,255,.2)", margin: "18px 0 12px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ opacity: 0.8 }}>Next due date</span>
              <strong>{nextCharge ? formatDate(nextCharge.dueDate) : "—"}</strong>
            </div>
            <p style={{ fontSize: 11, opacity: 0.7, margin: "12px 0 0" }}>
              {charges.length > 0
                ? `${charges.length} installments · ${formatXof(charges.reduce((s, c) => s + c.amount, 0))} total`
                : "No payment plan on this account."}
            </p>
          </div>

          <Card pad={false}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,2fr) 130px 120px 90px",
                gap: 12,
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
              }}
            >
              <span>Description</span>
              <span style={{ textAlign: "right" }}>Amount</span>
              <span style={{ textAlign: "right" }}>Due</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>
            {charges.map((c, i) => {
              const s = statusStyle(c.status);
              return (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,2fr) 130px 120px 90px",
                    gap: 12,
                    alignItems: "center",
                    padding: "13px 18px",
                    borderBottom: i < charges.length - 1 ? "1px solid var(--divider)" : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.description}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{c.note}</div>
                  </div>
                  <span style={{ textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                    {formatXof(c.amount)}
                  </span>
                  <span className="muted" style={{ textAlign: "right", fontSize: 12.5 }}>
                    {formatDate(c.dueDate)}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: s.bg,
                        color: s.fg,
                      }}
                    >
                      {s.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </>
  );
}

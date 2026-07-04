"use client";

import { PLAN_TEMPLATES, splitEvenXof } from "@mydaust/shared";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type AccountInvoice,
  type StudentAccount,
  createPaymentLink,
  createPaymentPlan,
  getStudentAccount,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";

export default function StudentAccountPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [acct, setAcct] = useState<StudentAccount | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    getStudentAccount(id).then(setAcct).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, [id]);
  useEffect(load, [load]);

  if (!acct) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Student account</p>
      <h1 className="page-title">{acct.student.name}</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        {acct.student.studentNo} · {acct.student.program} · {acct.student.email}
      </p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Billed</div><div className="value">{formatXof(acct.totals.billed)}</div></div>
        <div className="kpi"><div className="label">Paid</div><div className="value">{formatXof(acct.totals.paid)}</div></div>
        <div className="kpi"><div className="label">Balance</div><div className="value">{formatXof(acct.totals.balance)}</div></div>
      </div>

      {msg && <p className="card" style={{ color: msg.kind === "ok" ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>}

      <LinkQuickCreate studentId={id} acct={acct} onDone={(m) => setMsg(m)} />

      {acct.invoices.map((inv) => (
        <InvoiceBlock key={inv.id} inv={inv} onChange={(m) => { setMsg(m); load(); }} />
      ))}
    </>
  );
}


/** One-click payment link for this student: prefilled, tied to their open invoice so the
 * money allocates to installments like any tuition payment. URL is copied on create. */
function LinkQuickCreate({
  studentId,
  acct,
  onDone,
}: {
  studentId: string;
  acct: StudentAccount;
  onDone: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const openInvoice = acct.invoices.find((i) => i.balance > 0);
  const [amount, setAmount] = useState(String(openInvoice?.balance ?? ""));
  const [purpose, setPurpose] = useState(openInvoice ? `Tuition payment — ${openInvoice.term}` : "Payment");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const link = await createPaymentLink({
        payeeName: acct.student.name,
        payeeMeta: `${acct.student.studentNo} · ${acct.student.program}`,
        studentId,
        invoiceId: openInvoice && Number(amount) <= openInvoice.balance ? openInvoice.id : undefined,
        amountXof: Number(amount),
        purpose,
      });
      await navigator.clipboard.writeText(link.url).catch(() => {});
      setUrl(link.url);
      onDone({ kind: "ok", text: "Payment link created and copied — share it with the student or a parent." });
    } catch (e) {
      onDone({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p className="h1" style={{ fontSize: 16, margin: 0 }}>Send a payment link</p>
        <span className="muted" style={{ fontSize: 12 }}>
          {openInvoice ? `allocates to ${openInvoice.term} installments` : "no open invoice — records as standalone revenue"}
        </span>
        <span style={{ flex: 1 }} />
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 140 }} placeholder="Amount XOF" />
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ width: 260 }} />
        <button className="primary" disabled={busy || !amount || Number(amount) <= 0} onClick={create}>
          {busy ? "Creating…" : "Create + copy link"}
        </button>
      </div>
      {url && <p className="muted" style={{ fontSize: 12.5, marginTop: 8, wordBreak: "break-all" }}>{url} — <a href={url} target="_blank" rel="noreferrer">open</a> · manage under Finance → Payment Links</p>}
    </div>
  );
}

function InvoiceBlock({
  inv,
  onChange,
}: {
  inv: AccountInvoice;
  onChange: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <p className="h1" style={{ fontSize: 17 }}>Tuition — {inv.term}</p>
        <span className={`badge ${inv.status}`}>{inv.status}</span>
        <span style={{ flex: 1 }} />
        <span className="muted">{formatXof(inv.paid)} / {formatXof(inv.total)}</span>
      </div>

      {inv.installments.length > 0 ? (
        <table>
          <thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>
            {inv.installments.map((i) => (
              <tr key={i.id}>
                <td>{i.sequence}</td><td>{formatDate(i.dueDate)}</td>
                <td>{formatXof(i.amountDue)}</td><td>{formatXof(i.amountPaid)}</td>
                <td><span className={`badge ${i.status}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <PlanForm invoiceId={inv.id} total={inv.total} onChange={onChange} />
      )}

      {inv.payments.length > 0 && (
        <>
          <p className="muted" style={{ fontWeight: 600, marginTop: 14 }}>Payments</p>
          <table>
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt)}</td><td>{formatXof(p.amount)}</td>
                  <td>{p.method}</td><td><span className={`badge ${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

interface Row {
  dueDate: string;
  amount: number;
}

function PlanForm({
  invoiceId,
  total,
  onChange,
}: {
  invoiceId: string;
  total: number;
  onChange: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);

  function generate(parts = count, dueMonthDays?: readonly string[] | null) {
    const amounts = splitEvenXof(total, parts);
    const now = new Date();
    // Official anchors ("enrolment" = today; "MM-DD" lands on the next occurrence of that date).
    const anchored = (i: number): string => {
      const spec = dueMonthDays?.[i];
      if (!spec || spec === "enrolment") {
        return spec === "enrolment"
          ? now.toISOString().slice(0, 10)
          : new Date(now.getFullYear(), now.getMonth() + i + 1, 15).toISOString().slice(0, 10);
      }
      const [mm, dd] = spec.split("-").map(Number);
      const d = new Date(now.getFullYear(), mm! - 1, dd);
      if (d.getTime() < now.getTime()) d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    };
    setRows(amounts.map((amount, i) => ({ dueDate: anchored(i), amount })));
    setCount(parts);
  }

  const sum = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  async function save() {
    setBusy(true);
    try {
      await createPaymentPlan(
        invoiceId,
        rows.map((r, i) => ({ sequence: i + 1, dueDate: r.dueDate, amount: Number(r.amount) })),
      );
      onChange({ kind: "ok", text: "Payment plan created." });
    } catch (e) {
      const m = (e as Error).message.match(/"message":"([^"]+)"/);
      onChange({ kind: "err", text: m ? m[1]! : (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <p className="muted" style={{ fontSize: 13 }}>
        No payment plan. Configure an installment schedule (must total {formatXof(total)}).
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <label className="muted" style={{ fontSize: 13 }}>Template</label>
        <select defaultValue="" onChange={(e) => { const t = PLAN_TEMPLATES.find((x) => x.key === e.target.value); if (t) generate(t.installments, t.dueMonthDays); }}>
          <option value="" disabled>Pick a template…</option>
          {PLAN_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>or</span>
        <label className="muted" style={{ fontSize: 13 }}>Installments</label>
        <input type="number" min={1} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 70 }} />
        <button onClick={() => generate()}>Generate schedule</button>
      </div>
      {rows.length > 0 && (
        <>
          <table>
            <thead><tr><th>#</th><th>Due date</th><th>Amount (XOF)</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><input type="date" value={r.dueDate} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))} /></td>
                  <td><input type="number" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))} style={{ width: 140 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <span className={sum === total ? "badge paid" : "badge overdue"}>
              Total {formatXof(sum)} {sum === total ? "✓" : `(needs ${formatXof(total)})`}
            </span>
            <button className="primary" disabled={busy || sum !== total} onClick={save}>
              {busy ? "Saving…" : "Create plan"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

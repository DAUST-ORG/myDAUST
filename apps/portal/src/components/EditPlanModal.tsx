"use client";

import { useState } from "react";
import { type AccountInvoice, updatePaymentPlan } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Modal } from "@/components/ui";

interface EditRow {
  id: string;
  sequence: number;
  dueDate: string; // yyyy-mm-dd
  amountDue: number;
  amountPaid: number;
}

/**
 * Per-student payment-plan editor: change each installment's amount + due date.
 * The invoice total (and balance) follow the installment sum, so lowering an
 * installment lowers what the student owes. Shared by the finance account page
 * and the student profile Finance tab.
 */
export function EditPlanModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: AccountInvoice;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [rows, setRows] = useState<EditRow[]>(() =>
    invoice.installments.map((i) => ({
      id: i.id,
      sequence: i.sequence,
      dueDate: i.dueDate.slice(0, 10),
      amountDue: i.amountDue,
      amountPaid: i.amountPaid,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const newTotal = rows.reduce((s, r) => s + (r.amountDue || 0), 0);
  const newBalance = newTotal - invoice.paid;
  const label = invoice.description ?? `${invoice.term} tuition`;

  function setAmount(id: string, v: string) {
    const n = Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, amountDue: n } : r)));
  }
  function setDue(id: string, v: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, dueDate: v } : r)));
  }

  async function save() {
    setErr(null);
    const bad = rows.find((r) => r.amountDue < r.amountPaid);
    if (bad) {
      setErr(`Installment ${bad.sequence} already has ${formatXof(bad.amountPaid)} paid — its amount can't be lower.`);
      return;
    }
    setBusy(true);
    try {
      await updatePaymentPlan(
        invoice.id,
        rows.map((r) => ({ id: r.id, dueDate: r.dueDate, amountDue: r.amountDue })),
      );
      onSaved(
        `Payment plan updated — new balance ${newBalance < 0 ? `${formatXof(-newBalance)} credit` : formatXof(newBalance)}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the plan.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Edit payment plan"
      width={560}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button
            onClick={save}
            disabled={busy}
            style={{ background: "var(--navy, #153b6a)", color: "#fff", border: "none" }}
          >
            {busy ? "Saving…" : "Save plan"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
          <strong>{label}</strong> — set each installment&apos;s amount and due date. The total the student owes
          follows the sum below.
        </p>
        <table>
          <thead>
            <tr><th>#</th><th>Due date</th><th style={{ textAlign: "right" }}>Amount (FCFA)</th><th style={{ textAlign: "right" }}>Paid</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.sequence}</td>
                <td>
                  <input type="date" value={r.dueDate} onChange={(e) => setDue(r.id, e.target.value)} style={{ width: 150 }} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <input
                    inputMode="numeric"
                    value={r.amountDue}
                    onChange={(e) => setAmount(r.id, e.target.value)}
                    style={{
                      width: 130,
                      textAlign: "right",
                      borderColor: r.amountDue < r.amountPaid ? "var(--danger, #c0392b)" : undefined,
                    }}
                  />
                </td>
                <td className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatXof(r.amountPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 13.5 }}>
          <span className="muted">New total</span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatXof(newTotal)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
          <span className="muted">Already paid</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatXof(invoice.paid)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
          <span>New balance</span>
          <span style={{ color: newBalance > 0 ? "var(--danger, #c0392b)" : "var(--success)", fontVariantNumeric: "tabular-nums" }}>
            {newBalance < 0 ? `${formatXof(-newBalance)} credit` : formatXof(newBalance)}
          </span>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { type AccountInvoice, removeCharge } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Modal } from "@/components/ui";

/**
 * Shared remove-charge confirmation. Mirrors the billing-admin flow:
 * paid charges reverse into an account credit (no cash refund), unpaid ones hard-delete.
 * Reused by the finance account page and the student profile Finance tab.
 */
export function RemoveChargeConfirm({
  charge,
  onClose,
  onRemoved,
}: {
  charge: AccountInvoice;
  onClose: () => void;
  onRemoved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const paid = charge.paid > 0;
  const label = charge.description ?? `${charge.term} tuition`;

  async function confirm() {
    setErr(null);
    setBusy(true);
    try {
      await removeCharge(charge.id);
      onRemoved(paid ? "Charge removed — paid amount reversed to account credit" : "Charge removed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove charge.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Remove charge?"
      width={440}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button onClick={confirm} disabled={busy} style={{ background: "var(--danger, #c0392b)", color: "#fff", border: "none" }}>
            {busy ? "Removing…" : paid ? "Reverse to credit" : "Remove"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
          <strong>{label}</strong>
          {paid ? (
            <> — {formatXof(charge.paid)} has been paid. This will <strong>reverse that amount into an account credit</strong> (no cash refund); the credit offsets the student&apos;s other or future charges.</>
          ) : (
            <> — this charge is unpaid and will be deleted.</>
          )}
        </p>
      </div>
    </Modal>
  );
}

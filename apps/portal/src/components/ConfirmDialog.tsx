"use client";

import { type ReactNode, useState } from "react";
import { Modal } from "@/components/ui";

/**
 * Payload-agnostic confirmation dialog for destructive actions. `onConfirm` runs the
 * mutation and is responsible for closing the dialog on success (clear the parent's
 * pending state); a thrown error is caught and shown inline, leaving the dialog open.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setErr(null);
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      width={440}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            onClick={go}
            disabled={busy}
            style={danger ? { background: "var(--danger, #c0392b)", color: "#fff", border: "none" } : undefined}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <div style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{message}</div>
      </div>
    </Modal>
  );
}

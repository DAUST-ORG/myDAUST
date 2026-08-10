"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Eye, Save, XCircle } from "lucide-react";
import {
  type AdminWireTransfer,
  type WireConfig,
  approveWireTransfer,
  getAdminWireConfig,
  getWireProof,
  listWireTransfers,
  rejectWireTransfer,
  updateAdminWireConfig,
} from "@/lib/api";
import { Card, PageHeader } from "@/components/ui";
import { formatXof } from "@/lib/format";

const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  marginTop: 5,
};
const primary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: 0,
  borderRadius: 999,
  padding: "10px 16px",
  background: "var(--daust-orange)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

export default function FinanceWiresPage() {
  const [tab, setTab] = useState<"reviews" | "settings">("reviews");
  return (
    <>
      <PageHeader
        eyebrow="Finance · Global payment configuration"
        title="Wire Transfers"
        subtitle="Configure the institution bank account and review transfer proofs from every payment channel."
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button
          onClick={() => setTab("reviews")}
          style={{
            ...primary,
            background: tab === "reviews" ? "var(--daust-navy)" : "#fff",
            color: tab === "reviews" ? "#fff" : "var(--fg2)",
            border: "1px solid var(--border)",
          }}
        >
          Proof reviews
        </button>
        <button
          onClick={() => setTab("settings")}
          style={{
            ...primary,
            background: tab === "settings" ? "var(--daust-navy)" : "#fff",
            color: tab === "settings" ? "#fff" : "var(--fg2)",
            border: "1px solid var(--border)",
          }}
        >
          Bank settings
        </button>
      </div>
      {tab === "reviews" ? <Reviews /> : <SettingsPanel />}
    </>
  );
}

function SettingsPanel() {
  const [config, setConfig] = useState<WireConfig | null>(null);
  const [recipients, setRecipients] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getAdminWireConfig()
      .then((value) => {
        setConfig(value);
        setRecipients(value.notificationRecipients.join(", "));
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  const set = (key: keyof WireConfig, value: string | boolean) =>
    setConfig((current) => (current ? { ...current, [key]: value } : current));
  async function save() {
    if (!config) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await updateAdminWireConfig({
        ...config,
        notificationRecipients: recipients
          .split(/[;,\n]/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setConfig(saved);
      setRecipients(saved.notificationRecipients.join(", "));
      setMessage(
        saved.enabled
          ? "Wire payments are enabled globally."
          : "Settings saved; wire payments remain disabled.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  if (!config)
    return (
      <Card>
        <p className="muted">{error ?? "Loading bank settings…"}</p>
      </Card>
    );
  return (
    <Card
      title="Institution bank account"
      action={
        <span className={`badge ${config.enabled ? "paid" : "pending"}`}>
          {config.enabled ? "Enabled globally" : "Disabled"}
        </span>
      }
    >
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        This single setting controls wire payments in student billing,
        payment.daust.net, and payment links.
      </p>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontWeight: 700,
          padding: "10px 0 18px",
        }}
      >
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />{" "}
        Enable wire payments globally
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
          gap: 14,
        }}
      >
        {(
          [
            "bankName",
            "beneficiary",
            "accountNumber",
            "iban",
            "swift",
            "branch",
          ] as const
        ).map((key) => (
          <label
            key={key}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" }}
          >
            {key.replace(/([A-Z])/g, " $1")}
            <input
              value={config[key]}
              onChange={(e) => set(key, e.target.value)}
              style={field}
            />
          </label>
        ))}
      </div>
      <label
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--fg2)",
          marginTop: 14,
        }}
      >
        Payer instructions
        <textarea
          value={config.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          style={{ ...field, minHeight: 90 }}
        />
      </label>
      <label
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--fg2)",
          marginTop: 14,
        }}
      >
        Finance notification recipients
        <input
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="finance@daust.edu.sn"
          style={field}
        />
      </label>
      {message && (
        <p style={{ color: "var(--success-500)", fontWeight: 600 }}>
          {message}
        </p>
      )}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button
        onClick={save}
        disabled={busy}
        style={{ ...primary, marginTop: 16, opacity: busy ? 0.6 : 1 }}
      >
        <Save size={15} /> {busy ? "Saving…" : "Save global settings"}
      </button>
    </Card>
  );
}

function Reviews() {
  const [status, setStatus] = useState("submitted");
  const [rows, setRows] = useState<AdminWireTransfer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const data = await listWireTransfers(status);
    setRows(data);
    setSelectedId((current) =>
      data.some((row) => row.id === current) ? current : (data[0]?.id ?? null),
    );
  }, [status]);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  useEffect(() => {
    setAmount(selected ? String(selected.submittedAmountXof) : "");
    setReference("");
    setNote("");
    setReason("");
  }, [selectedId, selected?.submittedAmountXof]);
  async function proof() {
    if (!selected) return;
    const tab = window.open("", "_blank");
    try {
      const blob = await getWireProof(selected.id);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Proof could not be opened.");
    }
  }
  async function approve() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await approveWireTransfer(selected.id, {
        confirmedAmountXof: Number(amount.replace(/\D/g, "")),
        bankReference: reference.trim() || undefined,
        confirmationNote: note.trim() || undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await rejectWireTransfer(selected.id, reason.trim());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rejection failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(270px,.8fr) minmax(0,1.5fr)",
        gap: 18,
      }}
    >
      <Card
        title="Review queue"
        action={
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        }
      >
        {rows.length === 0 ? (
          <p className="muted">No {status} proofs.</p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              onClick={() => setSelectedId(row.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "11px 8px",
                border: 0,
                borderTop: "1px solid var(--divider)",
                background:
                  row.id === selectedId ? "var(--surface-2)" : "transparent",
                cursor: "pointer",
              }}
            >
              <strong>{row.student}</strong>
              <span
                className="muted"
                style={{ display: "block", fontSize: 11.5 }}
              >
                {row.studentNo ?? row.source} ·{" "}
                {formatXof(row.submittedAmountXof)}
              </span>
            </button>
          ))
        )}
      </Card>
      <Card title={selected?.student ?? "Transfer details"}>
        {!selected ? (
          <p className="muted">Select a transfer.</p>
        ) : (
          <>
            <p className="muted">
              {selected.purpose} · {selected.contactEmail}
            </p>
            <button onClick={proof} style={primary}>
              <Eye size={15} /> View proof
            </button>
            {selected.status === "submitted" ? (
              <div style={{ marginTop: 18 }}>
                <label>
                  Confirmed amount
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={field}
                  />
                </label>
                <label style={{ display: "block", marginTop: 12 }}>
                  Bank reference
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={field}
                  />
                </label>
                <label style={{ display: "block", marginTop: 12 }}>
                  Confirmation note
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ ...field, minHeight: 70 }}
                  />
                </label>
                <button
                  onClick={approve}
                  disabled={busy || (!reference.trim() && !note.trim())}
                  style={{ ...primary, marginTop: 14 }}
                >
                  <CheckCircle2 size={15} /> Approve and post
                </button>
                <div
                  style={{
                    borderTop: "1px solid var(--divider)",
                    marginTop: 20,
                    paddingTop: 16,
                  }}
                >
                  <label>
                    Rejection reason
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      style={field}
                    />
                  </label>
                  <button
                    onClick={reject}
                    disabled={busy || !reason.trim()}
                    style={{
                      ...primary,
                      background: "var(--danger)",
                      marginTop: 12,
                    }}
                  >
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ marginTop: 18 }}>
                <strong>Status:</strong> {selected.status}
                <br />
                <strong>Reviewed by:</strong> {selected.reviewedByName ?? "—"}{" "}
                {selected.reviewedByEmail
                  ? `(${selected.reviewedByEmail})`
                  : ""}
              </p>
            )}
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          </>
        )}
      </Card>
    </div>
  );
}

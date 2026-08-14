"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Save,
  Upload,
  XCircle,
} from "lucide-react";
import {
  type AdminPaymentSubmission,
  type PaymentMethodsConfig,
  getAdminPaymentMethods,
  getPaymentSubmissionFile,
  listPaymentSubmissions,
  rejectPaymentSubmission,
  updateAdminPaymentMethods,
  uploadPaymentMethodQr,
  verifyPaymentSubmission,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";

const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--fg)",
};
const action: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: 0,
  borderRadius: 999,
  padding: "10px 15px",
  background: "var(--daust-orange)",
  color: "#fffaf5",
  fontWeight: 750,
  cursor: "pointer",
};

export default function PaymentReviewsPage() {
  const [tab, setTab] = useState<"queue" | "history" | "settings">("queue");
  return (
    <>
      <PageHeader
        eyebrow="Finance · Payment controls"
        title="Payment Reviews"
        subtitle="Verify payer evidence against the university account, attach Finance confirmation, and preserve a complete audit trail."
      />
      <div
        style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}
      >
        {(["queue", "history", "settings"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{
              ...action,
              border: "1px solid var(--border)",
              background:
                tab === value ? "var(--daust-navy)" : "var(--surface)",
              color: tab === value ? "#f7f9fc" : "var(--fg2)",
              textTransform: "capitalize",
            }}
          >
            {value}
          </button>
        ))}
      </div>
      {tab === "settings" ? (
        <PaymentSettings />
      ) : (
        <ReviewWorkspace history={tab === "history"} />
      )}
    </>
  );
}

function ReviewWorkspace({ history }: { history: boolean }) {
  const [status, setStatus] = useState(history ? "approved" : "submitted");
  const [rows, setRows] = useState<AdminPaymentSubmission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [verificationProof, setVerificationProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await listPaymentSubmissions(status);
    setRows(next);
    setSelectedId((current) =>
      next.some((row) => row.id === current) ? current : (next[0]?.id ?? null),
    );
  }, [status]);

  useEffect(() => {
    load().catch((cause: Error) => setError(cause.message));
  }, [load]);
  useEffect(() => {
    setStatus(history ? "approved" : "submitted");
  }, [history]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  useEffect(() => {
    setReference("");
    setNote("");
    setReason("");
    setVerificationProof(null);
  }, [selectedId]);

  async function openFile(kind: "payer" | "verification") {
    if (!selected) return;
    const tab = window.open("", "_blank");
    try {
      const blob = await getPaymentSubmissionFile(selected.id, kind);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      tab?.close();
      setError(
        cause instanceof Error ? cause.message : "Evidence could not open.",
      );
    }
  }

  async function verify() {
    if (!selected || !verificationProof || !reference.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await verifyPaymentSubmission(
        selected.id,
        {
          transactionReference: reference.trim(),
          note: note.trim() || undefined,
        },
        verificationProof,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await rejectPaymentSubmission(selected.id, reason.trim());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rejection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px,.78fr) minmax(0,1.45fr)",
        gap: 18,
        alignItems: "start",
      }}
    >
      <Card
        title={history ? "Verification history" : "Submitted proofs"}
        action={
          history ? (
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="approved">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="muted">
            {history
              ? "No decisions in this view."
              : "No payer proofs are waiting."}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                width: "100%",
                padding: "11px 8px",
                border: 0,
                borderTop: "1px solid var(--divider)",
                background:
                  row.id === selectedId ? "var(--surface-2)" : "transparent",
                color: "var(--fg)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span>
                <strong style={{ display: "block" }}>{row.target}</strong>
                <small className="muted">
                  {row.method.replaceAll("_", " ")} · {row.purpose}
                </small>
              </span>
              <strong>{formatXof(row.amountXof)}</strong>
            </button>
          ))
        )}
      </Card>

      <Card title={selected?.target ?? "Payment detail"}>
        {!selected ? (
          <p className="muted">Select a payment submission.</p>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                gap: 14,
                paddingBottom: 16,
                borderBottom: "1px solid var(--divider)",
              }}
            >
              {[
                ["Amount", formatXof(selected.amountXof)],
                ["Method", selected.method.replaceAll("_", " ")],
                ["Purpose", selected.purpose],
                [
                  "Submitted",
                  formatDate(
                    selected.payerProofSubmittedAt ?? selected.createdAt,
                  ),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <small className="muted">{label}</small>
                  <strong style={{ display: "block", marginTop: 3 }}>
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                margin: "16px 0",
                flexWrap: "wrap",
              }}
            >
              <button style={action} onClick={() => openFile("payer")}>
                <Eye size={15} /> Payer proof
              </button>
              {selected.hasVerificationProof && (
                <button
                  style={{ ...action, background: "var(--daust-navy)" }}
                  onClick={() => openFile("verification")}
                >
                  <Eye size={15} /> Finance confirmation
                </button>
              )}
            </div>

            {selected.status === "submitted" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <label>
                  Transaction or merchant reference
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    style={field}
                  />
                </label>
                <label>
                  Finance confirmation file
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) =>
                      setVerificationProof(event.target.files?.[0] ?? null)
                    }
                    style={field}
                  />
                </label>
                <label>
                  Verification note <span className="muted">(optional)</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    style={{ ...field, minHeight: 72 }}
                  />
                </label>
                <button
                  style={action}
                  disabled={busy || !reference.trim() || !verificationProof}
                  onClick={verify}
                >
                  <CheckCircle2 size={15} /> Verify and settle
                </button>
                <div
                  style={{
                    borderTop: "1px solid var(--divider)",
                    paddingTop: 12,
                  }}
                >
                  <label>
                    Rejection reason
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      style={{ ...field, minHeight: 64 }}
                    />
                  </label>
                  <button
                    style={{
                      ...action,
                      marginTop: 9,
                      background: "var(--error-500)",
                    }}
                    disabled={busy || !reason.trim()}
                    onClick={reject}
                  >
                    <XCircle size={15} /> Reject proof
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <p>
                  <strong>
                    {selected.status === "verified" ? "Verified" : "Decision"}
                  </strong>
                  {selected.verifiedByName
                    ? ` by ${selected.verifiedByName} (${selected.verifiedByEmail})`
                    : ""}
                </p>
                {selected.transactionReference && (
                  <p className="muted">
                    Reference: {selected.transactionReference}
                  </p>
                )}
                {selected.rejectionReason && (
                  <p style={{ color: "var(--error-500)" }}>
                    {selected.rejectionReason}
                  </p>
                )}
              </div>
            )}
            {error && <p style={{ color: "var(--error-500)" }}>{error}</p>}
          </>
        )}
      </Card>
    </div>
  );
}

function PaymentSettings() {
  const [config, setConfig] = useState<PaymentMethodsConfig | null>(null);
  const [recipients, setRecipients] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await getAdminPaymentMethods();
    setConfig(next);
    setRecipients(next.notificationRecipients.join(", "));
  }, []);
  useEffect(() => {
    load().catch((cause: Error) => setError(cause.message));
  }, [load]);

  if (!config)
    return (
      <Card>
        <p className="muted">{error ?? "Loading payment settings…"}</p>
      </Card>
    );

  function mobileSet(
    key: "wave" | "orangeMoney",
    fieldName: "enabled" | "phoneNumber" | "merchantNumber" | "instructions",
    value: string | boolean,
  ) {
    setConfig((current) =>
      current
        ? { ...current, [key]: { ...current[key], [fieldName]: value } }
        : current,
    );
  }

  async function uploadQr(method: "wave" | "orange_money", file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadPaymentMethodQr(method, file);
      await load();
      setMessage(
        `${method === "wave" ? "Wave" : "Orange Money"} QR code uploaded.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "QR upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await updateAdminPaymentMethods({
        ...config!,
        notificationRecipients: recipients
          .split(/[;,\n]/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setConfig(saved);
      setMessage("Global payment settings saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Settings could not save.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {(
        [
          ["wave", "Wave", "wave"],
          ["orangeMoney", "Orange Money", "orange_money"],
        ] as const
      ).map(([key, label, routeMethod]) => (
        <Card
          key={key}
          title={label}
          action={
            <span
              className={`badge ${config[key].enabled ? "paid" : "pending"}`}
            >
              {config[key].enabled ? "Enabled" : "Disabled"}
            </span>
          }
        >
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={config[key].enabled}
              onChange={(event) =>
                mobileSet(key, "enabled", event.target.checked)
              }
            />
            Enable {label}
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 12,
              marginTop: 14,
            }}
          >
            <label>
              Phone number
              <input
                value={config[key].phoneNumber}
                onChange={(event) =>
                  mobileSet(key, "phoneNumber", event.target.value)
                }
                style={field}
              />
            </label>
            {key === "orangeMoney" && (
              <label>
                Merchant number
                <input
                  value={config[key].merchantNumber}
                  onChange={(event) =>
                    mobileSet(key, "merchantNumber", event.target.value)
                  }
                  style={field}
                />
              </label>
            )}
            <label>
              QR code
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) =>
                  uploadQr(routeMethod, event.target.files?.[0])
                }
                style={field}
              />
              <small className="muted">
                {config[key].qrAsset?.fileName ?? "No QR uploaded"}
              </small>
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Payer instructions
            <textarea
              value={config[key].instructions}
              onChange={(event) =>
                mobileSet(key, "instructions", event.target.value)
              }
              style={{ ...field, minHeight: 70 }}
            />
          </label>
        </Card>
      ))}

      <Card title="Bank transfer">
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={config.bank.enabled}
            onChange={(event) =>
              setConfig({
                ...config,
                bank: { ...config.bank, enabled: event.target.checked },
              })
            }
          />
          Enable bank transfer
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
            marginTop: 14,
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
            <label key={key}>
              {key.replace(/([A-Z])/g, " $1")}
              <input
                value={config.bank[key]}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    bank: { ...config.bank, [key]: event.target.value },
                  })
                }
                style={field}
              />
            </label>
          ))}
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          Payer instructions
          <textarea
            value={config.bank.instructions}
            onChange={(event) =>
              setConfig({
                ...config,
                bank: { ...config.bank, instructions: event.target.value },
              })
            }
            style={{ ...field, minHeight: 70 }}
          />
        </label>
      </Card>

      <Card title="Notifications and publishing">
        <label>
          Finance notification recipients
          <input
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            style={field}
          />
        </label>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Methods are published only after their required account details and QR
          code are present.
        </p>
        {message && <p style={{ color: "var(--success-500)" }}>{message}</p>}
        {error && <p style={{ color: "var(--error-500)" }}>{error}</p>}
        <button style={action} disabled={busy} onClick={save}>
          <Save size={15} /> {busy ? "Saving…" : "Save payment settings"}
        </button>
      </Card>
    </div>
  );
}

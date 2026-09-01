"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import {
  type DirectorPaymentVerification,
  auditDirectorPayment,
  getDirectorPaymentFile,
  listDirectorPaymentVerifications,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";

const button: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: 0,
  borderRadius: 999,
  padding: "9px 14px",
  background: "var(--daust-navy)",
  color: "#f7f9fc",
  fontWeight: 750,
  cursor: "pointer",
};

export default function DirectorPaymentsPage() {
  const [rows, setRows] = useState<DirectorPaymentVerification[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await listDirectorPaymentVerifications();
    setRows(next);
    setSelectedId((current) =>
      next.some((row) => row.id === current) ? current : (next[0]?.id ?? null),
    );
  }, []);
  useEffect(() => {
    load().catch((cause: Error) => setError(cause.message));
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "all") return true;
        if (filter === "unreviewed") return row.auditStatus === "unreviewed";
        return row.method === filter;
      }),
    [filter, rows],
  );
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  async function openFile(kind: "payer" | "verification") {
    if (!selected || selected.kind !== "manual") return;
    const tab = window.open("", "_blank");
    try {
      const blob = await getDirectorPaymentFile(selected.id, kind);
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

  async function audit(outcome: "reviewed" | "flagged") {
    if (!selected || selected.kind !== "manual") return;
    if (outcome === "flagged" && !note.trim()) {
      setError("Enter a note before flagging a payment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auditDirectorPayment(
        selected.id,
        outcome,
        note.trim() || undefined,
      );
      setNote("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Audit decision failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Director · Collections assurance"
        title="Payment Verifications"
        subtitle="Review how payments were verified, inspect available evidence, and flag exceptions without changing settled balances."
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(290px,.82fr) minmax(0,1.5fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <Card
          title="Payment ledger"
          action={
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All payments</option>
              <option value="unreviewed">Awaiting audit</option>
              <option value="cash">Cash</option>
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
              <option value="wire">Bank</option>
              <option value="pi_spi">PI-SPI</option>
            </select>
          }
        >
          {visible.length === 0 ? (
            <p className="muted">No payments match this view.</p>
          ) : (
            visible.map((row) => (
              <button
                key={`${row.kind}:${row.id}`}
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
                    selectedId === row.id ? "var(--surface-2)" : "transparent",
                  color: "var(--fg)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span>
                  <strong style={{ display: "block" }}>{row.target}</strong>
                  <small className="muted">
                    {row.method.replaceAll("_", " ")} · {row.auditStatus}
                  </small>
                </span>
                <strong>{formatXof(row.amountXof)}</strong>
              </button>
            ))
          )}
        </Card>

        <Card title={selected?.target ?? "Verification detail"}>
          {!selected ? (
            <p className="muted">Select a payment.</p>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                  gap: 15,
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--divider)",
                }}
              >
                {[
                  [
                    "Amount",
                    formatXof(
                      selected.confirmedAmountXof ?? selected.amountXof,
                    ),
                  ],
                  ["Method", selected.method.replaceAll("_", " ")],
                  ["Reference", selected.transactionReference ?? "—"],
                  ["Status", selected.status],
                  [
                    "Verified",
                    selected.verifiedAt
                      ? formatDate(selected.verifiedAt)
                      : "Not settled",
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
              <p>
                <strong>{selected.purpose}</strong>
              </p>
              <p className="muted">
                Verification: {selected.verifiedByName ?? "Not verified"}
                {selected.verifiedByEmail
                  ? ` · ${selected.verifiedByEmail}`
                  : ""}
              </p>
              {selected.kind === "manual" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      margin: "15px 0",
                    }}
                  >
                    {selected.hasPayerProof && (
                      <button style={button} onClick={() => openFile("payer")}>
                        <Eye size={15} /> Payer proof
                      </button>
                    )}
                    {selected.hasVerificationProof && (
                      <button
                        style={button}
                        onClick={() => openFile("verification")}
                      >
                        <Eye size={15} /> Finance proof
                      </button>
                    )}
                  </div>
                  {!selected.hasPayerProof &&
                    !selected.hasVerificationProof && (
                      <p className="muted">
                        Recorded directly by Finance; the named staff member and
                        transaction reference are retained for audit.
                      </p>
                    )}
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Audit note — required when flagging"
                    style={{
                      width: "100%",
                      minHeight: 76,
                      padding: 10,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    <button
                      style={button}
                      disabled={busy}
                      onClick={() => audit("reviewed")}
                    >
                      <CheckCircle2 size={15} /> Mark reviewed
                    </button>
                    <button
                      style={{ ...button, background: "var(--error-500)" }}
                      disabled={busy || !note.trim()}
                      onClick={() => audit("flagged")}
                    >
                      <AlertTriangle size={15} /> Flag for Finance
                    </button>
                  </div>
                </>
              )}
              {selected.kind !== "manual" && (
                <p className="muted">
                  System-verified record. No human evidence files are required.
                </p>
              )}
              {error && <p style={{ color: "var(--error-500)" }}>{error}</p>}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

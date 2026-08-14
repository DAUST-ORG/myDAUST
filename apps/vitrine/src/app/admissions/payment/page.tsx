"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Upload } from "lucide-react";
import type {
  PaymentSubmissionSummary,
  ProofPaymentMethod,
  PublicProofMethodConfig,
} from "@mydaust/shared";
import {
  changePaymentMethod,
  feeCheckout,
  listApplicationPaymentAttempts,
  paymentQrUrl,
  proofPaymentMethods,
  resumePaymentAttempt,
  uploadPaymentProof,
} from "../../../lib/api";

export default function ApplicationFeePaymentPage() {
  const [id, setId] = useState("");
  const [methods, setMethods] = useState<PublicProofMethodConfig[]>([]);
  const [method, setMethod] = useState<ProofPaymentMethod>("wave");
  const [attempt, setAttempt] = useState<PaymentSubmissionSummary | null>(null);
  const [history, setHistory] = useState<PaymentSubmissionSummary[]>([]);
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") ?? "");
  }, []);

  useEffect(() => {
    if (!id) return;
    proofPaymentMethods()
      .then((rows) => {
        setMethods(rows);
        if (rows[0]) setMethod(rows[0].method);
      })
      .catch(() => setError("Payment methods are unavailable right now."));
    listApplicationPaymentAttempts(id)
      .then((rows) => {
        setHistory(rows);
        setAttempt(
          rows.find((row) =>
            ["awaiting_proof", "submitted"].includes(row.status),
          ) ??
            rows[0] ??
            null,
        );
      })
      .catch(() => undefined);
    const token = new URLSearchParams(window.location.search).get("resume");
    if (token) {
      resumePaymentAttempt(token)
        .then((next) => {
          setAttempt(next);
          setHistory((rows) => [
            next,
            ...rows.filter((row) => row.id !== next.id),
          ]);
          setMethod(next.method);
        })
        .catch(() =>
          setError("This private payment link is invalid or unavailable."),
        );
    }
  }, [id]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const next = await feeCheckout(id, method);
      setAttempt(next);
      setHistory((rows) => [next, ...rows.filter((row) => row.id !== next.id)]);
      setMethod(next.method);
    } catch {
      setError("The application fee payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function change(nextMethod: ProofPaymentMethod) {
    setMethod(nextMethod);
    if (
      !attempt?.resumeToken ||
      attempt.status === "rejected" ||
      attempt.status === "cancelled"
    )
      return;
    setBusy(true);
    try {
      const next = await changePaymentMethod(
        attempt.resumeToken,
        attempt.id,
        nextMethod,
      );
      setAttempt(next);
      setHistory((rows) =>
        rows.map((row) => (row.id === next.id ? next : row)),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attempt?.resumeToken || !proof) return;
    setBusy(true);
    setError(null);
    try {
      const next = await uploadPaymentProof(
        attempt.resumeToken,
        attempt.id,
        proof,
      );
      setAttempt(next);
      setHistory((rows) =>
        rows.map((row) => (row.id === next.id ? next : row)),
      );
      setProof(null);
    } catch {
      setError("The proof could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  const details = attempt?.details;
  const rows = details
    ? [
        ["Phone", details.phoneNumber],
        ["Merchant", details.merchantNumber],
        ["Bank", details.bankName],
        ["Beneficiary", details.beneficiary],
        ["Account", details.accountNumber],
        ["IBAN", details.iban],
      ].filter((row): row is [string, string] => Boolean(row[1]))
    : [];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f6f9",
        padding: "clamp(24px, 6vw, 72px) 18px",
        color: "#132d4f",
      }}
    >
      <section style={{ maxWidth: 760, margin: "0 auto" }}>
        <a href="/" style={{ color: "#153b6a", fontWeight: 700 }}>
          ← DAUST Admissions
        </a>
        <p
          style={{
            margin: "42px 0 8px",
            color: "#ed8425",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".1em",
            textTransform: "uppercase",
          }}
        >
          Application fee
        </p>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "clamp(34px, 7vw, 58px)",
            lineHeight: 1,
          }}
        >
          Complete your application
        </h1>
        <p style={{ maxWidth: 570, color: "#5a6a7c", lineHeight: 1.7 }}>
          Pay using the official DAUST details below. You can upload your
          transaction screenshot now or return from the link in your email.
        </p>

        <div
          style={{
            marginTop: 32,
            background: "#fbfcfe",
            border: "1px solid #d7e0e8",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              background: "#153b6a",
              color: "#f7f9fc",
              padding: "20px 22px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong style={{ fontSize: 23 }}>
              {(attempt?.amountXof ?? 30_000).toLocaleString("fr-FR")} FCFA
            </strong>
            <span style={{ fontSize: 12, fontWeight: 700 }}>
              {attempt?.status === "submitted"
                ? "Finance review"
                : attempt?.status === "verified"
                  ? "Verified"
                  : "Proof required"}
            </span>
          </header>
          <div style={{ padding: 22 }}>
            {(!attempt ||
              attempt.status === "awaiting_proof" ||
              attempt.status === "rejected" ||
              attempt.status === "cancelled") && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={method}
                  onChange={(event) =>
                    change(event.target.value as ProofPaymentMethod)
                  }
                  style={{ flex: "1 1 240px", padding: 12, borderRadius: 8 }}
                >
                  {methods.map((item) => (
                    <option key={item.method} value={item.method}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {(!attempt ||
                  attempt.status === "rejected" ||
                  attempt.status === "cancelled") && (
                  <button
                    onClick={start}
                    disabled={busy || methods.length === 0}
                    style={buttonStyle}
                  >
                    {attempt ? "Start replacement" : "Show payment details"}
                  </button>
                )}
              </div>
            )}

            {attempt && details && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: details.qrUrl
                    ? "minmax(180px, 230px) minmax(0, 1fr)"
                    : "1fr",
                  gap: 22,
                  marginTop: 18,
                }}
              >
                {details.qrUrl && (
                  <img
                    src={paymentQrUrl(details.qrUrl)}
                    alt={`${details.label} payment QR code`}
                    style={{ width: "100%", borderRadius: 10 }}
                  />
                )}
                <div>
                  {rows.map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        borderBottom: "1px solid #e2e8ee",
                        padding: "9px 0",
                      }}
                    >
                      <span style={{ color: "#6b7886" }}>{label}</span>
                      <strong>{value}</strong>
                      <button
                        aria-label={`Copy ${label}`}
                        onClick={() => navigator.clipboard.writeText(value)}
                        style={{ border: 0, background: "transparent" }}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ))}
                  {details.instructions && (
                    <p style={{ color: "#5a6a7c", lineHeight: 1.55 }}>
                      {details.instructions}
                    </p>
                  )}
                </div>
              </div>
            )}

            {attempt?.status === "awaiting_proof" && (
              <div
                style={{
                  borderTop: "1px solid #dfe6ec",
                  marginTop: 22,
                  paddingTop: 18,
                }}
              >
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) =>
                    setProof(event.target.files?.[0] ?? null)
                  }
                />
                <button
                  onClick={submit}
                  disabled={busy || !proof}
                  style={{ ...buttonStyle, marginTop: 14 }}
                >
                  <Upload size={15} /> Submit proof
                </button>
              </div>
            )}
            {attempt?.status === "submitted" && (
              <p style={{ color: "#8a5319", fontWeight: 650 }}>
                Proof received. Finance will verify it before marking the fee
                paid.
              </p>
            )}
            {attempt?.status === "verified" && (
              <p style={{ color: "#237247", fontWeight: 700 }}>
                <CheckCircle2 size={16} /> Application fee verified.
              </p>
            )}
            {history.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid #dfe6ec",
                  marginTop: 22,
                  paddingTop: 16,
                }}
              >
                <strong style={{ fontSize: 13 }}>Payment attempts</strong>
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setAttempt(item);
                      setMethod(item.method);
                    }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      width: "100%",
                      marginTop: 7,
                      padding: "9px 10px",
                      border: "1px solid #d7e0e8",
                      borderRadius: 7,
                      background:
                        item.id === attempt?.id ? "#eef3f8" : "transparent",
                      color: "#153b6a",
                      cursor: "pointer",
                    }}
                  >
                    <span>{item.method.replaceAll("_", " ")}</span>
                    <strong>{item.status.replaceAll("_", " ")}</strong>
                  </button>
                ))}
              </div>
            )}
            {error && <p style={{ color: "#b53a31" }}>{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: 0,
  borderRadius: 999,
  padding: "12px 18px",
  background: "#ed8425",
  color: "#fffaf5",
  fontWeight: 800,
  cursor: "pointer",
};

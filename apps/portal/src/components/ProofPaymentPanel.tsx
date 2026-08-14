"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Upload } from "lucide-react";
import {
  getProofPaymentMethods,
  type PaymentSubmissionSummary,
  type ProofPaymentMethod,
  type PublicProofMethodConfig,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import styles from "./ProofPaymentPanel.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STATUS_LABELS: Record<string, string> = {
  awaiting_proof: "Proof needed",
  submitted: "Finance review",
  verified: "Verified",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

export function ProofPaymentPanel({
  amountXof,
  attempt,
  history = [],
  onSelectAttempt,
  onStart,
  onChangeMethod,
  onUploadProof,
}: {
  amountXof: number;
  attempt: PaymentSubmissionSummary | null;
  history?: PaymentSubmissionSummary[];
  onSelectAttempt?: (attempt: PaymentSubmissionSummary) => void;
  onStart: (method: ProofPaymentMethod) => Promise<PaymentSubmissionSummary>;
  onChangeMethod: (
    attemptId: string,
    method: ProofPaymentMethod,
  ) => Promise<PaymentSubmissionSummary>;
  onUploadProof: (
    attemptId: string,
    proof: File,
  ) => Promise<PaymentSubmissionSummary>;
}) {
  const [methods, setMethods] = useState<PublicProofMethodConfig[]>([]);
  const [current, setCurrent] = useState(attempt);
  const [method, setMethod] = useState<ProofPaymentMethod>(
    attempt?.method ?? "wave",
  );
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setCurrent(attempt), [attempt]);
  useEffect(() => {
    getProofPaymentMethods()
      .then((rows) => {
        setMethods(rows);
        if (!attempt && rows[0]) setMethod(rows[0].method);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [attempt]);

  const details = useMemo(
    () => current?.details ?? methods.find((item) => item.method === method),
    [current, method, methods],
  );

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const next = await onStart(method);
      setCurrent(next);
      setMethod(next.method);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Payment could not start.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function change(nextMethod: ProofPaymentMethod) {
    setMethod(nextMethod);
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      setCurrent(await onChangeMethod(current.id, nextMethod));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Method could not change.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!current || !proof) return;
    setBusy(true);
    setError(null);
    try {
      setCurrent(await onUploadProof(current.id, proof));
      setProof(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Proof could not be uploaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  }

  const rows = details
    ? [
        ["Phone", details.phoneNumber],
        ["Merchant", details.merchantNumber],
        ["Bank", details.bankName],
        ["Beneficiary", details.beneficiary],
        ["Account", details.accountNumber],
        ["IBAN", details.iban],
        ["SWIFT", details.swift],
        ["Branch", details.branch],
      ].filter((row): row is [string, string] => Boolean(row[1]))
    : [];

  return (
    <section className={styles.panel} aria-label="Payment instructions">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Payment to DAUST</p>
          <h3 className={styles.amount}>
            {formatXof(current?.amountXof ?? amountXof)}
          </h3>
        </div>
        <span className={styles.status}>
          {current ? STATUS_LABELS[current.status] : "Choose a method"}
        </span>
      </header>
      <div className={styles.body}>
        {methods.length > 0 &&
          (!current ||
            current.status === "awaiting_proof" ||
            current.status === "rejected" ||
            current.status === "cancelled") && (
            <div className={styles.methodRow}>
              <select
                className={styles.select}
                value={method}
                disabled={busy}
                onChange={(event) =>
                  current?.status === "awaiting_proof"
                    ? change(event.target.value as ProofPaymentMethod)
                    : setMethod(event.target.value as ProofPaymentMethod)
                }
              >
                {methods.map((item) => (
                  <option key={item.method} value={item.method}>
                    {item.label}
                  </option>
                ))}
              </select>
              {(!current ||
                current.status === "rejected" ||
                current.status === "cancelled") && (
                <button
                  className={styles.primary}
                  disabled={busy}
                  onClick={start}
                  type="button"
                >
                  {busy
                    ? "Starting…"
                    : current
                      ? "Start replacement"
                      : "Show payment details"}
                </button>
              )}
            </div>
          )}

        {current && details && (
          <>
            {current.status === "rejected" && (
              <p className={styles.rejected}>
                {current.rejectionReason ??
                  "Finance could not verify this proof."}
              </p>
            )}
            <div className={styles.instructions} style={{ marginTop: 14 }}>
              {details.qrUrl && (
                <img
                  className={styles.qr}
                  src={`${API_URL}${details.qrUrl}`}
                  alt={`${details.label} QR code for DAUST payment`}
                />
              )}
              <div>
                <dl className={styles.details}>
                  {rows.map(([label, value]) => (
                    <div key={label} style={{ display: "contents" }}>
                      <dt>{label}</dt>
                      <dd>
                        <span>{value}</span>
                        <button
                          className={styles.copy}
                          type="button"
                          aria-label={`Copy ${label}`}
                          onClick={() => copy(label, value)}
                        >
                          {copied === label ? (
                            <Check size={13} />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </dd>
                    </div>
                  ))}
                </dl>
                {details.instructions && (
                  <p className={styles.note}>{details.instructions}</p>
                )}
              </div>
            </div>
            {current.status === "awaiting_proof" && (
              <div className={styles.upload}>
                <label>
                  <span
                    className={styles.eyebrow}
                    style={{ color: "var(--fg2)" }}
                  >
                    Transaction screenshot
                  </span>
                  <input
                    className={styles.file}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) =>
                      setProof(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={!proof || busy}
                    onClick={upload}
                  >
                    <Upload
                      size={14}
                      style={{ verticalAlign: -2, marginRight: 6 }}
                    />
                    {busy ? "Uploading…" : "Submit proof"}
                  </button>
                  <span className={styles.note} style={{ margin: 0 }}>
                    You can leave now and return to this payment at any time.
                  </span>
                </div>
              </div>
            )}
            {current.status === "submitted" && (
              <p className={styles.note}>
                Finance has your screenshot. Your official balance changes after
                verification.
              </p>
            )}
            {current.status === "verified" && (
              <p className={styles.success}>
                <Check
                  size={14}
                  style={{ verticalAlign: -2, marginRight: 6 }}
                />
                Finance verified this payment.
              </p>
            )}
          </>
        )}
        {!current && methods.length === 0 && !error && (
          <p className={styles.note}>
            No proof-based payment method is enabled right now.
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {history.length > 0 && (
          <div className={styles.history}>
            <p className={styles.eyebrow} style={{ color: "var(--fg2)" }}>
              Payment attempts
            </p>
            {history.map((item) => (
              <button
                type="button"
                key={item.id}
                className={styles.historyRow}
                aria-current={current?.id === item.id ? "true" : undefined}
                onClick={() => {
                  setCurrent(item);
                  setMethod(item.method);
                  setError(null);
                  onSelectAttempt?.(item);
                }}
              >
                <span>{item.method.replaceAll("_", " ")}</span>
                <span>{formatXof(item.amountXof)}</span>
                <strong>{STATUS_LABELS[item.status] ?? item.status}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

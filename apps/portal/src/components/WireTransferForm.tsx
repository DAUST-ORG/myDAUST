"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, Upload } from "lucide-react";
import type { PublicWireConfig, WireTransferSummary } from "@/lib/api";
import { formatXof } from "@/lib/format";

export function WireTransferForm({
  config,
  amountXof,
  pending,
  requireEmail = false,
  onSubmit,
}: {
  config: PublicWireConfig;
  amountXof: number;
  pending?: WireTransferSummary | null;
  requireEmail?: boolean;
  onSubmit: (proof: File, contactEmail?: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pending?.status === "submitted") {
    return (
      <div
        style={{
          background: "#fff7e8",
          border: "1px solid #f1d3a7",
          borderRadius: 12,
          padding: 16,
          color: "#8a5319",
        }}
      >
        <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={17} /> Transfer proof under review
        </strong>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>
          {formatXof(pending.submittedAmountXof)} was submitted on{" "}
          {new Date(pending.submittedAt).toLocaleDateString("en-GB")}. The
          official balance changes only after Finance approves it.
        </div>
      </div>
    );
  }

  async function submit() {
    if (!proof) return setError("Choose a PDF, JPG, or PNG proof.");
    if (requireEmail && !/^\S+@\S+\.\S+$/.test(email))
      return setError("Enter a valid contact email.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(proof, requireEmail ? email.trim() : undefined);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Proof could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "#f5f7fa",
        border: "1px solid #d9e0e8",
        borderRadius: 14,
        padding: 18,
      }}
    >
      {pending?.status === "rejected" && (
        <p
          style={{
            background: "#fdeeeb",
            color: "#9e3026",
            borderRadius: 8,
            padding: "9px 11px",
            fontSize: 12.5,
            margin: "0 0 12px",
          }}
        >
          The previous proof was not approved
          {pending.rejectionReason ? `: ${pending.rejectionReason}` : "."} You
          may submit a corrected proof.
        </p>
      )}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            background: "var(--daust-navy)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Banknote size={19} />
        </span>
        <div>
          <strong>Wire {formatXof(amountXof)}</strong>
          <div style={{ fontSize: 12, color: "#6c7884" }}>
            Use the payment reference shown below.
          </div>
        </div>
      </div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "110px 1fr",
          gap: "7px 12px",
          fontSize: 12.5,
          margin: "0 0 14px",
        }}
      >
        {[
          ["Bank", config.bankName],
          ["Beneficiary", config.beneficiary],
          ["Account", config.accountNumber],
          ["IBAN", config.iban],
          ["SWIFT", config.swift],
          ["Branch", config.branch],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt style={{ color: "#6c7884" }}>{label}</dt>
              <dd
                style={{ margin: 0, fontWeight: 600, overflowWrap: "anywhere" }}
              >
                {value}
              </dd>
            </div>
          ))}
      </dl>
      {config.instructions && (
        <p
          style={{
            fontSize: 12.5,
            color: "#4d5965",
            lineHeight: 1.5,
            margin: "0 0 14px",
          }}
        >
          {config.instructions}
        </p>
      )}
      {requireEmail && (
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for status updates"
          style={{
            width: "100%",
            padding: "11px 12px",
            border: "1px solid #ccd5df",
            borderRadius: 8,
            marginBottom: 10,
          }}
        />
      )}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px dashed #9eabb9",
          background: "#fff",
          borderRadius: 9,
          padding: "11px 12px",
          cursor: "pointer",
          fontSize: 12.5,
          color: "#4d5965",
        }}
      >
        <Upload size={15} />{" "}
        {proof ? proof.name : "Choose proof (PDF, JPG, or PNG · max 10 MB)"}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          hidden
          onChange={(e) => setProof(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy || !proof || amountXof <= 0}
        style={{
          width: "100%",
          marginTop: 12,
          padding: 12,
          border: 0,
          borderRadius: 999,
          background: "var(--daust-orange)",
          color: "#fff",
          fontWeight: 700,
          opacity: busy || !proof ? 0.55 : 1,
          cursor: "pointer",
        }}
      >
        {busy ? "Submitting…" : "Submit transfer proof"}
      </button>
      {error && (
        <p style={{ color: "#c0392b", fontSize: 12.5, margin: "10px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}

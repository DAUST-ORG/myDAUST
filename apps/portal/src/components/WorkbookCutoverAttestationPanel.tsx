"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  XOctagon,
} from "lucide-react";
import { request } from "@/lib/api";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

type AttestationStatus = {
  manifestSha256: string;
  statement: string;
  statementSha256: string;
  status:
    "missing" | "valid" | "revoked" | "identity_drift" | "statement_stale";
  attestationId: string | null;
  attestedAt: string | null;
  revokedAt: string | null;
};

const STATUS = {
  missing: { label: "Not attested", tone: "warning" as const },
  valid: { label: "Attested", tone: "success" as const },
  revoked: { label: "Revoked", tone: "error" as const },
  identity_drift: { label: "Identity changed", tone: "error" as const },
  statement_stale: { label: "Statement superseded", tone: "error" as const },
};

const REVOCATION_REASONS = [
  { value: "decisions_changed", label: "The reviewed decisions changed" },
  { value: "attested_in_error", label: "I attested in error" },
  { value: "identity_compromised", label: "My identity may be compromised" },
] as const;

function dateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Dakar",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

export function WorkbookCutoverAttestationPanel() {
  const [digest, setDigest] = useState("");
  const [status, setStatus] = useState<AttestationStatus | null>(null);
  const [affirmed, setAffirmed] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [revokeReason, setRevokeReason] =
    useState<(typeof REVOCATION_REASONS)[number]["value"]>("decisions_changed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedDigest = digest.trim().toLowerCase();
  const digestValid = SHA256_PATTERN.test(normalizedDigest);

  function changeDigest(value: string) {
    setDigest(value);
    setStatus(null);
    setAffirmed(false);
    setRevokeConfirmed(false);
    setError(null);
  }

  async function inspect() {
    if (!digestValid) {
      setError(
        "Enter the 64-character lowercase SHA-256 printed by the canonical manifest builder.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStatus(
        await request<AttestationStatus>(
          `/finance/workbook-cutover-attestations/${normalizedDigest}`,
        ),
      );
    } catch (cause) {
      setStatus(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function attest() {
    if (!digestValid || !affirmed) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(
        await request<AttestationStatus>(
          "/finance/workbook-cutover-attestations",
          {
            method: "POST",
            body: JSON.stringify({
              manifestSha256: normalizedDigest,
              affirmed: true,
            }),
          },
        ),
      );
      setAffirmed(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!status || !revokeConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(
        await request<AttestationStatus>(
          `/finance/workbook-cutover-attestations/${status.manifestSha256}/revoke`,
          {
            method: "POST",
            body: JSON.stringify({ reasonCode: revokeReason }),
          },
        ),
      );
      setRevokeConfirmed(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <PageHeader
        eyebrow="Workbook cutover"
        title="Reviewer attestation"
        subtitle="Adopt every reviewed decision bearing your institutional login email in one exact canonical manifest. The server records your signed-in identity; no password or shared secret belongs in the workbook."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          [
            "1",
            "Paste the digest",
            "Use the canonical manifest SHA-256 from the builder output.",
          ],
          [
            "2",
            "Review the statement",
            "It applies only to decisions carrying your login email.",
          ],
          [
            "3",
            "Attest once",
            "A changed manifest has a different digest and needs a new attestation.",
          ],
        ].map(([step, title, detail]) => (
          <div
            key={step}
            style={{
              display: "flex",
              gap: 11,
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                flex: "0 0 28px",
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                background: "var(--daust-navy)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {step}
            </span>
            <div>
              <div
                style={{ fontWeight: 700, color: "var(--fg1)", fontSize: 13.5 }}
              >
                {title}
              </div>
              <div
                className="muted"
                style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.45 }}
              >
                {detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Fingerprint size={18} aria-hidden /> Exact manifest identity
          </span>
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "end",
            gap: 10,
          }}
        >
          <Field
            label="Canonical manifest SHA-256"
            hint="Exactly 64 lowercase hexadecimal characters. Do not use the workbook, extraction, snapshot, or confirmation-plan digest."
          >
            <Input
              value={digest}
              onChange={changeDigest}
              placeholder="e.g. 6f2a… (64 characters)"
              invalid={digest.length > 0 && !digestValid}
              disabled={busy}
            />
          </Field>
          <Button
            variant="navy"
            icon={<RefreshCw size={15} aria-hidden />}
            disabled={busy || !digestValid}
            onClick={inspect}
          >
            {busy ? "Checking…" : "Check digest"}
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              display: "flex",
              gap: 9,
              marginTop: 14,
              padding: "11px 13px",
              borderRadius: "var(--radius-md)",
              border:
                "1px solid color-mix(in srgb, var(--error-500) 35%, var(--border))",
              background:
                "color-mix(in srgb, var(--error-500) 8%, var(--surface))",
              color: "var(--error-500)",
              fontSize: 13,
            }}
          >
            <AlertTriangle size={17} aria-hidden />
            <span>{error}</span>
          </div>
        )}
      </Card>

      {status && (
        <div style={{ marginTop: 18 }}>
          <Card
            title="Authenticated decision adoption"
            action={
              <Badge tone={STATUS[status.status].tone}>
                {STATUS[status.status].label}
              </Badge>
            }
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 14,
                borderRadius: "var(--radius-md)",
                background: "var(--accent-bg)",
                marginBottom: 16,
              }}
            >
              <ShieldCheck size={21} color="var(--daust-navy)" aria-hidden />
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--fg1)",
                    marginBottom: 5,
                  }}
                >
                  Attestation statement
                </div>
                <p
                  style={{
                    margin: 0,
                    color: "var(--fg2)",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                  }}
                >
                  “{status.statement}”
                </p>
              </div>
            </div>

            {status.status === "missing" && (
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 0",
                    cursor: "pointer",
                    color: "var(--fg2)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={affirmed}
                    onChange={(event) => setAffirmed(event.target.checked)}
                    disabled={busy}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    I have checked the exact digest and explicitly make the
                    statement above as the currently signed-in staff member.
                  </span>
                </label>
                <Button
                  variant="primary"
                  icon={<ShieldCheck size={16} aria-hidden />}
                  disabled={busy || !affirmed}
                  onClick={attest}
                >
                  {busy ? "Recording…" : "Attest exact manifest"}
                </Button>
              </div>
            )}

            {status.status === "valid" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    color: "var(--success-600)",
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  <CheckCircle2 size={19} aria-hidden /> Recorded{" "}
                  {dateTime(status.attestedAt)}
                </div>
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "max-content minmax(0, 1fr)",
                    gap: "7px 14px",
                    margin: "0 0 18px",
                    fontSize: 12.5,
                  }}
                >
                  <dt className="muted">Evidence ID</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: "monospace",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {status.attestationId}
                  </dd>
                  <dt className="muted">Statement SHA-256</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: "monospace",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {status.statementSha256}
                  </dd>
                </dl>
                <details>
                  <summary
                    style={{
                      cursor: "pointer",
                      color: "var(--error-500)",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Revoke this attestation
                  </summary>
                  <div
                    style={{
                      marginTop: 12,
                      padding: 14,
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <p
                      className="muted"
                      style={{
                        margin: "0 0 10px",
                        fontSize: 12.5,
                        lineHeight: 1.5,
                      }}
                    >
                      Revocation is permanent for this digest. Corrected
                      decisions must be exported as a new canonical manifest and
                      attested under its new digest.
                    </p>
                    <Field label="Reason code">
                      <select
                        value={revokeReason}
                        onChange={(event) =>
                          setRevokeReason(
                            event.target
                              .value as (typeof REVOCATION_REASONS)[number]["value"],
                          )
                        }
                        disabled={busy}
                        style={{
                          width: "100%",
                          padding: "9px 12px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          color: "var(--fg1)",
                        }}
                      >
                        {REVOCATION_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label
                      style={{
                        display: "flex",
                        gap: 9,
                        margin: "12px 0",
                        color: "var(--fg2)",
                        fontSize: 12.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={revokeConfirmed}
                        onChange={(event) =>
                          setRevokeConfirmed(event.target.checked)
                        }
                        disabled={busy}
                      />
                      I understand this exact digest cannot be re-attested.
                    </label>
                    <Button
                      variant="danger"
                      icon={<XOctagon size={15} aria-hidden />}
                      disabled={busy || !revokeConfirmed}
                      onClick={revoke}
                    >
                      Revoke permanently
                    </Button>
                  </div>
                </details>
              </div>
            )}

            {status.status === "revoked" && (
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  color: "var(--error-500)",
                  fontSize: 13.5,
                }}
              >
                <XOctagon size={19} aria-hidden />
                <span>
                  Revoked {dateTime(status.revokedAt)}. Generate a corrected
                  canonical manifest and attest its new digest.
                </span>
              </div>
            )}

            {(status.status === "identity_drift" ||
              status.status === "statement_stale") && (
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  color: "var(--error-500)",
                  fontSize: 13.5,
                }}
              >
                <AlertTriangle size={19} aria-hidden />
                <span>
                  This evidence is not valid for confirmation. Regenerate the
                  canonical manifest after the identity or statement issue is
                  resolved, then attest its new digest.
                </span>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

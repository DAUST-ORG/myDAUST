"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { piSpiReasonText, type PiSpiRequestSummary } from "@mydaust/shared";
import type { PiSpiAliasLookup } from "@/lib/api";
import { formatXof } from "@/lib/format";

/**
 * Request-to-pay widget for the PI-SPI rail.
 *
 * The flow is deliberately three steps — enter alias, confirm the resolved name, send —
 * because a request is pushed at whoever owns that alias. Showing the payer's real name
 * before sending is what turns a mistyped UUID into a visible error instead of a payment
 * request landing on a stranger's phone.
 */

const PANEL: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--surface)",
  color: "var(--fg1)",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** How often to re-check a sent request while the payer approves it in their app. */
const POLL_MS = 4000;

export function PiSpiPayForm({
  amountXof,
  savedAlias,
  allowSaveAlias = false,
  request,
  onVerifyAlias,
  onSend,
  onPoll,
}: {
  amountXof: number;
  /** Alias stored on the payer's record, if any. */
  savedAlias?: string | null;
  /** Offer "remember this alias" (only where we have somewhere to store it). */
  allowSaveAlias?: boolean;
  /** An already-live request, so a reload resumes the waiting state. */
  request?: PiSpiRequestSummary | null;
  onVerifyAlias: (alias: string) => Promise<PiSpiAliasLookup>;
  onSend: (alias: string, saveAlias: boolean) => Promise<PiSpiRequestSummary>;
  onPoll: (txId: string) => Promise<PiSpiRequestSummary>;
}) {
  const [alias, setAlias] = useState(savedAlias ?? "");
  const [editingAlias, setEditingAlias] = useState(!savedAlias);
  const [lookup, setLookup] = useState<PiSpiAliasLookup | null>(null);
  const [live, setLive] = useState<PiSpiRequestSummary | null>(request ?? null);
  const [busy, setBusy] = useState<"verify" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll while the payer decides. Cleared as soon as the request reaches a terminal state
  // so a settled payment does not keep hitting the API forever.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    const waiting = live && (live.status === "sent" || live.status === "initiated");
    if (!waiting) {
      stopPolling();
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const next = await onPoll(live!.txId);
        setLive(next);
      } catch {
        // A transient failure must not kill the waiting state; the next tick retries.
      }
    }, POLL_MS);
    return stopPolling;
  }, [live, onPoll, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function verify() {
    const value = alias.trim();
    if (!UUID_RE.test(value)) {
      setError("That does not look like a PI alias. Copy it from your banking app.");
      return;
    }
    setBusy("verify");
    setError(null);
    try {
      setLookup(await onVerifyAlias(value));
    } catch (e) {
      setLookup(null);
      setError(
        e instanceof Error ? e.message : "We could not find that payment alias.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function send(saveAlias: boolean) {
    setBusy("send");
    setError(null);
    try {
      setLive(await onSend(alias.trim(), saveAlias));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the payment request.");
    } finally {
      setBusy(null);
    }
  }

  // --- Terminal + waiting states ------------------------------------------

  if (live?.status === "settled") {
    return (
      <div style={{ ...PANEL, background: "#eaf7ee", borderColor: "#b7e0c2", color: "#1d6b34" }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={17} /> Payment received
        </strong>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>
          {formatXof(live.settledAmountXof ?? live.amountXof)} has been applied to your
          account.
        </div>
      </div>
    );
  }

  if (live && (live.status === "sent" || live.status === "initiated")) {
    return (
      <div style={{ ...PANEL, background: "#fff7e8", borderColor: "#f1d3a7", color: "#8a5319" }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={17} className="spin" /> Waiting for your approval
        </strong>
        <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>
          A request for <strong>{formatXof(live.amountXof)}</strong>
          {live.payerName ? ` was sent to ${live.payerName}` : " was sent"}. Open your
          banking app and approve it — this page updates by itself.
        </div>
        <div style={{ fontSize: 11.5, marginTop: 8, opacity: 0.85 }}>
          Reference {live.txId}
          {live.expiresAt
            ? ` · expires ${new Date(live.expiresAt).toLocaleString("en-GB")}`
            : ""}
        </div>
      </div>
    );
  }

  const rejected =
    live && ["rejected", "cancelled", "expired"].includes(live.status) ? live : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rejected && (
        <div style={{ ...PANEL, background: "#fdecec", borderColor: "#f3c2c2", color: "#8c2c2c" }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={16} />
            {rejected.status === "expired" ? "Request expired" : "Request declined"}
          </strong>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>
            {rejected.status === "expired"
              ? "It was not approved in time. You can send a new one."
              : piSpiReasonText(rejected.statusReason)}
          </div>
        </div>
      )}

      <div style={PANEL}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: 13.5,
          }}
        >
          <Smartphone size={16} /> Instant payment
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg3)", marginTop: 4, lineHeight: 1.5 }}>
          We send a request to your bank or wallet. You approve it there — no card details
          are entered here.
        </div>

        {!editingAlias && savedAlias ? (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12.5 }}>
              Using your saved alias{" "}
              <code style={{ fontSize: 12 }}>…{savedAlias.slice(-8)}</code>
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingAlias(true);
                setLookup(null);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--daust-navy)",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              change
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, color: "var(--fg3)" }}>
              Your PI payment alias
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                value={alias}
                onChange={(e) => {
                  setAlias(e.target.value);
                  setLookup(null);
                }}
                placeholder="550e8400-e29b-41d4-a716-446655440000"
                spellCheck={false}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "9px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--fg1)",
                  fontSize: 13,
                  fontFamily: "ui-monospace, monospace",
                }}
              />
              <button
                type="button"
                onClick={verify}
                disabled={busy !== null}
                style={{
                  padding: "9px 16px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--fg1)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: busy ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {busy === "verify" ? "Checking…" : "Verify"}
              </button>
            </div>
          </div>
        )}

        {lookup && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#1d6b34",
            }}
          >
            <UserCheck size={15} />
            <span>
              <strong>{lookup.name}</strong>
              {lookup.country ? ` (${lookup.country})` : ""}
            </span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--error-500)" }}>
            {error}
          </div>
        )}

        <SendButton
          amountXof={amountXof}
          // Send only after the payer has seen who they are billing.
          enabled={(!!lookup || (!editingAlias && !!savedAlias)) && busy === null}
          busy={busy === "send"}
          allowSaveAlias={allowSaveAlias && editingAlias}
          onSend={send}
        />
      </div>
    </div>
  );
}

function SendButton({
  amountXof,
  enabled,
  busy,
  allowSaveAlias,
  onSend,
}: {
  amountXof: number;
  enabled: boolean;
  busy: boolean;
  allowSaveAlias: boolean;
  onSend: (saveAlias: boolean) => void;
}) {
  const [save, setSave] = useState(true);
  return (
    <>
      {allowSaveAlias && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 12.5,
            color: "var(--fg2)",
          }}
        >
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
          />
          Remember this alias for next time
        </label>
      )}
      <button
        type="button"
        disabled={!enabled}
        onClick={() => onSend(save)}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "11px 18px",
          borderRadius: "var(--radius-pill)",
          border: "1px solid transparent",
          background: "var(--daust-orange)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 13.5,
          cursor: enabled ? "pointer" : "not-allowed",
          opacity: enabled ? 1 : 0.55,
        }}
      >
        {busy ? "Sending…" : `Request ${formatXof(amountXof)}`}
      </button>
    </>
  );
}

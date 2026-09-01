"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from "lucide-react";
import { redeemAccountInvite } from "@/lib/api";

const MIN_LENGTH = 10;

/**
 * Password setup for a student or guardian. Deliberately outside the authenticated
 * portal areas because the person has no password yet. The token is single-use and expiring; the API
 * returns one generic failure for unknown, used and expired tokens alike.
 */
function SetPasswordForm() {
  const queryToken = useSearchParams().get("token") ?? "";
  const [token, setToken] = useState(queryToken);
  const [tokenReady, setTokenReady] = useState(Boolean(queryToken));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // New credential emails keep the bearer token in the URL fragment so it is never
    // sent to the web server or in a Referer. Legacy query-token links still work.
    const fragmentToken = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    ).get("token");
    const resolvedToken = queryToken || fragmentToken || "";
    setToken(resolvedToken);
    setTokenReady(true);
    if (resolvedToken && (window.location.search || window.location.hash)) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    }
    // Capture and scrub the capability once, immediately after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    token && password.length >= MIN_LENGTH && confirm === password && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await redeemAccountInvite(token, password);
      setLoginEmail(result.email);
      setToken("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!tokenReady) {
    return <p className="muted">Loading secure invitation…</p>;
  }

  if (loginEmail) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ color: "var(--success)", fontWeight: 600, margin: 0 }}>
          <Check size={16} /> Password set
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Use this login email when you sign in:
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ flex: 1, overflowWrap: "anywhere" }}>
            {loginEmail}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(loginEmail)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            aria-label="Copy login email"
          >
            <Copy size={15} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <a
          href="/login"
          className="sis-btn"
          style={{ justifyContent: "center" }}
        >
          Continue to sign in
        </a>
      </div>
    );
  }

  if (!token) {
    return (
      <p
        style={{
          color: "var(--danger)",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <AlertCircle size={16} /> This setup link is incomplete. Return to
        account activation or ask authorized staff for help.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>New password</span>
        <span
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Lock
            size={15}
            style={{ position: "absolute", left: 12, color: "var(--fg3)" }}
          />
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            style={{ width: "100%", padding: "10px 40px" }}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--fg3)",
            }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </span>
        <span
          className="muted"
          style={{
            fontSize: 12,
            color: tooShort ? "var(--danger)" : undefined,
          }}
        >
          At least {MIN_LENGTH} characters.
        </span>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Confirm password</span>
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          style={{ padding: "10px 12px" }}
        />
        {mismatch && (
          <span style={{ fontSize: 12, color: "var(--danger)" }}>
            Those passwords do not match.
          </span>
        )}
      </label>

      {error && (
        <div style={{ display: "grid", gap: 8 }}>
          <p
            style={{
              color: "var(--danger)",
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "center",
              margin: 0,
            }}
          >
            <AlertCircle size={15} /> {error}
          </p>
          <a href="/activate-student" style={{ fontSize: 13 }}>
            Return to account activation
          </a>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="sis-btn"
        style={{ padding: "11px 16px", justifyContent: "center" }}
      >
        {busy ? <Loader2 size={15} className="spin" /> : null}{" "}
        {busy ? "Setting password…" : "Set password"}
      </button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-subtle)",
        padding: 24,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 420, margin: 0 }}>
        <p className="eyebrow">Account access</p>
        <h1 className="page-title" style={{ fontSize: 24, marginBottom: 4 }}>
          Set your password
        </h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 20 }}>
          Choose a password to finish setting up your myDAUST account.
        </p>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

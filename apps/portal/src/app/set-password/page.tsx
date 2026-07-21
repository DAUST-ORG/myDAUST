"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { redeemGuardianInvite } from "@/lib/api";

const MIN_LENGTH = 10;

/**
 * Password setup for a guardian the registrar provisioned. Deliberately outside
 * /parent/*: that whole area sits behind the authenticated portal layout, and the
 * guardian has no password yet. The token is single-use and expiring; the API
 * returns one generic failure for unknown, used and expired tokens alike.
 */
function SetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = token && password.length >= MIN_LENGTH && confirm === password && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await redeemGuardianInvite(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 1600);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <p style={{ color: "var(--danger)", display: "flex", gap: 8, alignItems: "center" }}>
        <AlertCircle size={16} /> This link is missing its invitation token. Ask the registrar to resend it.
      </p>
    );
  }

  if (done) {
    return (
      <p style={{ color: "var(--success)", fontWeight: 600 }}>
        Password set. Taking you to the sign-in page…
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>New password</span>
        <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Lock size={15} style={{ position: "absolute", left: 12, color: "var(--fg3)" }} />
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
            style={{ position: "absolute", right: 8, border: "none", background: "transparent", cursor: "pointer", color: "var(--fg3)" }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </span>
        <span className="muted" style={{ fontSize: 12, color: tooShort ? "var(--danger)" : undefined }}>
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
        {mismatch && <span style={{ fontSize: 12, color: "var(--danger)" }}>Those passwords do not match.</span>}
      </label>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
          <AlertCircle size={15} /> {error}
        </p>
      )}

      <button type="submit" disabled={!canSubmit} className="sis-btn" style={{ padding: "11px 16px", justifyContent: "center" }}>
        {busy ? <Loader2 size={15} className="spin" /> : null} {busy ? "Setting password…" : "Set password"}
      </button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-subtle)", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, margin: 0 }}>
        <p className="eyebrow">Parent access</p>
        <h1 className="page-title" style={{ fontSize: 24, marginBottom: 4 }}>Set your password</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 20 }}>
          Choose a password to finish setting up your myDAUST parent account.
        </p>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

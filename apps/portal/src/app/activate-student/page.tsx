"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { ApiError, startStudentActivation } from "@/lib/api";

function createRequestToken(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export default function ActivateStudentPage() {
  const [studentNo, setStudentNo] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRequestToken, setPendingRequestToken] = useState<string | null>(
    null,
  );

  function continueToPasswordSetup(requestToken: string) {
    // The server stores only this token's hash. Keep the plaintext in the URL
    // fragment so browsers never send it in HTTP requests, logs, or referrers.
    window.location.replace(
      `/set-password#token=${encodeURIComponent(requestToken)}`,
    );
  }

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    if (!studentNo.trim() || !dob || busy) return;
    setBusy(true);
    setError(null);
    const requestToken = createRequestToken();
    const input = {
      studentNo: studentNo.trim(),
      dob,
      requestToken,
    };
    let failure: unknown = null;
    // A dropped response is ambiguous: the server may already have created the
    // request. Retry once with the exact same browser token, never a new one.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await startStudentActivation(input);
        continueToPasswordSetup(requestToken);
        return;
      } catch (caught) {
        failure = caught;
        if (caught instanceof ApiError) break;
      }
    }
    if (!(failure instanceof ApiError)) {
      // The request may have committed even though both responses were lost.
      // The retained token is safe to try and is the only possible live invite.
      continueToPasswordSetup(requestToken);
      return;
    }
    setError(
      failure.status === 429
        ? "Too many attempts. Please wait 15 minutes and try again."
        : failure.message,
    );
    setBusy(false);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at 15% 15%, rgba(237,132,37,.12), transparent 34%), var(--bg-subtle)",
      }}
    >
      <section
        className="card"
        style={{ width: "100%", maxWidth: 480, margin: 0 }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            color: "white",
            background: "var(--daust-navy)",
            marginBottom: 16,
          }}
        >
          <ShieldCheck size={23} />
        </div>
        <p className="eyebrow">Student account activation</p>
        <h1 className="page-title" style={{ fontSize: 26, marginBottom: 6 }}>
          Set up your account
        </h1>
        <p
          className="muted"
          style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 22 }}
        >
          Enter your Student ID and date of birth. You will choose your password
          on the next screen.
        </p>

        <form
          onSubmit={begin}
          aria-busy={busy}
          style={{ display: "grid", gap: 15 }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>Student ID</span>
            <input
              value={studentNo}
              onChange={(event) => setStudentNo(event.target.value)}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              placeholder="Enter your student ID"
              required
              disabled={busy || pendingRequestToken !== null}
              style={{ padding: "11px 12px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>Date of birth</span>
            <input
              type="date"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
              autoComplete="bday"
              required
              disabled={busy || pendingRequestToken !== null}
              style={{ padding: "11px 12px" }}
            />
          </label>
          {error && <ActivationError>{error}</ActivationError>}
          {pendingRequestToken && (
            <button
              type="button"
              onClick={() => continueToPasswordSetup(pendingRequestToken)}
              style={{ justifyContent: "center", padding: "11px 16px" }}
            >
              Continue with this activation attempt
            </button>
          )}
          <button
            type="submit"
            className="sis-btn"
            disabled={
              busy || pendingRequestToken !== null || !studentNo.trim() || !dob
            }
            style={{ justifyContent: "center", padding: "11px 16px" }}
          >
            {busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            {busy ? "Checking your details…" : "Continue to password setup"}
          </button>
        </form>

        <p
          className="muted"
          style={{ fontSize: 12.5, textAlign: "center", marginTop: 18 }}
        >
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}

function ActivationError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        color: "var(--danger)",
        fontSize: 13,
      }}
    >
      <AlertCircle size={16} style={{ marginTop: 1, flex: "0 0 auto" }} />
      <span>{children}</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertCircle, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import {
  normalizeStudentActivationCode,
  STUDENT_ACTIVATION_CODE_LENGTH,
} from "@mydaust/shared";
import { ApiError, startStudentActivation } from "@/lib/api";

function cleanPartialCardCode(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "")
    .slice(0, STUDENT_ACTIVATION_CODE_LENGTH);
}

function formatCardCode(value: string): string {
  return cleanPartialCardCode(value).replace(/(.{4})(?=.)/g, "$1-");
}

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
  const [activationCode, setActivationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRequestToken, setPendingRequestToken] = useState<string | null>(
    null,
  );

  const canonicalActivationCode =
    normalizeStudentActivationCode(activationCode);
  const codeReady = canonicalActivationCode !== null;

  function continueToPasswordSetup(requestToken: string) {
    // The server stores only this token's hash. Keep the plaintext in the URL
    // fragment so browsers never send it in HTTP requests, logs, or referrers.
    window.location.replace(
      `/set-password#token=${encodeURIComponent(requestToken)}`,
    );
  }

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    if (!studentNo.trim() || !dob || !codeReady || busy) return;
    setBusy(true);
    setError(null);
    const requestToken = createRequestToken();
    const input = {
      studentNo: studentNo.trim(),
      dob,
      activationCode: canonicalActivationCode!,
      requestToken,
    };
    let failure: unknown = null;
    // A dropped response is ambiguous: the server may already have claimed the
    // card. Retry once with the exact same browser token, never a new one.
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
    setPendingRequestToken(requestToken);
    setError(
      `${failure.message} If the request completed before the error, continue with this same activation attempt.`,
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
          Enter your Student ID, date of birth, and the private activation code
          on your card. You will choose your password on the next screen.
        </p>

        <form onSubmit={begin} style={{ display: "grid", gap: 15 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>Student ID</span>
            <input
              value={studentNo}
              onChange={(event) => setStudentNo(event.target.value)}
              autoComplete="username"
              maxLength={40}
              placeholder="Enter your student ID"
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
              disabled={busy || pendingRequestToken !== null}
              style={{ padding: "11px 12px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 650 }}>
              Activation code
            </span>
            <input
              value={formatCardCode(activationCode)}
              onChange={(event) => setActivationCode(event.target.value)}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={19}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              disabled={busy || pendingRequestToken !== null}
              style={{
                padding: "11px 12px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 16,
                letterSpacing: ".08em",
              }}
            />
          </label>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "11px 12px",
              borderRadius: 12,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <KeyRound
              size={16}
              style={{
                color: "var(--daust-navy)",
                marginTop: 2,
                flex: "0 0 auto",
              }}
            />
            <p
              className="muted"
              style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}
            >
              Your activation code works once and expires at the time printed on
              your card. Keep it private until your password is set.
            </p>
          </div>

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
              busy ||
              pendingRequestToken !== null ||
              !studentNo.trim() ||
              !dob ||
              !codeReady
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
      </section>
    </main>
  );
}

function ActivationError({ children }: { children: React.ReactNode }) {
  return (
    <div
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

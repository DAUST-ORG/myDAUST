"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  getStudentActivationStatus,
  startStudentActivation,
  type StudentActivationStart,
} from "@/lib/api";

const POLL_MS = 5_000;
// Approval can begin just before request expiry and commit within the API's
// bounded 30-second transaction. Keep polling briefly so that safe race wins.
const APPROVAL_GRACE_MS = 35_000;
const REQUEST_TTL_MS = 10 * 60_000;
const CEREMONY_STORAGE_KEY = "mydaust.studentActivation.v1";
type BrowserCeremony = StudentActivationStart & { localExpiresAt: number };

function clearStoredCeremony() {
  try {
    window.sessionStorage.removeItem(CEREMONY_STORAGE_KEY);
  } catch {
    // Storage is only reload recovery; it is not required for the ceremony.
  }
}

export default function ActivateStudentPage() {
  const [studentNo, setStudentNo] = useState("");
  const [dob, setDob] = useState("");
  const [ceremony, setCeremony] = useState<BrowserCeremony | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const expiryMs = useMemo(
    () => ceremony?.localExpiresAt ?? 0,
    [ceremony],
  );

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(CEREMONY_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<BrowserCeremony>;
      if (
        typeof parsed.requestToken === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(parsed.requestToken) &&
        typeof parsed.approvalCode === "string" &&
        /^\d{6}$/.test(parsed.approvalCode) &&
        typeof parsed.localExpiresAt === "number" &&
        Number.isFinite(parsed.localExpiresAt) &&
        parsed.localExpiresAt + APPROVAL_GRACE_MS > Date.now()
      ) {
        setCeremony(parsed as BrowserCeremony);
      } else {
        clearStoredCeremony();
      }
    } catch {
      clearStoredCeremony();
    }
  }, []);

  useEffect(() => {
    if (!ceremony || !Number.isFinite(expiryMs)) return;
    let stopped = false;
    let polling = false;
    const finalDeadlineMs = expiryMs + APPROVAL_GRACE_MS;

    const updateClock = () => {
      const remaining = Math.max(0, Math.ceil((expiryMs - Date.now()) / 1_000));
      setRemainingSeconds(remaining);
      if (Date.now() >= finalDeadlineMs) {
        // Do not trust the browser clock as the final authority. Force one
        // body-only server status check before discarding the retained bearer.
        void poll();
      }
    };
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const result = await getStudentActivationStatus(ceremony.requestToken);
        if (stopped) return;
        if (result.status === "approved") {
          stopped = true;
          clearStoredCeremony();
          window.location.replace(
            `/set-password#token=${encodeURIComponent(ceremony.requestToken)}`,
          );
        } else if (result.status === "expired") {
          stopped = true;
          clearStoredCeremony();
          setRemainingSeconds(0);
          setError(
            "This pairing request expired. Start again with the registrar present.",
          );
        } else if (Date.now() >= finalDeadlineMs) {
          stopped = true;
          clearStoredCeremony();
          setRemainingSeconds(0);
          setError(
            "This pairing request expired. Start again with the registrar present.",
          );
        }
      } catch {
        // A transient poll failure is safe to retry while the local 10-minute
        // deadline remains. Never place the request token in an error or URL.
      } finally {
        polling = false;
      }
    };

    updateClock();
    void poll();
    const clockId = window.setInterval(updateClock, 1_000);
    const pollId = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(clockId);
      window.clearInterval(pollId);
    };
  }, [ceremony, expiryMs]);

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    if (!studentNo.trim() || !dob || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await startStudentActivation({
        studentNo: studentNo.trim(),
        dob,
      });
      // Count down relative to receipt. A student's mis-set wall clock must not
      // discard a valid server request merely because the absolute ISO timestamp
      // appears to be in the past or future on that device.
      const started: BrowserCeremony = {
        ...response,
        localExpiresAt: Date.now() + REQUEST_TTL_MS,
      };
      setStudentNo("");
      setDob("");
      setCeremony(started);
      try {
        window.sessionStorage.setItem(
          CEREMONY_STORAGE_KEY,
          JSON.stringify(started),
        );
      } catch {
        // Storage may be blocked or full. The in-memory ceremony remains fully
        // usable; only reload recovery is unavailable.
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Activation is unavailable. Please ask the registrar for help.",
      );
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    clearStoredCeremony();
    setCeremony(null);
    setError(null);
    setRemainingSeconds(0);
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
      <section className="card" style={{ width: "100%", maxWidth: 480, margin: 0 }}>
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
          Pair with the registrar
        </h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 22 }}>
          Start this process only while you are physically with an authorized registrar.
          Your date of birth is checked privately and is never shown to staff.
        </p>

        {!ceremony ? (
          <form onSubmit={begin} style={{ display: "grid", gap: 15 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 650 }}>Student ID</span>
              <input
                value={studentNo}
                onChange={(event) => setStudentNo(event.target.value)}
                autoComplete="username"
                maxLength={40}
                placeholder="Enter your student ID"
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
                style={{ padding: "11px 12px" }}
              />
            </label>
            {error && <ActivationError>{error}</ActivationError>}
            <button
              type="submit"
              className="sis-btn"
              disabled={busy || !studentNo.trim() || !dob}
              style={{ justifyContent: "center", padding: "11px 16px" }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
              {busy ? "Starting secure pairing…" : "Start activation"}
            </button>
          </form>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "20px 18px",
                textAlign: "center",
                background: "var(--surface-2)",
              }}
            >
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                Show this pairing code to the registrar
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 38,
                  fontWeight: 800,
                  letterSpacing: ".18em",
                  color: "var(--daust-navy)",
                  marginLeft: ".18em",
                }}
              >
                {ceremony.approvalCode.slice(0, 3)} {ceremony.approvalCode.slice(3)}
              </div>
            </div>

            {remainingSeconds > 0 && !error ? (
              <div
                role="status"
                aria-live="polite"
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <Loader2 size={17} className="spin" style={{ color: "var(--daust-navy)" }} />
                <div>
                  <strong style={{ fontSize: 13.5 }}>Waiting for registrar approval</strong>
                  <div className="muted" aria-live="off" style={{ fontSize: 12.5 }}>
                    <Clock3 size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    Expires in {Math.floor(remainingSeconds / 60)}:
                    {String(remainingSeconds % 60).padStart(2, "0")}
                  </div>
                </div>
              </div>
            ) : !error ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Loader2 size={17} className="spin" style={{ color: "var(--daust-navy)" }} />
                <strong style={{ fontSize: 13.5 }}>Checking final registrar approval…</strong>
              </div>
            ) : null}
            {error && <ActivationError>{error}</ActivationError>}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <CheckCircle2 size={16} style={{ color: "var(--success)", marginTop: 2 }} />
              <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
                Keep this page open. After the registrar confirms your identity, it will
                securely unlock the password setup screen. The pairing code cannot set a
                password by itself.
              </p>
            </div>
            {error && (
              <button type="button" onClick={restart} style={{ justifyContent: "center" }}>
                Start again
              </button>
            )}
          </div>
        )}
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

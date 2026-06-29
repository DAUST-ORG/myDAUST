"use client";

import { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { type ApplyResult, submitApplication } from "@/lib/api";

const field: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  padding: "12px 14px",
  fontFamily: "var(--body)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--body)",
  fontWeight: 600,
  fontSize: 13,
  color: "var(--fg2)",
  display: "block",
  marginBottom: 7,
};

export function ApplyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    country: "Senegal",
    track: "first-year",
    programCode: "BSCE",
    bacScore: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);

  if (!open) return null;

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--navy)";
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
  };

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await submitApplication({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        country: form.country || undefined,
        track: form.track as "first-year" | "transfer",
        programCode: form.programCode || undefined,
        bacScore: form.bacScore ? Number(form.bacScore) : undefined,
      });
      setDone(res);
    } catch (e) {
      setErr(
        (e as Error).message.includes("400")
          ? "Please fill in all required fields with a valid email."
          : (e as Error).message
      );
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDone(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      country: "Senegal",
      track: "first-year",
      programCode: "BSCE",
      bacScore: "",
    });
    onClose();
  }

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,44,80,.55)",
        backdropFilter: "blur(3px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 22,
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 30px 80px rgba(15,44,80,.4)",
        }}
      >
        <div
          style={{
            background: "var(--navy)",
            padding: "26px 30px",
            color: "#fff",
            borderRadius: "22px 22px 0 0",
            position: "relative",
          }}
        >
          <div
            className="eyebrow"
            style={{ color: "var(--orange)" }}
          >
            September 2026 intake
          </div>
          <div
            style={{
              fontFamily: "var(--display)",
              fontWeight: 700,
              fontSize: 26,
              marginTop: 8,
            }}
          >
            {done ? "Application received" : "Apply to DAUST"}
          </div>
          <button
            onClick={close}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              background: "rgba(255,255,255,.12)",
              border: "none",
              borderRadius: 999,
              width: 34,
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#fff",
              transition: "background 0.15s",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div style={{ padding: "40px 30px", textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                background: "var(--subtle)",
                margin: "0 auto 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={30} color="var(--orange)" />
            </div>
            <div
              style={{
                fontFamily: "var(--display)",
                fontWeight: 700,
                fontSize: 22,
                marginTop: 14,
              }}
            >
              Application received!
            </div>
            <p
              className="lead"
              style={{ fontSize: 15, marginTop: 10, lineHeight: 1.6 }}
            >
              Thanks, {form.firstName}. We&rsquo;ve emailed a confirmation to{" "}
              <strong>{form.email}</strong>.
            </p>
            {done.scholarship.pct > 0 && (
              <div
                style={{
                  background: "var(--subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "20px 24px",
                  marginTop: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--display)",
                    fontWeight: 800,
                    fontSize: 44,
                    color: "var(--orange)",
                    lineHeight: 1,
                  }}
                >
                  {done.scholarship.pct}%
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginTop: 6,
                  }}
                >
                  merit scholarship
                </div>
                <div
                  className="lead"
                  style={{ fontSize: 13.5, marginTop: 6 }}
                >
                  {done.scholarship.band}. Applied automatically on enrollment.
                </div>
              </div>
            )}
            <button
              className="btn btn-primary btn-lg"
              style={{ marginTop: 24, width: "100%", justifyContent: "center" }}
              onClick={close}
            >
              Done
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: "28px 30px 30px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>First name *</label>
                <input
                  style={field}
                  value={form.firstName}
                  onChange={set("firstName")}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Last name *</label>
                <input
                  style={field}
                  value={form.lastName}
                  onChange={set("lastName")}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input
                style={field}
                type="email"
                value={form.email}
                onChange={set("email")}
                onFocus={focusStyle}
                onBlur={blurStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Country</label>
                <input
                  style={field}
                  value={form.country}
                  onChange={set("country")}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Track</label>
                <select
                  style={field}
                  value={form.track}
                  onChange={set("track")}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                >
                  <option value="first-year">First-Year Undergraduate</option>
                  <option value="transfer">Transfer Student</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Program</label>
                <input
                  style={field}
                  value={form.programCode}
                  onChange={set("programCode")}
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>BAC score (0–20)</label>
                <input
                  style={field}
                  type="number"
                  step="0.1"
                  value={form.bacScore}
                  onChange={set("bacScore")}
                  placeholder="e.g. 15.5"
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                />
              </div>
            </div>
            {err && (
              <div style={{ color: "#c0392b", fontSize: 13 }}>{err}</div>
            )}
            <p style={{ fontSize: 12, color: "var(--fg3)", margin: 0 }}>
              Your BAC score unlocks an automatic merit scholarship. No account
              needed.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ justifyContent: "center" }}
              onClick={submit}
              disabled={busy}
            >
              {busy ? "Submitting…" : "Submit application"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

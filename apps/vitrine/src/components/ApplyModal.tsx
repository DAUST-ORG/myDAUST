"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { type ApplyResult, feeCheckout, getFees, submitApplication } from "@/lib/api";

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "11px 13px",
  fontFamily: "var(--body)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontFamily: "var(--body)", fontWeight: 600, fontSize: 12.5, color: "var(--fg2)", display: "block", marginBottom: 5 };

export function ApplyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", country: "Senegal", track: "first-year", programCode: "BSCE", bacScore: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);
  const [feeXof, setFeeXof] = useState(30_000);
  useEffect(() => {
    getFees().then((f) => {
      const fee = f.find((x) => x.key === "application_fee");
      if (fee) setFeeXof(fee.minXof);
    }).catch(() => {});
  }, []);

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

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
      setErr((e as Error).message.includes("400") ? "Please fill in all required fields with a valid email." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDone(null);
    setForm({ firstName: "", lastName: "", email: "", country: "Senegal", track: "first-year", programCode: "BSCE", bacScore: "" });
    onClose();
  }

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(15,44,80,.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,.4)" }}>
        <div style={{ background: "var(--navy)", padding: "24px 28px", color: "#fff", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--orange)" }}>September 2026 intake</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, marginTop: 6 }}>Apply to DAUST</div>
          </div>
          <button onClick={close} style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div style={{ padding: "40px 28px", textAlign: "center" }}>
            <CheckCircle2 size={56} color="#2e7d52" style={{ margin: "0 auto" }} />
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, marginTop: 14 }}>Application received!</div>
            <p className="lead" style={{ fontSize: 14.5, marginTop: 10 }}>
              Thanks, {form.firstName}. We&rsquo;ve emailed a confirmation to <strong>{form.email}</strong>.
            </p>
            {done.scholarship.pct > 0 && (
              <div style={{ background: "var(--subtle)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", marginTop: 18 }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 40, color: "var(--orange)", lineHeight: 1 }}>{done.scholarship.pct}%</div>
                <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", marginTop: 6 }}>merit scholarship</div>
                <div className="lead" style={{ fontSize: 13.5, marginTop: 6 }}>{done.scholarship.band} — applied automatically on enrollment.</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={async () => {
                  try {
                    const { redirectUrl } = await feeCheckout(done.id);
                    window.location.href = redirectUrl;
                  } catch {
                    setErr("Online fee payment is unavailable right now — you can pay at the Office of Admissions.");
                  }
                }}
              >
                Pay application fee ({feeXof.toLocaleString("en-US")} FCFA)
              </button>
              <button className="btn btn-outline-light btn-lg" style={{ color: "var(--navy)", boxShadow: "inset 0 0 0 1.5px var(--navy)" }} onClick={close}>Later</button>
            </div>
            {err && <div style={{ color: "#c0392b", fontSize: 13, marginTop: 10 }}>{err}</div>}
          </div>
        ) : (
          <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={labelStyle}>First name *</label><input style={field} value={form.firstName} onChange={set("firstName")} /></div>
              <div><label style={labelStyle}>Last name *</label><input style={field} value={form.lastName} onChange={set("lastName")} /></div>
            </div>
            <div><label style={labelStyle}>Email *</label><input style={field} type="email" value={form.email} onChange={set("email")} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={labelStyle}>Country</label><input style={field} value={form.country} onChange={set("country")} /></div>
              <div>
                <label style={labelStyle}>Track</label>
                <select style={field} value={form.track} onChange={set("track")}>
                  <option value="first-year">First-Year Undergraduate</option>
                  <option value="transfer">Transfer Student</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={labelStyle}>Program</label><input style={field} value={form.programCode} onChange={set("programCode")} /></div>
              <div><label style={labelStyle}>BAC score (0–20)</label><input style={field} type="number" step="0.1" value={form.bacScore} onChange={set("bacScore")} placeholder="e.g. 15.5" /></div>
            </div>
            {err && <div style={{ color: "#c0392b", fontSize: 13 }}>{err}</div>}
            <p style={{ fontSize: 12, color: "var(--fg3)", margin: 0 }}>Your BAC score unlocks an automatic merit scholarship. No account needed.</p>
            <button className="btn btn-primary btn-lg" style={{ justifyContent: "center" }} onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : "Submit application"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

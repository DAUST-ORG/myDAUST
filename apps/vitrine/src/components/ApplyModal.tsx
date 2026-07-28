"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { submitApplication } from "@/lib/api";
import type { Content } from "@/lib/content";

const PROGRAMS: { label: string; code: string }[] = [
  { label: "Computer Science", code: "BSCS" },
  { label: "Mechanical Engineering", code: "BSME" },
  { label: "Electrical Engineering", code: "BSEE" },
  { label: "Chemical Engineering", code: "BSCHE" },
  { label: "Intensive English Program", code: "IEP" },
];

const field: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 4,
  padding: "12px 14px", fontFamily: "var(--font-body)", fontSize: 14, outline: "none",
};
const label: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--fg2)", display: "block", marginBottom: 6,
};

export function ApplyModal({ tx, onClose, onOpenAI }: { tx: Content["tx"]; onClose: () => void; onOpenAI: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState(PROGRAMS[0]!.code);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    const trimmed = name.trim();
    const sp = trimmed.indexOf(" ");
    const firstName = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const lastName = sp === -1 ? trimmed : trimmed.slice(sp + 1);
    try {
      await submitApplication({
        firstName: firstName || trimmed,
        lastName: lastName || firstName || trimmed,
        email: email.trim(),
        programCode: program,
        track: "first-year",
      });
      setSent(true);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg.includes("400") ? "Please enter your full name and a valid email." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,44,80,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: "#fff", borderRadius: 6, overflow: "hidden", boxShadow: "0 30px 70px rgba(15,44,80,.4)", animation: "daustPop .2s cubic-bezier(.2,.7,.3,1) both" }}>
        <div style={{ background: "var(--daust-navy)", padding: "24px 28px", position: "relative" }}>
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{tx.applyKicker}</span>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "#fff", margin: "8px 0 0" }}>{tx.applyTitle}</h3>
          <button onClick={onClose} aria-label="Close" style={{ position: "absolute", right: 18, top: 18, width: 34, height: 34, borderRadius: 3, background: "rgba(255,255,255,.12)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {sent ? (
          <div style={{ padding: "44px 28px", textAlign: "center" }}>
            <div style={{ width: 66, height: 66, borderRadius: 3, background: "rgba(46,125,82,.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <Icon name="check" size={34} color="#2e7d52" />
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--fg1)", margin: "20px 0 0" }}>{tx.thankTitle}</h3>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.6, color: "var(--fg2)", margin: "10px auto 0", maxWidth: 360 }}>{tx.thankBody}</p>
            <button onClick={onClose} style={{ marginTop: 24, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".05em", textTransform: "uppercase", border: "none", borderRadius: 3, padding: "13px 30px", background: "var(--daust-navy)", color: "#fff", cursor: "pointer" }}>{tx.done}</button>
          </div>
        ) : (
          <div style={{ padding: "26px 28px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={label}>{tx.applyName}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tx.namePh} style={field} />
              </div>
              <div>
                <label style={label}>{tx.applyEmail}</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" style={field} />
              </div>
              <div>
                <label style={label}>{tx.applyProgram}</label>
                <select value={program} onChange={(e) => setProgram(e.target.value)} style={{ ...field, background: "#fff", color: "var(--fg1)" }}>
                  {PROGRAMS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                </select>
              </div>
            </div>
            {err && <div style={{ color: "var(--error-500)", fontSize: 13, marginTop: 12 }}>{err}</div>}
            <button onClick={submit} disabled={busy} style={{ width: "100%", marginTop: 22, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".05em", textTransform: "uppercase", border: "none", borderRadius: 4, padding: 15, background: "var(--daust-orange)", color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1 }}>
              {busy ? "…" : tx.applySubmit}
            </button>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--fg3)", textAlign: "center", margin: "14px 0 0" }}>
              {tx.applyQ}{" "}
              <button onClick={onOpenAI} style={{ color: "var(--daust-navy)", fontWeight: 600, cursor: "pointer", background: "none", border: "none", padding: 0, fontSize: 12 }}>{tx.applyAI}</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

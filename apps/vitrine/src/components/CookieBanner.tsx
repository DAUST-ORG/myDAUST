"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

const KEY = "daust-cookie-consent";

export function CookieBanner({
  text, accept, decline, more,
  onMore,
}: {
  text: string; accept: string; decline: string; more: string;
  onMore: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY)) return;
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  function choose(v: "accepted" | "declined") {
    try { window.localStorage.setItem(KEY, v); } catch { /* storage unavailable */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={more}
      style={{
        position: "fixed", left: 24, bottom: 24, zIndex: 75, maxWidth: 380,
        background: "var(--daust-navy-deep)", color: "#fff",
        border: "1px solid rgba(255,255,255,.14)", borderRadius: 6,
        boxShadow: "0 18px 50px rgba(15,44,80,.45)",
        padding: "20px 22px",
        animation: "daustRise .45s cubic-bezier(.16,1,.3,1) both",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 3, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="landmark" size={16} color="var(--daust-orange)" />
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>Cookies</div>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "var(--fg-on-navy-muted)", margin: 0 }}>{text}</p>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => choose("accepted")} style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", textTransform: "uppercase", border: "none", borderRadius: 3, padding: "11px 18px", background: "var(--daust-orange)", color: "#fff", cursor: "pointer" }}>{accept}</button>
        <button onClick={() => choose("declined")} style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12.5, letterSpacing: ".04em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,.35)", borderRadius: 3, padding: "11px 18px", background: "transparent", color: "#fff", cursor: "pointer" }}>{decline}</button>
        <button onClick={onMore} style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", border: "none", background: "none", color: "var(--daust-orange)", cursor: "pointer", padding: "11px 4px" }}>{more}</button>
      </div>
    </div>
  );
}

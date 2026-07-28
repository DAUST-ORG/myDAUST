"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { Content, Lang } from "@/lib/content";

interface Msg { role: "user" | "assistant"; content: string; }

export function AiPanel({
  open, onOpen, onClose, tx, suggestions, lang, setLang,
}: {
  open: boolean; onOpen: () => void; onClose: () => void;
  tx: Content["tx"]; suggestions: string[]; lang: Lang; setLang: (l: Lang) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q) return;
    // Stub: the DAUST AI assistant has no production backend yet — reply with a coming-soon note.
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: tx.aiComingSoon }]);
    setInput("");
  }

  if (!open) {
    return (
      <button onClick={onOpen} style={{ position: "fixed", right: 24, bottom: 24, zIndex: 80, display: "flex", alignItems: "center", gap: 10, background: "var(--daust-navy)", color: "#fff", border: "none", borderRadius: 3, padding: "14px 22px 14px 18px", cursor: "pointer", boxShadow: "0 14px 34px rgba(15,44,80,.4)", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".03em" }}>
        <Icon name="sparkles" size={20} color="var(--daust-orange)" />
        {lang === "fr" ? "Demander à l’IA DAUST" : "Ask DAUST AI"}
      </button>
    );
  }

  const langBtn = (on: boolean): React.CSSProperties => ({
    fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, border: "none", borderRadius: 2,
    padding: "5px 11px", cursor: "pointer", background: on ? "#fff" : "transparent",
    color: on ? "var(--daust-navy)" : "var(--fg-on-navy-muted)",
  });

  return (
    <div className="ai-panel" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 90, width: 400, height: 580, maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column", background: "#fff", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "0 30px 70px rgba(15,44,80,.4)", animation: "daustPop .2s cubic-bezier(.2,.7,.3,1) both" }}>
      <div style={{ background: "var(--daust-navy)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 3, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="sparkles" size={20} color="var(--daust-orange)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "#fff", lineHeight: 1.1 }}>DAUST Assistant</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11.5, color: "var(--fg-on-navy-muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4caf7d" }} />
            {lang === "fr" ? "Bientôt · Admissions & programmes" : "Coming soon · Admissions & programs"}
          </div>
        </div>
        <div style={{ display: "flex", background: "rgba(255,255,255,.1)", borderRadius: 3, padding: 3 }}>
          <button onClick={() => setLang("en")} style={langBtn(lang === "en")}>EN</button>
          <button onClick={() => setLang("fr")} style={langBtn(lang === "fr")}>FR</button>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 3, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20, background: "var(--bg-subtle)" }}>
        {messages.length === 0 ? (
          <div>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 6, borderTopLeftRadius: 0, padding: "14px 16px", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--fg1)" }}>{tx.aiWelcome}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg3)", margin: "22px 0 12px" }}>{tx.aiSuggestLabel}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} style={{ textAlign: "left", fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--daust-navy)", background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="message-circle" size={16} color="var(--daust-orange)" style={{ flexShrink: 0 }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: "84%", padding: "11px 15px", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", borderRadius: 6, background: isUser ? "var(--daust-navy)" : "#fff", color: isUser ? "#fff" : "var(--fg1)", border: isUser ? "none" : "1px solid var(--border)", borderTopRightRadius: isUser ? 0 : 6, borderTopLeftRadius: isUser ? 6 : 0 }}>
                  {m.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ padding: 14, background: "#fff", borderTop: "1px solid var(--border)", display: "flex", alignItems: "flex-end", gap: 10 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder={tx.aiPlaceholder}
          style={{ flex: 1, resize: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--fg1)", outline: "none", maxHeight: 96, lineHeight: 1.4 }}
        />
        <button onClick={() => send()} aria-label="Send" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 4, background: "var(--daust-navy)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="send" size={19} />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { Content, Lang } from "@/lib/content";
import { answerQuestion, type KbEntry } from "@/lib/assistant";

interface Msg { role: "user" | "assistant"; content: string; }

/** Inline **bold** within a line. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((seg, i) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={keyBase + i}>{seg.slice(2, -2)}</strong>
      ) : (
        <span key={keyBase + i}>{seg}</span>
      ),
    );
}

/** Render an answer string with paragraphs, bullet lists (lines starting with "• "), and **bold**. */
function renderRich(text: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    const items = bullets;
    const idx = blocks.length;
    bullets = [];
    blocks.push(
      <ul key={`ul${idx}`} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((b, i) => (
          <li key={i}>{inline(b, `li${idx}-${i}-`)}</li>
        ))}
      </ul>,
    );
  };
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (t.startsWith("• ") || t.startsWith("- ")) {
      bullets.push(t.slice(2));
      continue;
    }
    flush();
    if (t) blocks.push(<p key={`p${blocks.length}`} style={{ margin: 0 }}>{inline(t, `p${blocks.length}-`)}</p>);
  }
  flush();
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{blocks}</div>;
}

export function AiPanel({
  open, onOpen, onClose, tx, suggestions, lang, kb, fallback,
}: {
  open: boolean; onOpen: () => void; onClose: () => void;
  tx: Content["tx"]; suggestions: string[]; lang: Lang; kb: KbEntry[]; fallback: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, open]);

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    // Retrieval over the curated knowledge base — no backend, answers are vetted.
    const answer = answerQuestion(q, kb, fallback);
    setTyping(true);
    window.setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
      setTyping(false);
    }, 450);
  }

  if (!open) {
    return (
      <button onClick={onOpen} style={{ position: "fixed", right: 24, bottom: 24, zIndex: 80, display: "flex", alignItems: "center", gap: 10, background: "var(--daust-navy)", color: "#fff", border: "none", borderRadius: 3, padding: "14px 22px 14px 18px", cursor: "pointer", boxShadow: "0 14px 34px rgba(15,44,80,.4)", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, letterSpacing: ".03em" }}>
        <Icon name="sparkles" size={20} color="var(--daust-orange)" />
        {lang === "fr" ? "Demander à l’IA DAUST" : "Ask DAUST AI"}
      </button>
    );
  }

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
            {lang === "fr" ? "En ligne · Admissions & programmes" : "Online · Admissions & programs"}
          </div>
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
          <>
            {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: "84%", padding: "11px 15px", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, whiteSpace: isUser ? "pre-wrap" : "normal", borderRadius: 6, background: isUser ? "var(--daust-navy)" : "#fff", color: isUser ? "#fff" : "var(--fg1)", border: isUser ? "none" : "1px solid var(--border)", borderTopRightRadius: isUser ? 0 : 6, borderTopLeftRadius: isUser ? 6 : 0 }}>
                  {isUser ? m.content : renderRich(m.content)}
                </div>
              </div>
            );
            })}
            {typing && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                <div style={{ padding: "11px 15px", fontFamily: "var(--font-body)", fontSize: 16, color: "var(--fg3)", letterSpacing: 2, borderRadius: 6, borderTopLeftRadius: 0, background: "#fff", border: "1px solid var(--border)" }}>
                  ···
                </div>
              </div>
            )}
          </>
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

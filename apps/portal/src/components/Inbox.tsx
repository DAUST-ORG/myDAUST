"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  type Contact,
  type ThreadDetail,
  type ThreadSummary,
  getContacts,
  getThread,
  getThreads,
  sendThreadMessage,
  startThread,
} from "@/lib/api";

const NAVY = "var(--daust-navy)";

function Avatar({ initials, size = 42 }: { initials: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: NAVY,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.36,
        flexShrink: 0,
      }}
    >
      {initials.toUpperCase()}
    </span>
  );
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Inbox() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const t = await getThreads();
    setThreads(t);
    return t;
  }, []);

  useEffect(() => {
    loadThreads().then((t) => {
      if (t[0]) setSel(t[0].id);
    });
  }, [loadThreads]);

  useEffect(() => {
    if (!sel) return;
    getThread(sel).then(setDetail).catch(() => {});
  }, [sel]);

  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [detail]);

  async function send() {
    if (!draft.trim() || !sel) return;
    const body = draft;
    setDraft("");
    await sendThreadMessage(sel, body);
    setDetail(await getThread(sel));
    loadThreads();
  }

  return (
    <>
      <p className="eyebrow">Conversations</p>
      <h1 className="page-title">Messages</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          height: "calc(100vh - 230px)",
          minHeight: 460,
          overflow: "hidden",
          background: "var(--surface)",
          border: "1px solid var(--gray-100)",
          borderRadius: 16,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Thread list */}
        <div style={{ borderRight: "1px solid var(--divider)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 16px 12px", borderBottom: "1px solid var(--divider)" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Inbox</span>
            <button
              onClick={() => setComposing(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: NAVY, color: "#fff", borderRadius: 9, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
            >
              <Plus size={14} /> New
            </button>
          </div>
          {threads.length === 0 && <p className="muted" style={{ padding: 16 }}>No conversations yet.</p>}
          {threads.map((th) => (
            <div
              key={th.id}
              onClick={() => { setSel(th.id); setComposing(false); }}
              style={{
                display: "flex",
                gap: 12,
                padding: "14px 16px",
                cursor: "pointer",
                background: sel === th.id && !composing ? "#f5f8fc" : "#fff",
                borderBottom: "1px solid var(--gray-50)",
                borderLeft: "3px solid " + (sel === th.id && !composing ? NAVY : "transparent"),
              }}
            >
              <Avatar initials={th.initials} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: th.unread ? 700 : 600, fontSize: 13.5 }}>{th.who}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtTime(th.time)}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--daust-steel)", marginTop: 1, textTransform: "capitalize" }}>{th.role.replace("_", " ")}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.preview}</div>
              </div>
              {th.unread > 0 && <span style={{ alignSelf: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "var(--daust-orange)", color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{th.unread}</span>}
            </div>
          ))}
        </div>

        {/* Conversation / composer */}
        {composing ? (
          <NewMessage
            onCancel={() => setComposing(false)}
            onSent={async (threadId) => {
              setComposing(false);
              await loadThreads();
              setSel(threadId);
            }}
          />
        ) : !detail ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg3)" }}>Select a conversation</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "13px 22px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar initials={detail.initials} size={38} />
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16 }}>{detail.who}</div>
                <div className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{detail.role.replace("_", " ")}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 4, background: "var(--gray-50)" }}>
              {detail.messages.map((b, i) => (
                <div key={b.id} style={{ alignSelf: b.me ? "flex-end" : "flex-start", maxWidth: "66%", display: "flex", flexDirection: "column", alignItems: b.me ? "flex-end" : "flex-start", marginTop: i && detail.messages[i - 1]!.me !== b.me ? 8 : 0 }}>
                  <div
                    style={{
                      background: b.me ? NAVY : "#fff",
                      color: b.me ? "#fff" : "var(--fg1)",
                      border: b.me ? "none" : "1px solid var(--gray-100)",
                      borderRadius: 16,
                      borderBottomRightRadius: b.me ? 5 : 16,
                      borderBottomLeftRadius: b.me ? 16 : 5,
                      padding: "10px 15px",
                      fontSize: 13.5,
                      lineHeight: 1.45,
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    {b.body}
                  </div>
                  <span style={{ fontSize: 10.5, color: "var(--gray-300)", margin: "3px 6px 0" }}>{fmtTime(b.time)}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div style={{ padding: 16, borderTop: "1px solid var(--divider)", display: "flex", gap: 10 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Write a message…"
                style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 10, padding: "12px 15px", fontSize: 13.5, outline: "none" }}
              />
              <button onClick={send} className="primary" style={{ padding: "0 22px" }}>Send</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function NewMessage({ onCancel, onSent }: { onCancel: () => void; onSent: (threadId: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getContacts().then((c) => {
      setContacts(c);
      if (c[0]) setRecipientId(c[0].id);
    }).catch(() => {});
  }, []);

  async function submit() {
    if (!recipientId || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { threadId } = await startThread(recipientId, body);
      onSent(threadId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 24, gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, flex: 1 }}>New message</h3>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <label>
        <span className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>To</span>
        <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)" }}>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.role.replace("_", " ")}</option>
          ))}
        </select>
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message…"
        rows={6}
        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 13px", fontSize: 13.5, resize: "vertical", lineHeight: 1.5 }}
      />
      {err && <span className="muted" style={{ color: "var(--bad)" }}>{err}</span>}
      {contacts.length === 0 && <span className="muted">No contacts available to message yet.</span>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="primary" onClick={submit} disabled={busy || !recipientId || !body.trim()}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import {
  type Contact,
  type MessageAttachment,
  type TeachingSection,
  type ThreadDetail,
  type ThreadSummary,
  broadcastToSection,
  fileUrl,
  getContacts,
  getThread,
  getThreads,
  sendThreadMessage,
  startThread,
  uploadFile,
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

function fileSizeLabel(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentList({ attachments, tone }: { attachments: MessageAttachment[]; tone: "me" | "other" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
      {attachments.map((a, i) => (
        <a
          key={i}
          href={fileUrl(a.url)}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
            background: tone === "me" ? "rgba(255,255,255,.16)" : "var(--bg-tint)",
            color: tone === "me" ? "#fff" : "var(--daust-navy)",
            border: tone === "me" ? "1px solid rgba(255,255,255,.25)" : "1px solid var(--border)",
          }}
        >
          <Paperclip size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
          {fileSizeLabel(a.size) && (
            <span style={{ fontSize: 11, opacity: 0.75, flexShrink: 0 }}>{fileSizeLabel(a.size)}</span>
          )}
        </a>
      ))}
    </div>
  );
}

export interface InboxProps {
  eyebrow?: string;
  title?: string;
  /**
   * When supplied, the composer gains a "Whole course" mode that sends through
   * broadcastToSection. Absent, the component renders exactly as the student inbox does.
   */
  sections?: TeachingSection[];
}

export function Inbox({ eyebrow = "Conversations", title = "Messages", sections }: InboxProps = {}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [composing, setComposing] = useState(false);
  const [replying, setReplying] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);

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

  async function pickReplyFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReplying(true);
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadFile(f)));
      setReplyAttachments((prev) => [...prev, ...uploaded]);
    } finally {
      setReplying(false);
    }
  }

  async function send() {
    if ((!draft.trim() && replyAttachments.length === 0) || !sel || replying) return;
    const body = draft;
    setDraft("");
    const atts = replyAttachments;
    setReplyAttachments([]);
    await sendThreadMessage(sel, body, atts);
    setDetail(await getThread(sel));
    loadThreads();
  }

  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>

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
          <NewMessage sections={sections}
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
                    {b.attachments && b.attachments.length > 0 && (
                      <AttachmentList attachments={b.attachments} tone={b.me ? "me" : "other"} />
                    )}
                  </div>
                  <span style={{ fontSize: 10.5, color: "var(--gray-300)", margin: "3px 6px 0" }}>{fmtTime(b.time)}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div style={{ padding: 16, borderTop: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 8 }}>
              {replyAttachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {replyAttachments.map((a, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-tint)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                      <Paperclip size={12} style={{ flexShrink: 0 }} />
                      <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      <button
                        onClick={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg3)", display: "flex", padding: 0 }}
                        aria-label="Remove attachment"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  ref={replyFileRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => pickReplyFiles(e.target.files)}
                />
                <button
                  onClick={() => replyFileRef.current?.click()}
                  disabled={replying}
                  style={{ border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 10, padding: "0 12px", cursor: "pointer", color: "var(--fg2)", display: "flex", alignItems: "center" }}
                  title="Attach files"
                >
                  <Paperclip size={16} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Write a message…"
                  style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 10, padding: "12px 15px", fontSize: 13.5, outline: "none" }}
                />
                <button onClick={send} className="primary" disabled={(!draft.trim() && replyAttachments.length === 0) || replying} style={{ padding: "0 22px" }}>Send</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function NewMessage({
  onCancel,
  onSent,
  sections,
}: {
  onCancel: () => void;
  onSent: (threadId: string) => void;
  sections?: TeachingSection[];
}) {
  const canBroadcast = Boolean(sections && sections.length > 0);
  const [mode, setMode] = useState<"individual" | "course">("individual");
  const [sectionId, setSectionId] = useState("");
  const [subject, setSubject] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getContacts().then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    if (sections?.[0]) setSectionId((cur) => cur || sections[0]!.id);
  }, [sections]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === contacts.length
        ? new Set<string>()
        : new Set(contacts.map((c) => c.id)),
    );
  };

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((f) => uploadFile(f)),
      );
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (mode === "course" ? !sectionId : selected.size === 0) return;
    if (!body.trim() && attachments.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === "course") {
        // Fans out into per-student 1:1 threads, so each reply comes back privately —
        // and every recipient thread lands in this same inbox as real sent history.
        await broadcastToSection(
          sectionId,
          body.trim(),
          subject.trim() || undefined,
          attachments,
        );
        onSent("");
        return;
      }
      const res = await startThread({
        recipientIds: [...selected],
        subject: subject.trim() || undefined,
        body: body.trim(),
        attachments,
      });
      onSent(res.threadId ?? "");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 24, gap: 14, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, flex: 1 }}>New message</h3>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {canBroadcast && (
        <div style={{ display: "flex", gap: 8 }}>
          {(["individual", "course"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? "primary" : ""}
              onClick={() => setMode(m)}
            >
              {m === "individual" ? "One or more students" : "Whole course"}
            </button>
          ))}
        </div>
      )}
      {mode === "course" ? (
        <>
          <label>
            <span className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Course</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)" }}>
              {(sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.course} · {s.sectionCode}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label>
          <span className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            To ({selected.size} selected)
            {contacts.length > 0 && (
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); toggleAll(); }}
                style={{ marginLeft: 8, fontSize: 11.5, color: "var(--daust-navy)" }}
              >
                {selected.size === contacts.length ? "Clear all" : "Select all"}
              </a>
            )}
          </span>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 9,
              maxHeight: 150,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {contacts.length === 0 && <p className="muted" style={{ padding: "10px 12px", margin: 0 }}>No contacts available to message yet.</p>}
            {contacts.map((c) => (
              <label
                key={c.id}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", cursor: "pointer", fontSize: 13, background: selected.has(c.id) ? "var(--bg-tint)" : "transparent" }}
              >
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: NAVY }} />
                <span>{c.name}</span>
                <span className="muted" style={{ fontSize: 11.5, textTransform: "capitalize", marginLeft: "auto" }}>{c.role.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </label>
      )}
      <label>
        <span className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Optional subject line"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)", fontSize: 13.5 }}
        />
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message…"
        rows={6}
        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 9, padding: "11px 13px", fontSize: 13.5, resize: "vertical", lineHeight: 1.5 }}
      />
      <div>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => pickFiles(e.target.files)}
        />
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "var(--bg-tint)", borderRadius: 8, padding: "7px 11px" }}>
                <Paperclip size={13} style={{ flexShrink: 0, color: "var(--fg3)" }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg3)", display: "flex" }} aria-label="Remove attachment">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)" }}>
          <Paperclip size={13} /> Attach files
        </button>
      </div>
      {err && <span className="muted" style={{ color: "var(--bad)" }}>{err}</span>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="primary"
          onClick={submit}
          disabled={busy || (mode === "course" ? !sectionId : selected.size === 0) || (!body.trim() && attachments.length === 0)}
        >
          {busy ? "Sending…" : `Send${mode === "individual" && selected.size > 1 ? ` (${selected.size})` : ""}`}
        </button>
      </div>
    </div>
  );
}
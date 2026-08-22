"use client";

import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Eye,
  Share2,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Users,
  BarChart3,
  FileText,
} from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { FormQuestion, FormRecord } from "../types";
import { Card, SearchInput, Badge, PageHeader, type BadgeTone } from "@/components/ui";

// ---------- Constants ----------

type QuestionType = FormQuestion["type"];
type TabKey = "questions" | "responses";

const STATUS_TABS = ["All", "Published", "Draft"] as const;
type StatusFilter = (typeof STATUS_TABS)[number];

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
  { value: "rating", label: "Rating (1-5)" },
];

const TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text",
  multiple_choice: "Multiple choice",
  yes_no: "Yes / No",
  rating: "Rating",
};

const TYPE_TONES: Record<QuestionType, BadgeTone> = {
  text: "neutral",
  multiple_choice: "navy",
  yes_no: "info",
  rating: "teal",
};

type Draft = {
  name: string;
  description: string;
  status: FormRecord["status"];
  questions: FormQuestion[];
};

const EMPTY_DRAFT: Draft = { name: "", description: "", status: "Draft", questions: [] };

// ---------- Shared inline styles ----------

const inputStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  fontSize: 13,
  color: "var(--fg1)",
  background: "var(--surface)",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const fieldLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--fg2)",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.4)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: "var(--radius-pill)",
  border: "none",
  background: "var(--daust-navy)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const orangeBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 18px",
  borderRadius: "var(--radius-pill)",
  border: "none",
  background: "var(--daust-orange)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const cancelBtn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--fg2)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: "var(--radius-pill)",
  border: "none",
  background: "var(--danger-500)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const iconBtn: CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "var(--fg3)",
  padding: 6,
  borderRadius: "var(--radius-md)",
  display: "inline-flex",
  alignItems: "center",
};

// ---------- Helpers ----------

function nextQuestionId(questions: FormQuestion[]): string {
  let max = 0;
  for (const qq of questions) {
    const m = qq.id.match(/\d+/);
    if (m) max = Math.max(max, parseInt(m[0], 10));
  }
  return `Q${max + 1}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "form"
  );
}

function shareLinkFor(f: FormRecord): string {
  const existing = f.shareLink?.trim();
  if (existing) return existing;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/health/forms/${slugify(f.name)}?id=${f.id}`;
  }
  return `/health/forms/${slugify(f.name)}?id=${f.id}`;
}

function formatSubmitted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

// ---------- Small building blocks ----------

function Modal({
  width,
  onClose,
  children,
}: {
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          width,
          maxWidth: "94vw",
          maxHeight: "86vh",
          overflowY: "auto",
          boxShadow: "0 8px 30px rgba(0,0,0,.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalTitle({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--fg1)" }}>{title}</h2>
      <button aria-label="Close" onClick={onClose} style={iconBtn}>
        <X size={18} />
      </button>
    </div>
  );
}

function QuestionRow({
  index,
  question,
  onDelete,
}: {
  index: number;
  question: FormQuestion;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-subtle)",
      }}
    >
      <span
        style={{
          minWidth: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--bg-tint)",
          color: "var(--daust-navy)",
          fontSize: 11.5,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--fg1)", wordBreak: "break-word" }}>
          {question.text}
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={TYPE_TONES[question.type]}>{TYPE_LABELS[question.type]}</Badge>
          {question.required && <Badge tone="warning">Required</Badge>}
        </div>
      </div>
      <button aria-label="Remove question" title="Remove question" onClick={onDelete} style={iconBtn}>
        <Trash2 size={14} color="var(--danger-500)" />
      </button>
    </div>
  );
}

function QuestionComposer({
  onAdd,
}: {
  onAdd: (q: Omit<FormQuestion, "id">) => void;
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState<QuestionType>("text");
  const [required, setRequired] = useState(true);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({ text: trimmed, type, required });
    setText("");
    setType("text");
    setRequired(true);
  }

  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface)",
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Type a new question…"
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType)}
          style={{ ...inputStyle, width: "auto", flex: "1 1 160px" }}
        >
          {QUESTION_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRequired((r) => !r)}
          title="Toggle whether an answer is required"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 12px",
            borderRadius: "var(--radius-pill)",
            border: `1px solid ${required ? "var(--daust-navy)" : "var(--border)"}`,
            background: required ? "var(--bg-tint)" : "transparent",
            color: required ? "var(--daust-navy)" : "var(--fg3)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Check size={12} /> Required
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          style={{
            ...primaryBtn,
            opacity: text.trim() ? 1 : 0.45,
            cursor: text.trim() ? "pointer" : "not-allowed",
          }}
        >
          <Plus size={14} /> Add question
        </button>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function FormsPage() {
  const { store, addForm, updateForm, deleteForm, deleteFormResponse, loading, error } = useInfirmaryStore();

  if (loading) {
    return <div className="loading-state">Loading…</div>;
  }
  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load data.</p>
        <p>{error}</p>
      </div>
    );
  }

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<TabKey>("questions");
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);

  const [shareId, setShareId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      store.forms.filter(
        (f) =>
          (statusFilter === "All" || f.status === statusFilter) &&
          (f.name.toLowerCase().includes(query) || f.description.toLowerCase().includes(query)),
      ),
    [store.forms, statusFilter, query],
  );

  const detailForm = detailId ? (() => { const f = store.forms.find((x) => x.id === detailId); return f ? { ...f, questions: f.questions || [], } : null; })() : null;
  const shareForm = shareId ? store.forms.find((f) => f.id === shareId) ?? null : null;
  const confirmForm = confirmDeleteId ? store.forms.find((f) => f.id === confirmDeleteId) ?? null : null;
  const detailResponses = useMemo(
    () => store.formResponses.filter((r) => r.formId === detailId),
    [store.formResponses, detailId],
  );

  function showToast(message: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setEditorOpen(true);
  }

  function openEdit(f: FormRecord) {
    setDraft({ name: f.name, description: f.description, status: f.status, questions: f.questions || [] });
    setEditingId(f.id);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
  }

  async function saveEditor() {
    const name = draft.name.trim();
    if (!name) return;
    const payload = { name, description: draft.description.trim(), status: draft.status, questions: draft.questions };
    try {
      if (editingId) {
        await updateForm(editingId, payload);
        showToast("Form updated");
      } else {
        await addForm({ ...payload, id: "", responses: 0, completion: 0, updated: "Just now" });
        showToast("Form created");
      }
      setEditorOpen(false);
      setEditingId(null);
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    }
  }

  function openDetail(f: FormRecord) {
    setDetailId(f.id);
    setDetailTab("questions");
    setExpandedResponseId(null);
  }

  function openShare(f: FormRecord) {
    const link = shareLinkFor(f);
    if (!f.shareLink) updateForm(f.id, { shareLink: link });
    setCopied(false);
    setShareId(f.id);
  }

  async function copyShareLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  function confirmDelete() {
    if (!confirmDeleteId) return;
    deleteForm(confirmDeleteId);
    setConfirmDeleteId(null);
    if (detailId === confirmDeleteId) setDetailId(null);
    showToast("Form deleted");
  }

  const thStyle: CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontWeight: 600,
    color: "var(--fg3)",
    fontSize: 11.5,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <PageHeader
        eyebrow="Health Center"
        title="Forms"
        subtitle="Health questionnaires and surveys sent to students"
        actions={
          <button onClick={openAdd} style={orangeBtn}>
            <Plus size={15} /> New Form
          </button>
        }
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search forms..." />
        <div style={{ display: "flex", gap: 4 }}>
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border)",
                background: statusFilter === s ? "var(--daust-navy)" : "transparent",
                color: statusFilter === s ? "#fff" : "var(--fg2)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {filtered.map((f) => (
          <div
            key={f.id}
            role="button"
            tabIndex={0}
            onClick={() => openDetail(f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDetail(f);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <Card lift>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-tint)",
                    color: "var(--daust-navy)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FileText size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--fg1)" }}>{f.name}</h3>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 12.5 }}>{f.description}</p>
                </div>
                <Badge tone={f.status === "Published" ? "success" : "neutral"}>{f.status}</Badge>
              </div>

              <div style={{ display: "flex", gap: 18, marginBottom: 10, fontSize: 12.5, alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg2)" }}>
                  <Users size={14} color="var(--daust-navy)" />
                  <strong>{f.responses}</strong> responses
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--fg2)" }}>
                  <BarChart3 size={14} color="var(--daust-navy)" />
                  <strong>{f.completion}%</strong> completion
                </span>
              </div>
              <div style={{ height: 6, background: "var(--bg-subtle)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, f.completion))}%`,
                    background: "var(--daust-navy)",
                    borderRadius: 3,
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--divider)",
                  paddingTop: 10,
                }}
              >
                <span className="muted" style={{ fontSize: 12 }}>Updated {f.updated}</span>
                <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  <button aria-label="View details" title="View details" onClick={() => openDetail(f)} style={iconBtn}>
                    <Eye size={14} />
                  </button>
                  <button aria-label="Share form" title="Share form" onClick={() => openShare(f)} style={iconBtn}>
                    <Share2 size={14} />
                  </button>
                  <button aria-label="Edit form" title="Edit form" onClick={() => openEdit(f)} style={iconBtn}>
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete form"
                    title="Delete form"
                    onClick={() => setConfirmDeleteId(f.id)}
                    style={iconBtn}
                  >
                    <Trash2 size={14} color="var(--danger-500)" />
                  </button>
                </div>
              </div>
            </Card>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--fg3)", padding: 24 }}>
            No forms found.
          </p>
        )}
      </div>

      {/* ---------- Detail modal (Questions / Responses) ---------- */}
      {detailForm && (
        <Modal width={760} onClose={() => setDetailId(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--fg1)" }}>{detailForm.name}</h2>
                <Badge tone={detailForm.status === "Published" ? "success" : "neutral"}>{detailForm.status}</Badge>
              </div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{detailForm.description}</p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                {detailForm.questions.length} questions · {detailResponses.length} responses · Updated {detailForm.updated}
              </p>
            </div>
            <button aria-label="Close" onClick={() => setDetailId(null)} style={iconBtn}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", margin: "16px 0 16px" }}>
            {([
              ["questions", `Questions (${detailForm.questions.length})`],
              ["responses", `Responses (${detailResponses.length})`],
            ] as const).map(([value, label]) => {
              const on = detailTab === value;
              return (
                <button
                  key={value}
                  onClick={() => setDetailTab(value)}
                  style={{
                    border: "none",
                    background: "none",
                    padding: "9px 14px",
                    marginBottom: -1,
                    borderBottom: `2px solid ${on ? "var(--daust-navy)" : "transparent"}`,
                    color: on ? "var(--daust-navy)" : "var(--fg3)",
                    fontWeight: on ? 700 : 500,
                    fontSize: 13.5,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {detailTab === "questions" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {detailForm.questions.length === 0 && (
                <p className="muted" style={{ textAlign: "center", fontSize: 13, padding: "12px 0" }}>
                  No questions yet. Add the first one below.
                </p>
              )}
              {detailForm.questions.map((qq, i) => (
                <QuestionRow
                  key={qq.id}
                  index={i}
                  question={qq}
                  onDelete={() =>
                    updateForm(detailForm.id, {
                      questions: detailForm.questions.filter((x) => x.id !== qq.id),
                    })
                  }
                />
              ))}
              <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
                <QuestionComposer
                  onAdd={(base) =>
                    updateForm(detailForm.id, {
                      questions: [...detailForm.questions, { id: nextQuestionId(detailForm.questions), ...base }],
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <div>
              {detailResponses.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", fontSize: 13, padding: "24px 0" }}>
                  No responses yet for this form.
                </p>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={thStyle}>Student</th>
                        <th style={thStyle}>Submitted</th>
                        <th style={thStyle}>Answers</th>
                        <th style={thStyle}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailResponses.map((r) => {
                        const open = expandedResponseId === r.id;
                        const total = detailForm.questions.length;
                        const answered = detailForm.questions.filter(
                          (qq) => (r.answers[qq.id] ?? "").trim() !== "",
                        ).length;
                        return (
                          <Fragment key={r.id}>
                            <tr
                              onClick={() => setExpandedResponseId(open ? null : r.id)}
                              style={{
                                cursor: "pointer",
                                borderBottom: "1px solid var(--divider)",
                                background: open ? "var(--bg-tint)" : "transparent",
                              }}
                            >
                              <td style={{ padding: "10px 14px", fontWeight: 600 }}>{r.studentName}</td>
                              <td style={{ padding: "10px 14px", fontSize: 12.5, whiteSpace: "nowrap" }}>
                                {formatSubmitted(r.submittedAt)}
                              </td>
                              <td style={{ padding: "10px 14px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                                {answered}/{total}
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                                <button
                                  aria-label="Delete response"
                                  title="Delete response"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteFormResponse(r.id);
                                    showToast("Response deleted");
                                  }}
                                  style={iconBtn}
                                >
                                  <Trash2 size={14} color="var(--danger-500)" />
                                </button>
                              </td>
                            </tr>
                            {open && (
                              <tr style={{ background: "var(--bg-tint)" }}>
                                <td colSpan={4} style={{ padding: "0 14px 14px" }}>
                                  {detailForm.questions.length === 0 ? (
                                    <p className="muted" style={{ fontSize: 12.5, margin: "0 0 4px" }}>
                                      This form no longer has questions defined.
                                    </p>
                                  ) : (
                                    <div
                                      style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--radius-md)",
                                        background: "var(--surface)",
                                        padding: "4px 16px",
                                      }}
                                    >
                                      {detailForm.questions.map((qq, qi) => {
                                        const ans = (r.answers[qq.id] ?? "").trim();
                                        return (
                                          <div
                                            key={qq.id}
                                            style={{
                                              padding: "10px 0",
                                              borderBottom:
                                                qi === detailForm.questions.length - 1
                                                  ? "none"
                                                  : "1px solid var(--divider)",
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: 11.5,
                                                fontWeight: 700,
                                                letterSpacing: ".04em",
                                                textTransform: "uppercase",
                                                color: "var(--fg3)",
                                                marginBottom: 3,
                                              }}
                                            >
                                              {qq.text}
                                              {qq.required ? " *" : ""}
                                            </div>
                                            <div style={{ fontSize: 13, color: ans ? "var(--fg1)" : "var(--fg3)" }}>
                                              {ans || "No answer provided"}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
                Click a row to expand and review all answers.
              </p>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={() => setDetailId(null)} style={cancelBtn}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* ---------- Share modal ---------- */}
      {shareForm && (
        <Modal width={480} onClose={() => setShareId(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "var(--radius-md)",
                background: "var(--bg-tint)",
                color: "var(--daust-navy)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Link2 size={16} />
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>Share form</h2>
            <button aria-label="Close" onClick={() => setShareId(null)} style={iconBtn}>
              <X size={18} />
            </button>
          </div>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>{shareForm.name}</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input
              readOnly
              value={shareLinkFor(shareForm)}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...inputStyle, flex: 1, background: "var(--bg-subtle)", color: "var(--fg2)" }}
            />
            <button
              onClick={() => copyShareLink(shareLinkFor(shareForm))}
              style={{
                ...primaryBtn,
                background: copied ? "var(--success-500)" : "var(--daust-navy)",
                flexShrink: 0,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 12 }}>
            Anyone with this link can view and fill out the form.
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => showToast("Share link emailed to students")}
              style={{ ...primaryBtn, flex: "1 1 auto" }}
            >
              <Share2 size={14} /> Share via Email
            </button>
            <a
              href={shareLinkFor(shareForm)}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--daust-navy)",
                background: "transparent",
                color: "var(--daust-navy)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <ExternalLink size={14} /> Open Form
            </a>
          </div>
        </Modal>
      )}

      {/* ---------- Add / Edit form modal ---------- */}
      {editorOpen && (
        <Modal width={600} onClose={closeEditor}>
          <ModalTitle title={editingId ? "Edit Form" : "New Form"} onClose={closeEditor} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={fieldLabelStyle}>
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Dormitory health screening"
                style={inputStyle}
              />
            </label>
            <label style={fieldLabelStyle}>
              Description
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What is this form for?"
                style={inputStyle}
              />
            </label>
            <label style={{ ...fieldLabelStyle, maxWidth: 220 }}>
              Status
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as FormRecord["status"] })}
                style={inputStyle}
              >
                {(["Published", "Draft"] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 14, marginTop: 2 }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "var(--fg1)" }}>
                Questions ({draft.questions.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {draft.questions.length === 0 && (
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                    No questions yet — add at least one before publishing.
                  </p>
                )}
                {draft.questions.map((qq, i) => (
                  <QuestionRow
                    key={qq.id}
                    index={i}
                    question={qq}
                    onDelete={() =>
                      setDraft((d) => ({ ...d, questions: d.questions.filter((x) => x.id !== qq.id) }))
                    }
                  />
                ))}
                <QuestionComposer
                  onAdd={(base) =>
                    setDraft((d) => ({
                      ...d,
                      questions: [...d.questions, { id: nextQuestionId(d.questions), ...base }],
                    }))
                  }
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
              <button onClick={closeEditor} style={cancelBtn}>
                Cancel
              </button>
              <button
                onClick={saveEditor}
                disabled={!draft.name.trim()}
                style={{ ...primaryBtn, opacity: draft.name.trim() ? 1 : 0.45, cursor: draft.name.trim() ? "pointer" : "not-allowed" }}
              >
                {editingId ? "Save changes" : "Create form"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ---------- Delete confirmation ---------- */}
      {confirmForm && (
        <Modal width={400} onClose={() => setConfirmDeleteId(null)}>
          <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>Delete form?</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
            &ldquo;{confirmForm.name}&rdquo; and all of its responses will be permanently removed. This cannot be
            undone.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button onClick={() => setConfirmDeleteId(null)} style={cancelBtn}>
              Cancel
            </button>
            <button onClick={confirmDelete} style={dangerBtn}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </Modal>
      )}

      {/* ---------- Toast ---------- */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--daust-navy)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "var(--radius-pill)",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
            zIndex: 1100,
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

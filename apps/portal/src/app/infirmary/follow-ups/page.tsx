"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Pencil, Trash2, X, Eye, CheckCircle2, AlarmClock } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { FollowUp } from "../types";
import { Card, SearchInput, Badge, type BadgeTone } from "@/components/ui";

const STATUSES: FollowUp["status"][] = ["Pending", "Completed", "Overdue", "Cancelled"];
const PRIORITIES: FollowUp["priority"][] = ["High", "Medium", "Low"];
const STATUS_FILTERS = ["All", ...STATUSES];
const PRIORITY_FILTERS = ["All", ...PRIORITIES];

function emptyForm(): FollowUp {
  return {
    id: "", studentId: "", studentName: "", reason: "",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: "Pending", priority: "Medium", notes: "",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function startOfToday(): number {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

function isPastDue(f: FollowUp): boolean {
  if (f.status === "Completed" || f.status === "Cancelled") return false;
  return new Date(f.dueDate + "T00:00:00").getTime() < startOfToday();
}

function statusTone(s: FollowUp["status"]): BadgeTone {
  return s === "Completed" ? "success" : s === "Overdue" ? "error" : s === "Pending" ? "warning" : "neutral";
}

function priorityTone(p: FollowUp["priority"]): BadgeTone {
  return p === "High" ? "error" : p === "Medium" ? "warning" : "info";
}

const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" };

const fieldStyle: CSSProperties = {
  padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  fontSize: 13, color: "var(--fg1)", background: "var(--surface)", fontFamily: "inherit",
};

const thStyle: CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "var(--fg3)",
  fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = { padding: "10px 14px" };

const sectionLabelStyle: CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: "var(--fg3)",
  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6,
};

const boxStyle: CSSProperties = {
  padding: 12, background: "var(--bg-subtle)", border: "1px solid var(--divider)",
  borderRadius: "var(--radius-md)", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap",
};

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};

const modalStyle: CSSProperties = {
  background: "var(--surface)", borderRadius: "var(--radius-lg)", width: "100%",
  maxWidth: "90vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,.22)",
};

const closeBtnStyle: CSSProperties = { border: "none", background: "none", cursor: "pointer", color: "var(--fg3)", padding: 4 };

const primaryBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
  borderRadius: "var(--radius-pill)", border: "none", background: "var(--daust-orange)",
  color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

const ghostBtnStyle: CSSProperties = {
  padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)",
  background: "transparent", color: "var(--fg2)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const navyBtnStyle: CSSProperties = {
  padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "none",
  background: "var(--daust-navy)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

const successBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
  borderRadius: "var(--radius-pill)", border: "none", background: "var(--success-500)",
  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

function actionBtn(color: string): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28,
    height: 28, borderRadius: "var(--radius-md)", border: "none", background: "transparent",
    color, cursor: "pointer", padding: 0,
  };
}

function pill(on: boolean): CSSProperties {
  return {
    padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)",
    background: on ? "var(--daust-navy)" : "transparent",
    color: on ? "#fff" : "var(--fg2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}

function MetaTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg1)" }}>{children}</div>
    </div>
  );
}

export default function FollowUpsPage() {
  const { store, addFollowUp, updateFollowUp, deleteFollowUp } = useInfirmaryStore();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [form, setForm] = useState<FollowUp>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const followUps = store.followUps;
  const lowerQ = q.toLowerCase();
  const filtered = followUps.filter(
    (f) =>
      (statusFilter === "All" || f.status === statusFilter) &&
      (priorityFilter === "All" || f.priority === priorityFilter) &&
      (f.studentName.toLowerCase().includes(lowerQ) ||
        f.reason.toLowerCase().includes(lowerQ) ||
        f.notes.toLowerCase().includes(lowerQ) ||
        f.id.toLowerCase().includes(lowerQ)),
  );
  const detail = detailId ? followUps.find((f) => f.id === detailId) ?? null : null;

  const overdueCount = followUps.filter((f) => f.status === "Overdue" || isPastDue(f)).length;
  const stats = [
    { label: "Total", value: followUps.length, color: "var(--fg1)" },
    { label: "Pending", value: followUps.filter((f) => f.status === "Pending").length, color: "var(--daust-orange)" },
    { label: "Overdue", value: overdueCount, color: "var(--danger-500)" },
    { label: "Completed", value: followUps.filter((f) => f.status === "Completed").length, color: "var(--success-500)" },
  ];

  const trimmed = form.studentName.trim().toLowerCase();
  const suggestions =
    trimmed.length > 0
      ? store.students.filter((s) => s.name.toLowerCase().includes(trimmed) && s.name.toLowerCase() !== trimmed).slice(0, 5)
      : [];

  function setField<K extends keyof FollowUp>(key: K, value: FollowUp[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setForm(emptyForm());
    setEditing(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  function openEdit(f: FollowUp) {
    setForm({ ...f });
    setEditing(f.id);
    setDetailId(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  function save() {
    if (!form.studentName.trim() || !form.reason.trim()) return;
    if (editing) updateFollowUp(editing, form);
    else addFollowUp(form);
    setShowForm(false);
  }

  function pickStudent(id: string, name: string) {
    setForm((f) => ({ ...f, studentId: id, studentName: name }));
    setShowSuggestions(false);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Follow-ups</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>Pending follow-up tasks</p>
        </div>
        <button onClick={openAdd} style={primaryBtnStyle}>
          <Plus size={15} /> New Follow-up
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg3)" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search follow-ups..." />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} style={pill(statusFilter === s)}>
              {s}
            </button>
          ))}
        </div>
        <span style={{ width: 1, height: 20, background: "var(--border)" }} aria-hidden />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg3)" }}>Priority</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PRIORITY_FILTERS.map((p) => (
            <button key={p} onClick={() => setPriorityFilter(p)} style={pill(priorityFilter === p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["ID", "Student", "Reason", "Due Date", "Status", "Priority", "Notes", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const overdue = isPastDue(f) || f.status === "Overdue";
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{f.id}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{f.studentName}</td>
                    <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.reason}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, whiteSpace: "nowrap", color: overdue ? "var(--danger-500)" : "var(--fg2)", fontWeight: overdue ? 700 : 400 }}>
                        {overdue && <AlarmClock size={13} />}
                        {f.dueDate}
                        {overdue && <span style={{ fontSize: 11 }}>(overdue)</span>}
                      </div>
                    </td>
                    <td style={tdStyle}><Badge tone={statusTone(f.status)}>{f.status}</Badge></td>
                    <td style={tdStyle}><Badge tone={priorityTone(f.priority)}>{f.priority}</Badge></td>
                    <td style={{ ...tdStyle, fontSize: 12.5, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: f.notes ? "var(--fg2)" : "var(--fg3)" }}>
                      {f.notes || "—"}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button title="View details" onClick={() => setDetailId(f.id)} style={actionBtn("var(--daust-navy)")}>
                          <Eye size={15} />
                        </button>
                        <button title="Edit" onClick={() => openEdit(f)} style={actionBtn("var(--fg2)")}>
                          <Pencil size={14} />
                        </button>
                        <button title="Delete" onClick={() => deleteFollowUp(f.id)} style={actionBtn("var(--danger-500)")}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--fg3)" }}>
                    No follow-ups found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && (
        <div onClick={() => setDetailId(null)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 540 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid var(--divider)" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Follow-up {detail.id}</p>
                <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 800 }}>{detail.studentName}</h2>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>Created {detail.createdAt}</p>
              </div>
              <button onClick={() => setDetailId(null)} aria-label="Close" style={closeBtnStyle}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <MetaTile label="Reason">{detail.reason}</MetaTile>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <MetaTile label="Status"><Badge tone={statusTone(detail.status)}>{detail.status}</Badge></MetaTile>
                <MetaTile label="Priority"><Badge tone={priorityTone(detail.priority)}>{detail.priority}</Badge></MetaTile>
                <MetaTile label="Due Date">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: isPastDue(detail) ? "var(--danger-500)" : undefined, fontWeight: isPastDue(detail) ? 700 : undefined }}>
                    {isPastDue(detail) && <AlarmClock size={13} />}
                    {detail.dueDate}
                  </span>
                </MetaTile>
                <MetaTile label="Student ID">{detail.studentId || "—"}</MetaTile>
              </div>

              <div>
                <div style={sectionLabelStyle}>Notes</div>
                <div style={boxStyle}>{detail.notes || "No notes recorded."}</div>
              </div>

              {isPastDue(detail) && (
                <div style={{ background: "#fbe6e3", border: "1px solid var(--danger-500)", color: "var(--danger-500)", borderRadius: "var(--radius-md)", padding: "9px 12px", fontSize: 12.5, fontWeight: 600 }}>
                  This task is past its due date — complete it as soon as possible.
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                {detail.status !== "Completed" ? (
                  <button onClick={() => updateFollowUp(detail.id, { status: "Completed" })} style={successBtnStyle}>
                    <CheckCircle2 size={15} /> Mark Complete
                  </button>
                ) : (
                  <button onClick={() => updateFollowUp(detail.id, { status: "Pending" })} style={{ ...successBtnStyle, background: "var(--surface)", color: "var(--success-500)", border: "1px solid var(--success-500)" }}>
                    Reopen Task
                  </button>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setDetailId(null)} style={ghostBtnStyle}>Close</button>
                  <button onClick={() => openEdit(detail)} style={navyBtnStyle}>Edit</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px 16px", borderBottom: "1px solid var(--divider)" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                {editing ? `Edit Follow-up ${editing}` : "New Follow-up"}
              </h2>
              <button onClick={() => setShowForm(false)} aria-label="Close" style={closeBtnStyle}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={labelStyle}>
                Student Name
                <div style={{ position: "relative" }}>
                  <input
                    value={form.studentName}
                    placeholder="Start typing a student name..."
                    onChange={(e) => {
                      setField("studentName", e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                    style={fieldStyle}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.14)" }}>
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickStudent(s.id, s.name)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid var(--divider)", background: "transparent", fontSize: 13, color: "var(--fg1)", cursor: "pointer" }}
                        >
                          <strong style={{ fontWeight: 600 }}>{s.name}</strong>
                          <span style={{ color: "var(--fg3)", marginLeft: 8, fontSize: 12 }}>{s.program}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>

              <label style={labelStyle}>
                Reason
                <input value={form.reason} onChange={(e) => setField("reason", e.target.value)} placeholder="What needs to be followed up?" style={fieldStyle} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Due Date
                  <input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} style={fieldStyle} />
                </label>
                <label style={labelStyle}>
                  Priority
                  <select value={form.priority} onChange={(e) => setField("priority", e.target.value as FollowUp["priority"])} style={fieldStyle}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
              </div>

              <label style={labelStyle}>
                Status
                <select value={form.status} onChange={(e) => setField("status", e.target.value as FollowUp["status"])} style={fieldStyle}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>

              <label style={labelStyle}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={3}
                  placeholder="Context, expected outcome..."
                  style={{ ...fieldStyle, resize: "vertical" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button onClick={() => setShowForm(false)} style={ghostBtnStyle}>Cancel</button>
                <button
                  onClick={save}
                  disabled={!form.studentName.trim() || !form.reason.trim()}
                  style={{ ...navyBtnStyle, opacity: !form.studentName.trim() || !form.reason.trim() ? 0.5 : 1 }}
                >
                  {editing ? "Save Changes" : "Create Follow-up"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

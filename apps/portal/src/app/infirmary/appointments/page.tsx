"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Pencil, Trash2, X, Eye, CalendarDays, Clock } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { Appointment } from "../types";
import { Card, SearchInput, Badge, type BadgeTone } from "@/components/ui";

const STATUSES: Appointment["status"][] = ["Scheduled", "Checked In", "Completed", "No Show", "Cancelled"];
const TYPES = ["Routine", "Follow-up", "Consultation", "Walk-in", "Emergency"];
const FILTERS = ["All", ...STATUSES];

function emptyForm(): Appointment {
  return {
    id: "", studentId: "", studentName: "", date: new Date().toISOString().slice(0, 10),
    time: "09:00", type: "Routine", reason: "", status: "Scheduled", notes: "",
  };
}

function statusTone(s: Appointment["status"]): BadgeTone {
  return s === "Scheduled" ? "info" : s === "Checked In" ? "navy" : s === "Completed" ? "success" : s === "No Show" ? "error" : "neutral";
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

function quickBtn(bg: string, fg = "#fff"): CSSProperties {
  return {
    padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "none",
    background: bg, color: fg, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
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

function SectionBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={boxStyle}>{children}</div>
    </div>
  );
}

export default function AppointmentsPage() {
  const { store, addAppointment, updateAppointment, deleteAppointment, loading, error } = useInfirmaryStore();


  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState<Appointment>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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


  const appointments = store.appointments;
  const lowerQ = q.toLowerCase();
  const filtered = appointments.filter(
    (a) =>
      (statusFilter === "All" || a.status === statusFilter) &&
      (a.studentName.toLowerCase().includes(lowerQ) ||
        a.reason.toLowerCase().includes(lowerQ) ||
        a.type.toLowerCase().includes(lowerQ) ||
        a.id.toLowerCase().includes(lowerQ)),
  );
  const detail = detailId ? appointments.find((a) => a.id === detailId) ?? null : null;

  const countByStatus = (s: Appointment["status"]) => appointments.filter((a) => a.status === s).length;
  const stats = [
    { label: "Total", value: appointments.length, color: "var(--fg1)" },
    { label: "Scheduled", value: countByStatus("Scheduled"), color: "var(--info)" },
    { label: "Completed", value: countByStatus("Completed"), color: "var(--success-500)" },
    { label: "No Show", value: countByStatus("No Show"), color: "var(--daust-orange)" },
    { label: "Cancelled", value: countByStatus("Cancelled"), color: "var(--danger-500)" },
  ];

  const trimmed = form.studentName.trim().toLowerCase();
  const suggestions =
    trimmed.length > 0
      ? store.students.filter((s) => s.name.toLowerCase().includes(trimmed) && s.name.toLowerCase() !== trimmed).slice(0, 5)
      : [];

  function setField<K extends keyof Appointment>(key: K, value: Appointment[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setForm(emptyForm());
    setEditing(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  function openEdit(a: Appointment) {
    setForm({ ...a });
    setEditing(a.id);
    setDetailId(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  async function save() {
    if (!form.studentName.trim() || !form.reason.trim()) return;
    try {
      if (editing) await updateAppointment(editing, form);
      else await addAppointment(form);
      setShowForm(false);
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    }
  }

  function pickStudent(id: string, name: string) {
    setForm((f) => ({ ...f, studentId: id, studentName: name }));
    setShowSuggestions(false);
  }

  const isOpen = detail !== null && (detail.status === "Scheduled" || detail.status === "Checked In");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Appointments</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>Scheduled visits and check-ins</p>
        </div>
        <button onClick={openAdd} style={primaryBtnStyle}>
          <Plus size={15} /> New Appointment
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
        <SearchInput value={q} onChange={setQ} placeholder="Search appointments..." />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTERS.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} style={pill(statusFilter === s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["ID", "Student", "Date", "Time", "Type", "Reason", "Status", "Notes", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{a.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{a.studentName}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5, whiteSpace: "nowrap" }}>{a.date}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5, whiteSpace: "nowrap" }}>{a.time}</td>
                  <td style={tdStyle}>{a.type}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.reason}</td>
                  <td style={tdStyle}><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
                  <td style={{ ...tdStyle, fontSize: 12.5, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: a.notes ? "var(--fg2)" : "var(--fg3)" }}>
                    {a.notes || "—"}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button title="View details" onClick={() => setDetailId(a.id)} style={actionBtn("var(--daust-navy)")}>
                        <Eye size={15} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(a)} style={actionBtn("var(--fg2)")}>
                        <Pencil size={14} />
                      </button>
                      <button title="Delete" onClick={() => deleteAppointment(a.id)} style={actionBtn("var(--danger-500)")}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--fg3)" }}>
                    No appointments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && (
        <div onClick={() => setDetailId(null)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid var(--divider)" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Appointment {detail.id}</p>
                <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 800 }}>{detail.studentName}</h2>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={13} /> {detail.date}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {detail.time}</span>
                </p>
              </div>
              <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>
              <button onClick={() => setDetailId(null)} aria-label="Close" style={{ ...closeBtnStyle, marginLeft: 4 }}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <MetaTile label="Reason">{detail.reason}</MetaTile>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <MetaTile label="Visit Type">{detail.type}</MetaTile>
                <MetaTile label="Student ID">{detail.studentId || "—"}</MetaTile>
                <MetaTile label="Status"><Badge tone={statusTone(detail.status)}>{detail.status}</Badge></MetaTile>
              </div>

              <SectionBlock label="Notes">{detail.notes || "No notes for this appointment."}</SectionBlock>

              <div>
                <div style={sectionLabelStyle}>Quick Actions</div>
                {isOpen ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {detail.status === "Scheduled" && (
                      <button onClick={() => updateAppointment(detail.id, { status: "Checked In" })} style={quickBtn("var(--success-500)")}>
                        Check In
                      </button>
                    )}
                    <button onClick={() => updateAppointment(detail.id, { status: "Completed" })} style={quickBtn("var(--daust-navy)")}>
                      Complete
                    </button>
                    <button onClick={() => updateAppointment(detail.id, { status: "No Show" })} style={quickBtn("var(--daust-orange)")}>
                      No Show
                    </button>
                    <button onClick={() => updateAppointment(detail.id, { status: "Cancelled" })} style={{ ...quickBtn("var(--surface)", "var(--danger-500)"), border: "1px solid var(--danger-500)" }}>
                      Cancel Visit
                    </button>
                  </div>
                ) : (
                  <div style={{ ...boxStyle, color: "var(--fg3)" }}>This appointment is closed — no further actions available.</div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button onClick={() => setDetailId(null)} style={ghostBtnStyle}>Close</button>
                <button onClick={() => openEdit(detail)} style={navyBtnStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Pencil size={13} /> Edit</span>
                </button>
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
                {editing ? `Edit Appointment ${editing}` : "New Appointment"}
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
                <input value={form.reason} onChange={(e) => setField("reason", e.target.value)} placeholder="Reason for the visit" style={fieldStyle} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Date
                  <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} style={fieldStyle} />
                </label>
                <label style={labelStyle}>
                  Time
                  <input type="time" value={form.time} onChange={(e) => setField("time", e.target.value)} style={fieldStyle} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Type
                  <select value={form.type} onChange={(e) => setField("type", e.target.value)} style={fieldStyle}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  Status
                  <select value={form.status} onChange={(e) => setField("status", e.target.value as Appointment["status"])} style={fieldStyle}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>

              <label style={labelStyle}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={3}
                  placeholder="Preparation instructions, reminders..."
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
                  {editing ? "Save Changes" : "Create Appointment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

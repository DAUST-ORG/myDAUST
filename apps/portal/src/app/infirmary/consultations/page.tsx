"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Pencil, Trash2, X, Eye, Thermometer, Heart, Activity, Weight } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { Consultation } from "../types";
import { Card, SearchInput, Badge } from "@/components/ui";

type VitalKey = keyof NonNullable<Consultation["vitals"]>;

const VISIT_TYPES = ["Routine", "Follow-up", "Walk-in", "Emergency"];
const STATUS_OPTIONS = ["Completed", "In Progress", "Cancelled"];
const FILTERS = ["All", ...STATUS_OPTIONS];

const VITAL_INPUTS: [VitalKey, string, string][] = [
  ["temperature", "Temperature (°C)", "36.8"],
  ["bloodPressure", "Blood Pressure (mmHg)", "120/80"],
  ["heartRate", "Heart Rate (bpm)", "72"],
  ["weight", "Weight (kg)", "65"],
];

function emptyForm(): Consultation {
  return {
    id: "", studentId: "", studentName: "", reason: "", visitType: "Routine", clinicalNotes: "",
    status: "In Progress", date: new Date().toISOString().slice(0, 10), time: "09:00",
    followUpRequired: false, vitals: {}, diagnosis: "", treatmentPlan: "",
  };
}

function statusTone(s: string): "success" | "warning" | "neutral" {
  return s === "Completed" ? "success" : s === "In Progress" ? "warning" : "neutral";
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

function MetaTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg1)" }}>{children}</div>
    </div>
  );
}

function SectionBlock({ label, accent, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={accent ? { ...boxStyle, borderLeft: "3px solid var(--daust-orange)" } : boxStyle}>{children}</div>
    </div>
  );
}

export default function ConsultationsPage() {
  const { store, addConsultation, updateConsultation, deleteConsultation } = useInfirmaryStore();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState<Consultation>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const consultations = store.consultations;
  const lowerQ = q.toLowerCase();
  const filtered = consultations.filter(
    (c) =>
      (statusFilter === "All" || c.status === statusFilter) &&
      (c.studentName.toLowerCase().includes(lowerQ) ||
        c.reason.toLowerCase().includes(lowerQ) ||
        c.id.toLowerCase().includes(lowerQ)),
  );
  const detail = detailId ? consultations.find((c) => c.id === detailId) ?? null : null;

  const stats = [
    { label: "Total", value: consultations.length, color: "var(--daust-navy)" },
    { label: "Completed", value: consultations.filter((c) => c.status === "Completed").length, color: "var(--success-500)" },
    { label: "In Progress", value: consultations.filter((c) => c.status === "In Progress").length, color: "var(--daust-orange)" },
    { label: "Cancelled", value: consultations.filter((c) => c.status === "Cancelled").length, color: "var(--danger-500)" },
  ];

  const trimmed = form.studentName.trim().toLowerCase();
  const suggestions =
    trimmed.length > 0
      ? store.students.filter((s) => s.name.toLowerCase().includes(trimmed) && s.name.toLowerCase() !== trimmed).slice(0, 5)
      : [];

  function setField<K extends keyof Consultation>(key: K, value: Consultation[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setVital(key: VitalKey, value: string) {
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [key]: value } }));
  }

  function openAdd() {
    setForm(emptyForm());
    setEditing(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  function openEdit(c: Consultation) {
    setForm({ ...c, vitals: c.vitals ? { ...c.vitals } : {} });
    setEditing(c.id);
    setShowSuggestions(false);
    setShowForm(true);
  }

  function save() {
    if (!form.studentName.trim() || !form.reason.trim()) return;
    if (editing) updateConsultation(editing, form);
    else addConsultation(form);
    setShowForm(false);
  }

  function pickStudent(id: string, name: string) {
    setForm((f) => ({ ...f, studentId: id, studentName: name }));
    setShowSuggestions(false);
  }

  const vitalCards = detail?.vitals
    ? [
        { key: "temp", label: "Temperature", unit: "°C", value: detail.vitals.temperature, icon: <Thermometer size={15} /> },
        { key: "bp", label: "Blood Pressure", unit: "mmHg", value: detail.vitals.bloodPressure, icon: <Activity size={15} /> },
        { key: "hr", label: "Heart Rate", unit: "bpm", value: detail.vitals.heartRate, icon: <Heart size={15} /> },
        { key: "wt", label: "Weight", unit: "kg", value: detail.vitals.weight, icon: <Weight size={15} /> },
      ]
    : [];
  const hasVitals = vitalCards.some((v) => v.value && v.value.trim().length > 0);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Consultations</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>
            Clinical visit log with vitals, diagnosis and treatment plans
          </p>
        </div>
        <button onClick={openAdd} style={primaryBtnStyle}>
          <Plus size={15} /> New Consultation
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg3)" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search consultations..." />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)",
                background: statusFilter === s ? "var(--daust-navy)" : "transparent",
                color: statusFilter === s ? "#fff" : "var(--fg2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
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
                {["ID", "Student", "Reason", "Type", "Status", "Date", "Time", "Follow-up", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setDetailId(c.id)} style={{ borderBottom: "1px solid var(--divider)", cursor: "pointer" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{c.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{c.studentName}</td>
                  <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.reason}</td>
                  <td style={tdStyle}>{c.visitType}</td>
                  <td style={tdStyle}><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{c.date}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{c.time}</td>
                  <td style={tdStyle}>
                    {c.followUpRequired ? <Badge tone="warning">Yes</Badge> : <span style={{ color: "var(--fg3)" }}>No</span>}
                  </td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button title="View details" onClick={() => setDetailId(c.id)} style={actionBtn("var(--daust-navy)")}>
                        <Eye size={15} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(c)} style={actionBtn("var(--fg2)")}>
                        <Pencil size={14} />
                      </button>
                      <button title="Delete" onClick={() => deleteConsultation(c.id)} style={actionBtn("var(--danger-500)")}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--fg3)" }}>
                    No consultations found.
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
                <p className="eyebrow" style={{ margin: 0 }}>Consultation {detail.id}</p>
                <h2 style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 800 }}>{detail.studentName}</h2>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>{detail.date} · {detail.time}</p>
              </div>
              <button onClick={() => setDetailId(null)} aria-label="Close" style={closeBtnStyle}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <MetaTile label="Reason">{detail.reason || "—"}</MetaTile>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <MetaTile label="Visit Type">{detail.visitType}</MetaTile>
                <MetaTile label="Status"><Badge tone={statusTone(detail.status)}>{detail.status}</Badge></MetaTile>
                <MetaTile label="Follow-up Required">
                  {detail.followUpRequired ? <Badge tone="warning">Yes</Badge> : "No"}
                </MetaTile>
              </div>

              <div>
                <div style={sectionLabelStyle}>Vitals</div>
                {hasVitals ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 10 }}>
                    {vitalCards.map((v) => (
                      <div key={v.key} style={{ background: "var(--bg-tint)", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--daust-navy)", marginBottom: 4 }}>
                          {v.icon}
                          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{v.label}</span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg1)", fontVariantNumeric: "tabular-nums" }}>
                          {v.value && v.value.trim().length > 0 ? v.value : "—"}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", marginLeft: 4 }}>{v.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...boxStyle, color: "var(--fg3)" }}>No vitals recorded for this visit.</div>
                )}
              </div>

              <SectionBlock label="Diagnosis" accent>{detail.diagnosis || "No diagnosis recorded yet."}</SectionBlock>
              <SectionBlock label="Treatment Plan">{detail.treatmentPlan || "No treatment plan recorded yet."}</SectionBlock>
              <SectionBlock label="Clinical Notes">{detail.clinicalNotes || "No notes recorded."}</SectionBlock>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px 16px", borderBottom: "1px solid var(--divider)" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                {editing ? `Edit Consultation ${editing}` : "New Consultation"}
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
                <input value={form.reason} onChange={(e) => setField("reason", e.target.value)} placeholder="Chief complaint / reason for visit" style={fieldStyle} />
              </label>

              <label style={labelStyle}>
                Clinical Notes
                <textarea
                  value={form.clinicalNotes}
                  onChange={(e) => setField("clinicalNotes", e.target.value)}
                  rows={3}
                  placeholder="Observations, history, examination findings..."
                  style={{ ...fieldStyle, resize: "vertical" }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Visit Type
                  <select value={form.visitType} onChange={(e) => setField("visitType", e.target.value)} style={fieldStyle}>
                    {VISIT_TYPES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  Status
                  <select value={form.status} onChange={(e) => setField("status", e.target.value as Consultation["status"])} style={fieldStyle}>
                    {STATUS_OPTIONS.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
              </div>

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

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--fg2)", cursor: "pointer" }}>
                <input type="checkbox" checked={form.followUpRequired} onChange={(e) => setField("followUpRequired", e.target.checked)} />
                Follow-up required
              </label>

              <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
                <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>Vitals</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {VITAL_INPUTS.map(([key, lbl, ph]) => (
                    <label key={key} style={labelStyle}>
                      {lbl}
                      <input value={form.vitals?.[key] ?? ""} placeholder={ph} onChange={(e) => setVital(key, e.target.value)} style={fieldStyle} />
                    </label>
                  ))}
                </div>
              </div>

              <label style={labelStyle}>
                Diagnosis
                <input value={form.diagnosis ?? ""} onChange={(e) => setField("diagnosis", e.target.value)} placeholder="Working or final diagnosis" style={fieldStyle} />
              </label>

              <label style={labelStyle}>
                Treatment Plan
                <textarea
                  value={form.treatmentPlan ?? ""}
                  onChange={(e) => setField("treatmentPlan", e.target.value)}
                  rows={3}
                  placeholder="Medications, rest, referrals, next steps..."
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
                  {editing ? "Save Changes" : "Create Consultation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

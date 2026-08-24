"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Pencil, Trash2, X, Eye, FileText, Download, Share2 } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { MedicalDocument } from "../types";
import { Card, SearchInput, Badge, type BadgeTone } from "@/components/ui";

const TYPES: MedicalDocument["type"][] = ["Medical Record", "Lab Result", "Prescription", "Consent Form", "Insurance", "Vaccination", "Other"];
const FILTERS = ["All", ...TYPES];

const TYPE_TONES: Record<MedicalDocument["type"], BadgeTone> = {
  "Medical Record": "navy",
  "Lab Result": "info",
  Prescription: "success",
  "Consent Form": "warning",
  Insurance: "neutral",
  Vaccination: "success",
  Other: "neutral",
};

function emptyForm(): MedicalDocument {
  return {
    id: "", studentId: "", studentName: "", name: "", type: "Medical Record",
    date: new Date().toISOString().slice(0, 10), uploadedBy: "", notes: "",
  };
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
  borderRadius: "var(--radius-md)", fontSize: 13.5, lineHeight: 1.6,
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
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
  borderRadius: "var(--radius-pill)", border: "none", background: "var(--daust-navy)",
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

export default function DocumentsPage() {
  const { store, addDocument, updateDocument, deleteDocument, loading, error } = useInfirmaryStore();


  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [form, setForm] = useState<MedicalDocument>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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


  const documents = store.documents;
  const lowerQ = q.toLowerCase();
  const filtered = documents.filter(
    (d) =>
      (typeFilter === "All" || d.type === typeFilter) &&
      (d.studentName.toLowerCase().includes(lowerQ) ||
        d.name.toLowerCase().includes(lowerQ) ||
        d.uploadedBy.toLowerCase().includes(lowerQ) ||
        d.id.toLowerCase().includes(lowerQ)),
  );
  const detail = detailId ? documents.find((d) => d.id === detailId) ?? null : null;

  const medicalRecords = documents.filter((d) => d.type === "Medical Record").length;
  const labResults = documents.filter((d) => d.type === "Lab Result").length;
  const stats = [
    { label: "Total Documents", value: documents.length, color: "var(--fg1)" },
    { label: "Medical Records", value: medicalRecords, color: "var(--daust-navy)" },
    { label: "Lab Results", value: labResults, color: "var(--info)" },
    { label: "Other Types", value: documents.length - medicalRecords - labResults, color: "var(--daust-orange)" },
  ];

  const trimmed = form.studentName.trim().toLowerCase();
  const suggestions =
    trimmed.length > 0
      ? store.students.filter((s) => s.name.toLowerCase().includes(trimmed) && s.name.toLowerCase() !== trimmed).slice(0, 5)
      : [];

  function setField<K extends keyof MedicalDocument>(key: K, value: MedicalDocument[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setForm(emptyForm());
    setEditing(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  function openEdit(d: MedicalDocument) {
    setForm({ ...d });
    setEditing(d.id);
    setDetailId(null);
    setShowSuggestions(false);
    setShowForm(true);
  }

  async function save() {
    if (!form.studentName.trim() || !form.name.trim()) return;
    try {
      if (editing) await updateDocument(editing, form);
      else await addDocument(form);
      setShowForm(false);
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    }
  }

  function pickStudent(id: string, name: string) {
    setForm((f) => ({ ...f, studentId: id, studentName: name }));
    setShowSuggestions(false);
  }

  function simulate(action: string, docName: string) {
    setToast(`${action} "${docName}" — simulated action completed.`);
    window.setTimeout(() => setToast(null), 2200);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Documents</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>Medical records and files</p>
        </div>
        <button onClick={openAdd} style={primaryBtnStyle}>
          <Plus size={15} /> Add Document
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
        <SearchInput value={q} onChange={setQ} placeholder="Search documents..." />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FILTERS.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} style={pill(typeFilter === t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["ID", "Student", "Document", "Type", "Date", "Uploaded By", "Notes", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{d.id}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{d.studentName}</td>
                  <td style={{ ...tdStyle, maxWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <FileText size={15} color="var(--daust-navy)" style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 }}>{d.name}</span>
                    </div>
                  </td>
                  <td style={tdStyle}><Badge tone={TYPE_TONES[d.type]}>{d.type}</Badge></td>
                  <td style={{ ...tdStyle, fontSize: 12.5, color: "var(--fg2)", whiteSpace: "nowrap" }}>{d.date}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{d.uploadedBy}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: d.notes ? "var(--fg2)" : "var(--fg3)" }}>
                    {d.notes || "—"}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button title="View details" onClick={() => setDetailId(d.id)} style={actionBtn("var(--daust-navy)")}>
                        <Eye size={15} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(d)} style={actionBtn("var(--fg2)")}>
                        <Pencil size={14} />
                      </button>
                      <button title="Delete" onClick={() => deleteDocument(d.id)} style={actionBtn("var(--danger-500)")}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--fg3)" }}>
                    No documents found.
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
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <span style={{ width: 42, height: 42, borderRadius: "var(--radius-md)", background: "var(--bg-tint)", color: "var(--daust-navy)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileText size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="eyebrow" style={{ margin: 0 }}>Document {detail.id}</p>
                  <h2 style={{ margin: "3px 0 0", fontSize: 17, fontWeight: 800 }}>{detail.name}</h2>
                  <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>{detail.studentName}</p>
                </div>
              </div>
              <button onClick={() => setDetailId(null)} aria-label="Close" style={closeBtnStyle}><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <MetaTile label="Document Type">
                <Badge tone={TYPE_TONES[detail.type]}>{detail.type}</Badge>
              </MetaTile>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <MetaTile label="Date">{detail.date}</MetaTile>
                <MetaTile label="Uploaded By">{detail.uploadedBy || "—"}</MetaTile>
                <MetaTile label="Student ID">{detail.studentId || "—"}</MetaTile>
              </div>

              <div>
                <div style={sectionLabelStyle}>Notes</div>
                <div style={boxStyle}>{detail.notes || "No notes recorded for this document."}</div>
              </div>

              {toast && (
                <div style={{ background: "#e3f5ec", border: "1px solid var(--success-500)", color: "var(--success-500)", borderRadius: "var(--radius-md)", padding: "9px 12px", fontSize: 12.5, fontWeight: 600 }}>
                  {toast}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button onClick={() => openEdit(detail)} style={ghostBtnStyle}>Edit</button>
                <button onClick={() => simulate("Share", detail.name)} style={{ ...navyBtnStyle, background: "transparent", color: "var(--daust-navy)", border: "1px solid var(--daust-navy)" }}>
                  <Share2 size={14} /> Share
                </button>
                <button onClick={() => simulate("Download", detail.name)} style={navyBtnStyle}>
                  <Download size={14} /> Download
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
                {editing ? `Edit Document ${editing}` : "Add Document"}
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
                Document Name
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Annual Blood Panel" style={fieldStyle} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Type
                  <select value={form.type} onChange={(e) => setField("type", e.target.value as MedicalDocument["type"])} style={fieldStyle}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  Date
                  <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} style={fieldStyle} />
                </label>
              </div>

              <label style={labelStyle}>
                Uploaded By
                <input value={form.uploadedBy} onChange={(e) => setField("uploadedBy", e.target.value)} placeholder="e.g. Dr. S. Diop" style={fieldStyle} />
              </label>

              <label style={labelStyle}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  rows={3}
                  placeholder="Description or context for this document..."
                  style={{ ...fieldStyle, resize: "vertical" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button onClick={() => setShowForm(false)} style={ghostBtnStyle}>Cancel</button>
                <button
                  onClick={save}
                  disabled={!form.studentName.trim() || !form.name.trim()}
                  style={{ ...navyBtnStyle, opacity: !form.studentName.trim() || !form.name.trim() ? 0.5 : 1 }}
                >
                  {editing ? "Save Changes" : "Add Document"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

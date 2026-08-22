"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Eye, Mail, Phone, Heart, AlertTriangle, FileText, Calendar, User } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { Student } from "../types";
import { Card, SearchInput, Badge } from "@/components/ui";

const EMPTY: Student = {
  id: "", name: "", initials: "", program: "", year: "Year 1", status: "Active",
  lastVisit: "Never", allergies: [], concern: "", email: "", phone: "",
  dateOfBirth: "", gender: "", bloodType: "", emergencyContact: "", emergencyPhone: "",
  medicalHistory: [], height: "", weight: "",
};

const INPUT = { padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13, color: "var(--fg1)", width: "100%" as const };
const LABEL = { display: "flex" as const, flexDirection: "column" as const, gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" };

export default function StudentsPage() {
  const { store, addStudent, updateStudent, deleteStudent, loading, error } = useInfirmaryStore();

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
  const [form, setForm] = useState<Student>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [allergyInput, setAllergyInput] = useState("");
  const [historyInput, setHistoryInput] = useState("");

  const filtered = store.students.filter(
    (s) => s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.program.toLowerCase().includes(q.toLowerCase()) ||
      s.id.toLowerCase().includes(q.toLowerCase()),
  );

  const detail = detailId ? store.students.find((s) => s.id === detailId) : null;

  const detailStats = useMemo(() => {
    if (!detail) return null;
    const consultations = store.consultations.filter((c) => c.studentId === detail.id);
    const prescriptions = store.prescriptions.filter((p) => p.studentId === detail.id && p.status === "Active");
    const documents = store.documents.filter((d) => d.studentId === detail.id);
    const followUps = store.followUps.filter((f) => f.studentId === detail.id && (f.status === "Pending" || f.status === "Overdue"));
    const recentConsultations = consultations.slice(0, 3);
    return { consultations: consultations.length, prescriptions: prescriptions.length, documents: documents.length, followUps: followUps.length, recentConsultations };
  }, [detail, store.consultations, store.prescriptions, store.documents, store.followUps]);

  function openAdd() { setForm(EMPTY); setEditing(null); setAllergyInput(""); setHistoryInput(""); setShowForm(true); }
  function openEdit(s: Student) {
    setForm({ ...s }); setEditing(s.id);
    setAllergyInput(s.allergies.join(", "));
    setHistoryInput((s.medicalHistory || []).join(", "));
    setShowForm(true);
  }
  function save() {
    const data = {
      ...form,
      allergies: allergyInput.split(",").map((a) => a.trim()).filter(Boolean),
      medicalHistory: historyInput.split(",").map((a) => a.trim()).filter(Boolean),
    };
    if (editing) updateStudent(editing, data);
    else addStudent(data);
    setShowForm(false);
  }

  const badge = (status: string) => <Badge tone={status === "Active" ? "success" : status === "Follow-up" ? "warning" : "neutral"}>{status}</Badge>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Students</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>Student health records and profiles</p>
        </div>
        <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "none", background: "var(--daust-orange)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <Plus size={15} /> Add Student
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
        {[
          { label: "Total Students", value: store.students.length, color: "var(--daust-navy)" },
          { label: "Active", value: store.students.filter((s) => s.status === "Active").length, color: "var(--success-500)" },
          { label: "Follow-up", value: store.students.filter((s) => s.status === "Follow-up").length, color: "var(--daust-orange)" },
          { label: "With Allergies", value: store.students.filter((s) => s.allergies.length > 0).length, color: "#c0392b" },
        ].map((stat) => (
          <Card key={stat.label}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
          </Card>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, program, or ID..." />
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Student", "Program", "Year", "Status", "Last Visit", "Allergies", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "var(--fg3)", fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--daust-navy)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{s.initials}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{s.id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>{s.program}</td>
                  <td style={{ padding: "10px 14px" }}>{s.year}</td>
                  <td style={{ padding: "10px 14px" }}>{badge(s.status)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, color: "var(--fg2)" }}>{s.lastVisit}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5 }}>
                    {s.allergies.length > 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#c0392b", fontWeight: 600 }}>
                        <AlertTriangle size={12} /> {s.allergies.join(", ")}
                      </span>
                    ) : <span className="muted">None</span>}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setDetailId(s.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--daust-navy)", padding: 4 }} title="View profile"><Eye size={14} /></button>
                      <button onClick={() => openEdit(s)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--fg3)", padding: 4 }} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(s.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger-500, #c0392b)", padding: 4 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--fg3)" }}>No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && detailStats && (
        <div onClick={() => setDetailId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: "90vw", height: "100%", background: "var(--surface)", boxShadow: "-4px 0 20px rgba(0,0,0,.15)", overflowY: "auto", padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Student Profile</h2>
              <button onClick={() => setDetailId(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--fg3)" }}><X size={20} /></button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--divider)" }}>
              <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--daust-orange)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0 }}>{detail.initials}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  {badge(detail.status)}
                  <span className="muted" style={{ fontSize: 12.5 }}>{detail.program} · {detail.year}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Email", value: detail.email, icon: <Mail size={13} /> },
                { label: "Phone", value: detail.phone, icon: <Phone size={13} /> },
                { label: "Date of Birth", value: detail.dateOfBirth, icon: <Calendar size={13} /> },
                { label: "Gender", value: detail.gender, icon: <User size={13} /> },
                { label: "Blood Type", value: detail.bloodType || "—", icon: <Heart size={13} /> },
                { label: "Height", value: detail.height || "—", icon: <Activity size={13} /> },
                { label: "Weight", value: detail.weight || "—", icon: <Activity size={13} /> },
                { label: "Last Visit", value: detail.lastVisit, icon: <Calendar size={13} /> },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>{item.icon} {item.label}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {detail.emergencyContact && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--daust-orange)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Emergency Contact</div>
                <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{detail.emergencyContact}</div>
                  <div className="muted" style={{ marginTop: 2 }}>{detail.emergencyPhone}</div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#c0392b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={13} /> Allergies</div>
              {detail.allergies.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {detail.allergies.map((a) => (
                    <div key={a} style={{ padding: "8px 12px", background: "#fbe6e3", borderLeft: "3px solid #c0392b", borderRadius: "0 var(--radius-md) var(--radius-md) 0", fontSize: 13, fontWeight: 600, color: "#c0392b" }}>{a}</div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 13, color: "var(--fg3)" }}>None reported</div>}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--daust-navy)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><FileText size={13} /> Medical History</div>
              {detail.medicalHistory && detail.medicalHistory.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {detail.medicalHistory.map((h) => (
                    <div key={h} style={{ padding: "8px 12px", background: "var(--bg-tint)", borderLeft: "3px solid var(--daust-navy)", borderRadius: "0 var(--radius-md) var(--radius-md) 0", fontSize: 13, fontWeight: 500 }}>{h}</div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 13, color: "var(--fg3)" }}>No recorded history</div>}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Quick Stats</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Visits", value: detailStats.consultations, color: "var(--daust-navy)" },
                { label: "Rx Active", value: detailStats.prescriptions, color: "var(--daust-orange)" },
                { label: "Documents", value: detailStats.documents, color: "var(--success-500)" },
                { label: "Follow-ups", value: detailStats.followUps, color: detailStats.followUps > 0 ? "#c0392b" : "var(--fg3)" },
              ].map((s) => (
                <div key={s.label} style={{ padding: 10, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".04em" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {detailStats.recentConsultations.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Recent Consultations</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detailStats.recentConsultations.map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)" }}>
                      <span style={{ width: 4, alignSelf: "stretch", minHeight: 30, borderRadius: 2, background: c.status === "Completed" ? "var(--success-500)" : c.status === "In Progress" ? "var(--daust-orange)" : "var(--gray-300)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.reason}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{c.date} · {c.time}</div>
                      </div>
                      <Badge tone={c.status === "Completed" ? "success" : c.status === "In Progress" ? "warning" : "neutral"}>{c.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.concern && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Current Concern</div>
                <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", fontSize: 13 }}>{detail.concern}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteId && (
        <div onClick={() => setDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: 24, width: 400, maxWidth: "90vw", boxShadow: "0 8px 30px rgba(0,0,0,.18)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Delete Student</h3>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--fg2)" }}>
              Are you sure you want to delete <strong>{store.students.find((s) => s.id === deleteId)?.name}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { deleteStudent(deleteId); setDeleteId(null); }} style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "none", background: "#c0392b", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: 24, width: 540, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,.18)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{editing ? "Edit Student" : "Add Student"}</h2>
              <button onClick={() => setShowForm(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--fg3)" }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Personal Information</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <label style={LABEL}>Name<input style={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label style={LABEL}>Email<input style={INPUT} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label style={LABEL}>Phone<input style={INPUT} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label style={LABEL}>Date of Birth<input type="date" style={INPUT} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
              <label style={LABEL}>Gender<select style={INPUT} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option><option>Other</option></select></label>
              <label style={LABEL}>Blood Type<select style={INPUT} value={form.bloodType || ""} onChange={(e) => setForm({ ...form, bloodType: e.target.value })}><option value="">Select</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((t) => <option key={t}>{t}</option>)}</select></label>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Academic</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <label style={LABEL}>Program<input style={INPUT} value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} /></label>
              <label style={LABEL}>Year<select style={INPUT} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>{["Year 1","Year 2","Year 3","Year 4"].map((y) => <option key={y}>{y}</option>)}</select></label>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Medical</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label style={LABEL}>Height<input style={INPUT} placeholder="e.g. 170cm" value={form.height || ""} onChange={(e) => setForm({ ...form, height: e.target.value })} /></label>
              <label style={LABEL}>Weight<input style={INPUT} placeholder="e.g. 65kg" value={form.weight || ""} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <label style={LABEL}>Allergies (comma separated)<input style={INPUT} placeholder="e.g. Penicillin, Peanuts" value={allergyInput} onChange={(e) => setAllergyInput(e.target.value)} /></label>
              <label style={LABEL}>Medical History (comma separated)<input style={INPUT} placeholder="e.g. Asthma, Migraines" value={historyInput} onChange={(e) => setHistoryInput(e.target.value)} /></label>
              <label style={LABEL}>Current Concern<input style={INPUT} value={form.concern} onChange={(e) => setForm({ ...form, concern: e.target.value })} /></label>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Emergency Contact</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <label style={LABEL}>Contact Name<input style={INPUT} value={form.emergencyContact || ""} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></label>
              <label style={LABEL}>Contact Phone<input style={INPUT} value={form.emergencyPhone || ""} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} /></label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={save} disabled={!form.name} style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "none", background: form.name ? "var(--daust-navy)" : "var(--gray-300)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: form.name ? "pointer" : "not-allowed" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Activity({ size, ...props }: { size: number; [k: string]: unknown }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
}

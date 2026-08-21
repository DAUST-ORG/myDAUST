"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, X, Eye, Pill, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { useInfirmaryStore } from "../store";
import type { Prescription } from "../types";
import { Card, SearchInput, Badge } from "@/components/ui";

const EMPTY: Prescription = {
  id: "",
  consultationId: "",
  studentId: "",
  studentName: "",
  medication: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
  status: "Active",
  date: new Date().toISOString().slice(0, 10),
  prescribedBy: "",
};

const STATUSES = ["All", "Active", "Completed", "Cancelled"];

const STATUS_LARGE: Record<Prescription["status"], { bg: string; fg: string }> = {
  Active: { bg: "#e3f5ec", fg: "var(--success)" },
  Completed: { bg: "var(--bg-subtle)", fg: "var(--fg2)" },
  Cancelled: { bg: "#fbe6e3", fg: "var(--danger)" },
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--fg2)",
};

const inputStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  fontSize: 13,
  color: "var(--fg1)",
  background: "var(--surface)",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const sectionLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--fg3)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 6,
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

const modalStyle: CSSProperties = {
  background: "var(--surface)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
  width: 520,
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 8px 30px rgba(0,0,0,.18)",
};

function StatCard({ icon, color, value, label }: { icon: ReactNode; color: string; value: number; label: string }) {
  return (
    <div
      style={{
        flex: "1 1 170px",
        minWidth: 160,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--fg3)", fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}

export default function PrescriptionsPage() {
  const { store, addPrescription, updatePrescription, deletePrescription } = useInfirmaryStore();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState<Prescription>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const activeCount = store.prescriptions.filter((p) => p.status === "Active").length;
  const completedCount = store.prescriptions.filter((p) => p.status === "Completed").length;
  const cancelledCount = store.prescriptions.filter((p) => p.status === "Cancelled").length;

  const needle = q.toLowerCase();
  const filtered = store.prescriptions.filter(
    (p) =>
      (statusFilter === "All" || p.status === statusFilter) &&
      (p.studentName.toLowerCase().includes(needle) ||
        p.medication.toLowerCase().includes(needle) ||
        p.prescribedBy.toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle)),
  );
  const detail = detailId ? store.prescriptions.find((p) => p.id === detailId) : undefined;
  const linkedConsultation = detail ? store.consultations.find((c) => c.id === detail.consultationId) : undefined;
  const canSave = form.studentName.trim() !== "" && form.medication.trim() !== "";

  function openAdd() { setForm(EMPTY); setEditing(null); setShowForm(true); }
  function openEdit(p: Prescription) { setForm({ ...p }); setEditing(p.id); setShowForm(true); }
  function save() {
    if (!canSave) return;
    if (editing) updatePrescription(editing, form);
    else {
      const student = store.students.find((s) => s.name.toLowerCase() === form.studentName.trim().toLowerCase());
      addPrescription({
        ...form,
        id: form.id || `RX-${String(store.prescriptions.length + 1).padStart(3, "0")}`,
        studentId: student?.id ?? "",
        studentName: form.studentName.trim(),
        medication: form.medication.trim(),
      });
    }
    setShowForm(false);
  }

  const thStyle: CSSProperties = { textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "var(--fg3)", fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" };
  const iconBtn = (title: string, color: string, onClick: () => void, children: ReactNode) => (
    <button title={title} onClick={onClick} style={{ border: "none", background: "none", cursor: "pointer", color, padding: 4 }}>
      {children}
    </button>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Health Center</p>
          <h1 className="page-title">Prescriptions</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 14 }}>Medication orders issued during student consultations</p>
        </div>
        <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: "var(--radius-pill)", border: "none", background: "var(--daust-orange)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <Plus size={15} /> New Prescription
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard icon={<Clock size={17} />} color="var(--success-500)" value={activeCount} label="Active" />
        <StatCard icon={<CheckCircle size={17} />} color="var(--daust-navy)" value={completedCount} label="Completed" />
        <StatCard icon={<AlertTriangle size={17} />} color="var(--danger-500)" value={cancelledCount} label="Cancelled" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search prescriptions..." />
        <div style={{ display: "flex", gap: 4 }}>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", background: statusFilter === s ? "var(--daust-navy)" : "transparent", color: statusFilter === s ? "#fff" : "var(--fg2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{s}</button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["ID", "Student", "Medication", "Dosage", "Frequency", "Duration", "Status", "Date", "Prescribed By", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{p.id}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.studentName}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.medication}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5 }}>{p.dosage}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5, maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.frequency}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5 }}>{p.duration}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <Badge tone={p.status === "Active" ? "success" : p.status === "Cancelled" ? "error" : "neutral"}>{p.status}</Badge>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5 }}>{p.date}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12.5 }}>{p.prescribedBy}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {iconBtn("View details", "var(--fg3)", () => setDetailId(p.id), <Eye size={14} />)}
                      {iconBtn("Edit", "var(--fg3)", () => openEdit(p), <Pencil size={14} />)}
                      {iconBtn("Delete", "var(--danger-500)", () => deletePrescription(p.id), <Trash2 size={14} />)}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 28, textAlign: "center", color: "var(--fg3)" }}>No prescriptions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && (
        <div onClick={() => setDetailId(null)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Prescription {detail.id}</h2>
              <button onClick={() => setDetailId(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--fg3)" }}><X size={18} /></button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 13.5, marginBottom: 16 }}>
              {([["Student", detail.studentName], ["Prescribed By", detail.prescribedBy], ["Date", detail.date]] as [string, string][]).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 2 }}>{k}</div>
                  <div>{v || "—"}</div>
                </div>
              ))}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 16 }}>
              <div style={sectionLabelStyle}><Pill size={13} /> Medication</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{detail.medication || "—"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { icon: <Pill size={14} />, label: "Dosage", value: detail.dosage },
                  { icon: <Clock size={14} />, label: "Frequency", value: detail.frequency },
                  { icon: <Clock size={14} />, label: "Duration", value: detail.duration },
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px", minWidth: 0 }}>
                    <span style={{ color: "var(--daust-orange)", display: "flex", flexShrink: 0 }}>{row.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: ".05em" }}>{row.label}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.value || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={sectionLabelStyle}><AlertTriangle size={13} /> Instructions</div>
              <div style={{ padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", fontSize: 13.5, lineHeight: 1.6 }}>
                {detail.instructions || "No special instructions provided."}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ padding: "5px 16px", borderRadius: "var(--radius-pill)", fontSize: 13, fontWeight: 700, background: STATUS_LARGE[detail.status].bg, color: STATUS_LARGE[detail.status].fg, whiteSpace: "nowrap" }}>
                {detail.status}
              </span>
              {detail.consultationId && (
                <Link href="/infirmary/consultations" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)" }}>
                  View linked consultation{linkedConsultation ? ` (${linkedConsultation.id})` : ""}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{editing ? "Edit Prescription" : "New Prescription"}</h2>
              <button onClick={() => setShowForm(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--fg3)" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Student Name *
                  <input value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} placeholder="e.g. Amina Diallo" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Medication *
                  <input value={form.medication} onChange={(e) => setForm({ ...form, medication: e.target.value })} placeholder="e.g. Amoxicillin 500mg" style={inputStyle} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Dosage
                  <input value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="1 tablet" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Frequency
                  <input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="3x daily" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Duration
                  <input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="7 days" style={inputStyle} />
                </label>
              </div>
              <label style={labelStyle}>
                Prescribed By
                <input value={form.prescribedBy} onChange={(e) => setForm({ ...form, prescribedBy: e.target.value })} placeholder="e.g. Dr. Ndiaye" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Instructions
                <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Take after meals with plenty of water..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Status
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Prescription["status"] })} style={inputStyle}>
                    {["Active", "Completed", "Cancelled"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  Date
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button
                  onClick={save}
                  disabled={!canSave}
                  style={{ padding: "8px 18px", borderRadius: "var(--radius-pill)", border: "none", background: canSave ? "var(--daust-navy)" : "var(--border)", color: canSave ? "#fff" : "var(--fg3)", fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed" }}
                >
                  {editing ? "Save Changes" : "Create Prescription"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

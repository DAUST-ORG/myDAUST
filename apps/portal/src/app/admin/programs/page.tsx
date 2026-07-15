"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookPlus, FolderPlus, Pencil } from "lucide-react";
import { type AdminPrograms, type ProgramRow, createCourse, getAdminPrograms } from "@/lib/api";
import { Badge, Field, Modal, PageHeader, SearchInput, Select, Tabs } from "@/components/ui";
import { MasterSchedule } from "@/components/MasterSchedule";
import { ProgramEditModal } from "./ProgramEditModal";

const PROGRAM_COLORS = ["#153b6a", "#ed8425", "#1d4a82", "#2e7d52", "#9da6ae", "#c4660f", "#7c3aed", "#0f7d8c"];

export default function AdminProgramsPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminPrograms | null>(null);
  const [tab, setTab] = useState("programs");
  const [q, setQ] = useState("");
  const [courseModal, setCourseModal] = useState(false);
  const [progEdit, setProgEdit] = useState<null | "new" | ProgramRow>(null);

  function load() {
    getAdminPrograms().then(setData).catch(() => {});
  }
  useEffect(() => load(), []);

  const courses = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.courses ?? []).filter((c) => !needle || c.title.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Programs & Courses"
        subtitle="Degree programs, course catalog and the weekly master schedule."
        actions={
          <>
            <button onClick={() => setProgEdit("new")} style={{ display: "flex", alignItems: "center", gap: 7 }}><FolderPlus size={15} /> New program</button>
            <button className="primary" onClick={() => setCourseModal(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}><BookPlus size={15} /> New course</button>
          </>
        }
      />

      <Tabs
        tabs={[
          { value: "programs", label: "Programs" },
          { value: "courses", label: "Course catalog" },
          { value: "schedule", label: "Schedule" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "programs" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {(data?.programs ?? []).map((p, i) => (
            <div
              key={p.code}
              className="card lift"
              style={{ margin: 0, cursor: "pointer" }}
              onClick={() => router.push(`/admin/programs/${encodeURIComponent(p.code)}`)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, background: p.color ?? PROGRAM_COLORS[i % PROGRAM_COLORS.length], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{p.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{p.degree ? `${p.degree} · ` : ""}{p.department}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setProgEdit(p); }}
                  title="Edit program"
                  style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--fg3)", flexShrink: 0 }}
                >
                  <Pencil size={14} />
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/admin/programs/${encodeURIComponent(p.code)}?tab=students`); }}
                  title="View students"
                  style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>{p.students}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>students →</div>
                </button>
                {p.tuition != null && <span className="muted" style={{ fontSize: 12.5 }}>{p.tuition.toLocaleString("fr-FR")} FCFA/yr</span>}
              </div>
            </div>
          ))}
          {(data?.programs ?? []).length === 0 && <p className="muted">No programs yet.</p>}
        </div>
      )}

      {tab === "courses" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search courses…" width={280} />
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Code</th><th>Course</th><th>Department</th><th>Credits</th><th /></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.code} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/programs/courses/${encodeURIComponent(c.code)}`)}>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600 }}>{c.code}</td>
                      <td style={{ fontWeight: 600 }}>{c.title}</td>
                      <td><Badge tone="neutral">{c.department}</Badge></td>
                      <td>{c.credits}</td>
                      <td style={{ textAlign: "right", color: "var(--fg3)" }}><Pencil size={14} /></td>
                    </tr>
                  ))}
                  {courses.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 32 }}>No courses match.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "schedule" && <MasterSchedule />}

      {progEdit && (
        <ProgramEditModal
          mode={progEdit === "new" ? "create" : "edit"}
          program={progEdit === "new" ? undefined : progEdit}
          departments={data?.departments ?? []}
          onClose={() => setProgEdit(null)}
          onSaved={() => { setProgEdit(null); load(); }}
        />
      )}
      {courseModal && <CourseModal departments={data?.departments ?? []} onClose={() => setCourseModal(false)} onCreated={() => { setCourseModal(false); load(); }} />}
    </>
  );
}

function CourseModal({ departments, onClose, onCreated }: { departments: AdminPrograms["departments"]; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [credits, setCredits] = useState("3");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!code.trim() || !title.trim() || !departmentId) {
      setErr("Code, title and department are required.");
      return;
    }
    setBusy(true);
    try {
      await createCourse({ code: code.trim().toUpperCase(), title: title.trim(), credits: Number(credits) || 3, departmentId });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create course.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New course" width={440}
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create course"}</button></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <Field label="Code"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS301" /></Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Algorithms & Data Structures" /></Field>
        <Field label="Credits"><input type="number" min={1} max={12} value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
        <Field label="Department">
          <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        </Field>
      </div>
    </Modal>
  );
}

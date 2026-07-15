"use client";

import { useEffect, useMemo, useState } from "react";
import { BookPlus, FolderPlus } from "lucide-react";
import { type AdminPrograms, createCourse, createProgram, getAdminPrograms } from "@/lib/api";
import { Badge, Field, Modal, PageHeader, SearchInput, Select, Tabs } from "@/components/ui";
import { MasterSchedule } from "@/components/MasterSchedule";

const PROGRAM_COLORS = ["#153b6a", "#ed8425", "#1d4a82", "#2e7d52", "#9da6ae", "#c4660f", "#7c3aed", "#0f7d8c"];

export default function AdminProgramsPage() {
  const [data, setData] = useState<AdminPrograms | null>(null);
  const [tab, setTab] = useState("programs");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "program" | "course">(null);

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
            <button onClick={() => setModal("program")} style={{ display: "flex", alignItems: "center", gap: 7 }}><FolderPlus size={15} /> New program</button>
            <button className="primary" onClick={() => setModal("course")} style={{ display: "flex", alignItems: "center", gap: 7 }}><BookPlus size={15} /> New course</button>
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
            <div key={p.code} className="card lift" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, background: PROGRAM_COLORS[i % PROGRAM_COLORS.length], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14 }}>{p.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{p.department}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>{p.students}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>students</div>
                </div>
                <Badge tone="neutral">{p.code}</Badge>
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
                <thead><tr><th>Code</th><th>Course</th><th>Department</th><th>Credits</th></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.code}>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600 }}>{c.code}</td>
                      <td style={{ fontWeight: 600 }}>{c.title}</td>
                      <td><Badge tone="neutral">{c.department}</Badge></td>
                      <td>{c.credits}</td>
                    </tr>
                  ))}
                  {courses.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 32 }}>No courses match.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "schedule" && <MasterSchedule />}

      {modal === "program" && <ProgramModal departments={data?.departments ?? []} onClose={() => setModal(null)} onCreated={() => { setModal(null); load(); }} />}
      {modal === "course" && <CourseModal departments={data?.departments ?? []} onClose={() => setModal(null)} onCreated={() => { setModal(null); load(); }} />}
    </>
  );
}

function ProgramModal({ departments, onClose, onCreated }: { departments: AdminPrograms["departments"]; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!code.trim() || !name.trim() || !departmentId) {
      setErr("Code, name and department are required.");
      return;
    }
    setBusy(true);
    try {
      await createProgram({ code: code.trim(), name: name.trim(), departmentId });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create program.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New program" width={440}
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create program"}</button></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <Field label="Code"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS" /></Field>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science" /></Field>
        <Field label="Department">
          <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
        </Field>
      </div>
    </Modal>
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
      await createCourse({ code: code.trim(), title: title.trim(), credits: Number(credits) || 3, departmentId });
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

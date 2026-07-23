"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, Pencil, Plus, Trash2 } from "lucide-react";
import {
  type AdminCourseDetail,
  type AdminPrograms,
  type Section,
  createCourse,
  deleteCourse,
  getAdminCourseDetail,
  getAdminPrograms,
  getCurrentTerm,
  getSections,
  updateCourse,
} from "@/lib/api";
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, SearchInput, Select, SortTh, useSort } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type CatalogRow = AdminPrograms["courses"][number];
const SEMESTERS = ["fall", "spring", "summer"] as const;
type Sem = (typeof SEMESTERS)[number];

export default function AdminCoursesPage() {
  const [data, setData] = useState<AdminPrograms | null>(null);
  const [termName, setTermName] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "new" | CatalogRow>(null);
  const [removing, setRemoving] = useState<CatalogRow | null>(null);
  const { sort, toggle, apply } = useSort({ key: "code", dir: "asc" });

  const load = useCallback(() => {
    getAdminPrograms().then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    getCurrentTerm()
      .then((t) => {
        setTermName(t.name);
        return getSections(t.id).then(setSections);
      })
      .catch(() => {});
  }, [load]);

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sections) counts[s.courseCode] = (counts[s.courseCode] ?? 0) + 1;
    return counts;
  }, [sections]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (data?.courses ?? []).filter(
      (c) => !needle || c.code.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle) || c.department.toLowerCase().includes(needle),
    );
    return apply(filtered, {
      code: (c) => c.code,
      title: (c) => c.title,
      department: (c) => c.department,
      credits: (c) => c.credits,
      sections: (c) => sectionCounts[c.code] ?? 0,
      status: (c) => c.status,
    });
  }, [data, q, apply, sectionCounts]);

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Course Catalog"
        subtitle={`Manage course definitions, credits and sections.${termName ? ` Section counts are for ${termName}.` : ""}`}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setModal("new")}>New course</Button>}
      />

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search catalog…" width={300} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <SortTh label="Code" sortKey="code" sort={sort} onSort={toggle} />
                <SortTh label="Title" sortKey="title" sort={sort} onSort={toggle} />
                <SortTh label="Department" sortKey="department" sort={sort} onSort={toggle} />
                <SortTh label="Cr" sortKey="credits" sort={sort} onSort={toggle} align="right" />
                <th>Prereq</th>
                <SortTh label="Sect." sortKey="sections" sort={sort} onSort={toggle} align="right" />
                <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code} className="sis-row">
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)" }}>{c.code}</td>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td><Badge tone="neutral">{c.department}</Badge></td>
                  <td style={{ textAlign: "right" }}>{c.credits}</td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--fg3)" }}>{c.prereq ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{sectionCounts[c.code] ?? "—"}</td>
                  <td><Badge tone={c.status === "draft" ? "warning" : "success"}>{c.status === "draft" ? "Draft" : "Active"}</Badge></td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                      <IconButton label="Edit course" onClick={() => setModal(c)}><Pencil size={15} /></IconButton>
                      <IconButton label="Delete course" tone="danger" onClick={() => setRemoving(c)}><Trash2 size={15} /></IconButton>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon={<BookMarked size={26} />} title="No courses match." note="Adjust the search or add a new course to the catalog." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <CourseModal
          departments={data?.departments ?? []}
          allCourses={(data?.courses ?? []).map((c) => ({ code: c.code, title: c.title }))}
          course={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete course?"
          confirmLabel="Delete course"
          message={<>Delete <strong>{removing.code}</strong> — {removing.title}? A course with existing sections cannot be deleted.</>}
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await deleteCourse(removing.code); setRemoving(null); load(); }}
        />
      )}
    </>
  );
}

function TogglePill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
        border: on ? "1px solid var(--daust-navy)" : "1px solid var(--border)",
        background: on ? "var(--daust-navy)" : "var(--surface)",
        color: on ? "#fff" : "var(--fg2)",
      }}
    >
      {children}
    </button>
  );
}

function CourseModal({
  departments,
  allCourses,
  course,
  onClose,
  onSaved,
}: {
  departments: AdminPrograms["departments"];
  allCourses: { code: string; title: string }[];
  course?: CatalogRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!course;
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [credits, setCredits] = useState(String(course?.credits ?? 3));
  const [departmentId, setDepartmentId] = useState("");
  const [semesters, setSemesters] = useState<Record<Sem, boolean>>({ fall: false, spring: false, summer: false });
  const [prereq, setPrereq] = useState("");
  const [coreq, setCoreq] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "draft">("active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!course) {
      setDepartmentId(departments[0]?.id ?? "");
      return;
    }
    getAdminCourseDetail(course.code)
      .then((d: AdminCourseDetail) => {
        setDepartmentId(d.departmentId);
        setStatus(d.status === "draft" ? "draft" : "active");
        setDescription(d.description ?? "");
        setSemesters({ fall: d.semestersOffered.includes("fall"), spring: d.semestersOffered.includes("spring"), summer: d.semestersOffered.includes("summer") });
        setPrereq(d.prerequisites[0]?.code ?? "");
        setCoreq(d.corequisites[0]?.code ?? "");
      })
      .catch(() => setErr("Could not load course details."));
  }, [course, departments]);

  const prereqOptions = [{ value: "", label: "None" }, ...allCourses.filter((c) => c.code !== code).map((c) => ({ value: c.code, label: `${c.code} — ${c.title}` }))];

  async function submit() {
    setErr(null);
    if (!code.trim() || !title.trim() || !departmentId) {
      setErr("Code, title and department are required.");
      return;
    }
    const semestersOffered = SEMESTERS.filter((s) => semesters[s]);
    const shared = {
      title: title.trim(),
      credits: Number(credits) || 3,
      departmentId,
      status,
      description: description.trim() || null,
      semestersOffered,
      prerequisiteCodes: prereq ? [prereq] : [],
      corequisiteCodes: coreq.trim() ? [coreq.trim().toUpperCase()] : [],
    };
    setBusy(true);
    try {
      if (editing) await updateCourse(course!.code, shared);
      else await createCourse({ code: code.trim().toUpperCase(), ...shared });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save course.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit Course" : "New Course"}
      width={620}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create course"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Define a course for the catalog.</p>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Course code" hint={editing ? "Not editable" : undefined}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. CSC 410" readOnly={editing} style={editing ? { background: "var(--bg-subtle)", color: "var(--fg3)" } : undefined} />
          </Field>
          <Field label="Course title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Distributed Systems" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Department">
            <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="Credits"><input type="number" min={1} max={12} value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
        </div>
        <Field label="Semesters offered">
          <div style={{ display: "flex", gap: 8 }}>
            {SEMESTERS.map((s) => (
              <TogglePill key={s} on={semesters[s]} onClick={() => setSemesters((p) => ({ ...p, [s]: !p[s] }))}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </TogglePill>
            ))}
          </div>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Prerequisite">
            <Select value={prereq} onChange={setPrereq} options={prereqOptions} />
          </Field>
          <Field label="Co-requisite" hint="Optional course code">
            <input value={coreq} onChange={(e) => setCoreq(e.target.value.toUpperCase())} placeholder="e.g. CSC 410L (optional)" />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Short course description…" style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg1)", fontSize: 13.5, fontFamily: "var(--font-body)", resize: "vertical" }} />
        </Field>
        <Field label="Status">
          <div style={{ display: "flex", gap: 8 }}>
            <TogglePill on={status === "active"} onClick={() => setStatus("active")}>Active</TogglePill>
            <TogglePill on={status === "draft"} onClick={() => setStatus("draft")}>Draft</TogglePill>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, Pencil, Plus } from "lucide-react";
import {
  type AdminCourseDetail,
  type AdminPrograms,
  type Section,
  createCourse,
  getAdminCourseDetail,
  getAdminPrograms,
  getCurrentTerm,
  getSections,
  updateCourse,
} from "@/lib/api";
import { Badge, Button, EmptyState, Field, Modal, PageHeader, SearchInput, Select, SortTh, useSort } from "@/components/ui";

type CatalogRow = AdminPrograms["courses"][number];

export default function AdminCoursesPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminPrograms | null>(null);
  const [termName, setTermName] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "new" | CatalogRow>(null);
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
          <table style={{ minWidth: 780 }}>
            <thead>
              <tr>
                <SortTh label="Code" sortKey="code" sort={sort} onSort={toggle} />
                <SortTh label="Title" sortKey="title" sort={sort} onSort={toggle} />
                <SortTh label="Department" sortKey="department" sort={sort} onSort={toggle} />
                <SortTh label="Cr" sortKey="credits" sort={sort} onSort={toggle} align="right" />
                <SortTh label="Sect." sortKey="sections" sort={sort} onSort={toggle} align="right" />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/programs/courses/${encodeURIComponent(c.code)}`)}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600, color: "var(--daust-navy)" }}>{c.code}</td>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td><Badge tone="neutral">{c.department}</Badge></td>
                  <td style={{ textAlign: "right" }}>{c.credits}</td>
                  <td style={{ textAlign: "right" }}>{sectionCounts[c.code] ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setModal(c); }}
                      title="Edit course"
                      style={{ padding: "5px 8px", color: "var(--fg3)" }}
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
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
          course={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </>
  );
}

function CourseModal({
  departments,
  course,
  onClose,
  onSaved,
}: {
  departments: AdminPrograms["departments"];
  course?: CatalogRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!course;
  const [detail, setDetail] = useState<AdminCourseDetail | null>(null);
  const [code, setCode] = useState(course?.code ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [credits, setCredits] = useState(String(course?.credits ?? 3));
  const [departmentId, setDepartmentId] = useState("");
  const [prereqs, setPrereqs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!course) {
      setDepartmentId(departments[0]?.id ?? "");
      return;
    }
    getAdminCourseDetail(course.code)
      .then((d) => {
        setDetail(d);
        setDepartmentId(d.departmentId);
        setPrereqs(d.prerequisites.map((p) => p.code));
      })
      .catch(() => setErr("Could not load course details."));
  }, [course, departments]);

  function togglePrereq(c: string) {
    setPrereqs((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  }

  async function submit() {
    setErr(null);
    if (!code.trim() || !title.trim() || !departmentId) {
      setErr("Code, title and department are required.");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateCourse(course!.code, { title: title.trim(), credits: Number(credits) || course!.credits, departmentId, prerequisiteCodes: prereqs });
      } else {
        await createCourse({ code: code.trim().toUpperCase(), title: title.trim(), credits: Number(credits) || 3, departmentId });
      }
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
      width={480}
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
        <Field label="Course code" hint={editing ? "Not editable" : undefined}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. CSC 410"
            readOnly={editing}
            style={editing ? { background: "var(--bg-subtle)", color: "var(--fg3)" } : undefined}
          />
        </Field>
        <Field label="Course title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Distributed Systems" /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Department">
            <Select value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="Credits"><input type="number" min={1} max={12} value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
        </div>
        {editing && detail && (
          <Field label="Prerequisites" hint={prereqs.length ? `${prereqs.length} selected` : "None"}>
            <div style={{ maxHeight: 170, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {detail.allCourses.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No other courses.</span>}
              {detail.allCourses.map((oc) => (
                <label key={oc.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={prereqs.includes(oc.code)} onChange={() => togglePrereq(oc.code)} style={{ width: 15, height: 15 }} />
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{oc.code}</span>
                  <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{oc.title}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

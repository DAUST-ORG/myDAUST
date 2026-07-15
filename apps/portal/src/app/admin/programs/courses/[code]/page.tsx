"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  type AdminCourseDetail,
  type CourseSection,
  type StaffMember,
  createSection,
  deleteSection,
  getAdminCourseDetail,
  getStaff,
  updateCourse,
  updateSection,
} from "@/lib/api";
import { Field, Modal, Select } from "@/components/ui";

const DAY_TOKENS = ["M", "T", "W", "Th", "F"];
function parseDayString(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.slice(i, i + 2) === "Th") { out.push("Th"); i += 2; } else { out.push(s[i]!); i += 1; }
  }
  return out;
}

export default function CourseDetailPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const [c, setC] = useState<AdminCourseDetail | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sectionModal, setSectionModal] = useState<null | "new" | CourseSection>(null);

  const load = useCallback(() => {
    getAdminCourseDetail(code).then(setC).catch(() => setC(null));
  }, [code]);
  useEffect(() => {
    load();
    getStaff().then(setStaff).catch(() => {});
  }, [load]);

  if (!c) return <p className="muted">Loading…</p>;

  const instructors = staff.filter((s) => s.kind === "faculty" || s.roles.includes("faculty"));
  const instructorOptions = (instructors.length ? instructors : staff).map((s) => ({ value: s.id, label: s.name }));

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Link href="/admin/programs" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg3)", fontWeight: 600, fontSize: 13.5 }}>
          <ArrowLeft size={16} /> Course catalog
        </Link>
      </div>

      <p className="eyebrow">Course</p>
      <h1 className="page-title" style={{ fontFamily: "ui-monospace, monospace" }}>{c.code}</h1>
      <p className="muted" style={{ marginTop: -2, marginBottom: 22 }}>{c.title}</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <CatalogForm course={c} onSaved={load} />

        <div className="card" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--divider)" }}>
            <h4 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarClock size={16} color="var(--daust-navy)" /> Sections
            </h4>
            <button className="primary" onClick={() => setSectionModal("new")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px" }}><Plus size={14} /> Add section</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Sec</th><th>Term</th><th>Instructor</th><th>Schedule</th><th>Room</th><th>Seats</th><th /></tr></thead>
              <tbody>
                {c.sections.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.sectionCode}</td>
                    <td>{s.term}</td>
                    <td style={{ fontSize: 12.5 }}>{s.instructor ?? "TBA"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{s.days} {s.startTime}–{s.endTime}</td>
                    <td>{s.room ?? "—"}</td>
                    <td>{s.seatsTaken}/{s.capacity}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => setSectionModal(s)} title="Edit section" style={{ padding: "5px 8px", color: "var(--fg3)" }}><Pencil size={14} /></button>
                      <DeleteSectionButton section={s} onDone={load} />
                    </td>
                  </tr>
                ))}
                {c.sections.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>No sections scheduled. Add one to put this course on the timetable.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {sectionModal && (
        <SectionModal
          course={c}
          instructorOptions={instructorOptions}
          section={sectionModal === "new" ? undefined : sectionModal}
          onClose={() => setSectionModal(null)}
          onSaved={() => { setSectionModal(null); load(); }}
        />
      )}
    </>
  );
}

function CatalogForm({ course, onSaved }: { course: AdminCourseDetail; onSaved: () => void }) {
  const [title, setTitle] = useState(course.title);
  const [credits, setCredits] = useState(String(course.credits));
  const [departmentId, setDepartmentId] = useState(course.departmentId);
  const [prereqs, setPrereqs] = useState<string[]>(course.prerequisites.map((p) => p.code));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function togglePrereq(code: string) {
    setPrereqs((p) => (p.includes(code) ? p.filter((x) => x !== code) : [...p, code]));
  }

  async function save() {
    setMsg(null);
    setBusy(true);
    try {
      await updateCourse(course.code, { title: title.trim(), credits: Number(credits) || course.credits, departmentId, prerequisiteCodes: prereqs });
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ margin: 0 }}>
      <h4 style={{ margin: "0 0 14px", fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700 }}>Course details</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Code"><input value={course.code} readOnly style={{ background: "var(--bg-subtle)", color: "var(--fg3)" }} /></Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Credits"><input type="number" min={1} max={12} value={credits} onChange={(e) => setCredits(e.target.value)} /></Field>
        <Field label="Department">
          <Select value={departmentId} onChange={setDepartmentId} options={course.departments.map((d) => ({ value: d.id, label: d.name }))} />
        </Field>
        <Field label="Prerequisites" hint={prereqs.length ? `${prereqs.length} selected` : "None"}>
          <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {course.allCourses.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No other courses.</span>}
            {course.allCourses.map((oc) => (
              <label key={oc.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                <input type="checkbox" checked={prereqs.includes(oc.code)} onChange={() => togglePrereq(oc.code)} style={{ width: 15, height: 15 }} />
                <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{oc.code}</span>
                <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{oc.title}</span>
              </label>
            ))}
          </div>
        </Field>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          {msg && <span className="muted" style={{ fontSize: 13 }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

function DeleteSectionButton({ section, onDone }: { section: CourseSection; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await deleteSection(section.id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <>
        <button onClick={remove} disabled={busy} style={{ padding: "5px 8px", color: "var(--danger)", fontSize: 12 }}>{busy ? "…" : "Confirm"}</button>
        <button onClick={() => setConfirming(false)} style={{ padding: "5px 8px", fontSize: 12 }}>No</button>
      </>
    );
  }
  return (
    <>
      <button onClick={() => setConfirming(true)} title={err ?? "Delete section"} style={{ padding: "5px 8px", color: err ? "var(--danger)" : "var(--fg3)" }}><Trash2 size={14} /></button>
    </>
  );
}

function SectionModal({
  course,
  instructorOptions,
  section,
  onClose,
  onSaved,
}: {
  course: AdminCourseDetail;
  instructorOptions: { value: string; label: string }[];
  section?: CourseSection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!section;
  const [termId, setTermId] = useState(section?.termId ?? course.terms[0]?.id ?? "");
  const [sectionCode, setSectionCode] = useState(section?.sectionCode ?? "A");
  const [instructorId, setInstructorId] = useState(section?.instructorId ?? "");
  const [days, setDays] = useState<string[]>(section ? parseDayString(section.days) : ["M", "W", "F"]);
  const [startTime, setStartTime] = useState(section?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(section?.endTime ?? "11:00");
  const [room, setRoom] = useState(section?.room ?? "");
  const [capacity, setCapacity] = useState(String(section?.capacity ?? 40));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(d: string) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }
  const daysStr = DAY_TOKENS.filter((d) => days.includes(d)).join("");

  async function save() {
    setErr(null);
    if (!termId || !sectionCode.trim() || !daysStr || !startTime || !endTime) {
      setErr("Term, section, days and times are required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        termId,
        sectionCode: sectionCode.trim().toUpperCase(),
        instructorId: instructorId || null,
        capacity: Number(capacity) || 40,
        days: daysStr,
        startTime,
        endTime,
        room: room.trim() || null,
      };
      if (editing) await updateSection(section!.id, payload);
      else await createSection({ courseCode: course.code, ...payload });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save section.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit section ${section!.sectionCode}` : "Add section"}
      width={480}
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save section" : "Add section"}</button></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Term"><Select value={termId} onChange={setTermId} options={course.terms.map((t) => ({ value: t.id, label: t.name }))} /></Field>
          <Field label="Section"><input value={sectionCode} onChange={(e) => setSectionCode(e.target.value.toUpperCase())} placeholder="A" /></Field>
        </div>
        <Field label="Instructor" hint="Optional">
          <Select value={instructorId} onChange={setInstructorId} options={[{ value: "", label: "— TBA —" }, ...instructorOptions]} />
        </Field>
        <Field label="Days">
          <div style={{ display: "flex", gap: 6 }}>
            {DAY_TOKENS.map((d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${days.includes(d) ? "var(--daust-navy)" : "var(--border)"}`, background: days.includes(d) ? "var(--bg-tint)" : "var(--surface)", color: days.includes(d) ? "var(--daust-navy)" : "var(--fg2)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Start"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
          <Field label="End"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Room" hint="Optional"><input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B-204" /></Field>
          <Field label="Capacity"><input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

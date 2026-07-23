"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock, ListChecks, MapPin, Pencil, Plus, Trash2, User } from "lucide-react";
import {
  type AdminPrograms,
  type Section,
  type StaffMember,
  type Term,
  createSection,
  deleteSection,
  getAdminCourseDetail,
  getAdminPrograms,
  getCurrentTerm,
  getSections,
  getStaff,
  updateSection,
} from "@/lib/api";
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, Progress, Segmented, Select } from "@/components/ui";

const DAY_TOKENS = ["M", "T", "W", "Th", "F"];

/**
 * Registration status is the registrar's own switch, not a seat count: a section
 * with seats left can still be closed to registration, and `enroll()` refuses a
 * closed section server-side regardless of capacity.
 */
function isOpen(s: Section): boolean {
  return s.status === "open";
}
function seatTone(s: Section): string {
  const pct = s.capacity > 0 ? (s.seatsTaken / s.capacity) * 100 : 0;
  if (s.seatsLeft <= 0) return "var(--error-500)";
  if (pct >= 80) return "var(--warning)";
  return "var(--success)";
}

export default function AdminOfferingsPage() {
  const [term, setTerm] = useState<Term | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);

  const load = useCallback(() => {
    getCurrentTerm()
      .then((t) => {
        setTerm(t);
        return getSections(t.id).then(setSections);
      })
      .catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const openCount = sections.filter(isOpen).length;
  const closedCount = sections.length - openCount;

  const rows = useMemo(() => {
    return sections.filter((s) => {
      if (filter === "open" && !isOpen(s)) return false;
      if (filter === "closed" && isOpen(s)) return false;
      return true;
    });
  }, [sections, filter]);

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Course Enrollment"
        subtitle={`${openCount} open · ${closedCount} closed sections offered${term ? ` · ${term.name}` : ""}`}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add course</Button>}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${sections.length})` },
            { value: "open", label: `Open (${openCount})` },
            { value: "closed", label: `Closed (${closedCount})` },
          ]}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((s) => (
          <OfferingCard
            key={s.id}
            section={s}
            term={term}
            onEdit={() => setEditing(s)}
            onDeleted={load}
            onChanged={load}
          />
        ))}
        {rows.length === 0 && (
          <div className="card" style={{ margin: 0 }}>
            <EmptyState icon={<ListChecks size={26} />} title="No sections offered." note="Add a catalog course to this term to open it for enrollment." />
          </div>
        )}
      </div>

      {adding && <OfferingModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {editing && <OfferingModal section={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function OfferingCard({
  section,
  term,
  onEdit,
  onDeleted,
  onChanged,
}: {
  section: Section;
  term: Term | null;
  onEdit: () => void;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const open = isOpen(section);
  const pct = section.capacity > 0 ? (section.seatsTaken / section.capacity) * 100 : 0;

  return (
    <div className="card" style={{ margin: 0, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: "var(--daust-navy)" }}>
            {section.courseCode} · {section.sectionCode}
          </span>
          <StatusToggle section={section} onChanged={onChanged} />
        </div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{section.title}</div>
        <div className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginTop: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><User size={13} /> {section.instructor ?? "TBA"}</span>
          {term && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarClock size={13} /> {term.name}</span>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock size={13} /> {section.schedule}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MapPin size={13} /> {section.room ?? "—"}</span>
        </div>
      </div>

      <div style={{ flex: "0 1 200px", minWidth: 160 }}>
        <Progress pct={pct} tone={seatTone(section)} label={<span>Seats {section.seatsTaken} / {section.capacity}</span>} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ToggleButton section={section} onChanged={onChanged} />
        <IconButton label="Edit offering" onClick={onEdit}><Pencil size={15} /></IconButton>
        <DeleteSectionButton section={section} onDeleted={onDeleted} />
      </div>
    </div>
  );
}

function ToggleButton({ section, onChanged }: { section: Section; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try { await updateSection(section.id, { status: isOpen(section) ? "closed" : "open" }); onChanged(); }
    finally { setBusy(false); }
  }
  return <Button size="sm" onClick={flip} disabled={busy}>{busy ? "…" : "Toggle"}</Button>;
}

/** Opens or closes the section to registration. `enroll()` enforces the same flag. */
function StatusToggle({ section, onChanged }: { section: Section; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = isOpen(section);

  async function toggle() {
    setBusy(true);
    try {
      await updateSection(section.id, { status: open ? "closed" : "open" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={open ? "Close to registration" : "Open for registration"}
      style={{ border: "none", background: "transparent", padding: 0, cursor: busy ? "wait" : "pointer" }}
    >
      <Badge tone={open ? "success" : "error"}>{open ? "Open" : "Closed"}</Badge>
    </button>
  );
}

function DeleteSectionButton({ section, onDeleted }: { section: Section; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await deleteSection(section.id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <>
        <Button variant="danger" size="sm" onClick={remove} disabled={busy}>{busy ? "…" : "Confirm"}</Button>
        <Button size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
      </>
    );
  }
  return (
    <IconButton label={err ?? "Remove section"} tone="danger" onClick={() => setConfirming(true)}><Trash2 size={15} /></IconButton>
  );
}

function parseDayTokens(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.slice(i, i + 2) === "Th") { out.push("Th"); i += 2; }
    else { const c = s[i]!; if (DAY_TOKENS.includes(c)) out.push(c); i += 1; }
  }
  return out;
}

function OfferingModal({ section, onClose, onSaved }: { section?: Section; onClose: () => void; onSaved: () => void }) {
  const editing = !!section;
  const [catalog, setCatalog] = useState<AdminPrograms["courses"]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [courseCode, setCourseCode] = useState(section?.courseCode ?? "");
  const [termId, setTermId] = useState(section?.termId ?? "");
  const [sectionCode, setSectionCode] = useState(section?.sectionCode ?? "A");
  const [instructorId, setInstructorId] = useState(section?.instructorId ?? "");
  const [days, setDays] = useState<string[]>(section ? parseDayTokens(section.days) : ["M", "W", "F"]);
  const [startTime, setStartTime] = useState(section?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(section?.endTime ?? "11:00");
  const [room, setRoom] = useState(section?.room ?? "");
  const [capacity, setCapacity] = useState(String(section?.capacity ?? 40));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAdminPrograms().then((d) => {
      setCatalog(d.courses);
      if (!editing) setCourseCode((c) => c || d.courses[0]?.code || "");
    }).catch(() => {});
    getStaff().then(setStaff).catch(() => {});
  }, [editing]);

  // The term list is only exposed through a course's admin detail, so it reloads per course.
  useEffect(() => {
    if (!courseCode) return;
    getAdminCourseDetail(courseCode)
      .then((d) => {
        setTerms(d.terms);
        setTermId((t) => (d.terms.some((x) => x.id === t) ? t : section?.termId ?? d.terms[0]?.id ?? ""));
      })
      .catch(() => setTerms([]));
  }, [courseCode, section?.termId]);

  const instructors = staff.filter((s) => s.kind === "faculty" || s.roles.includes("faculty"));
  const instructorOptions = (instructors.length ? instructors : staff).map((s) => ({ value: s.id, label: s.name }));
  const daysStr = DAY_TOKENS.filter((d) => days.includes(d)).join("");
  const endsAfterStart = startTime < endTime;

  function toggleDay(d: string) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function submit() {
    setErr(null);
    if (!courseCode || !termId || !sectionCode.trim() || !daysStr || !startTime || !endTime) {
      setErr("Course, term, section, days and times are required.");
      return;
    }
    if (!instructorId) { setErr("An instructor is required."); return; }
    if (!endsAfterStart) { setErr("The end time must be after the start time."); return; }
    setBusy(true);
    try {
      if (editing) {
        await updateSection(section!.id, {
          sectionCode: sectionCode.trim().toUpperCase(),
          instructorId,
          capacity: Number(capacity) || 40,
          days: daysStr,
          startTime,
          endTime,
          room: room.trim() || null,
        });
      } else {
        await createSection({
          courseCode,
          termId,
          sectionCode: sectionCode.trim().toUpperCase(),
          instructorId,
          capacity: Number(capacity) || 40,
          days: daysStr,
          startTime,
          endTime,
          room: room.trim() || null,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the offering.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit Course Offering" : "Add Course to Enrollment"}
      width={520}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add to enrollment"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Offer a catalog course for a given term.</p>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <Field label="Course" hint={editing ? "Not editable" : undefined}>
          {editing ? (
            <input value={`${section!.courseCode} · ${section!.title}`} readOnly style={{ background: "var(--bg-subtle)", color: "var(--fg3)" }} />
          ) : (
            <Select value={courseCode} onChange={setCourseCode} options={catalog.map((c) => ({ value: c.code, label: `${c.code} · ${c.title}` }))} />
          )}
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Term">
            {editing ? (
              <input value={terms.find((t) => t.id === termId)?.name ?? "—"} readOnly style={{ background: "var(--bg-subtle)", color: "var(--fg3)" }} />
            ) : (
              <Select value={termId} onChange={setTermId} options={terms.map((t) => ({ value: t.id, label: t.name }))} />
            )}
          </Field>
          <Field label="Section"><input value={sectionCode} onChange={(e) => setSectionCode(e.target.value.toUpperCase())} placeholder="A" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Instructor">
            <Select value={instructorId} onChange={setInstructorId} options={[{ value: "", label: "— Assign instructor —" }, ...instructorOptions]} />
          </Field>
          <Field label="Max participants"><input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Start"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
          <Field label="End"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
          <Field label="Room" hint="Optional"><input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B-204" /></Field>
        </div>
      </div>
    </Modal>
  );
}

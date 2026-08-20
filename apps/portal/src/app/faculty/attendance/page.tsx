"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Card, EmptyState } from "@/components/ui";
import { SectionInsights } from "@/components/SectionInsights";
import { CourseTabs, courseTitle } from "../CourseTabs";
import {
  type AttendanceSession,
  type AttendanceSheet,
  type TeachingSection,
  getAttendance,
  getAttendanceSessions,
  getTeaching,
  markAttendance,
} from "@/lib/api";

const SEGMENTS = [
  { value: "present", label: "Present", color: "#1f6b42" },
  { value: "late", label: "Late", color: "#a85f16" },
  { value: "absent", label: "Absent", color: "#a3291b" },
] as const;

export default function FacultyAttendance() {
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  /** Only students the instructor has actually marked. Unmarked stay out entirely, so
   *  saving a session never invents attendance for someone who was not called. */
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTeaching()
      .then((list) => {
        setSections(list);
        setSectionId((cur) => cur || list[0]?.id || "");
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, []);

  const load = useCallback(() => {
    if (!sectionId) return;
    getAttendance(sectionId, date)
      .then((s) => {
        setSheet(s);
        setMarks(
          Object.fromEntries(
            s.students
              .filter((x) => x.status !== null)
              .map((x) => [x.enrollmentId, x.status as string]),
          ),
        );
        setDirty(false);
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, [sectionId, date]);
  useEffect(load, [load]);

  const loadSessions = useCallback(() => {
    if (!sectionId) return;
    getAttendanceSessions(sectionId).then(setSessions).catch(() => {});
  }, [sectionId]);
  useEffect(loadSessions, [loadSessions]);

  const section = sections?.find((s) => s.id === sectionId);
  const counts = { present: 0, late: 0, absent: 0 };
  for (const status of Object.values(marks)) {
    if (status in counts) counts[status as keyof typeof counts] += 1;
  }

  function allPresent() {
    if (!sheet) return;
    setMarks(Object.fromEntries(sheet.students.map((s) => [s.enrollmentId, "present"])));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const records = Object.entries(marks).map(([enrollmentId, status]) => ({ enrollmentId, status }));
      await markAttendance(sectionId, date, records);
      setMsg({
        kind: "ok",
        text: `Attendance recorded for ${records.length} student${records.length === 1 ? "" : "s"}.`,
      });
      setDirty(false);
      load();
      loadSessions();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Take Attendance</h1>
      <p className="muted" style={{ margin: "2px 0 22px", fontSize: 14 }}>
        Record attendance for a class session
      </p>

      {msg && (
        <p className="card" style={{ color: msg.kind === "ok" ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>
      )}

      {sections && sections.length === 0 && (
        <EmptyState
          title="You are not teaching any sections"
          note="Sections appear here once the registrar assigns you as instructor."
        />
      )}

      {sections && sections.length > 0 && (
        <>
          <CourseTabs sections={sections} value={sectionId} onChange={setSectionId} />
          <SectionInsights sectionId={sectionId} />

          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>
                  {section ? courseTitle(section) : "—"}
                </h3>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 12.5 }}>
                  <span style={{ color: "var(--success-500)", fontWeight: 700 }}>{counts.present}P</span>{" · "}
                  <span style={{ color: "var(--warning-500)", fontWeight: 700 }}>{counts.late}L</span>{" · "}
                  <span style={{ color: "var(--error-500)", fontWeight: 700 }}>{counts.absent}A</span>
                  {" this session"}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <Button variant="secondary" size="sm" onClick={allPresent}>All present</Button>
                <Button variant="navy" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save session"}</Button>
              </div>
            </div>

            {sheet?.students.map((s) => (
              <div
                key={s.enrollmentId}
                className="sis-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "11px 8px",
                  borderBottom: "1px solid var(--divider)",
                  borderRadius: 8,
                }}
              >
                <Avatar name={s.name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{s.studentNo}</div>
                </div>
                <div style={{ width: 240, display: "flex", gap: 6 }}>
                  {SEGMENTS.map((seg) => {
                    const on = marks[s.enrollmentId] === seg.value;
                    return (
                      <button
                        key={seg.value}
                        onClick={() => { setMarks({ ...marks, [s.enrollmentId]: seg.value }); setDirty(true); }}
                        className="sis-btn"
                        style={{
                          flex: 1,
                          textAlign: "center",
                          padding: 7,
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: `1.5px solid ${on ? seg.color : "var(--border)"}`,
                          background: on ? seg.color : "var(--surface)",
                          color: on ? "#fff" : "var(--fg3)",
                        }}
                      >
                        {seg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {sheet && sheet.students.length === 0 && <EmptyState title="No students enrolled in this section" />}
          </Card>

          <Card title="Recorded sessions">
            {sessions.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                No sessions recorded for this course yet.
              </p>
            ) : (
              sessions.map((ss) => (
                <button
                  key={ss.date}
                  onClick={() => setDate(ss.date)}
                  className="sis-btn"
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 0",
                    borderBottom: "1px solid var(--divider)",
                    background: "none",
                    border: "none",
                    borderRadius: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                    {new Date(`${ss.date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--success-500)" }}>{ss.present}P</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--warning-500)" }}>{ss.late}L</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--error-500)" }}>{ss.absent}A</span>
                </button>
              ))
            )}
          </Card>
        </>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Card, EmptyState } from "@/components/ui";
import { CourseTabs, courseTitle } from "../CourseTabs";
import {
  type AttendanceSheet,
  type TeachingSection,
  getAttendance,
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
  const [marks, setMarks] = useState<Record<string, string>>({});
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
        setMarks(Object.fromEntries(s.students.map((x) => [x.enrollmentId, x.status])));
      })
      .catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, [sectionId, date]);
  useEffect(load, [load]);

  const section = sections?.find((s) => s.id === sectionId);
  const counts = { present: 0, late: 0, absent: 0 };
  for (const status of Object.values(marks)) {
    if (status in counts) counts[status as keyof typeof counts] += 1;
  }

  function allPresent() {
    if (!sheet) return;
    setMarks(Object.fromEntries(sheet.students.map((s) => [s.enrollmentId, "present"])));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const records = Object.entries(marks).map(([enrollmentId, status]) => ({ enrollmentId, status }));
      await markAttendance(sectionId, date, records);
      setMsg({ kind: "ok", text: "Attendance recorded." });
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
                <Button variant="navy" disabled={busy} onClick={save}>Save session</Button>
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
                        onClick={() => setMarks({ ...marks, [s.enrollmentId]: seg.value })}
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
        </>
      )}
    </>
  );
}

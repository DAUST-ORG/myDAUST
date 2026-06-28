"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type AttendanceSheet, getAttendance, markAttendance } from "@/lib/api";

const CYCLE = ["present", "late", "absent"];

export default function AttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((d: string) => {
    getAttendance(id, d).then((s) => {
      setSheet(s);
      setMarks(Object.fromEntries(s.students.map((x) => [x.enrollmentId, x.status])));
    }).catch(() => {});
  }, [id]);
  useEffect(() => load(date), [load, date]);

  if (!sheet) return <p className="muted">Loading…</p>;

  const counts = { present: 0, late: 0, absent: 0 } as Record<string, number>;
  Object.values(marks).forEach((s) => (counts[s] = (counts[s] ?? 0) + 1));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await markAttendance(id, date, Object.entries(marks).map(([enrollmentId, status]) => ({ enrollmentId, status })));
      setMsg("Attendance saved.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="eyebrow"><Link href={`/faculty/classes/${id}`}>← Class</Link></p>
      <h1 className="page-title">Attendance</h1>

      <div className="card">
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="badge paid">Present {counts.present ?? 0}</span>
          <span className="badge partial">Late {counts.late ?? 0}</span>
          <span className="badge overdue">Absent {counts.absent ?? 0}</span>
          {msg && <span className="muted">{msg}</span>}
        </div>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Student #</th><th>Name</th><th>Status (click to cycle)</th></tr></thead>
          <tbody>
            {sheet.students.map((s) => {
              const cur = marks[s.enrollmentId] ?? "present";
              return (
                <tr key={s.enrollmentId}>
                  <td>{s.studentNo}</td>
                  <td>{s.name}</td>
                  <td>
                    <button
                      onClick={() => setMarks({ ...marks, [s.enrollmentId]: CYCLE[(CYCLE.indexOf(cur) + 1) % 3]! })}
                      className={`badge ${cur === "present" ? "paid" : cur === "late" ? "partial" : "overdue"}`}
                      style={{ border: "none", cursor: "pointer" }}
                    >
                      {cur}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sheet.students.length === 0 && <p className="muted">No students enrolled.</p>}
        <button className="primary" disabled={busy} onClick={save} style={{ marginTop: 14 }}>Save attendance</button>
      </div>
    </>
  );
}

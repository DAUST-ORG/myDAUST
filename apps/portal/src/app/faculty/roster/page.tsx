"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRoster, getTeaching, type Roster, type TeachingSection } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

export default function RosterPage() {
  const { me, loading: authLoading } = useAuth();
  const [sections, setSections] = useState<TeachingSection[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    getTeaching()
      .then(setSections)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [me]);

  if (authLoading || (me && loading)) return <main>Loading…</main>;
  if (!me) return <main>Redirecting…</main>;
  if (error)
    return <main><p className="card" style={{ color: "var(--bad)" }}>{error}</p></main>;

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setRoster(null);
    setOpenId(id);
    setRoster(await getRoster(id));
  }

  return (
    <main>
      <p className="h1">Teaching</p>
      {sections.length === 0 && <p className="card muted">No sections assigned.</p>}
      {sections.map((s) => (
        <div className="card" key={s.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <strong>{s.course}</strong> · Sec {s.sectionCode} · {s.term}
              <br />
              <span className="muted" style={{ fontSize: 13 }}>{s.schedule} · {s.room}</span>
            </div>
            <span className="badge pending">{s.enrolled}/{s.capacity} enrolled</span>
            <Link href={`/faculty/assignments/${s.id}`}>Assignments</Link>
            <Link href={`/faculty/gradebook/${s.id}`}>Gradebook</Link>
            <Link href={`/faculty/attendance/${s.id}`}>Attendance</Link>
            <button onClick={() => toggle(s.id)}>{openId === s.id ? "Hide" : "Roster"}</button>
          </div>

          {openId === s.id && roster && (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Student #</th><th>Name</th><th>Grade</th></tr>
              </thead>
              <tbody>
                {roster.students.length === 0 ? (
                  <tr><td colSpan={3} className="muted">No students enrolled.</td></tr>
                ) : (
                  roster.students.map((st) => (
                    <tr key={st.studentNo}>
                      <td>{st.studentNo}</td>
                      <td>{st.name}</td>
                      <td>{st.grade ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </main>
  );
}

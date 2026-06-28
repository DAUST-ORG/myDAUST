"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dropEnrollment,
  enrollSection,
  getCurrentTerm,
  getMyEnrollments,
  getSections,
  type MyEnrollment,
  type Section,
} from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

export default function CoursesPage() {
  const { me, loading: authLoading } = useAuth();
  const [termId, setTermId] = useState<string | null>(null);
  const [termName, setTermName] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [mine, setMine] = useState<MyEnrollment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (tid: string) => {
    const [secs, my] = await Promise.all([getSections(tid), getMyEnrollments()]);
    setSections(secs);
    setMine(my);
  }, []);

  useEffect(() => {
    if (!me) return;
    getCurrentTerm()
      .then(async (t) => {
        setTermId(t.id);
        setTermName(t.name);
        await refresh(t.id);
      })
      .finally(() => setLoading(false));
  }, [me, refresh]);

  if (authLoading || (me && loading)) return <main>Loading…</main>;
  if (!me) return <main>Redirecting…</main>;

  const enrolledSectionIds = new Set(mine.map((m) => m.sectionId));
  const totalCredits = mine.reduce((sum, m) => sum + m.credits, 0);

  async function act(fn: () => Promise<unknown>, key: string, okText: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      if (termId) await refresh(termId);
    } catch (e) {
      const raw = (e as Error).message;
      const m = raw.match(/"message":"([^"]+)"/);
      setMsg({ kind: "err", text: m ? m[1]! : raw });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <p className="h1">Course registration — {termName}</p>
      {msg && (
        <p className="card" style={{ color: msg.kind === "ok" ? "var(--ok)" : "var(--bad)" }}>
          {msg.text}
        </p>
      )}

      <div className="card">
        <p className="muted" style={{ fontWeight: 600 }}>
          My schedule · {mine.length} courses · {totalCredits} credits
        </p>
        {mine.length === 0 ? (
          <p className="muted">Not enrolled in anything yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Course</th><th>Sec</th><th>Schedule</th><th>Room</th><th>Cr</th><th></th></tr>
            </thead>
            <tbody>
              {mine.map((m) => (
                <tr key={m.enrollmentId}>
                  <td>{m.courseCode} — {m.title}</td>
                  <td>{m.sectionCode}</td>
                  <td>{m.schedule}</td>
                  <td>{m.room}</td>
                  <td>{m.credits}</td>
                  <td>
                    <button
                      disabled={busy === m.enrollmentId}
                      onClick={() => act(() => dropEnrollment(m.enrollmentId), m.enrollmentId, "Dropped.")}
                    >
                      {busy === m.enrollmentId ? "…" : "Drop"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <p className="muted" style={{ fontWeight: 600 }}>Available sections</p>
        <table>
          <thead>
            <tr><th>Course</th><th>Sec</th><th>Schedule</th><th>Instructor</th><th>Prereqs</th><th>Seats</th><th></th></tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const enrolled = enrolledSectionIds.has(s.id);
              const full = s.seatsLeft <= 0;
              return (
                <tr key={s.id}>
                  <td>{s.courseCode} — {s.title}</td>
                  <td>{s.sectionCode}</td>
                  <td>{s.schedule}<br /><span className="muted" style={{ fontSize: 12 }}>{s.room}</span></td>
                  <td>{s.instructor}</td>
                  <td>{s.prerequisites.length ? s.prerequisites.join(", ") : <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge ${full ? "overdue" : "paid"}`}>{s.seatsTaken}/{s.capacity}</span>
                  </td>
                  <td>
                    {enrolled ? (
                      <span className="badge success">enrolled</span>
                    ) : (
                      <button
                        className="primary"
                        disabled={busy === s.id || full}
                        onClick={() => act(() => enrollSection(s.id), s.id, `Enrolled in ${s.courseCode}.`)}
                      >
                        {busy === s.id ? "…" : full ? "Full" : "Enroll"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

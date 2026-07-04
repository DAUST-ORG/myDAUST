"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type AdminStudentDetail, adminDropEnrollment, getAdminStudentDetail } from "@/lib/api";
import { formatXof } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = { enrolled: "enrolled", completed: "completed", dropped: "dropped" };

export default function AdminStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<AdminStudentDetail | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminStudentDetail(id).then(setS).catch(() => {});
  }, [id]);
  useEffect(() => load(), [load]);

  if (!s) return <p className="muted">Loading…</p>;

  async function drop(enrollmentId: string) {
    setNote(null);
    try {
      await adminDropEnrollment(enrollmentId);
      setNote("Enrollment dropped (administrative, audit-logged).");
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <>
      <p className="eyebrow"><Link href="/admin/students">← Students</Link></p>
      <h1 className="page-title">{s.name}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{s.studentNo} · {s.email} · {s.program ?? "No program"}</p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Cumulative GPA</div><div className="value">{s.gpa > 0 ? s.gpa.toFixed(2) : "—"}</div></div>
        <div className="kpi"><div className="label">Credits completed</div><div className="value">{s.completedCredits}</div></div>
        <div className="kpi"><div className="label">Balance</div><div className="value" style={{ fontSize: 22 }}>{formatXof(s.balance)}</div><div className="trend"><Link href={`/admin/finance/students/${id}`}>Finance account →</Link></div></div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="h1" style={{ fontSize: 16, flex: 1 }}>Enrollments</p>
          {note && <span className="muted" style={{ fontSize: 13 }}>{note}</span>}
        </div>
        <table>
          <thead><tr><th>Course</th><th>Term</th><th>Section</th><th>Credits</th><th>Status</th><th>Grade</th><th /></tr></thead>
          <tbody>
            {s.enrollments.map((e) => (
              <tr key={e.enrollmentId}>
                <td><strong>{e.courseCode}</strong> — {e.title}</td>
                <td>{e.term}</td>
                <td>{e.sectionCode}</td>
                <td>{e.credits}</td>
                <td><span className={`badge ${STATUS_BADGE[e.status] ?? "pending"}`}>{e.status}</span></td>
                <td>{e.grade ?? "—"}</td>
                <td>{e.status === "enrolled" && <button onClick={() => drop(e.enrollmentId)} style={{ fontSize: 12 }}>Admin drop</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.enrollments.length === 0 && <p className="muted">No enrollments.</p>}
      </div>
    </>
  );
}

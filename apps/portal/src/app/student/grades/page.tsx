"use client";

import { useEffect, useState } from "react";
import { type GradeRow, type MySummary, getMyGrades, getMySummary } from "@/lib/api";
import { GpaRing } from "@/components/GpaRing";

export default function GradesPage() {
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [summary, setSummary] = useState<MySummary | null>(null);
  useEffect(() => {
    Promise.all([getMyGrades(), getMySummary()])
      .then(([g, s]) => {
        setGrades(g);
        setSummary(s);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Academic record</p>
      <h1 className="page-title">Grades & GPA</h1>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flex: "0 0 auto" }}>
          <GpaRing gpa={summary?.gpa ?? 0} />
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Cumulative GPA</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800 }}>{summary?.gpa?.toFixed(2) ?? "—"}</div>
            <div className="muted" style={{ fontSize: 13 }}>{summary?.completedCredits ?? 0} credits completed</div>
          </div>
        </div>
        <div className="kpi" style={{ flex: 1 }}><div className="label">In progress</div><div className="value">{summary?.credits ?? 0}</div><div className="trend">credits this term</div></div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Transcript</p>
        {grades.length === 0 ? (
          <p className="muted">No completed courses yet.</p>
        ) : (
          <table>
            <thead><tr><th>Course</th><th>Term</th><th>Credits</th><th>Grade</th><th>Points</th></tr></thead>
            <tbody>
              {grades.map((g, i) => (
                <tr key={i}>
                  <td><strong>{g.courseCode}</strong> — {g.title}</td>
                  <td>{g.term}</td>
                  <td>{g.credits}</td>
                  <td><span className="badge completed">{g.grade}</span></td>
                  <td>{g.points?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

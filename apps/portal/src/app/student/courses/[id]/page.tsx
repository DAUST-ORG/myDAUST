"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type CourseDetail, getCourseDetail } from "@/lib/api";

const TABS = ["Overview", "Assignments", "Grade"] as const;
type Tab = (typeof TABS)[number];

const STATUS_BADGE: Record<string, string> = {
  assigned: "pending",
  submitted: "partial",
  graded: "completed",
};

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCourseDetail(id).then(setData).catch((e: Error) => setErr(e.message));
  }, [id]);

  if (err) return <p className="card" style={{ color: "var(--bad)" }}>{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const o = data.overview;

  return (
    <>
      <p className="eyebrow"><Link href="/student/schedule">← Schedule</Link></p>
      <h1 className="page-title">{o.courseCode} — {o.title}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{o.term} · {o.instructor ?? "TBA"} · {o.schedule} · {o.room ?? "—"}</p>

      <div className="tabs" style={{ display: "flex", gap: 6, margin: "14px 0" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? "primary" : ""}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="card">
          <div className="row">
            <div className="kpi"><div className="label">Credits</div><div className="value">{o.credits}</div></div>
            <div className="kpi"><div className="label">Status</div><div className="value" style={{ textTransform: "capitalize" }}>{o.status}</div></div>
            <div className="kpi"><div className="label">Current grade</div><div className="value">{o.grade ?? "—"}</div></div>
          </div>
          <p style={{ marginTop: 12 }}>{o.description ?? "No course description provided."}</p>
          {o.prerequisites.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>Prerequisites: {o.prerequisites.join(", ")}</p>
          )}
        </div>
      )}

      {tab === "Assignments" && (
        <div className="card">
          {data.assignments.length === 0 ? (
            <p className="muted">No assignments posted yet.</p>
          ) : (
            <table>
              <thead><tr><th>Title</th><th>Type</th><th>Due</th><th>Weight</th><th>Status</th><th>Score</th></tr></thead>
              <tbody>
                {data.assignments.map((a) => (
                  <tr key={a.assignmentId}>
                    <td><strong>{a.title}</strong></td>
                    <td style={{ textTransform: "capitalize" }}>{a.type}</td>
                    <td>{new Date(a.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                    <td>{a.weight}%</td>
                    <td><span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span></td>
                    <td>{a.score !== null ? `${a.score}/${a.maxPoints}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Submit work from the <Link href="/student/assignments">Assignments</Link> hub.</p>
        </div>
      )}

      {tab === "Grade" && (
        <div className="card">
          <p className="h1" style={{ fontSize: 16 }}>Graded work</p>
          {data.assignments.filter((a) => a.status === "graded").length === 0 ? (
            <p className="muted">No graded items yet.</p>
          ) : (
            data.assignments.filter((a) => a.status === "graded").map((a) => (
              <div key={a.assignmentId} style={{ borderTop: "1px solid var(--divider)", padding: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{a.title}</strong>
                  <span className="badge completed">{a.score}/{a.maxPoints}</span>
                </div>
                {a.feedback && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{a.feedback}</p>}
              </div>
            ))
          )}
          <p style={{ marginTop: 12 }}>Final course grade: <strong>{o.grade ?? "in progress"}</strong></p>
        </div>
      )}
    </>
  );
}

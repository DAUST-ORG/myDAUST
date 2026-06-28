"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type AssignmentSubmissions,
  type SubmissionRow,
  fileUrl,
  getAssignmentSubmissions,
  gradeSubmission,
} from "@/lib/api";

const STATUS_BADGE: Record<string, string> = {
  assigned: "pending",
  submitted: "partial",
  graded: "completed",
};

export default function SubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AssignmentSubmissions | null>(null);

  const load = useCallback(() => {
    getAssignmentSubmissions(id).then(setData).catch(() => {});
  }, [id]);
  useEffect(() => load(), [load]);

  if (!data) return <p className="muted">Loading…</p>;
  const { assignment } = data;
  const submitted = data.submissions.filter((s) => s.submissionId);
  const graded = data.submissions.filter((s) => s.status === "graded");

  return (
    <>
      <p className="eyebrow"><Link href={`/faculty/assignments/${assignment.sectionId}`}>← Assignments</Link></p>
      <h1 className="page-title">{assignment.title}</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        {assignment.course} · max {assignment.maxPoints} pts · weight {assignment.weight}% · due {new Date(assignment.dueDate).toLocaleDateString()}
      </p>

      <div className="row">
        <div className="kpi"><div className="label">Submitted</div><div className="value">{submitted.length}/{data.submissions.length}</div></div>
        <div className="kpi"><div className="label">Graded</div><div className="value">{graded.length}/{submitted.length}</div></div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Submission</th><th>Status</th><th>Score</th><th>Action</th></tr></thead>
          <tbody>
            {data.submissions.map((s) => (
              <GradeRow key={s.enrollmentId} row={s} maxPoints={assignment.maxPoints} onGraded={load} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GradeRow({ row, maxPoints, onGraded }: { row: SubmissionRow; maxPoints: number; onGraded: () => void }) {
  const [score, setScore] = useState<string>(row.score?.toString() ?? "");
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await gradeSubmission(row.submissionId!, Number(score), feedback.trim() || undefined);
      onGraded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{row.studentNo}</td>
      <td>{row.name}</td>
      <td style={{ maxWidth: 320 }}>
        {row.submissionId ? (
          <>
            {row.text && <div style={{ fontSize: 13 }}>{row.text}</div>}
            {row.fileUrl && (
              <a href={fileUrl(row.fileUrl)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>📎 {row.fileName ?? "attachment"}</a>
            )}
            {err && <div className="muted" style={{ color: "var(--bad)", fontSize: 12 }}>{err}</div>}
          </>
        ) : (
          <span className="muted">Not submitted</span>
        )}
      </td>
      <td><span className={`badge ${STATUS_BADGE[row.status]}`}>{row.status}</span></td>
      <td>
        {row.submissionId ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="number" value={score} onChange={(e) => setScore(e.target.value)} style={{ width: 60 }} /> / {maxPoints}
          </span>
        ) : "—"}
      </td>
      <td>
        {row.submissionId && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" style={{ width: 160 }} />
            <button className="primary" onClick={save} disabled={busy || score === ""}>{busy ? "…" : "Grade"}</button>
          </span>
        )}
      </td>
    </tr>
  );
}

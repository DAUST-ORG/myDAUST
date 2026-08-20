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
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";

/**
 * Reading a student's work before scoring it. The gradebook fetches text, file, status
 * and feedback and renders none of it, so this is the only screen where an instructor
 * can see what was actually handed in.
 */
export default function SubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AssignmentSubmissions | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    getAssignmentSubmissions(id)
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => load(), [load]);

  if (loading) return <Card><div role="status" className="muted">Loading submissions…</div></Card>;
  if (err) return <Card><div role="alert" style={{ color: "var(--error-500)" }}>{err}</div></Card>;
  if (!data) return null;

  const { assignment } = data;
  const submitted = data.submissions.filter((s) => s.submissionId);
  const graded = data.submissions.filter((s) => s.status === "graded");

  return (
    <>
      <p className="eyebrow"><Link href="/faculty/gradebook">← Gradebook</Link></p>
      <PageHeader
        title={assignment.title}
        subtitle={`${assignment.course} · max ${assignment.maxPoints} pts · weight ${assignment.weight}% · due ${new Date(assignment.dueDate).toLocaleDateString()}`}
      />
      {assignment.description && (
        <p style={{ fontSize: 14, marginTop: -8, marginBottom: 16, whiteSpace: "pre-wrap" }}>
          {assignment.description}
        </p>
      )}

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <Stat label="Submitted" value={`${submitted.length}/${data.submissions.length}`} />
        <Stat label="Graded" value={`${graded.length}/${submitted.length}`} />
      </div>

      {data.submissions.length === 0 ? (
        <EmptyState title="Nobody is enrolled in this section yet" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.submissions.map((s) => (
            <SubmissionCard key={s.enrollmentId} row={s} maxPoints={assignment.maxPoints} onGraded={load} />
          ))}
        </div>
      )}
    </>
  );
}

function SubmissionCard({
  row,
  maxPoints,
  onGraded,
}: {
  row: SubmissionRow;
  maxPoints: number;
  onGraded: () => void;
}) {
  const [score, setScore] = useState<string>(row.score?.toString() ?? "");
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasWork = Boolean(row.submissionId);

  async function save(clear = false) {
    if (!row.submissionId) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await gradeSubmission(row.submissionId, clear ? null : Number(score), feedback);
      if (clear) setScore("");
      setSaved(true);
      onGraded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const badge = row.status === "graded" ? "completed" : row.status === "submitted" ? "partial" : "pending";

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 14.5 }}>{row.name}</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{row.studentNo}</span>
        <span style={{ flex: 1 }} />
        <span className={`badge ${badge}`}>{row.status}</span>
      </div>

      {hasWork ? (
        <div style={{ background: "var(--bg-subtle)", borderRadius: 9, padding: "11px 13px", marginBottom: 12 }}>
          {row.text ? (
            <p style={{ margin: 0, fontSize: 13.5, whiteSpace: "pre-wrap" }}>{row.text}</p>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No written answer.</p>
          )}
          {row.fileUrl && (
            <a href={fileUrl(row.fileUrl)} target="_blank" rel="noreferrer" style={{ fontSize: 13, display: "inline-block", marginTop: 8 }}>
              📎 {row.fileName ?? "attachment"}
            </a>
          )}
          {row.submittedAt && (
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
              Submitted {new Date(row.submittedAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Nothing handed in yet.</p>
      )}

      {hasWork && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="number"
              value={score}
              onChange={(e) => { setScore(e.target.value); setSaved(false); }}
              style={{ width: 70 }}
              aria-label={`Score for ${row.name}`}
            />
            <span className="muted">/ {maxPoints}</span>
          </label>
          <textarea
            value={feedback}
            onChange={(e) => { setFeedback(e.target.value); setSaved(false); }}
            placeholder="Feedback for the student…"
            rows={2}
            aria-label={`Feedback for ${row.name}`}
            style={{ flex: 1, minWidth: 220, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="primary" onClick={() => save(false)} disabled={busy || score === ""}>
              {busy ? "Saving…" : "Save"}
            </button>
            {row.score !== null && <button onClick={() => save(true)} disabled={busy}>Clear</button>}
          </div>
          {saved && <span style={{ fontSize: 12.5, color: "var(--success-500)" }}>Saved</span>}
          {err && <span style={{ fontSize: 12.5, color: "var(--error-500)" }}>{err}</span>}
        </div>
      )}
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type PendingEvaluation,
  getPendingEvaluations,
  submitEvaluation,
} from "@/lib/api";
import { Card, EmptyState, PageHeader } from "@/components/ui";

const QUESTIONS = [
  { key: "overall", label: "Overall, how would you rate this course?" },
  { key: "clarity", label: "How clearly was the material explained?" },
  { key: "workload", label: "Was the workload appropriate?" },
] as const;

export default function StudentEvaluationsPage() {
  const [pending, setPending] = useState<PendingEvaluation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    getPendingEvaluations()
      .then(setPending)
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Course evaluations"
        subtitle="Your answers are anonymous — your name is never stored with them."
      />
      {err && <Card><div role="alert" style={{ color: "var(--error-500)" }}>{err}</div></Card>}
      {pending === null && !err && (
        <Card><div role="status" className="muted">Loading…</div></Card>
      )}
      {pending?.length === 0 && (
        <EmptyState
          title="Nothing to evaluate right now"
          note="Evaluations open twice a term. You will see your courses here when a round is running."
        />
      )}
      {pending?.map((p) => (
        <EvaluationForm key={`${p.windowId}:${p.sectionId}`} item={p} onDone={load} />
      ))}
    </>
  );
}

function EvaluationForm({
  item,
  onDone,
}: {
  item: PendingEvaluation;
  onDone: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const complete = QUESTIONS.every((q) => scores[q.key]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await submitEvaluation(item.sectionId, {
        windowId: item.windowId,
        overall: scores.overall!,
        clarity: scores.clarity!,
        workload: scores.workload!,
        comment: comment.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={item.course}>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>
        {item.kind === "midterm" ? "Mid-semester" : "End of semester"} · closes{" "}
        {new Date(item.closesAt).toLocaleDateString()}
        {item.instructor ? ` · ${item.instructor}` : ""}
      </p>

      {QUESTIONS.map((q) => (
        <div key={q.key} style={{ margin: "14px 0" }}>
          <p style={{ fontSize: 13.5, margin: "0 0 7px" }}>{q.label}</p>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={scores[q.key] === n}
                onClick={() => setScores({ ...scores, [q.key]: n })}
                className={scores[q.key] === n ? "primary" : ""}
                style={{ width: 44 }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Anything else? (optional)"
        style={{ width: "100%", resize: "vertical", marginTop: 4 }}
      />
      <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 12px" }}>
        Comments are shown to your instructor without your name, but in a small class a
        comment can still be recognisable. Leave it blank if you would rather not.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="primary" onClick={submit} disabled={busy || !complete}>
          {busy ? "Sending…" : "Submit anonymously"}
        </button>
        {err && <span style={{ fontSize: 12.5, color: "var(--error-500)" }}>{err}</span>}
      </div>
    </Card>
  );
}

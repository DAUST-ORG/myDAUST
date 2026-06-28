"use client";

import { useCallback, useEffect, useState } from "react";
import { type ReviewItem, fileUrl, getReviewQueue, gradeProjectSubmission } from "@/lib/api";

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const load = useCallback(() => {
    getReviewQueue().then(setItems).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  return (
    <>
      <p className="eyebrow">Studio</p>
      <h1 className="page-title">Review Queue</h1>
      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>{items.length} submission(s) awaiting review</p>
        <table>
          <thead><tr><th>Project</th><th>Submission</th><th>Attachment</th><th>Grade</th></tr></thead>
          <tbody>
            {items.map((it) => <ReviewRow key={it.id} item={it} onGraded={load} />)}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">Queue is clear. 🎉</p>}
      </div>
    </>
  );
}

function ReviewRow({ item, onGraded }: { item: ReviewItem; onGraded: () => void }) {
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!grade.trim()) return;
    setBusy(true);
    try { await gradeProjectSubmission(item.id, grade, feedback.trim() || undefined); onGraded(); } finally { setBusy(false); }
  }

  return (
    <tr>
      <td><strong>{item.project}</strong></td>
      <td>{item.title} <span className="muted" style={{ fontSize: 11 }}>· {item.kind}</span></td>
      <td>{item.fileUrl ? <a href={fileUrl(item.fileUrl)} target="_blank" rel="noopener noreferrer">📎 {item.fileName ?? "file"}</a> : <span className="muted">—</span>}</td>
      <td>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="A/B…" style={{ width: 56 }} />
          <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" style={{ width: 160 }} />
          <button className="primary" onClick={save} disabled={busy || !grade.trim()} style={{ fontSize: 12 }}>Grade</button>
        </span>
      </td>
    </tr>
  );
}

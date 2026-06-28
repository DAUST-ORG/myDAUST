"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { Roadmap } from "@/components/Roadmap";
import {
  type ProjectDetail,
  advanceProjectPhase,
  fileUrl,
  getProjectDetail,
  gradeProjectSubmission,
} from "@/lib/api";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<ProjectDetail | null>(null);

  const load = useCallback(() => {
    getProjectDetail(id).then(setP).catch(() => {});
  }, [id]);
  useEffect(() => load(), [load]);

  if (!p) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow"><Link href="/innovation/projects">← Projects</Link></p>
      <h1 className="page-title">{p.name}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: -8, marginBottom: 16 }}>
        <span className="muted">{p.advisor ? `Advisor ${p.advisor}` : "Unadvised"} · {p.members.map((m) => m.name).join(", ")}</span>
        <span style={{ flex: 1 }} />
        {p.phase !== "final" && <button className="primary" onClick={() => advanceProjectPhase(id).then(load)}>Advance phase →</button>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 15, marginBottom: 14 }}>Roadmap</p>
        <Roadmap phases={p.roadmap} />
      </div>

      <Panel title="Submissions" pad="4px 20px 12px">
        {p.submissions.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>No submissions.</p>}
        {p.submissions.map((s, i) => (
          <SubmissionRow key={s.id} s={s} last={i === p.submissions.length - 1} onGraded={load} />
        ))}
      </Panel>
    </>
  );
}

function SubmissionRow({ s, last, onGraded }: { s: ProjectDetail["submissions"][number]; last: boolean; onGraded: () => void }) {
  const [grade, setGrade] = useState(s.grade ?? "");
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!grade.trim()) return;
    setBusy(true);
    try { await gradeProjectSubmission(s.id, grade, feedback.trim() || undefined); onGraded(); } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--divider)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{s.title}</strong> <span className="muted" style={{ fontSize: 11 }}>· {s.kind}</span>
          {s.fileUrl && <> · <a href={fileUrl(s.fileUrl)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>📎 {s.fileName ?? "file"}</a></>}
        </div>
        {s.status === "reviewed" ? <span className="badge completed">Graded {s.grade}</span> : <span className="badge partial">Pending</span>}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" style={{ width: 70 }} />
        <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" style={{ flex: 1, maxWidth: 360 }} />
        <button className="primary" onClick={save} disabled={busy || !grade.trim()} style={{ fontSize: 12 }}>Save</button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "@/components/Panel";
import { Roadmap } from "@/components/Roadmap";
import {
  type MyProject,
  fileUrl,
  getMyProject,
  submitProjectWork,
  toggleProjectTask,
  uploadFile,
} from "@/lib/api";

const KINDS = ["Document", "Video", "Demo", "Poster"];

export default function StudentInnovationPage() {
  const [project, setProject] = useState<MyProject | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    getMyProject().then((p) => { setProject(p); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  useEffect(() => load(), [load]);

  if (!loaded) return <p className="muted">Loading…</p>;
  if (!project) return (
    <>
      <p className="eyebrow">Innovation Studio</p>
      <h1 className="page-title">Innovation Project</h1>
      <p className="muted">You&rsquo;re not part of an innovation project yet. Ask the Innovation Studio to add you to a team.</p>
    </>
  );

  return (
    <>
      <p className="eyebrow">Innovation Studio · {project.advisor ? `Advisor ${project.advisor}` : "Unadvised"}</p>
      <h1 className="page-title">{project.name}</h1>
      {project.grade && <span className="badge completed">Final grade: {project.grade}</span>}

      <div className="card" style={{ margin: "16px 0" }}>
        <p className="h1" style={{ fontSize: 15, marginBottom: 14 }}>7-phase roadmap</p>
        <Roadmap phases={project.roadmap} />
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Tasks" pad="4px 20px 12px">
            {project.tasks.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>No tasks assigned.</p>}
            {project.tasks.map((t, i) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < project.tasks.length - 1 ? "1px solid var(--divider)" : "none" }}>
                <input type="checkbox" checked={t.status === "done"} onChange={() => toggleProjectTask(t.id).then(load)} />
                <div style={{ flex: 1, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--fg3)" : "var(--fg1)" }}>
                  {t.title} <span className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>· {t.phase}</span>
                </div>
                {t.dueDate && <span className="muted" style={{ fontSize: 12 }}>{new Date(t.dueDate).toLocaleDateString()}</span>}
              </div>
            ))}
          </Panel>

          <Panel title="Submissions" pad="4px 20px 12px">
            {project.submissions.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>No submissions yet.</p>}
            {project.submissions.map((s, i) => (
              <div key={s.id} style={{ padding: "12px 0", borderBottom: i < project.submissions.length - 1 ? "1px solid var(--divider)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{s.title} <span className="muted" style={{ fontSize: 11 }}>· {s.kind}</span></strong>
                  {s.status === "reviewed" ? <span className="badge completed">Graded {s.grade}</span> : <span className="badge partial">Submitted</span>}
                </div>
                {s.feedback && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{s.feedback}</p>}
              </div>
            ))}
          </Panel>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Team">
            {project.members.map((m) => (
              <div key={m.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span>{m.name}</span><span className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{m.role}</span>
              </div>
            ))}
          </Panel>
          <SubmitWork projectId={project.id} onDone={load} />
        </div>
      </div>
    </>
  );
}

function SubmitWork({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("Document");
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { const r = await uploadFile(f); setFile({ url: r.url, name: r.name }); } finally { setBusy(false); }
  }
  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await submitProjectWork(projectId, { title, kind, fileUrl: file?.url, fileName: file?.name });
      setTitle(""); setFile(null); onDone();
    } finally { setBusy(false); }
  }

  return (
    <Panel title="Submit work">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 8, boxSizing: "border-box" }} />
      <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 8 }}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
      <input ref={fileRef} type="file" onChange={pick} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <button onClick={() => fileRef.current?.click()} disabled={busy}>Attach file</button>
        {file && <span className="muted" style={{ fontSize: 12 }}>📎 {file.name}</span>}
      </div>
      <button className="primary" onClick={submit} disabled={busy || !title.trim()} style={{ width: "100%" }}>{busy ? "Working…" : "Submit"}</button>
      {file && <p className="muted" style={{ fontSize: 11, marginTop: 6 }}><a href={fileUrl(file.url)} target="_blank" rel="noopener noreferrer">preview attachment</a></p>}
    </Panel>
  );
}

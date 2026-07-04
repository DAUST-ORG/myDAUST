"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { Roadmap } from "@/components/Roadmap";
import {
  type ProjectDetail,
  addProjectMember,
  advanceProjectPhase,
  fileUrl,
  getProjectDetail,
  gradeProjectSubmission,
  removeProjectMember,
  setProjectAdvisor,
} from "@/lib/api";
import { type ProjectPass, getProjectGlobalTasks, toggleGlobalTask } from "@/lib/api-innovation";

const TABS = [
  ["overview", "Overview"],
  ["passes", "Global passes"],
  ["submissions", "Submissions"],
  ["team", "Team"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(() => {
    getProjectDetail(id).then(setP).catch(() => {});
  }, [id]);
  useEffect(() => load(), [load]);

  if (!p) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow"><Link href="/innovation/projects">← Projects</Link></p>
      <h1 className="page-title">{p.name}</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        {p.advisor ? `Advisor ${p.advisor}` : "Unadvised"} · {p.members.map((m) => m.name).join(", ") || "no members"}
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 15, marginBottom: 14 }}>Roadmap</p>
        <Roadmap phases={p.roadmap} />
      </div>

      {/* Tabs (design: admin-detail.jsx pill tabs) */}
      <div
        style={{
          display: "flex",
          gap: 6,
          background: "var(--gray-50)",
          padding: 5,
          borderRadius: 999,
          width: "fit-content",
          border: "1px solid var(--divider)",
          marginBottom: 16,
        }}
      >
        {TABS.map(([tid, label]) => {
          const active = tab === tid;
          return (
            <button
              key={tid}
              onClick={() => setTab(tid)}
              style={{
                padding: "8px 18px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 13,
                background: active ? "var(--surface, #fff)" : "transparent",
                color: active ? "var(--daust-navy)" : "var(--fg2)",
                boxShadow: active ? "var(--shadow-sm)" : "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab project={p} onChanged={load} />}
      {tab === "passes" && <GlobalPassesTab projectId={p.id} />}
      {tab === "submissions" && (
        <Panel title="Submissions" pad="4px 20px 12px">
          {p.submissions.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>No submissions.</p>}
          {p.submissions.map((s, i) => (
            <SubmissionRow key={s.id} s={s} last={i === p.submissions.length - 1} onGraded={load} />
          ))}
        </Panel>
      )}
      {tab === "team" && <TeamPanel project={p} onChanged={load} />}
    </>
  );
}

function OverviewTab({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  return (
    <Panel title="About this project">
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--fg2)" }}>
        {project.description || "No description yet."}
      </p>
      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Advisor</div>
          <div style={{ fontWeight: 600 }}>{project.advisor || "Unadvised"}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Current phase</div>
          <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{project.phase}</div>
        </div>
        {project.grade && (
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Grade</div>
            <div style={{ fontWeight: 600 }}>{project.grade}</div>
          </div>
        )}
        <span style={{ flex: 1 }} />
        {project.phase !== "final" && (
          <button className="primary" onClick={() => advanceProjectPhase(project.id).then(onChanged)}>
            Advance phase →
          </button>
        )}
      </div>
    </Panel>
  );
}

function GlobalPassesTab({ projectId }: { projectId: string }) {
  const [passes, setPasses] = useState<ProjectPass[] | null>(null);

  const load = useCallback(() => {
    getProjectGlobalTasks(projectId).then(setPasses).catch(() => {});
  }, [projectId]);
  useEffect(() => load(), [load]);

  if (!passes) return <p className="muted">Loading…</p>;

  return (
    <Panel title="Global passes" pad="4px 20px 12px">
      {passes.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>No global tasks defined.</p>}
      {passes.map((t, i) => (
        <div
          key={t.taskId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            borderBottom: i < passes.length - 1 ? "1px solid var(--divider)" : "none",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, textDecoration: t.done ? "line-through" : "none", color: t.done ? "var(--fg3)" : "var(--fg1)" }}>
              {t.title}
            </div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {t.kind}{t.dueDate ? ` · due ${new Date(t.dueDate).toLocaleDateString()}` : ""}
            </div>
          </div>
          {t.done ? <span className="badge completed">Done</span> : <span className="badge partial">Pending</span>}
          <button onClick={() => toggleGlobalTask(t.taskId, projectId).then(load)} style={{ fontSize: 12 }}>
            {t.done ? "Mark pending" : "Mark done"}
          </button>
        </div>
      ))}
    </Panel>
  );
}

function TeamPanel({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [advisor, setAdvisor] = useState(project.advisor ?? "");
  const [note, setNote] = useState<string | null>(null);

  async function add() {
    if (!email.trim()) return;
    setNote(null);
    try {
      const res = await addProjectMember(project.id, email.trim());
      setNote(`Added ${res.name}.`);
      setEmail("");
      onChanged();
    } catch (e) {
      setNote((e as Error).message.includes("404") ? "No user with that email." : (e as Error).message);
    }
  }
  async function saveAdvisor() {
    await setProjectAdvisor(project.id, advisor);
    setNote("Advisor updated.");
    onChanged();
  }

  return (
    <Panel title="Team & advisor" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {project.members.map((m) => (
          <span key={m.personId} className="badge pending" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {m.name} · {m.role}
            <button onClick={() => removeProjectMember(project.id, m.personId).then(onChanged)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontWeight: 700 }}>×</button>
          </span>
        ))}
        {project.members.length === 0 && <span className="muted">No members yet.</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student email…" style={{ width: 220 }} />
        <button onClick={add} style={{ fontSize: 12 }}>Add member</button>
        <span style={{ width: 12 }} />
        <input value={advisor} onChange={(e) => setAdvisor(e.target.value)} placeholder="Advisor name" style={{ width: 180 }} />
        <button onClick={saveAdvisor} style={{ fontSize: 12 }}>Set advisor</button>
        {note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
      </div>
    </Panel>
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

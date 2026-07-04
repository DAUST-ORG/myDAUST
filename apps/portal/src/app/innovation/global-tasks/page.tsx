"use client";

import { useCallback, useEffect, useState } from "react";
import { type AdminGlobalTask, createGlobalTask, getGlobalTasks, toggleGlobalTask } from "@/lib/api-innovation";

const KINDS = ["Document", "Video", "Demo", "Review", "Poster", "Event", "Handover"];

export default function GlobalTasksPage() {
  const [tasks, setTasks] = useState<AdminGlobalTask[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    getGlobalTasks().then(setTasks).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  if (!tasks) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow">Innovation Studio · Required of every project</p>
      <h1 className="page-title">Global Tasks &amp; Deadlines</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: 560 }}>
        These milestones are assigned automatically to all projects. Creating one backfills a pass for every existing team.
      </p>

      <CreateForm onCreated={load} />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={headerRow}>
          <div>Task</div>
          <div>Kind</div>
          <div>Deadline</div>
          <div>Completion</div>
        </div>
        {tasks.length === 0 && <p className="muted" style={{ padding: 20 }}>No global tasks yet.</p>}
        {tasks.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            last={i === tasks.length - 1}
            open={expanded === t.id}
            onToggleOpen={() => setExpanded(expanded === t.id ? null : t.id)}
            onChanged={load}
          />
        ))}
      </div>
    </>
  );
}

const headerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2.4fr 1fr 1.2fr 1.6fr",
  gap: 14,
  padding: "12px 22px",
  background: "var(--gray-50)",
  borderBottom: "1px solid var(--divider)",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--fg3)",
  letterSpacing: ".06em",
  textTransform: "uppercase",
};

function TaskRow({
  task,
  last,
  open,
  onToggleOpen,
  onChanged,
}: {
  task: AdminGlobalTask;
  last: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onChanged: () => void;
}) {
  const pct = task.total === 0 ? 0 : Math.round((task.done / task.total) * 100);
  const days = task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div style={{ borderBottom: last && !open ? "none" : "1px solid var(--divider)" }}>
      <div
        onClick={onToggleOpen}
        style={{
          display: "grid",
          gridTemplateColumns: "2.4fr 1fr 1.2fr 1.6fr",
          gap: 14,
          padding: "15px 22px",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--fg1)" }}>{task.title}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{open ? "Click to collapse" : "Click to see per-project status"}</div>
        </div>
        <div><span className="badge pending" style={{ fontSize: 11 }}>{task.kind}</span></div>
        <div>
          {task.dueDate ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(task.dueDate).toLocaleDateString()}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: days !== null && days < 0 ? "var(--fg3)" : days !== null && days <= 14 ? "var(--daust-orange)" : "var(--fg3)" }}>
                {days !== null && (days < 0 ? "Closed" : `${days}d left`)}
              </div>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>No deadline</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--gray-100)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct > 70 ? "#2e7d52" : pct > 35 ? "var(--daust-orange)" : "var(--daust-navy)" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg2)", width: 48 }}>{task.done}/{task.total}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "4px 22px 16px", background: "var(--gray-50)", borderTop: "1px solid var(--divider)" }}>
          {task.statuses.length === 0 && <p className="muted" style={{ fontSize: 13, padding: "10px 0" }}>No projects yet.</p>}
          {task.statuses.map((s, i) => (
            <div
              key={s.projectId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 0",
                borderBottom: i < task.statuses.length - 1 ? "1px solid var(--divider)" : "none",
              }}
            >
              <span style={{ flex: 1, fontSize: 13.5, color: "var(--fg1)" }}>{s.projectName}</span>
              {s.done ? <span className="badge completed">Done</span> : <span className="badge partial">Pending</span>}
              <button
                onClick={() => toggleGlobalTask(task.id, s.projectId).then(onChanged)}
                style={{ fontSize: 12 }}
              >
                {s.done ? "Mark pending" : "Mark done"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("Document");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createGlobalTask({ title: title.trim(), kind, dueDate: dueDate || undefined });
      setTitle("");
      setDueDate("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span className="eyebrow" style={{ margin: 0 }}>New global task</span>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ flex: 1, minWidth: 200 }} />
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => <option key={k}>{k}</option>)}
      </select>
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button className="primary" onClick={create} disabled={busy || !title.trim()}>
        {busy ? "Creating…" : "Create for all projects"}
      </button>
    </div>
  );
}

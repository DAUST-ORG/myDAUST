"use client";

import { useEffect, useRef, useState } from "react";
import {
  type MyAssignment,
  getMyAssignments,
  submitAssignment,
  uploadFile,
} from "@/lib/api";

const STATUS_BADGE: Record<string, string> = {
  assigned: "pending",
  submitted: "partial",
  graded: "completed",
};

function dueLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return { text: `Due ${date} · overdue`, overdue: true };
  if (days === 0) return { text: `Due ${date} · today`, overdue: false };
  return { text: `Due ${date} · ${days}d left`, overdue: false };
}

export default function AssignmentsPage() {
  const [rows, setRows] = useState<MyAssignment[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => getMyAssignments().then(setRows).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const pending = rows.filter((r) => r.status === "assigned");
  const submitted = rows.filter((r) => r.status === "submitted");
  const graded = rows.filter((r) => r.status === "graded");

  return (
    <>
      <p className="eyebrow">Coursework</p>
      <h1 className="page-title">Assignments</h1>

      <div className="row">
        <div className="kpi"><div className="label">To do</div><div className="value">{pending.length}</div><div className="trend">not submitted</div></div>
        <div className="kpi"><div className="label">Awaiting grade</div><div className="value">{submitted.length}</div><div className="trend">submitted</div></div>
        <div className="kpi"><div className="label">Graded</div><div className="value">{graded.length}</div><div className="trend">returned</div></div>
      </div>

      <Section title="To do" empty="Nothing due — you're caught up.">
        {pending.map((a) => (
          <Row key={a.assignmentId} a={a} open={openId === a.assignmentId} onToggle={() => setOpenId(openId === a.assignmentId ? null : a.assignmentId)} onSubmitted={() => { setOpenId(null); load(); }} />
        ))}
      </Section>

      <Section title="Awaiting grade" empty="No submissions awaiting a grade.">
        {submitted.map((a) => (
          <Row key={a.assignmentId} a={a} open={openId === a.assignmentId} onToggle={() => setOpenId(openId === a.assignmentId ? null : a.assignmentId)} onSubmitted={() => { setOpenId(null); load(); }} />
        ))}
      </Section>

      <Section title="Graded" empty="No graded work yet.">
        {graded.map((a) => (
          <Row key={a.assignmentId} a={a} open={false} onToggle={() => {}} onSubmitted={load} graded />
        ))}
      </Section>
    </>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="card">
      <p className="h1" style={{ fontSize: 16 }}>{title}</p>
      {has ? children : <p className="muted">{empty}</p>}
    </div>
  );
}

function Row({
  a,
  open,
  onToggle,
  onSubmitted,
  graded,
}: {
  a: MyAssignment;
  open: boolean;
  onToggle: () => void;
  onSubmitted: () => void;
  graded?: boolean;
}) {
  const due = dueLabel(a.dueDate);
  return (
    <div style={{ borderTop: "1px solid var(--divider)", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <strong>{a.courseCode}</strong> · {a.title}{" "}
          <span className="muted" style={{ fontSize: 12 }}>({a.type})</span>
          <div className="muted" style={{ fontSize: 12, color: due.overdue ? "var(--bad)" : undefined }}>{due.text}</div>
        </div>
        {graded ? (
          <span className="badge completed">{a.score}/{a.maxPoints}</span>
        ) : (
          <>
            <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
            <button onClick={onToggle}>{open ? "Close" : a.status === "submitted" ? "Resubmit" : "Submit"}</button>
          </>
        )}
      </div>
      {graded && a.feedback && (
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}><strong>Feedback:</strong> {a.feedback}</p>
      )}
      {open && <SubmitForm assignmentId={a.assignmentId} onDone={onSubmitted} />}
    </div>
  );
}

function SubmitForm({ assignmentId, onDone }: { assignmentId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await uploadFile(f);
      setFile({ url: res.url, name: res.name });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await submitAssignment(assignmentId, { text: text.trim() || undefined, fileUrl: file?.url, fileName: file?.name });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10, padding: 12, background: "var(--gray-50, #f7f8fa)", borderRadius: 8 }}>
      <textarea
        placeholder="Type your submission, or attach a file below…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{ width: "100%", resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" onChange={pickFile} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}>Attach file</button>
        {file && <span className="muted" style={{ fontSize: 13 }}>📎 {file.name}</span>}
        <span className="spacer" style={{ flex: 1 }} />
        {err && <span className="muted" style={{ color: "var(--bad)" }}>{err}</span>}
        <button className="primary" onClick={submit} disabled={busy || (!text.trim() && !file)}>
          {busy ? "Working…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

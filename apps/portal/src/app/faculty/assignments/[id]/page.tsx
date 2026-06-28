"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type SectionAssignments,
  createAssignment,
  getSectionAssignments,
} from "@/lib/api";

const TYPES = ["homework", "quiz", "exam", "project"];

export default function FacultyAssignmentsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SectionAssignments | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    getSectionAssignments(id).then(setData).catch(() => {});
  }, [id]);
  useEffect(() => load(), [load]);

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="eyebrow"><Link href={`/faculty/classes/${id}`}>← Class</Link></p>
      <h1 className="page-title">Assignments</h1>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <p className="h1" style={{ fontSize: 16, flex: 1 }}>{data.assignments.length} assignment(s) · {data.enrolled} enrolled</p>
          <button className="primary" onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New assignment"}</button>
        </div>

        {creating && <CreateForm sectionId={id} onDone={() => { setCreating(false); load(); }} />}

        {data.assignments.length === 0 ? (
          <p className="muted">No assignments yet.</p>
        ) : (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Title</th><th>Type</th><th>Due</th><th>Max</th><th>Weight</th><th>Submitted</th><th>Graded</th><th /></tr></thead>
            <tbody>
              {data.assignments.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.title}</strong></td>
                  <td style={{ textTransform: "capitalize" }}>{a.type}</td>
                  <td>{new Date(a.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                  <td>{a.maxPoints}</td>
                  <td>{a.weight}%</td>
                  <td>{a.submitted}/{data.enrolled}</td>
                  <td>{a.graded}/{a.submitted}</td>
                  <td><Link href={`/faculty/submissions/${a.id}`}>Grade →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function CreateForm({ sectionId, onDone }: { sectionId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("homework");
  const [maxPoints, setMaxPoints] = useState(100);
  const [weight, setWeight] = useState(10);
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await createAssignment(sectionId, { title, type, maxPoints, weight, dueDate: `${dueDate}T23:59:00.000Z` });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 12, background: "var(--gray-50, #f7f8fa)", borderRadius: 8, display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr auto", alignItems: "end" }}>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assignment title" /></Field>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Max pts"><input type="number" value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value))} /></Field>
      <Field label="Weight %"><input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></Field>
      <Field label="Due date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      <button className="primary" onClick={save} disabled={busy || !title || !dueDate}>{busy ? "…" : "Create"}</button>
      {err && <span className="muted" style={{ gridColumn: "1 / -1", color: "var(--bad)" }}>{err}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="muted" style={{ fontSize: 11, display: "block", marginBottom: 2 }}>{label}</span>
      {children}
    </label>
  );
}

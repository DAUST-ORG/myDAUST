"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type Gradebook, getGradebook, submitGrades } from "@/lib/api";

const GRADES = ["", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];

export default function GradebookPage() {
  const { id } = useParams<{ id: string }>();
  const [gb, setGb] = useState<Gradebook | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getGradebook(id).then((g) => {
      setGb(g);
      setDraft(Object.fromEntries(g.students.map((s) => [s.enrollmentId, s.grade ?? ""])));
    }).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, [id]);
  useEffect(load, [load]);

  if (!gb) return <p className="muted">Loading…</p>;

  function exportCsv() {
    if (!gb) return;
    const header = "studentNo,name,grade,status";
    const lines = gb.students.map((s) =>
      [s.studentNo, s.name, draft[s.enrollmentId] ?? s.grade ?? "", s.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const section = `${gb.course.split(" — ")[0] ?? gb.course}-${gb.sectionCode}`.replace(/\s+/g, "");
    a.download = `${section}-grades.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function save(finalize: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const grades = Object.entries(draft).map(([enrollmentId, grade]) => ({
        enrollmentId,
        grade: grade || null,
      }));
      await submitGrades(id, grades, finalize);
      setMsg({ kind: "ok", text: finalize ? "Final grades submitted." : "Draft saved." });
      load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="eyebrow"><Link href={`/faculty/classes/${id}`}>← Class</Link></p>
      <h1 className="page-title">Gradebook — {gb.course} · Sec {gb.sectionCode}</h1>
      {msg && <p className="card" style={{ color: msg.kind === "ok" ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>}

      <div className="card">
        <table>
          <thead><tr><th>Student #</th><th>Name</th><th>Final grade</th><th>Status</th></tr></thead>
          <tbody>
            {gb.students.map((s) => (
              <tr key={s.enrollmentId}>
                <td>{s.studentNo}</td>
                <td>{s.name}</td>
                <td>
                  <select value={draft[s.enrollmentId] ?? ""} onChange={(e) => setDraft({ ...draft, [s.enrollmentId]: e.target.value })}>
                    {GRADES.map((g) => <option key={g} value={g}>{g || "—"}</option>)}
                  </select>
                </td>
                <td><span className={`badge ${s.status}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {gb.students.length === 0 && <p className="muted">No students enrolled.</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button disabled={busy} onClick={() => save(false)}>Save draft</button>
          <button className="primary" disabled={busy} onClick={() => save(true)}>Submit final grades</button>
          <button onClick={exportCsv} style={{ marginLeft: "auto" }}>Export CSV</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Submitting marks graded students <strong>completed</strong> — it flows to their transcript &amp; GPA.
        </p>
      </div>
    </>
  );
}

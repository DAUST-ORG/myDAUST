"use client";

import { useCallback, useEffect, useState } from "react";
import { type ConductCase, advanceConduct, createConductCase, getConductCases } from "@/lib/api";

const STAGES = ["intake", "investigation", "mediation", "hearing", "resolved"];
const SEV_BADGE: Record<string, string> = { low: "pending", med: "partial", high: "overdue" };

export default function ConductPage() {
  const [cases, setCases] = useState<ConductCase[]>([]);
  const [form, setForm] = useState({ subject: "", type: "", severity: "med" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    getConductCases().then(setCases).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function add() {
    if (!form.subject || !form.type) return;
    await createConductCase(form);
    setForm({ subject: "", type: "", severity: "med" });
    setAdding(false);
    load();
  }
  function nextStage(stage: string) {
    const i = STAGES.indexOf(stage);
    return i < STAGES.length - 1 ? STAGES[i + 1] : null;
  }

  return (
    <>
      <p className="eyebrow">Community standards</p>
      <h1 className="page-title">Conduct & Disputes</h1>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <p className="h1" style={{ fontSize: 16, flex: 1 }}>{cases.filter((c) => c.stage !== "resolved").length} open case(s)</p>
          <button className="primary" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "New case"}</button>
        </div>
        {adding && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr auto", gap: 10, marginBottom: 12, alignItems: "end" }}>
            <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Subject</span><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
            <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Type</span><input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. Residence noise" /></label>
            <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Severity</span><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">low</option><option value="med">med</option><option value="high">high</option></select></label>
            <button className="primary" onClick={add}>Open case</button>
          </div>
        )}
        <table>
          <thead><tr><th>Case</th><th>Type</th><th>Stage</th><th>Severity</th><th>SLA</th><th /></tr></thead>
          <tbody>
            {cases.map((c) => {
              const next = nextStage(c.stage);
              return (
                <tr key={c.id}>
                  <td><strong>{c.subject}</strong><br /><span className="muted" style={{ fontSize: 11 }}>{c.officer ?? "Unassigned"}</span></td>
                  <td>{c.type}</td>
                  <td><span className="badge pending" style={{ textTransform: "capitalize" }}>{c.stage}</span></td>
                  <td><span className={`badge ${SEV_BADGE[c.severity]}`}>{c.severity}</span></td>
                  <td>{c.stage === "resolved" ? <span className="muted">closed</span> : c.overdue ? <span className="badge overdue">overdue</span> : c.slaDueAt ? new Date(c.slaDueAt).toLocaleDateString() : "—"}</td>
                  <td>{next && <button onClick={() => advanceConduct(c.id, next).then(load)} style={{ fontSize: 12 }}>→ {next}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

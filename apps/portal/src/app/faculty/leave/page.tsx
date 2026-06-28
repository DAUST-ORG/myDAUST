"use client";

import { useCallback, useEffect, useState } from "react";
import { type LeaveRequest, getMyLeave, requestLeave } from "@/lib/api";

const TYPES = ["Annual", "Sick", "Personal", "Conference"];
const BADGE: Record<string, string> = { pending: "pending", approved: "completed", rejected: "overdue" };

export default function LeavePage() {
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [form, setForm] = useState({ type: "Annual", startDate: "", endDate: "", reason: "" });

  const load = useCallback(() => {
    getMyLeave().then(setItems).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function submit() {
    if (!form.startDate || !form.endDate) return;
    await requestLeave(form);
    setForm({ type: "Annual", startDate: "", endDate: "", reason: "" });
    load();
  }

  return (
    <>
      <p className="eyebrow">Time off</p>
      <h1 className="page-title">Leave & Absence</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 15 }}>Request leave</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end", marginTop: 8 }}>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>From</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>To</span><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Reason</span><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          <button className="primary" onClick={submit}>Submit</button>
        </div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 15 }}>My requests</p>
        <table>
          <thead><tr><th>Type</th><th>Dates</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td>{l.type}</td>
                <td>{new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}</td>
                <td className="muted">{l.reason ?? "—"}</td>
                <td><span className={`badge ${BADGE[l.status]}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">No leave requests yet.</p>}
      </div>
    </>
  );
}

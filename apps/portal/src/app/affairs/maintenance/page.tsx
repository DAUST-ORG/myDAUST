"use client";

import { useCallback, useEffect, useState } from "react";
import { type Hall, getHalls } from "@/lib/api";
import { type MaintenanceTicket, createMaintenanceTicket, getMaintenanceTickets, resolveMaintenanceTicket } from "@/lib/api-affairs";

const SEV_BADGE: Record<string, string> = {
  low: "completed",
  med: "pending",
  high: "overdue",
};
const SEV_LABEL: Record<string, string> = { low: "Low", med: "Medium", high: "High" };

function age(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const EMPTY_FORM = { hallId: "", room: "", kind: "", note: "", severity: "low" };

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getMaintenanceTickets().then(setTickets).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    getHalls().then((h) => {
      setHalls(h);
      const first = h[0];
      if (first) setForm((f) => (f.hallId ? f : { ...f, hallId: first.id }));
    }).catch(() => {});
  }, [load]);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hallId || !form.kind) {
      setError("Hall and issue type are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMaintenanceTicket({
        hallId: form.hallId,
        room: form.room || undefined,
        kind: form.kind,
        note: form.note || undefined,
        severity: form.severity,
      });
      setForm((f) => ({ ...EMPTY_FORM, hallId: f.hallId }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: string) {
    setBusy(id);
    try {
      await resolveMaintenanceTicket(id);
      load();
    } finally {
      setBusy(null);
    }
  }

  const open = tickets.filter((t) => t.status === "open");
  const resolved = tickets.filter((t) => t.status === "resolved");

  return (
    <>
      <p className="eyebrow">Residence</p>
      <h1 className="page-title">Maintenance</h1>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Report an issue</p>
        <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select value={form.hallId} onChange={set("hallId")} required>
            {halls.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input value={form.room} onChange={set("room")} placeholder="Room (opt.)" style={{ width: 100 }} />
          <input value={form.kind} onChange={set("kind")} placeholder="Issue (e.g. Plumbing leak)" style={{ minWidth: 180 }} required />
          <input value={form.note} onChange={set("note")} placeholder="Note (opt.)" style={{ minWidth: 200 }} />
          <select value={form.severity} onChange={set("severity")}>
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
          <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Open ticket"}</button>
        </form>
        {error && <p style={{ color: "#b02a37", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Open tickets ({open.length})</p>
        {open.length === 0 ? <p className="muted">No open tickets. A quiet day for facilities.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Hall</th><th>Room</th><th>Issue</th><th>Severity</th><th>Age</th><th></th></tr></thead>
              <tbody>
                {open.map((t) => (
                  <tr key={t.id}>
                    <td>{t.hall}</td>
                    <td>{t.room ?? "—"}</td>
                    <td>
                      {t.kind}
                      {t.note && <><br /><span className="muted" style={{ fontSize: 12 }}>{t.note}</span></>}
                    </td>
                    <td><span className={`badge ${SEV_BADGE[t.severity] ?? "pending"}`}>{SEV_LABEL[t.severity] ?? t.severity}</span></td>
                    <td className="muted">{age(t.openedAt)}</td>
                    <td>
                      <button onClick={() => resolve(t.id)} disabled={busy === t.id} style={{ fontSize: 12 }}>
                        {busy === t.id ? "…" : "Resolve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <div className="card">
          <p className="h1" style={{ fontSize: 16 }}>Resolved ({resolved.length})</p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Hall</th><th>Room</th><th>Issue</th><th>Severity</th><th>Opened</th></tr></thead>
              <tbody>
                {resolved.map((t) => (
                  <tr key={t.id} style={{ opacity: 0.6 }}>
                    <td>{t.hall}</td>
                    <td>{t.room ?? "—"}</td>
                    <td>{t.kind}</td>
                    <td><span className={`badge ${SEV_BADGE[t.severity] ?? "pending"}`}>{SEV_LABEL[t.severity] ?? t.severity}</span></td>
                    <td className="muted">{new Date(t.openedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { type BoardEvent, createBoardEvent, getEventsBoard } from "@/lib/api-affairs";

const STATUS_BADGE: Record<string, string> = {
  upcoming: "completed",
  planning: "pending",
  past: "cancelled",
};

const CATEGORIES = ["Campus", "Academics", "Career", "Sports", "Arts"];

const EMPTY_FORM = { title: "", category: "Campus", location: "", organizer: "", attendees: "", budgetXof: "", startsAt: "", status: "upcoming" };

export default function EventsBoardPage() {
  const [events, setEvents] = useState<BoardEvent[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getEventsBoard().then(setEvents).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.startsAt) {
      setError("Title and date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createBoardEvent({
        title: form.title,
        category: form.category,
        location: form.location,
        organizer: form.organizer,
        attendees: form.attendees ? Number(form.attendees) : undefined,
        budgetXof: form.budgetXof ? Number(form.budgetXof) : undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        status: form.status,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="eyebrow">Community</p>
      <h1 className="page-title">Events & Programs</h1>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>New event</p>
        <form onSubmit={submit} className="row" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input value={form.title} onChange={set("title")} placeholder="Event title" style={{ minWidth: 200 }} required />
          <select value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.location} onChange={set("location")} placeholder="Venue" style={{ width: 140 }} />
          <input value={form.organizer} onChange={set("organizer")} placeholder="Organizer" style={{ width: 150 }} />
          <input value={form.attendees} onChange={set("attendees")} type="number" min={0} placeholder="Attendees" style={{ width: 100 }} />
          <input value={form.budgetXof} onChange={set("budgetXof")} type="number" min={0} placeholder="Budget XOF" style={{ width: 120 }} />
          <input value={form.startsAt} onChange={set("startsAt")} type="datetime-local" required />
          <select value={form.status} onChange={set("status")}>
            <option value="planning">Planning</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
          <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
        </form>
        {error && <p style={{ color: "#b02a37", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Program board ({events.length})</p>
        {events.length === 0 ? <p className="muted">No events yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>Event</th><th>Date</th><th>Venue</th><th>Organizer</th><th>Attendees</th><th>Budget</th><th>Status</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ opacity: e.status === "past" ? 0.6 : 1 }}>
                    <td>
                      {e.title}
                      <br />
                      <span className="muted" style={{ fontSize: 12 }}>{e.category}</span>
                    </td>
                    <td>{new Date(e.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td>{e.location ?? "—"}</td>
                    <td>{e.organizer ?? "—"}</td>
                    <td>{e.attendees != null ? e.attendees.toLocaleString() : "—"}</td>
                    <td>{e.budgetXof != null ? `${e.budgetXof.toLocaleString()} XOF` : "—"}</td>
                    <td><span className={`badge ${STATUS_BADGE[e.status] ?? "pending"}`}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

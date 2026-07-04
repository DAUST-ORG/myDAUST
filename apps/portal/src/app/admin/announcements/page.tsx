"use client";

import { useCallback, useEffect, useState } from "react";
import { type Announcement, createAnnouncement, getAnnouncements } from "@/lib/api";

const AUDIENCES = ["all", "student", "faculty", "staff"];

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: "", body: "", category: "General", audience: "all" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getAnnouncements().then(setItems).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function post() {
    if (!form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await createAnnouncement(form);
      setForm({ title: "", body: "", category: "General", audience: "all" });
      setNote("Announcement published.");
      load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="eyebrow">Engagement</p>
      <h1 className="page-title">Announcements</h1>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <p className="h1" style={{ fontSize: 16 }}>New announcement</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Message…" rows={4} style={{ resize: "vertical" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Category</span>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: "100%" }} />
              </label>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Audience</span>
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} style={{ width: "100%" }}>
                  {AUDIENCES.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
            </div>
            {note && <span className="muted" style={{ fontSize: 13 }}>{note}</span>}
            <button className="primary" onClick={post} disabled={busy || !form.title.trim() || !form.body.trim()}>
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>

        <div className="card" style={{ flex: 1.4, minWidth: 360 }}>
          <p className="h1" style={{ fontSize: 16 }}>Published ({items.length})</p>
          {items.map((a) => (
            <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", letterSpacing: ".08em", textTransform: "uppercase" }}>{a.category}</span>
                <span className="badge pending" style={{ fontSize: 10 }}>{a.audience}</span>
                <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{a.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{a.body}</div>
              {a.author && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>— {a.author}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

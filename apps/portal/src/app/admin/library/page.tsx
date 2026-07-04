"use client";

import { useCallback, useEffect, useState } from "react";
import { getLibrary, type LibraryResource } from "@/lib/api";
import { addLibraryItem, toggleLibraryItem } from "@/lib/api-campus";

const KINDS = ["book", "journal", "ebook", "database"];
const EMPTY_FORM = { title: "", author: "", kind: "book", subject: "", callNumber: "" };

export default function AdminLibraryPage() {
  const [items, setItems] = useState<LibraryResource[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback((query?: string) => {
    getLibrary(query).then(setItems).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q.trim() || undefined), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  async function add() {
    if (!form.title.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await addLibraryItem({
        title: form.title.trim(),
        author: form.author.trim() || undefined,
        kind: form.kind,
        subject: form.subject.trim() || undefined,
        callNumber: form.callNumber.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setNote("Resource added to the catalog.");
      load(q.trim() || undefined);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string) {
    setTogglingId(id);
    try {
      const updated = await toggleLibraryItem(id);
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1 className="page-title">Library</h1>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <p className="h1" style={{ fontSize: 16 }}>Add a resource</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
            <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Author (optional)" />
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Kind</span>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={{ width: "100%" }}>
                  {KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
              </label>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 11, display: "block" }}>Call number</span>
                <input value={form.callNumber} onChange={(e) => setForm({ ...form, callNumber: e.target.value })} style={{ width: "100%" }} placeholder="e.g. QA76.73" />
              </label>
            </div>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject (optional)" />
            {note && <span className="muted" style={{ fontSize: 13 }}>{note}</span>}
            <button className="primary" onClick={add} disabled={busy || !form.title.trim()}>
              {busy ? "Adding…" : "Add to catalog"}
            </button>
          </div>
        </div>

        <div className="card" style={{ flex: 2.2, minWidth: 420 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <p className="h1" style={{ fontSize: 16, margin: 0 }}>Catalog ({items.length})</p>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, author, subject…"
              style={{ marginLeft: "auto", width: 260 }}
            />
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--divider)" }}>
                  {["Title", "Author", "Kind", "Subject", "Call no.", "Status", ""].map((h) => (
                    <th key={h} className="muted" style={{ padding: "8px 10px 8px 0", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                    <td style={{ padding: "10px 10px 10px 0", fontWeight: 600 }}>{it.title}</td>
                    <td className="muted" style={{ padding: "10px 10px 10px 0" }}>{it.author ?? "—"}</td>
                    <td style={{ padding: "10px 10px 10px 0" }}>
                      <span className="badge pending" style={{ fontSize: 10 }}>{it.kind}</span>
                    </td>
                    <td className="muted" style={{ padding: "10px 10px 10px 0" }}>{it.subject ?? "—"}</td>
                    <td className="muted" style={{ padding: "10px 10px 10px 0" }}>{it.callNumber ?? "—"}</td>
                    <td style={{ padding: "10px 10px 10px 0" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: it.available ? "#1a7f4b" : "var(--daust-orange)" }}>
                        {it.available ? "Available" : "Checked out"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>
                      <button onClick={() => toggle(it.id)} disabled={togglingId === it.id} style={{ fontSize: 12 }}>
                        {togglingId === it.id ? "…" : it.available ? "Mark out" : "Mark in"}
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: "18px 0", textAlign: "center" }}>
                      No resources match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

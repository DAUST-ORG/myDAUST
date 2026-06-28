"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { type LibraryResource, getLibrary } from "@/lib/api";

const KIND_BADGE: Record<string, string> = { book: "enrolled", journal: "partial", ebook: "completed", database: "pending" };

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryResource[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => getLibrary(q).then(setItems).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <p className="eyebrow">DAUST Library</p>
      <h1 className="page-title">Library</h1>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="card" style={{ flex: 2, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
            <Search size={18} color="var(--daust-steel)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog by title, author, subject…" style={{ flex: 1, border: "none", outline: "none", fontSize: 14 }} />
          </div>
        </div>
        <div className="kpi" style={{ flex: 1 }}>
          <div className="label">Hours today</div>
          <div className="value" style={{ fontSize: 20 }}>08:00–24:00</div>
          <div className="trend">Extended during finals</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Title</th><th>Author</th><th>Subject</th><th>Type</th><th>Call no.</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.title}</strong></td>
                <td>{r.author ?? "—"}</td>
                <td>{r.subject ?? "—"}</td>
                <td><span className={`badge ${KIND_BADGE[r.kind] ?? "pending"}`}>{r.kind}</span></td>
                <td>{r.callNumber ?? "—"}</td>
                <td>{r.available ? <span className="badge completed">Available</span> : <span className="badge overdue">On loan</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">No matching resources.</p>}
      </div>
    </>
  );
}

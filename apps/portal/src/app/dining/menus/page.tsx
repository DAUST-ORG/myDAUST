"use client";

import { useCallback, useEffect, useState } from "react";
import { type MenuItem, fileUrl, getAdminMenu, toggleMenuItem } from "@/lib/api";
import { createMenuItemWithImage, setMenuItemImage } from "@/lib/api-dining";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;
const CATEGORIES = ["weekend", "breakfast", "lunch", "dinner"];

export default function MenusPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState({ name: "", description: "", category: "weekend", priceXof: 0, imageUrl: "" });

  const load = useCallback(() => {
    getAdminMenu().then(setItems).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function add() {
    if (!form.name) return;
    await createMenuItemWithImage({
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      priceXof: form.priceXof,
      imageUrl: form.imageUrl || undefined,
    });
    setForm({ name: "", description: "", category: "weekend", priceXof: 0, imageUrl: "" });
    load();
  }

  async function editImage(item: MenuItem) {
    const url = window.prompt("Image URL (upload path or https://…) — empty to remove", item.imageUrl ?? "");
    if (url === null) return;
    await setMenuItemImage(item.id, url.trim());
    load();
  }

  return (
    <>
      <p className="eyebrow">Catalog</p>
      <h1 className="page-title">Menus</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 15 }}>Add menu item</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end", marginTop: 8 }}>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Description</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Price (XOF)</span><input type="number" value={form.priceXof} onChange={(e) => setForm({ ...form, priceXof: Number(e.target.value) })} /></label>
          <label><span className="muted" style={{ fontSize: 11, display: "block" }}>Image URL</span><input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="/uploads/… or https://…" /></label>
          <button className="primary" onClick={add}>Add</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Status</th><th /></tr></thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(m.imageUrl)} alt={m.name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div>
                      <strong>{m.name}</strong>
                      {m.description && <div className="muted" style={{ fontSize: 12 }}>{m.description}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ textTransform: "capitalize" }}>{m.category}</td>
                <td>{xof(m.priceXof)}</td>
                <td>{m.available ? <span className="badge completed">Available</span> : <span className="badge overdue">Hidden</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => editImage(m)} style={{ fontSize: 12, marginRight: 6 }}>{m.imageUrl ? "Edit image" : "Set image"}</button>
                  <button onClick={() => toggleMenuItem(m.id).then(load)} style={{ fontSize: 12 }}>{m.available ? "Hide" : "Show"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">No menu items yet.</p>}
      </div>
    </>
  );
}

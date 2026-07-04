"use client";

import { useEffect, useState } from "react";
import { type MenuItem, fileUrl } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { getFacultyDiningMenu } from "@/lib/api-faculty";

export default function FacultyDiningPage() {
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getFacultyDiningMenu().then(setMenu).catch((e: Error) => setErr(e.message));
  }, []);

  if (err) return <p className="card" style={{ color: "var(--danger)" }}>{err}</p>;
  if (!menu) return <p className="muted">Loading…</p>;

  const categories = [...new Set(menu.map((m) => m.category))];

  return (
    <>
      <p className="eyebrow">Campus</p>
      <h1 className="page-title">Cafeteria Menu</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Today&apos;s cafeteria offering. Pay at the counter — faculty meal plans are not yet available.
      </p>

      {menu.length === 0 && <p className="muted">No menu items published yet.</p>}

      {categories.map((cat) => (
        <section key={cat} style={{ marginBottom: 26 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, color: "var(--fg1)", margin: "0 0 12px", textTransform: "capitalize" }}>
            {cat}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {menu.filter((m) => m.category === cat).map((m) => (
              <div key={m.id} className="card" style={{ padding: 0, overflow: "hidden", opacity: m.available ? 1 : 0.55 }}>
                {m.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(m.imageUrl)} alt={m.name} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                )}
                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--fg1)" }}>{m.name}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--daust-navy)", whiteSpace: "nowrap" }}>
                      {formatXof(m.priceXof)}
                    </div>
                  </div>
                  {m.description && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0", lineHeight: 1.45 }}>{m.description}</p>}
                  {!m.available && <span className="badge pending" style={{ marginTop: 8, display: "inline-block" }}>Sold out</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

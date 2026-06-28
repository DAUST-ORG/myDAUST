"use client";

import { useEffect, useState } from "react";
import { type Announcement, getAnnouncements } from "@/lib/api";

export function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    getAnnouncements().then(setItems).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Campus</p>
      <h1 className="page-title">Announcements</h1>
      <div style={{ marginTop: 18 }}>
        {items.map((a) => (
          <div className="card" key={a.id}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", letterSpacing: ".08em", textTransform: "uppercase" }}>
              {a.category}
            </div>
            <p className="h1" style={{ fontSize: 17 }}>{a.title}</p>
            <p className="muted" style={{ margin: 0 }}>{a.body}</p>
            {a.author && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>— {a.author}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

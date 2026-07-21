"use client";

import { useEffect, useState } from "react";
import { type Announcement, getAnnouncements } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/ui";

const TAG_COLORS: Record<string, string> = {
  registrar: "#1d4a82",
  bursar: "#a3291b",
  finance: "#a3291b",
  life: "#ed8425",
  it: "#1f6b42",
  careers: "#153b6a",
};

const tagColor = (category: string) => TAG_COLORS[category.toLowerCase()] ?? "#153b6a";

/** "2 days ago" style stamp; falls back to a date once past a week. */
function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return new Date(iso).toLocaleDateString("fr-SN", { day: "numeric", month: "short", year: "numeric" });
}

export default function StudentAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAnnouncements()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <>
      <PageHeader title="Announcements" subtitle="Campus-wide and program updates" />

      {loaded && items.length === 0 && <EmptyState title="No announcements yet" />}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((a) => (
          <div
            key={a.id}
            className="sis-card sis-lift"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(21,59,106,.08)",
                  color: tagColor(a.category),
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                {a.category}
              </span>
              <span className="muted" style={{ fontSize: 11.5 }}>{relative(a.createdAt)}</span>
            </div>
            <h3 style={{ margin: "10px 0 6px", fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>
              {a.title}
            </h3>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{a.body}</p>
            {a.author && <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>— {a.author}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

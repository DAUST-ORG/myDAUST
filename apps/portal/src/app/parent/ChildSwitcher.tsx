"use client";

import { type ChildSummary } from "@/lib/api";
import { Avatar } from "@/components/ui";

/**
 * Child selector shared by every parent screen. A guardian may watch several
 * students, so each page keeps the chosen child in one place rather than
 * re-deriving it. Hidden when there is only one child.
 */
export function ChildSwitcher({
  children,
  activeId,
  onSelect,
}: {
  children: ChildSummary[];
  activeId: string | null;
  onSelect: (studentId: string) => void;
}) {
  if (children.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
      {children.map((c) => {
        const on = c.studentId === activeId;
        return (
          <button
            key={c.studentId}
            onClick={() => onSelect(c.studentId)}
            className="sis-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px 8px 8px",
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
              border: `1px solid ${on ? "var(--daust-navy)" : "var(--border)"}`,
              background: on ? "var(--daust-navy)" : "var(--surface)",
              color: on ? "#fff" : "var(--fg2)",
            }}
          >
            <Avatar name={c.name} size={28} src={c.photoUrl} />
            <span style={{ textAlign: "left" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{c.name}</span>
              <span style={{ display: "block", fontSize: 11, opacity: on ? 0.75 : 0.6 }}>{c.program}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

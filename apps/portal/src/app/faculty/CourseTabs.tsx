"use client";

import type { TeachingSection } from "@/lib/api";

/** Course code / title split out of the `"CODE — Title"` string the API returns. */
export function courseCode(section: TeachingSection): string {
  return section.course.split(" — ")[0] ?? section.course;
}

export function courseTitle(section: TeachingSection): string {
  return section.course.split(" — ")[1] ?? section.course;
}

/**
 * Navy course pills shared by Grade Entry, Gradebook, Attendance and Materials.
 * Each screen keeps its own selection — switching here never leaks across views.
 */
export function CourseTabs({
  sections,
  value,
  onChange,
}: {
  sections: TeachingSection[];
  value: string;
  onChange: (sectionId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
      {sections.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className="sis-btn"
            style={{
              padding: "9px 16px",
              borderRadius: "var(--radius-pill)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              border: `1px solid ${on ? "var(--daust-navy)" : "var(--border)"}`,
              background: on ? "var(--daust-navy)" : "var(--surface)",
              color: on ? "#fff" : "var(--fg2)",
            }}
          >
            {courseCode(s)} · {s.sectionCode}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  type GradeRow,
  type MyEnrollment,
  getCurrentTerm,
  getMyEnrollments,
  getMyGrades,
} from "@/lib/api";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { COURSE_COLORS } from "@/lib/student-schedule";

function gradeTone(grade: string | null): { bg: string; fg: string } {
  const head = (grade ?? "").charAt(0).toUpperCase();
  if (head === "A") return { bg: "rgba(46,125,82,.12)", fg: "#1f6b42" };
  if (head === "B") return { bg: "rgba(29,74,130,.12)", fg: "#1d4a82" };
  if (head === "C") return { bg: "rgba(237,132,37,.14)", fg: "#a85f16" };
  return { bg: "var(--bg-subtle)", fg: "var(--fg3)" };
}

export default function CoursesPage() {
  const [mine, setMine] = useState<MyEnrollment[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [term, setTerm] = useState("");

  useEffect(() => {
    getMyEnrollments().then(setMine).catch(() => {});
    getMyGrades().then(setGrades).catch(() => {});
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  /* One row per course code, keeping the first (most recent) term it was taken in. */
  const previous = useMemo(() => {
    const seen = new Set<string>();
    const out: GradeRow[] = [];
    for (const g of grades) {
      if (seen.has(g.courseCode)) continue;
      seen.add(g.courseCode);
      out.push(g);
    }
    return out;
  }, [grades]);

  return (
    <>
      <PageHeader title="My Courses" subtitle="Current and past courses · open each for materials and grades" />

      <SectionTitle title="Current semester" sub={term || undefined} />
      {mine.length === 0 ? (
        <EmptyState title="No courses this term" note="Add sections from Registration." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {mine.map((c, i) => (
            <div
              key={c.enrollmentId}
              className="sis-card sis-lift"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${COURSE_COLORS[i % COURSE_COLORS.length]}`,
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-sm)",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--daust-navy)" }}>{c.courseCode}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{c.credits} credits</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{c.title}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                §{c.sectionCode} · {c.schedule} · {c.room ?? "Room TBA"}
              </div>
              <Link
                href={`/student/courses/${c.sectionId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  marginTop: 14,
                  padding: "7px 14px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--daust-navy)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <FolderOpen size={13} /> View materials
              </Link>
            </div>
          ))}
        </div>
      )}

      <SectionTitle title="Previous courses" sub="Materials remain available for courses you have taken." />
      {previous.length === 0 ? (
        <EmptyState title="No completed courses yet" />
      ) : (
        <Card pad={false}>
          {previous.map((g, i) => {
            const tone = gradeTone(g.grade);
            return (
              <div
                key={g.courseCode}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 18px",
                  borderBottom: i < previous.length - 1 ? "1px solid var(--divider)" : undefined,
                }}
              >
                <span style={{ width: 78, fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" }}>{g.courseCode}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{g.title}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{g.term}</span>
                <span
                  style={{
                    minWidth: 42,
                    textAlign: "center",
                    padding: "3px 10px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: 12,
                    fontWeight: 700,
                    background: tone.bg,
                    color: tone.fg,
                  }}
                >
                  {g.grade ?? "—"}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  type GradeRow,
  type MyEnrollment,
  type MyCourse,
  getCurrentTerm,
  getMyCourses,
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
  /* Only enrollments carry a sectionId, so this is what decides whether a past course
     is openable. Transcript-only rows (legacy imports) have no section and no materials. */
  const [pastCourses, setPastCourses] = useState<MyCourse[]>([]);

  useEffect(() => {
    getMyEnrollments().then(setMine).catch(() => {});
    getMyCourses().then((c) => setPastCourses(c.past)).catch(() => {});
    getMyGrades().then(setGrades).catch(() => {});
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  /* One row per course code, most recent term first. Two sources, because neither is
     complete on its own: the transcript is canonical and carries legacy courses that
     have no enrollment, while enrollments are the only place a sectionId exists — and a
     course only has materials if we can name its section. */
  const previous = useMemo(() => {
    const seen = new Set<string>();
    const out: GradeRow[] = [];
    for (const g of grades) {
      if (seen.has(g.courseCode)) continue;
      seen.add(g.courseCode);
      out.push(g);
    }
    for (const c of pastCourses) {
      if (seen.has(c.courseCode)) continue;
      seen.add(c.courseCode);
      out.push({
        courseCode: c.courseCode,
        title: c.title,
        term: c.term,
        grade: c.grade,
        credits: c.credits,
      } as GradeRow);
    }
    return out;
  }, [grades, pastCourses]);

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

      <SectionTitle title="Previous courses" sub="Courses you have taken. Those with a link still have materials posted." />
      {previous.length === 0 ? (
        <EmptyState title="No completed courses yet" />
      ) : (
        <Card pad={false}>
          {previous.map((g, i) => {
            const tone = gradeTone(g.grade);
            const openable = pastCourses.find((p) => p.courseCode === g.courseCode);
            const Row = openable ? Link : "div";
            const rowProps = openable
              ? { href: `/student/courses/${openable.sectionId}` }
              : {};
            return (
              <Row
                key={g.courseCode}
                {...(rowProps as { href: string })}
                style={{
                  color: "inherit",
                  textDecoration: "none",
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
              </Row>
            );
          })}
        </Card>
      )}
    </>
  );
}

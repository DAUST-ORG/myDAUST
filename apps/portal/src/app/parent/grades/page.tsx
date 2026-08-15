"use client";

import { useEffect, useState } from "react";
import { type ChildTranscript, getChildGrades } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ChildSwitcher } from "../ChildSwitcher";
import { useChildren } from "../useChildren";

/** Colour-codes a letter grade the way the design does: A green, B navy, C orange. */
function gradeTone(grade: string | null): string {
  if (!grade) return "var(--fg3)";
  const head = grade.charAt(0).toUpperCase();
  if (head === "A") return "var(--success-500)";
  if (head === "B") return "var(--daust-navy)";
  if (head === "C") return "var(--daust-orange)";
  return "var(--error-500)";
}

export default function ParentGrades() {
  const { children, active, activeId, select, error } = useChildren();
  const [data, setData] = useState<ChildTranscript | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setData(null);
    setLoadError(null);
    getChildGrades(activeId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (error)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0) {
    return <EmptyState title="No students linked to your account" />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Academic record"
        title={active ? `Grades — ${active.name}` : "Grades"}
        subtitle={active ? `${active.program} · academic record` : undefined}
        actions={
          data ? (
            <Badge tone="info">
              Cumulative GPA{" "}
              {data.totals.gpa === null ? "—" : data.totals.gpa.toFixed(2)}
            </Badge>
          ) : undefined
        }
      />

      <ChildSwitcher
        children={children}
        activeId={activeId}
        onSelect={select}
      />

      {loadError && (
        <p className="card" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      )}
      {!data && !loadError && <p className="muted">Loading transcript…</p>}

      {data && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: 11.5 }}>
              Credits earned
            </div>
            <div style={{ font: "800 22px var(--font-display)", marginTop: 5 }}>
              {data.totals.earnedCredits}
              {data.academicProgress.requiredCredits
                ? ` / ${data.academicProgress.requiredCredits}`
                : ""}
            </div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: 11.5 }}>
              Academic level
            </div>
            <div style={{ font: "800 22px var(--font-display)", marginTop: 5 }}>
              {data.academicProgress.level?.code ?? "—"}
            </div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {data.academicProgress.level?.name ?? "Earned-credit level"}
            </div>
          </div>
          <div className="card" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: 11.5 }}>
              In progress
            </div>
            <div style={{ font: "800 22px var(--font-display)", marginTop: 5 }}>
              {data.academicProgress.inProgressCredits}
            </div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              Not counted toward level
            </div>
          </div>
        </div>
      )}

      {data && data.inProgressCourses.length > 0 && (
        <Card
          title="Courses in progress"
          action={
            <Badge tone="info">
              {data.academicProgress.inProgressCredits} credits
            </Badge>
          }
        >
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Course</th>
                <th>Term</th>
                <th style={{ textAlign: "right" }}>Credits</th>
              </tr>
            </thead>
            <tbody>
              {data.inProgressCourses.map((course) => (
                <tr key={course.enrollmentId}>
                  <td style={{ fontWeight: 650 }}>{course.courseCode}</td>
                  <td>{course.title}</td>
                  <td className="muted">{course.term}</td>
                  <td style={{ textAlign: "right" }}>
                    <Badge tone="info">{course.credits} · In progress</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.semesters.length === 0 && (
        <EmptyState
          title="No completed courses yet"
          note="Grades appear here once a term's results are approved by the registrar."
        />
      )}

      {data?.semesters.map((semester) => (
        <div
          key={semester.termId ?? semester.label}
          style={{ marginBottom: 16 }}
        >
          <Card
            title={semester.label}
            action={
              <span className="muted" style={{ fontSize: 13 }}>
                Term GPA{" "}
                <strong style={{ color: "var(--fg1)" }}>
                  {semester.gpa === null ? "—" : semester.gpa.toFixed(2)}
                </strong>{" "}
                · {semester.earnedCredits} earned / {semester.attemptedCredits}{" "}
                attempted credits
              </span>
            }
          >
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course</th>
                  <th style={{ textAlign: "right" }}>Credits</th>
                  <th style={{ textAlign: "right" }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {semester.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontWeight: 600 }}>{entry.courseCode}</td>
                    <td>{entry.title}</td>
                    <td style={{ textAlign: "right" }}>{entry.credits}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        color: gradeTone(entry.grade),
                      }}
                    >
                      {entry.grade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}
    </>
  );
}

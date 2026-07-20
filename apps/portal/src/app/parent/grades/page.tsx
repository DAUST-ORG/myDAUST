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
    setData(null);
    setLoadError(null);
    getChildGrades(activeId).then(setData).catch((e: Error) => setLoadError(e.message));
  }, [activeId]);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!children) return <p className="muted">Loading…</p>;
  if (children.length === 0) {
    return <EmptyState title="No students linked to your account" />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Academic record"
        title="Grades"
        subtitle={active ? `${active.name} · ${active.program}` : undefined}
        actions={
          data ? <Badge tone="info">Cumulative GPA {data.cumulativeGpa.toFixed(2)}</Badge> : undefined
        }
      />

      <ChildSwitcher children={children} activeId={activeId} onSelect={select} />

      {loadError && <p className="card" style={{ color: "var(--danger)" }}>{loadError}</p>}
      {!data && !loadError && <p className="muted">Loading transcript…</p>}

      {data && data.terms.length === 0 && (
        <EmptyState
          title="No completed courses yet"
          note="Grades appear here once a term's results are approved by the registrar."
        />
      )}

      {data?.terms.map((t) => (
        <div key={t.term} style={{ marginBottom: 16 }}>
          <Card
            title={t.term}
            action={
              <span className="muted" style={{ fontSize: 13 }}>
                Term GPA <strong style={{ color: "var(--fg1)" }}>{t.gpa.toFixed(2)}</strong> · {t.credits} credits
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
                {t.courses.map((c) => (
                  <tr key={c.code}>
                    <td style={{ fontWeight: 600 }}>{c.code}</td>
                    <td>{c.title}</td>
                    <td style={{ textAlign: "right" }}>{c.credits}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: gradeTone(c.grade) }}>
                      {c.grade ?? "—"}
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

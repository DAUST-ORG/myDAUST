"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type EvaluationResults,
  type TeachingSection,
  getSectionEvaluations,
  getTeaching,
} from "@/lib/api";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { CourseTabs, courseTitle } from "../CourseTabs";

const WHY: Record<string, string> = {
  not_released: "Results are released by the director once a round closes.",
  too_few_responses:
    "Too few students responded for this to stay anonymous, so results stay hidden.",
  grades_not_approved:
    "End-of-term results unlock after the registrar approves this section's grades.",
};

export default function FacultyEvaluationsPage() {
  const [sections, setSections] = useState<TeachingSection[] | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [rounds, setRounds] = useState<EvaluationResults[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getTeaching()
      .then((list) => {
        setSections(list);
        setSectionId((cur) => cur || list[0]?.id || "");
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const load = useCallback(() => {
    if (!sectionId) return;
    setRounds(null);
    getSectionEvaluations(sectionId)
      .then(setRounds)
      .catch((e: Error) => setErr(e.message));
  }, [sectionId]);
  useEffect(load, [load]);

  const section = sections?.find((s) => s.id === sectionId);

  return (
    <>
      <PageHeader
        title="Course evaluations"
        subtitle="What your students said. Responses are anonymous and cannot be traced back."
      />
      {err && <Card><div role="alert" style={{ color: "var(--error-500)" }}>{err}</div></Card>}
      {sections?.length === 0 && (
        <EmptyState title="You are not teaching any sections" />
      )}
      {sections && sections.length > 0 && (
        <>
          <CourseTabs sections={sections} value={sectionId} onChange={setSectionId} />
          <p style={{ fontSize: 13, color: "var(--fg3)", marginBottom: 16 }}>
            {section ? courseTitle(section) : ""}
          </p>
          {rounds === null ? (
            <Card><div role="status" className="muted">Loading…</div></Card>
          ) : rounds.length === 0 ? (
            <EmptyState
              title="No evaluation rounds yet"
              note="Rounds are scheduled by the director, twice a term."
            />
          ) : (
            rounds.map((r) => (
              <Card
                key={r.windowId}
                title={r.kind === "midterm" ? "Mid-semester round" : "End of semester round"}
              >
                {r.visible ? (
                  <>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                      <Stat label="Responses" value={r.responseCount} />
                      <Stat label="Overall" value={r.overall ?? "—"} />
                      <Stat label="Clarity" value={r.clarity ?? "—"} />
                      <Stat label="Workload" value={r.workload ?? "—"} />
                    </div>
                    {r.comments.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {r.comments.map((c, i) => (
                          <p
                            key={i}
                            style={{
                              margin: 0,
                              fontSize: 13.5,
                              background: "var(--bg-subtle)",
                              borderRadius: 9,
                              padding: "10px 12px",
                            }}
                          >
                            {c}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                    {WHY[r.reason] ?? "Results are not available yet."}
                  </p>
                )}
              </Card>
            ))
          )}
        </>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type GradeRow,
  type MyProfile,
  type MySummary,
  getMyGrades,
  getMyProfile,
  getMySummary,
} from "@/lib/api";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";

interface TermBlock {
  term: string;
  rows: GradeRow[];
  credits: number;
  gpa: number | null;
}

/** A-range green, B-range navy, C-range amber, everything else neutral. */
function gradeTone(grade: string | null): { bg: string; fg: string } {
  const head = (grade ?? "").charAt(0).toUpperCase();
  if (head === "A") return { bg: "rgba(46,125,82,.12)", fg: "#1f6b42" };
  if (head === "B") return { bg: "rgba(29,74,130,.12)", fg: "#1d4a82" };
  if (head === "C") return { bg: "rgba(237,132,37,.14)", fg: "#a85f16" };
  return { bg: "var(--bg-subtle)", fg: "var(--fg3)" };
}

/** Term GPA is derived from the same points the cumulative figure uses; never stored. */
function termGpa(rows: GradeRow[]): number | null {
  const graded = rows.filter((r) => r.points !== null);
  const credits = graded.reduce((s, r) => s + r.credits, 0);
  if (credits === 0) return null;
  return graded.reduce((s, r) => s + r.points! * r.credits, 0) / credits;
}

export default function GradesPage() {
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  useEffect(() => {
    getMyGrades().then(setGrades).catch(() => {});
    getMySummary().then(setSummary).catch(() => {});
    getMyProfile().then(setProfile).catch(() => {});
  }, []);

  const blocks: TermBlock[] = useMemo(() => {
    const byTerm = new Map<string, GradeRow[]>();
    for (const g of grades) {
      const list = byTerm.get(g.term);
      if (list) list.push(g);
      else byTerm.set(g.term, [g]);
    }
    return [...byTerm.entries()].map(([term, rows]) => ({
      term,
      rows,
      credits: rows.reduce((s, r) => s + r.credits, 0),
      gpa: termGpa(rows),
    }));
  }, [grades]);

  return (
    <>
      <PageHeader
        title="Grades & Transcript"
        subtitle={`Unofficial academic record${profile?.program ? ` · ${profile.program}` : ""}`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Stat label="Cumulative GPA" value={summary ? summary.gpa.toFixed(2) : "—"} tone="var(--daust-navy)" />
        <Stat label="Credits earned" value={summary?.completedCredits ?? "—"} />
        <Stat label="Credits in progress" value={summary?.credits ?? "—"} tone="var(--daust-orange)" />
      </div>

      {blocks.length === 0 ? (
        <EmptyState title="No graded courses yet" note="Grades appear here once instructors submit them." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {blocks.map((b) => (
            <Card key={b.term} pad={false}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "14px 18px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                }}
              >
                <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>{b.term}</h3>
                <div className="muted" style={{ fontSize: 12.5, display: "flex", gap: 16 }}>
                  <span>
                    Term GPA <strong style={{ color: "var(--fg1)" }}>{b.gpa === null ? "—" : b.gpa.toFixed(2)}</strong>
                  </span>
                  <span>{b.credits} credits</span>
                </div>
              </div>

              <div>
                {b.rows.map((r, i) => {
                  const tone = gradeTone(r.grade);
                  return (
                    <div
                      key={`${r.courseCode}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "11px 18px",
                        borderBottom: i < b.rows.length - 1 ? "1px solid var(--divider)" : undefined,
                      }}
                    >
                      <span style={{ width: 78, fontSize: 12.5, fontWeight: 600, color: "var(--fg2)" }}>
                        {r.courseCode}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{r.title}</span>
                      <span className="muted" style={{ width: 56, textAlign: "center", fontSize: 12.5 }}>
                        {r.credits} cr
                      </span>
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
                        {r.grade ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

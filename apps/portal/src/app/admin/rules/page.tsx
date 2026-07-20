"use client";

import { useEffect, useState } from "react";
import { type CourseRuleRow, getCourseRules } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, SearchInput } from "@/components/ui";

export default function RuleEnginePage() {
  const [rows, setRows] = useState<CourseRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    getCourseRules().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  const needle = q.trim().toLowerCase();
  const filtered = (rows ?? []).filter(
    (r) => !needle || r.code.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle),
  );

  return (
    <>
      <PageHeader
        eyebrow="Policy & rules"
        title="Rule engine"
        subtitle="Registration rules per course. These are enforced server-side at enrolment, not merely displayed."
        actions={<SearchInput value={q} onChange={setQ} placeholder="Search course…" width={260} />}
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && filtered.length === 0 && <EmptyState title="No courses match" />}

      {filtered.length > 0 && (
        <Card pad={false}>
          <table>
            <thead>
              <tr><th>Course</th><th>Prerequisites</th><th>Corequisites</th><th>Standing</th><th>Restricted to</th><th>Waitlist</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.courseId} className="sis-row">
                  <td><div style={{ fontWeight: 700 }}>{r.code}</div><div className="muted" style={{ fontSize: 12 }}>{r.title}</div></td>
                  <td>
                    {r.prerequisites.length === 0 ? <span className="muted">none</span> : r.prerequisites.map((p) => (
                      <div key={p.code} style={{ fontSize: 12.5 }}>
                        {p.code}{p.minGrade && <span className="muted"> (min {p.minGrade})</span>}
                      </div>
                    ))}
                  </td>
                  <td>{r.corequisites.length === 0 ? <span className="muted">none</span> : r.corequisites.join(", ")}</td>
                  <td>{r.standingRequired ?? <span className="muted">any</span>}</td>
                  <td>{r.majorRestriction ?? <span className="muted">open</span>}</td>
                  <td><Badge tone={r.waitlistEnabled ? "info" : "neutral"}>{r.waitlistEnabled ? "enabled" : "off"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

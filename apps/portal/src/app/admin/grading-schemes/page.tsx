"use client";

import { useEffect, useState } from "react";
import { type GradingSchemeRow, getGradingSchemes } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, Segmented } from "@/components/ui";

/** Spec title form: "{scheme name} · {max GPA points}", the points suffix dropped for unscored scales. */
function schemeTitle(scheme: GradingSchemeRow): string {
  const points = scheme.rows.map((r) => r.points).filter((p): p is number => p !== null);
  if (points.length === 0) return scheme.name;
  return `${scheme.name} · ${Math.max(...points).toFixed(2)}`;
}

export default function GradingSchemesPage() {
  const [schemes, setSchemes] = useState<GradingSchemeRow[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGradingSchemes()
      .then((s) => { setSchemes(s); setActive(s.find((x) => x.isDefault)?.key ?? s[0]?.key ?? ""); })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!schemes) return <p className="muted">Loading…</p>;
  if (schemes.length === 0) return <EmptyState title="No grading schemes configured" />;

  const scheme = schemes.find((s) => s.key === active) ?? schemes[0]!;

  return (
    <>
      <PageHeader
        eyebrow="Policy & rules"
        title="Grading schemes"
        subtitle="Grade scales used across the institution. GPA is always derived from these points, never stored."
        actions={scheme.isDefault ? <Badge tone="success">Institution default</Badge> : undefined}
      />

      <div style={{ marginBottom: 18 }}>
        <Segmented
          options={schemes.map((s) => ({ value: s.key, label: s.name }))}
          value={active}
          onChange={setActive}
        />
      </div>

      <Card
        pad={false}
        title={
          <h3 style={{ margin: 0, padding: "16px 18px 0", fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700 }}>
            {schemeTitle(scheme)}
          </h3>
        }
      >
        <table>
          <thead>
            <tr><th>Grade</th><th style={{ textAlign: "right" }}>Points</th><th style={{ textAlign: "right" }}>Score range</th></tr>
          </thead>
          <tbody>
            {scheme.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.grade}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.points === null ? <span className="muted">not counted</span> : r.points.toFixed(2)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.minScore === null || r.maxScore === null ? <span className="muted">—</span> : `${r.minScore}–${r.maxScore}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Scales without grade points (pass/fail, IEP levels) are excluded from GPA rather than counted as zero.
      </p>
    </>
  );
}

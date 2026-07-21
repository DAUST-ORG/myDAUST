"use client";

import { useEffect, useState } from "react";
import { type DegreeAudit, getDegreeAudit } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui";

function statusTone(status: string): "success" | "info" | "warning" {
  if (status === "Complete") return "success";
  if (status === "On track") return "info";
  return "warning";
}

/**
 * The headline figure is summed from the categories rather than read from the
 * audit's own totals, so it can never disagree with the breakdown below it.
 * Credit past a category's requirement is not counted twice.
 */
function rollUp(audit: DegreeAudit) {
  const total = audit.categories.reduce((s, c) => s + c.required, 0);
  const completed = audit.categories.reduce((s, c) => s + Math.min(c.done, c.required), 0);
  const inProgress = audit.categories.reduce((s, c) => s + c.inProgress, 0);
  return {
    total,
    completed,
    inProgress,
    remaining: Math.max(0, total - completed - inProgress),
    pctComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export default function StudentDegree() {
  const [audit, setAudit] = useState<DegreeAudit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDegreeAudit().then(setAudit).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!audit) return <p className="muted">Loading…</p>;

  if (audit.categories.length === 0) {
    return (
      <>
        <PageHeader title="Degree Audit" subtitle={audit.program ?? undefined} />
        <EmptyState
          title="No requirement set for your programme yet"
          note="The registrar publishes requirements per catalogue year. Contact them if this looks wrong."
        />
      </>
    );
  }

  const roll = rollUp(audit);

  return (
    <>
      <PageHeader
        title="Degree Audit"
        subtitle={[audit.program, audit.catalogYear ? `Catalog ${audit.catalogYear}` : null]
          .filter(Boolean)
          .join(" · ")}
      />

      <div
        style={{
          background: "var(--grad-brand)",
          color: "#fff",
          borderRadius: "var(--radius-lg)",
          padding: 26,
          marginBottom: 20,
          boxShadow: "var(--shadow-navy)",
          display: "grid",
          gridTemplateColumns: "minmax(150px, auto) minmax(0, 1fr)",
          gap: 30,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 800, lineHeight: 1 }}>
            {roll.pctComplete}%
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 4 }}>toward degree</div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ height: 14, background: "rgba(255,255,255,.22)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
            <div
              style={{
                width: `${roll.pctComplete}%`,
                height: "100%",
                background: "linear-gradient(90deg,#ed8425,#f0a05b)",
                borderRadius: "var(--radius-pill)",
                transition: "width var(--dur-slow) var(--ease-standard)",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 30, marginTop: 18, flexWrap: "wrap" }}>
            <HeroFig label="credits earned" value={roll.completed} />
            <HeroFig label="in progress" value={roll.inProgress} tone="#ffc98a" />
            <HeroFig label="remaining" value={roll.remaining} />
            <HeroFig label="total required" value={roll.total} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {audit.categories.map((c) => (
          <Card key={c.category}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <strong style={{ flex: 1, fontSize: 14.5 }}>{c.category}</strong>
              <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            </div>
            <Progress
              pct={c.pct}
              height={9}
              tone={c.status === "Complete" ? "var(--success-500)" : "var(--daust-navy)"}
            />
            <p className="muted" style={{ margin: "9px 0 0", fontSize: 12.5 }}>
              {c.done} of {c.required} credits · {c.remaining} to go
              {c.inProgress > 0 && ` · ${c.inProgress} in progress`}
            </p>
          </Card>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Completion is summed from the credits applied to each requirement above, so this percentage
        always agrees with the category breakdown.
      </p>
    </>
  );
}

function HeroFig({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "var(--font-display)",
          fontVariantNumeric: "tabular-nums",
          color: tone,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.75 }}>{label}</div>
    </div>
  );
}

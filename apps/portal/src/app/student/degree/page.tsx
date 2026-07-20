"use client";

import { useEffect, useState } from "react";
import { type DegreeAudit, getDegreeAudit } from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, Progress } from "@/components/ui";

function statusTone(status: string): "success" | "info" | "warning" {
  if (status === "Complete") return "success";
  if (status === "On track") return "info";
  return "warning";
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
        <PageHeader eyebrow="Degree audit" title="Degree progress" />
        <EmptyState
          title="No requirement set for your programme yet"
          note="The registrar publishes requirements per catalogue year. Contact them if this looks wrong."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Degree audit"
        title="Degree progress"
        subtitle={audit.program ?? undefined}
        actions={audit.catalogYear ? <Badge tone="neutral">Catalogue {audit.catalogYear}</Badge> : undefined}
      />

      <div
        style={{
          background: "var(--grad-brand)",
          color: "#fff",
          borderRadius: "var(--radius-lg)",
          padding: 26,
          marginBottom: 20,
          boxShadow: "var(--shadow-navy)",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>
          Overall completion
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 800, lineHeight: 1.05, margin: "4px 0 14px" }}>
          {audit.pctComplete}%
        </div>
        <div style={{ height: 10, background: "rgba(255,255,255,.22)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
          <div
            style={{
              width: `${audit.pctComplete}%`,
              height: "100%",
              background: "var(--daust-orange)",
              borderRadius: "var(--radius-pill)",
              transition: "width var(--dur-slow) var(--ease-standard)",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 28, marginTop: 18, flexWrap: "wrap" }}>
          <HeroFig label="Completed" value={audit.completed} />
          <HeroFig label="In progress" value={audit.inProgress} />
          <HeroFig label="Remaining" value={audit.remaining} />
          <HeroFig label="Total required" value={audit.total} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {audit.categories.map((c) => (
          <Card key={c.category}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <strong style={{ flex: 1 }}>{c.category}</strong>
              <Badge tone={statusTone(c.status)}>{c.status}</Badge>
            </div>
            <Progress pct={c.pct} tone={c.status === "Complete" ? "var(--success-500)" : "var(--daust-navy)"} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 12.5 }}>
              <span className="muted">
                {c.done} of {c.required} credits
                {c.inProgress > 0 && ` · ${c.inProgress} in progress`}
              </span>
              <span style={{ fontWeight: 600 }}>{c.remaining} to go</span>
            </div>
          </Card>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Completion is calculated from the credits applied to each requirement above, so this
        percentage always agrees with the category breakdown. Credit beyond a category&apos;s
        requirement is not double-counted.
      </p>
    </>
  );
}

function HeroFig({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.75 }}>{label}</div>
    </div>
  );
}

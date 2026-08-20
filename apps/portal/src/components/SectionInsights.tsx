"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { type SectionInsights as Insights, getSectionInsights } from "@/lib/api";
import { Card, Stat } from "@/components/ui";

/**
 * The only leading risk signal in the system. The registrar's early-alert list runs on
 * transcript GPA, which does not move until final grades post; this reads attendance and
 * graded work as the term happens. Rendered on the screens an instructor is already on
 * rather than as its own nav item.
 */
export function SectionInsights({ sectionId }: { sectionId: string }) {
  const [data, setData] = useState<Insights | null>(null);

  useEffect(() => {
    if (!sectionId) return;
    setData(null);
    getSectionInsights(sectionId).then(setData).catch(() => {});
  }, [sectionId]);

  if (!data) return null;
  const { kpis, atRisk } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Stat label="Attendance" value={kpis.attendance === null ? "—" : `${kpis.attendance}%`} />
        <Stat label="Pass rate" value={kpis.passRate === null ? "—" : `${kpis.passRate}%`} />
        <Stat label="To grade" value={kpis.itemsToGrade} tone={kpis.itemsToGrade > 0 ? "var(--warning-500)" : undefined} />
        <Stat label="At risk" value={kpis.atRiskCount} tone={kpis.atRiskCount > 0 ? "var(--error-500)" : undefined} />
      </div>

      {atRisk.length > 0 && (
        <Card title="Students to watch">
          {atRisk.map((s) => (
            <div
              key={s.studentNo}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 0",
                borderBottom: "1px solid var(--divider)",
              }}
            >
              <AlertTriangle
                size={14}
                color={s.severity === "high" ? "var(--error-500)" : "var(--warning-500)"}
              />
              <span style={{ fontWeight: 600, fontSize: 13.5, minWidth: 150 }}>{s.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{s.studentNo}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{s.reason}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

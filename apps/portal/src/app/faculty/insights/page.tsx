"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, Award, PencilLine, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/Panel";
import { StatCard } from "@/components/StatCard";
import {
  type FacultyClass,
  type SectionInsights,
  getFacultyOverview,
  getSectionInsights,
} from "@/lib/api";

const DIST_COLORS = ["#2e7d52", "#1d4a82", "#ed8425", "#c4660f", "#c0392b"];

function InsightsInner() {
  const params = useSearchParams();
  const [classes, setClasses] = useState<FacultyClass[]>([]);
  const [sectionId, setSectionId] = useState<string>("");
  const [data, setData] = useState<SectionInsights | null>(null);

  useEffect(() => {
    getFacultyOverview()
      .then((o) => {
        setClasses(o.classes);
        const fromQuery = params.get("section");
        setSectionId(fromQuery && o.classes.some((c) => c.sectionId === fromQuery) ? fromQuery : o.classes[0]?.sectionId ?? "");
      })
      .catch(() => {});
  }, [params]);

  useEffect(() => {
    if (!sectionId) return;
    setData(null);
    getSectionInsights(sectionId).then(setData).catch(() => {});
  }, [sectionId]);

  const current = classes.find((c) => c.sectionId === sectionId);
  const color = current?.color ?? "var(--daust-navy)";
  const maxDist = useMemo(() => Math.max(1, ...(data?.distribution.map((d) => d.count) ?? [1])), [data]);

  const trendPath = useMemo(() => {
    const t = data?.trend ?? [];
    if (t.length < 2) return null;
    const vals = t.map((x) => x.pct);
    const tMin = Math.min(...vals) - 4;
    const tMax = 100;
    const pts = t.map((x, i) => [(i / (t.length - 1)) * 100, 100 - ((x.pct - tMin) / (tMax - tMin)) * 100] as const);
    return { d: pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" "), pts };
  }, [data]);

  return (
    <>
      <p className="eyebrow">Teaching insights</p>
      <h1 className="page-title">Insights</h1>

      <div style={{ marginBottom: 18 }}>
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", minWidth: 280 }}
        >
          {classes.map((c) => (
            <option key={c.sectionId} value={c.sectionId}>{c.code} — {c.title}</option>
          ))}
        </select>
      </div>

      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <StatCard value={data.kpis.attendance !== null ? `${data.kpis.attendance}%` : "—"} label="Class attendance" icon={ClipboardCheck} color={color} />
            <StatCard value={data.kpis.passRate !== null ? `${data.kpis.passRate}%` : "—"} label="Pass rate (A–C)" icon={Award} color="#2e7d52" />
            <StatCard value={data.kpis.itemsToGrade} label="Items to grade" icon={PencilLine} color="var(--daust-orange)" />
            <StatCard value={data.kpis.atRiskCount} label="At-risk students" icon={AlertTriangle} color="#c0392b" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <Panel title="Grade distribution">
              {data.distribution.every((d) => d.count === 0) ? (
                <p className="muted">No grades recorded yet.</p>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 180, padding: "0 8px" }}>
                  {data.distribution.map((d, i) => (
                    <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--fg1)" }}>{d.count}</span>
                      <div style={{ width: "100%", maxWidth: 46, height: (d.count / maxDist) * 130 + 4, background: DIST_COLORS[i], borderRadius: 8 }} />
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: DIST_COLORS[i] }}>{d.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Attendance trend · recent sessions">
              {!trendPath ? (
                <p className="muted">Not enough attendance data yet.</p>
              ) : (
                <>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 160 }}>
                    {[25, 50, 75].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#eef1f5" strokeWidth="0.5" />)}
                    <path d={trendPath.d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                    {trendPath.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />)}
                  </svg>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    {data.trend.map((x, i) => <span key={i} className="muted" style={{ fontSize: 11 }}>{x.pct}%</span>)}
                  </div>
                </>
              )}
            </Panel>
          </div>

          <Panel title="Students needing attention" pad="4px 20px 12px">
            {data.atRisk.length === 0 ? (
              <p className="muted" style={{ padding: "14px 0" }}>No at-risk students. 🎉</p>
            ) : (
              data.atRisk.map((r, i) => (
                <div key={r.studentNo} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: i < data.atRisk.length - 1 ? "1px solid var(--divider)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name} <span className="muted" style={{ fontSize: 12 }}>· {r.studentNo}</span></div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{r.reason}</div>
                  </div>
                  <span className={`badge ${r.severity === "high" ? "overdue" : "pending"}`}>{r.severity === "high" ? "High risk" : "Monitor"}</span>
                </div>
              ))
            )}
          </Panel>
        </>
      )}
    </>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <InsightsInner />
    </Suspense>
  );
}

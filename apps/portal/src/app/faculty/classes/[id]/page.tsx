"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck, ClipboardList, FileText, LineChart, Table2, Users } from "lucide-react";
import { Panel } from "@/components/Panel";
import {
  type FacultyClass,
  type SectionAssignments,
  getFacultyOverview,
  getSectionAssignments,
} from "@/lib/api";

export default function FacultyCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cls, setCls] = useState<FacultyClass | null>(null);
  const [asg, setAsg] = useState<SectionAssignments | null>(null);

  useEffect(() => {
    getFacultyOverview().then((o) => setCls(o.classes.find((c) => c.sectionId === id) ?? null)).catch(() => {});
    getSectionAssignments(id).then(setAsg).catch(() => {});
  }, [id]);

  if (!cls) return <p className="muted">Loading…</p>;

  const tools: { label: string; icon: typeof Users; color: string; href: string }[] = [
    { label: "Gradebook", icon: Table2, color: "var(--daust-navy)", href: `/faculty/gradebook/${id}` },
    { label: "Attendance", icon: CalendarCheck, color: "var(--daust-orange)", href: `/faculty/attendance/${id}` },
    { label: "Assignments", icon: ClipboardList, color: "var(--daust-navy-700)", href: `/faculty/assignments/${id}` },
    { label: "Roster", icon: Users, color: "#2e7d52", href: `/faculty/roster` },
    { label: "Insights", icon: LineChart, color: "#6c7884", href: `/faculty/insights?section=${id}` },
  ];

  return (
    <>
      <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-lg)", marginBottom: 20 }}>
        <div style={{ background: `linear-gradient(135deg, ${cls.color} 0%, ${cls.color}cc 100%)`, padding: "24px 28px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.78)", fontWeight: 600 }}>
              {cls.term} · {cls.days} {cls.startTime}–{cls.endTime} · {cls.room ?? "TBA"}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, marginTop: 8 }}>
              {cls.code} <span style={{ fontWeight: 500, fontSize: 22, opacity: 0.9 }}>— {cls.title}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 32 }}>
            {[["Students", String(cls.students)], ["Attendance", cls.attendance !== null ? `${cls.attendance}%` : "—"], ["To grade", String(cls.ungraded)]].map(([l, v]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26 }}>{v}</div>
                <div style={{ fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "rgba(255,255,255,.72)", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}>
        <Panel title="Recent activity" pad="4px 20px">
          {!asg || asg.assignments.length === 0 ? (
            <p className="muted" style={{ padding: "14px 0" }}>No assignments posted yet.</p>
          ) : (
            asg.assignments.map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0", borderBottom: i < asg.assignments.length - 1 ? "1px solid var(--divider)" : "none" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${cls.color} 14%, white)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText size={17} color={cls.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.title}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.submitted}/{asg.enrolled} submitted · {a.graded} graded</div>
                </div>
                {a.graded < a.submitted ? <span className="badge pending">Needs grading</span> : <span className="badge completed">Up to date</span>}
              </div>
            ))
          )}
        </Panel>

        <Panel title="Quick actions">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {tools.map((t) => (
              <button
                key={t.label}
                onClick={() => router.push(t.href)}
                style={{ border: "1px solid var(--gray-100)", background: "#fff", borderRadius: 12, padding: 14, cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${t.color} 15%, white)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 9 }}>
                  <t.icon size={17} color={t.color} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.label}</div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, PencilLine, TrendingUp, Users } from "lucide-react";
import { Panel } from "@/components/Panel";
import { StatCard } from "@/components/StatCard";
import {
  type Announcement,
  type FacultyOverview,
  getAnnouncements,
  getFacultyOverview,
} from "@/lib/api";

const NAVY = "var(--daust-navy)";
const ORANGE = "var(--daust-orange)";

export default function FacultyDashboard() {
  const router = useRouter();
  const [ov, setOv] = useState<FacultyOverview | null>(null);
  const [news, setNews] = useState<Announcement[]>([]);

  useEffect(() => {
    Promise.all([getFacultyOverview(), getAnnouncements()])
      .then(([o, a]) => {
        setOv(o);
        setNews(a);
      })
      .catch(() => {});
  }, []);

  if (!ov) return <p className="muted">Loading…</p>;
  const k = ov.kpis;

  return (
    <>
      <p className="eyebrow">Fall 2026</p>
      <h1 className="page-title">Dashboard</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <StatCard value={k.activeCourses} label="Active courses" icon={BookOpen} color={NAVY} onClick={() => router.push("/faculty/classes")} />
        <StatCard value={k.studentsTaught} label="Students taught" icon={Users} color="var(--daust-navy-700)" />
        <StatCard value={k.itemsToGrade} label="Items to grade" icon={PencilLine} color={ORANGE} />
        <StatCard value={k.avgAttendance !== null ? `${k.avgAttendance}%` : "—"} label="Avg. attendance" icon={TrendingUp} color="#2e7d52" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel title={`Today · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`} action="Full schedule" onAction={() => router.push("/faculty/schedule")}>
            {ov.today.length === 0 ? (
              <p className="muted">No classes scheduled today.</p>
            ) : (
              ov.today.map((t, i) => (
                <div key={t.sectionId} style={{ display: "flex", gap: 16, cursor: "pointer" }} onClick={() => router.push(`/faculty/classes/${t.sectionId}`)}>
                  <div style={{ width: 52, textAlign: "right", paddingTop: 14, flexShrink: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{t.time}</div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: i === 0 ? ORANGE : "#fff", border: `2.5px solid ${i === 0 ? ORANGE : NAVY}`, marginTop: 15 }} />
                    {i < ov.today.length - 1 && <span style={{ flex: 1, width: 2, background: "var(--divider)" }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: i < ov.today.length - 1 ? 14 : 0 }}>
                    <div style={{ background: "var(--gray-50)", border: "1px solid var(--divider)", borderRadius: 12, padding: "12px 15px" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.sub} · until {t.end}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="My Classes" action="View all" onAction={() => router.push("/faculty/classes")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {ov.classes.map((c) => (
                <div
                  key={c.sectionId}
                  onClick={() => router.push(`/faculty/classes/${c.sectionId}`)}
                  style={{ border: "1px solid var(--gray-100)", borderRadius: 13, overflow: "hidden", cursor: "pointer", background: "var(--surface)" }}
                >
                  <div style={{ height: 4, background: c.color }} />
                  <div style={{ padding: 15 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: c.color }}>{c.code}</span>
                      {c.ungraded > 0 && <span className="badge pending">{c.ungraded} to grade</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15.5, marginTop: 7, lineHeight: 1.25 }}>{c.title}</div>
                    <div className="muted" style={{ display: "flex", gap: 14, marginTop: 11, fontSize: 12 }}>
                      <span>👥 {c.students}</span>
                      <span>📍 {c.room ?? "—"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel title="Needs your attention" pad="2px 20px">
            {ov.needsAttention.length === 0 ? (
              <p className="muted" style={{ padding: "14px 0" }}>All caught up.</p>
            ) : (
              ov.needsAttention.map((a, i) => (
                <div
                  key={i}
                  onClick={() => router.push(`/faculty/classes/${a.sectionId}`)}
                  style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 0", borderBottom: i < ov.needsAttention.length - 1 ? "1px solid var(--divider)" : "none", cursor: "pointer" }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "color-mix(in srgb, var(--daust-orange) 14%, white)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <PencilLine size={18} color={ORANGE} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: ORANGE, fontWeight: 600, marginTop: 2 }}>{a.meta}</div>
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Announcements" action="View all" onAction={() => router.push("/faculty/announcements")} pad="4px 20px">
            {news.slice(0, 3).map((n, i) => (
              <div key={n.id} style={{ display: "flex", gap: 11, padding: "13px 0", borderBottom: i < 2 ? "1px solid var(--divider)" : "none" }}>
                <div style={{ width: 7, paddingTop: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: ORANGE, display: "block" }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12, color: NAVY }}>{n.author ?? n.category}</div>
                  <div style={{ fontSize: 13, color: "var(--fg2)", marginTop: 3, lineHeight: 1.35 }}>{n.title}</div>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

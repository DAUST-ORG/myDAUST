"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, ChevronRight, GraduationCap, Layers, Pencil, TrendingUp, Users, Wallet } from "lucide-react";
import { type AdminPrograms, type ProgramDetail, type ProgramRow, getAdminPrograms, getProgramDetail } from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";
import { Avatar, Badge, type BadgeTone, Tabs } from "@/components/ui";
import { ProgramEditModal } from "../ProgramEditModal";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", probation: "warning" };
const STATUS_LABEL: Record<string, string> = { active: "Enrolled", probation: "Probation" };

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "var(--success)";
  if (gpa > 0 && gpa < 2) return "var(--danger)";
  return "var(--fg1)";
}

export default function ProgramDetailPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const router = useRouter();
  const search = useSearchParams();
  const [p, setP] = useState<ProgramDetail | null>(null);
  const [departments, setDepartments] = useState<AdminPrograms["departments"]>([]);
  const [tab, setTab] = useState(search.get("tab") === "students" ? "students" : "overview");
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    getProgramDetail(code).then(setP).catch(() => setP(null));
  }, [code]);
  useEffect(() => {
    load();
    getAdminPrograms().then((d) => setDepartments(d.departments)).catch(() => {});
  }, [load]);

  if (!p) return <p className="muted">Loading…</p>;

  const accent = p.color ?? "var(--daust-navy)";
  const maxYear = Math.max(1, ...p.stats.yearDist);
  const asRow: ProgramRow = { code: p.code, name: p.name, department: p.department, students: p.stats.studentCount, degree: p.degree, school: p.school, tuition: p.tuition, color: p.color };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Link href="/admin/programs" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg3)", fontWeight: 600, fontSize: 13.5 }}>
          <ArrowLeft size={16} /> All programs
        </Link>
        <button className="primary" onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}><Pencil size={15} /> Edit program</button>
      </div>

      {/* Hero */}
      <div style={{ background: "linear-gradient(120deg, var(--daust-navy), var(--daust-navy-deep))", borderRadius: "var(--radius-xl)", padding: "26px 28px", color: "#fff", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <span style={{ width: 64, height: 64, borderRadius: 16, background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, flexShrink: 0 }}>{p.code}</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>{p.name}</div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{p.school ? `${p.school} School · ` : ""}{p.department}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {p.degree && <HeroPill icon={GraduationCap}>{p.degree}</HeroPill>}
            <HeroPill icon={Users}>{p.stats.studentCount} students</HeroPill>
            <HeroPill icon={BookOpen}>{p.courses.length} courses</HeroPill>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginTop: 16 }}>
        <Stat icon={Users} label="Enrolled" value={String(p.stats.studentCount)} unit="students" />
        <Stat icon={Wallet} label="Annual tuition" value={p.tuition != null ? formatXofCompact(p.tuition) : "—"} />
        <Stat icon={TrendingUp} label="Program revenue" value={formatXofCompact(p.stats.revenue)} unit="billed" />
        <Stat icon={Layers} label="Courses" value={String(p.courses.length)} unit="in department" />
      </div>

      <div style={{ marginTop: 22 }}>
        <Tabs tabs={[{ value: "overview", label: "Overview" }, { value: "courses", label: "Courses" }, { value: "students", label: "Students" }]} active={tab} onChange={setTab} />
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <Card title="About the program">
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.6 }}>
              {p.name}{p.degree ? ` is a ${p.degree} program` : ""}{p.school ? ` in the ${p.school} School` : ""}, administered by the {p.department} department at DAUST, Somone campus.
            </p>
          </Card>
          <Card title="Key facts">
            <KV k="Degree awarded" v={p.degree ?? "—"} />
            <KV k="School" v={p.school ?? "—"} />
            <KV k="Department" v={p.department} />
            <KV k="Annual tuition" v={p.tuition != null ? formatXof(p.tuition) : "—"} />
            <KV k="Language" v="English" />
          </Card>
          <Card title="Enrollment by year">
            {[1, 2, 3, 4].map((y, i) => (
              <div key={y} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span className="muted">Year {y}</span>
                  <span style={{ fontWeight: 600 }}>{p.stats.yearDist[i]}</span>
                </div>
                <div className="bar"><span style={{ width: `${(p.stats.yearDist[i]! / maxYear) * 100}%`, background: accent }} /></div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "courses" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Code</th><th>Course</th><th>Credits</th><th /></tr></thead>
              <tbody>
                {p.courses.map((c) => (
                  <tr key={c.code} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/programs/courses/${encodeURIComponent(c.code)}`)}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600 }}>{c.code}</td>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td>{c.credits}</td>
                    <td style={{ textAlign: "right" }}><ChevronRight size={16} color="var(--fg3)" /></td>
                  </tr>
                ))}
                {p.courses.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 28 }}>No courses in this department.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11.5, padding: "10px 14px", borderTop: "1px solid var(--divider)", margin: 0 }}>
            Courses are shared at the department level ({p.department}); other programs in this department may use them too.
          </p>
        </div>
      )}

      {tab === "students" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Student</th><th>Year</th><th>GPA</th><th>Credits</th><th style={{ textAlign: "right" }}>Balance</th><th>Status</th><th /></tr></thead>
              <tbody>
                {p.students.map((s) => (
                  <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/students/${s.id}`)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={s.name} size={30} src={s.photoUrl} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          <div className="muted" style={{ fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}>{s.studentNo}</div>
                        </div>
                      </div>
                    </td>
                    <td>{s.yearLevel ? `Year ${s.yearLevel}` : "—"}</td>
                    <td><span style={{ fontWeight: 700, color: gpaColor(s.gpa) }}>{s.gpa > 0 ? s.gpa.toFixed(2) : "—"}</span></td>
                    <td>{s.completedCredits}</td>
                    <td style={{ textAlign: "right", fontWeight: s.balance > 0 ? 600 : 400, color: s.balance > 0 ? "var(--danger)" : s.balance < 0 ? "var(--success)" : "var(--fg3)" }}>
                      {s.balance > 0 ? formatXof(s.balance) : s.balance < 0 ? `Credit ${formatXof(-s.balance)}` : "Cleared"}
                    </td>
                    <td><Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABEL[s.status] ?? s.status}</Badge></td>
                    <td style={{ textAlign: "right" }}><ChevronRight size={16} color="var(--fg3)" /></td>
                  </tr>
                ))}
                {p.students.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>No students enrolled in this program.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <ProgramEditModal
          mode="edit"
          program={asRow}
          departments={departments}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
    </>
  );
}

function HeroPill({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, color: "#fff" }}>
      <Icon size={13} color="#a9c4ec" />{children}
    </span>
  );
}

function Stat({ icon: Icon, label, value, unit }: { icon: typeof Users; label: string; value: string; unit?: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--fg3)" }}>
        <Icon size={14} color="var(--daust-navy)" /> {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginTop: 8 }}>
        {value}{unit && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg3)", marginLeft: 5 }}>{unit}</span>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <h4 style={{ margin: "0 0 12px", fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700 }}>{title}</h4>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--divider)", fontSize: 13 }}>
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

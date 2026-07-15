"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Award,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  type LucideIcon,
  Pencil,
  Phone,
  Receipt,
  Send,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  type AdminStudentDetail,
  type StudentAccount,
  type StudentActivity,
  adminDropEnrollment,
  getAdminStudentActivity,
  getAdminStudentDetail,
  getStudentAccount,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Avatar, Badge, Tabs } from "@/components/ui";
import { EditStudentModal } from "./EditStudentModal";

const ENROLL_BADGE: Record<string, string> = { enrolled: "enrolled", completed: "completed", dropped: "dropped" };

function gradeColor(grade: string | null): string {
  if (!grade) return "var(--fg2)";
  if (grade.startsWith("A")) return "var(--success)";
  if (grade.startsWith("D") || grade === "F") return "var(--danger)";
  return "var(--fg1)";
}

export default function AdminStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<AdminStudentDetail | null>(null);
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [activity, setActivity] = useState<StudentActivity[]>([]);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getAdminStudentDetail(id).then(setS).catch(() => {});
    getStudentAccount(id).then(setAccount).catch(() => {});
    getAdminStudentActivity(id).then(setActivity).catch(() => {});
  }, [id]);
  useEffect(() => load(), [load]);

  async function drop(enrollmentId: string) {
    setNote(null);
    try {
      await adminDropEnrollment(enrollmentId);
      setNote("Enrollment dropped (administrative, audit-logged).");
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  if (!s) return <p className="muted">Loading…</p>;

  const balanceLabel = s.balance > 0 ? formatXof(s.balance) : s.balance < 0 ? `Credit ${formatXof(-s.balance)}` : "Cleared";
  const balanceTone = s.balance > 0 ? "var(--danger)" : "var(--success)";
  const payments = (account?.invoices ?? [])
    .flatMap((inv) => inv.payments.filter((p) => p.status === "success").map((p) => ({ ...p, item: inv.description ?? inv.term })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastPayment = payments[0];

  return (
    <>
      {/* Back + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Link href="/admin/students" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg3)", fontWeight: 600, fontSize: 13.5 }}>
          <ArrowLeft size={16} /> All students
        </Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 7 }}><BookOpen size={15} /> Transcript</button>
          {s.balance > 0 && (
            <Link href={`/admin/finance/students/${id}`} className="btn" style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--fg1)", fontWeight: 500 }}>
              <Send size={15} /> Payment reminder
            </Link>
          )}
          <button className="primary" onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}><Pencil size={15} /> Edit record</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: "linear-gradient(120deg, var(--daust-navy), var(--daust-navy-deep))", borderRadius: "var(--radius-xl)", padding: "26px 28px", color: "#fff", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <Avatar name={s.name} size={72} src={s.photoUrl} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>{s.name}</div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{s.studentNo} · {s.email}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <HeroPill icon={BadgeCheck} tone={s.status === "probation" ? "warn" : "ok"}>{s.status === "probation" ? "Probation" : "Enrolled"}</HeroPill>
            {s.program && <HeroPill icon={GraduationCap}>{s.program}</HeroPill>}
            <HeroPill icon={CalendarDays}>{s.yearLevel ? `Year ${s.yearLevel}` : "Year —"}{s.cohort ? ` · ${s.cohort}` : ""}</HeroPill>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 16 }}>
        <ProfileStat label="Account balance" icon={Wallet} value={balanceLabel} color={s.balance === 0 ? "var(--success)" : balanceTone} />
        <ProfileStat label="Cumulative GPA" icon={Award} value={s.gpa > 0 ? s.gpa.toFixed(2) : "—"} unit="/ 4.0" color="var(--daust-navy)" />
        <ProfileStat label="Credits earned" icon={Layers} value={String(s.completedCredits)} unit="/ 160" />
        <ProfileStat label="Standing" icon={CheckCircle2} value={s.standing === "Academic Probation" ? "Probation" : s.standing === "Dean's List" ? "Dean's List" : "Good"} />
      </div>

      <div style={{ marginTop: 22 }}>
        <Tabs
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "academics", label: "Academics" },
            { value: "finance", label: "Finance" },
            { value: "personal", label: "Personal & contact" },
            { value: "activity", label: "Activity" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <ProfileCard title="Enrollment" icon={BookOpen}>
            <KV k="Program" v={s.program ?? "—"} />
            <KV k="Year of study" v={s.yearLevel ? `Year ${s.yearLevel}` : "—"} />
            <KV k="Cohort" v={s.cohort ?? "—"} />
            <KV k="Enrolled" v={s.enrolledAt ?? "—"} />
            <KV k="Advisor" v={s.advisor ?? "—"} />
            <KV k="Status" v={s.status === "probation" ? "Probation" : "Enrolled"} />
          </ProfileCard>
          <ProfileCard title="Account summary" icon={Receipt}>
            <KV k="Balance" v={<span style={{ color: s.balance === 0 ? "var(--success)" : balanceTone, fontWeight: 700 }}>{balanceLabel}</span>} />
            <KV k="Payments on record" v={String(payments.length)} />
            <KV k="Total paid" v={account ? formatXof(account.totals.paid) : "—"} />
            <KV k="Credits this term" v={String(s.currentTermCredits)} />
          </ProfileCard>
          <ProfileCard title="Contact" icon={Phone}>
            <KV k="Email" v={s.email} />
            <KV k="Phone" v={s.phone ?? "—"} />
            <KV k="City" v={s.city ?? "—"} />
            <KV k="Nationality" v={s.nationality ?? "—"} />
          </ProfileCard>
        </div>
      )}

      {tab === "academics" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)", gap: 16, alignItems: "start" }}>
          <ProfileCard title="Standing" icon={Award}>
            <KV k="Cumulative GPA" v={<b>{s.gpa > 0 ? `${s.gpa.toFixed(2)} / 4.0` : "—"}</b>} />
            <KV k="Academic standing" v={s.standing} />
            <KV k="Credits earned" v={`${s.completedCredits} / 160`} />
            <KV k="Credits this term" v={String(s.currentTermCredits)} />
            <KV k="Expected graduation" v={s.cohort ?? "—"} />
            <KV k="Advisor" v={s.advisor ?? "—"} />
          </ProfileCard>
          <ProfileCard title="Courses & enrollment" icon={BookOpen}>
            {s.enrollments.length ? (
              <table>
                <thead><tr><th>Code</th><th>Course</th><th>Cr.</th><th>Instructor</th><th>Status</th><th>Grade</th><th /></tr></thead>
                <tbody>
                  {s.enrollments.map((e) => (
                    <tr key={e.enrollmentId}>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 600 }}>{e.courseCode}</td>
                      <td style={{ fontWeight: 600 }}>{e.title}</td>
                      <td>{e.credits}</td>
                      <td style={{ fontSize: 12.5 }}>{e.instructor ?? "—"}</td>
                      <td><span className={`badge ${ENROLL_BADGE[e.status] ?? "pending"}`}>{e.status}</span></td>
                      <td><span style={{ fontWeight: 800, color: gradeColor(e.grade) }}>{e.grade ?? "—"}</span></td>
                      <td>{e.status === "enrolled" && <button onClick={() => drop(e.enrollmentId)} style={{ fontSize: 11.5, padding: "5px 9px" }}>Drop</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No enrollments on record.</p>
            )}
            {note && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{note}</p>}
          </ProfileCard>
        </div>
      )}

      {tab === "finance" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)", gap: 16, alignItems: "start" }}>
          <ProfileCard title="Balance" icon={Wallet}>
            <div style={{ textAlign: "center", padding: "8px 0 14px" }}>
              <div className="muted" style={{ fontSize: 12.5 }}>Outstanding</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, color: s.balance === 0 ? "var(--success)" : balanceTone, marginTop: 4 }}>{balanceLabel}</div>
            </div>
            <KV k="Total billed" v={account ? formatXof(account.totals.billed) : "—"} />
            <KV k="Total paid" v={account ? formatXof(account.totals.paid) : "—"} />
            <KV k="Last payment" v={lastPayment ? new Date(lastPayment.createdAt).toLocaleDateString("fr-SN", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
            <Link href={`/admin/finance/students/${id}`} className="primary" style={{ display: "block", textAlign: "center", marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "var(--daust-orange)", color: "#fff", fontWeight: 600 }}>
              Manage finance account →
            </Link>
          </ProfileCard>
          <ProfileCard title="Payment history" icon={Clock}>
            {payments.length ? (
              <table>
                <thead><tr><th>Date</th><th>Item</th><th>Method</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(p.createdAt).toLocaleDateString("fr-SN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td style={{ fontWeight: 600 }}>{p.item}</td>
                      <td>{p.method}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--success)" }}>{formatXof(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No payments recorded.</p>
            )}
          </ProfileCard>
        </div>
      )}

      {tab === "personal" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <ProfileCard title="Personal details" icon={UserPlus}>
            <KV k="Full name" v={s.name} />
            <KV k="Student ID" v={s.studentNo} />
            <KV k="Date of birth" v={s.dateOfBirth ?? "—"} />
            <KV k="Gender" v={s.gender ?? "—"} />
            <KV k="Nationality" v={s.nationality ?? "—"} />
          </ProfileCard>
          <ProfileCard title="Contact" icon={Phone}>
            <KV k="Email" v={s.email} />
            <KV k="Phone" v={s.phone ?? "—"} />
            <KV k="Address" v={s.address ?? "—"} />
            <KV k="City" v={s.city ?? "—"} />
          </ProfileCard>
          <ProfileCard title="Guardian / emergency" icon={Users}>
            <KV k="Name" v={s.guardianName ?? "—"} />
            <KV k="Relationship" v={s.guardianRelation ?? "—"} />
            <KV k="Phone" v={s.guardianPhone ?? "—"} />
          </ProfileCard>
        </div>
      )}

      {tab === "activity" && (
        <ProfileCard title="Activity timeline" icon={Activity}>
          {activity.length ? (
            <div>
              {activity.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < activity.length - 1 ? 18 : 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-subtle)", border: "1px solid var(--border)", color: e.type === "payment" ? "var(--success)" : "var(--daust-navy)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {e.type === "payment" ? <CheckCircle2 size={15} /> : e.type === "enrollment" ? <BookOpen size={15} /> : <UserPlus size={15} />}
                    </span>
                    {i < activity.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 18, background: "var(--border)", marginTop: 2 }} />}
                  </div>
                  <div style={{ paddingTop: 5 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{new Date(e.at).toLocaleDateString("fr-SN", { day: "numeric", month: "short", year: "numeric" })} · {e.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No activity recorded.</p>
          )}
        </ProfileCard>
      )}

      {editing && (
        <EditStudentModal
          student={s}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setS(updated);
            setEditing(false);
            load();
          }}
        />
      )}
    </>
  );
}

function HeroPill({ icon: Icon, children, tone }: { icon: LucideIcon; children: React.ReactNode; tone?: "ok" | "warn" }) {
  const bg = tone === "warn" ? "rgba(237,132,37,0.28)" : "rgba(255,255,255,0.12)";
  const ic = tone === "ok" ? "#7ee0a8" : tone === "warn" ? "#ffc98f" : "#a9c4ec";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: bg, borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, color: "#fff" }}>
      <Icon size={13} color={ic} />
      {children}
    </span>
  );
}

function ProfileStat({ label, value, unit, icon: Icon, color = "var(--fg1)" }: { label: string; value: string; unit?: string; icon: LucideIcon; color?: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--fg3)" }}>
        <Icon size={14} color="var(--daust-navy)" /> {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 23, fontWeight: 800, marginTop: 8, color }}>
        {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg3)", marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ProfileCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="card" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 18px", borderBottom: "1px solid var(--divider)" }}>
        <Icon size={16} color="var(--daust-navy)" />
        <h4 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700 }}>{title}</h4>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--divider)", fontSize: 13 }}>
      <span className="muted" style={{ flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

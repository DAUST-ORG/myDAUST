"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, CheckCheck, ClipboardList, FileText, TrendingUp, Wallet } from "lucide-react";
import {
  type Announcement,
  type BillingInvoice,
  type DegreeAudit,
  type MyAssignment,
  type MyAttendance,
  type MyEnrollment,
  type MySummary,
  getAnnouncements,
  getCurrentTerm,
  getDegreeAudit,
  getMe,
  getMyAssignments,
  getMyAttendance,
  getMyBilling,
  getMyEnrollments,
  getMySummary,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Card, Progress, Stat } from "@/components/ui";
import { COURSE_COLORS, parseDayIndexes } from "@/lib/student-schedule";

interface TodoItem {
  key: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  due: string;
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("fr-SN", { day: "numeric", month: "short" });

export default function StudentDashboard() {
  const [first, setFirst] = useState("");
  const [term, setTerm] = useState("");
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [courses, setCourses] = useState<MyEnrollment[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [attendance, setAttendance] = useState<MyAttendance | null>(null);
  const [degree, setDegree] = useState<DegreeAudit | null>(null);

  useEffect(() => {
    getMe().then((me) => setFirst(me.name.split(" ")[0] ?? "")).catch(() => {});
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
    getMySummary().then(setSummary).catch(() => {});
    getMyBilling().then(setInvoices).catch(() => {});
    getMyEnrollments().then(setCourses).catch(() => {});
    getAnnouncements().then(setNews).catch(() => {});
    getMyAssignments().then(setAssignments).catch(() => {});
    getMyAttendance().then(setAttendance).catch(() => {});
    getDegreeAudit().then(setDegree).catch(() => {});
  }, []);

  const balance = invoices.reduce((b, i) => b + i.balance, 0);

  /* Falls back to Monday on a weekend so the panel is never empty for a student who has classes. */
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 || jsDay === 6 ? 0 : jsDay - 1;
  const todayClasses = courses
    .filter((c) => parseDayIndexes(c.days).includes(todayIdx))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const colorOf = (code: string) => {
    const i = courses.findIndex((c) => c.courseCode === code);
    return COURSE_COLORS[(i < 0 ? 0 : i) % COURSE_COLORS.length]!;
  };

  const nextInstallment = invoices
    .flatMap((inv) => inv.installments)
    .filter((i) => i.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const todos: TodoItem[] = [
    ...assignments
      .filter((a) => a.status === "assigned")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 3)
      .map<TodoItem>((a) => ({
        key: a.assignmentId,
        href: "/student/assignments",
        icon: <FileText size={16} color="#a3291b" />,
        title: `${a.courseCode} — ${a.title}`,
        due: `Due ${dayLabel(a.dueDate)}`,
      })),
    ...(nextInstallment
      ? [
          {
            key: nextInstallment.id,
            href: "/student/billing",
            icon: <Wallet size={16} color="var(--daust-orange)" />,
            title: `Tuition installment ${nextInstallment.sequence}`,
            due: `Due ${dayLabel(nextInstallment.dueDate)} · ${formatXof(
              nextInstallment.amountDue - nextInstallment.amountPaid,
            )}`,
          },
        ]
      : []),
  ];

  return (
    <>
      <p className="eyebrow">{term || "Current term"}</p>
      <h1 className="page-title">Welcome back, {first || "student"}</h1>
      <p className="muted" style={{ marginBottom: 22, fontSize: 14.5 }}>
        Here&apos;s where things stand this term.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 18 }}>
        <Link href="/student/schedule" style={{ textDecoration: "none", color: "inherit" }}>
          <Stat
            label="Enrolled courses"
            value={summary?.enrolledCourses ?? "—"}
            sub={`${summary?.credits ?? 0} credits${term ? ` · ${term}` : ""}`}
            icon={<BookOpen size={16} />}
          />
        </Link>
        <Link href="/student/grades" style={{ textDecoration: "none", color: "inherit" }}>
          <Stat
            label="Cumulative GPA"
            value={summary ? summary.gpa.toFixed(2) : "—"}
            sub={`${summary?.completedCredits ?? 0} credits completed`}
            tone="var(--daust-navy)"
            icon={<TrendingUp size={16} />}
          />
        </Link>
        <Link href="/student/billing" style={{ textDecoration: "none", color: "inherit" }}>
          <Stat
            label="Balance due"
            value={formatXof(balance)}
            sub={
              balance > 0
                ? nextInstallment
                  ? `Due ${dayLabel(nextInstallment.dueDate)}`
                  : "Payment due"
                : "Settled"
            }
            tone={balance > 0 ? "var(--error-500)" : "var(--success-500)"}
            icon={<Wallet size={16} />}
          />
        </Link>
        <Link href="/student/attendance" style={{ textDecoration: "none", color: "inherit" }}>
          <Stat
            label="Attendance"
            value={attendance?.overall === null || attendance?.overall === undefined ? "—" : `${attendance.overall}%`}
            sub="This term"
            tone="var(--success-500)"
            icon={<CheckCheck size={16} />}
          />
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <div style={{ gridColumn: "span 1", minWidth: 0 }}>
          <Card
            title="Today's schedule"
            action={
              <Link href="/student/schedule" style={{ fontSize: 12.5, fontWeight: 600 }}>
                Full week →
              </Link>
            }
          >
            {todayClasses.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>No classes scheduled.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {todayClasses.map((c, i) => (
                  <div key={c.enrollmentId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 4, alignSelf: "stretch", minHeight: 38, borderRadius: 2, background: colorOf(c.courseCode) }} />
                    <span style={{ width: 96, fontSize: 12.5, color: "var(--fg2)", fontVariantNumeric: "tabular-nums" }}>
                      {c.startTime}–{c.endTime}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {c.courseCode} · {c.room ?? "room TBA"}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "2px 10px",
                        borderRadius: "var(--radius-pill)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: i === 0 ? "rgba(237,132,37,.14)" : "var(--bg-subtle)",
                        color: i === 0 ? "#a85f16" : "var(--fg3)",
                      }}
                    >
                      {i === 0 ? "Next" : "Upcoming"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title="To-do">
          {todos.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing needs your attention.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {todos.map((t) => (
                <Link key={t.key} href={t.href} style={{ display: "flex", gap: 10, alignItems: "flex-start", textDecoration: "none", color: "inherit" }}>
                  <span style={{ marginTop: 1 }}>{t.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{t.due}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card
          title="Degree progress"
          action={
            <Link href="/student/degree" style={{ fontSize: 12.5, fontWeight: 600 }}>
              Audit →
            </Link>
          }
        >
          {!degree ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Loading…</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, color: "var(--daust-navy)" }}>
                  {degree.pctComplete}%
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  complete · {degree.completed}/{degree.total} credits
                </span>
              </div>
              <Progress pct={degree.pctComplete} height={10} />
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 12.5 }}>
                Cumulative GPA <strong style={{ color: "var(--fg1)" }}>{summary ? summary.gpa.toFixed(2) : "—"}</strong> ·{" "}
                {degree.inProgress} credits in progress
              </p>
            </>
          )}
        </Card>

        <Card
          title="Announcements"
          action={
            <Link href="/student/announcements" style={{ fontSize: 12.5, fontWeight: 600 }}>
              View all
            </Link>
          }
        >
          {news.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No campus updates.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {news.slice(0, 3).map((a) => (
                <div key={a.id}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--daust-navy-700)" }}>
                    {a.category}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.title}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

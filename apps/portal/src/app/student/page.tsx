"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type Announcement,
  type BillingInvoice,
  type MyAssignment,
  type MyEnrollment,
  type MySummary,
  getAnnouncements,
  getMe,
  getMyAssignments,
  getMyBilling,
  getMyEnrollments,
  getMySummary,
} from "@/lib/api";
import { formatXof } from "@/lib/format";

const NAVY = "var(--daust-navy)";
const ORANGE = "var(--daust-orange)";

/* "MWF"/"TTh" -> weekday indices, Mon=0 (mirrors api parseDays). */
function parseDays(s: string): number[] {
  const out: number[] = [];
  const map: Record<string, number> = { M: 0, T: 1, W: 2, F: 4 };
  let i = 0;
  while (i < s.length) {
    if (s.slice(i, i + 2) === "Th") {
      out.push(3);
      i += 2;
    } else {
      const d = map[s[i]!];
      if (d !== undefined) out.push(d);
      i += 1;
    }
  }
  return out;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export default function StudentDashboard() {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [courses, setCourses] = useState<MyEnrollment[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);

  useEffect(() => {
    Promise.all([getMe(), getMySummary(), getMyBilling(), getMyEnrollments(), getAnnouncements()])
      .then(([me, s, inv, enr, ann]) => {
        setName(me.name);
        setSummary(s);
        setInvoices(inv);
        setCourses(enr);
        setNews(ann);
      })
      .catch(() => {});
    getMyAssignments().then(setAssignments).catch(() => {});
  }, []);

  const balance = invoices.reduce((b, i) => b + i.balance, 0);

  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayClasses = courses
    .filter((c) => parseDays(c.days).includes(todayIdx))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const now = Date.now();
  const dueInstallments = invoices
    .flatMap((inv) => inv.installments)
    .filter((i) => i.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const openAssignments = assignments.filter((a) => a.status === "assigned");
  const actionCount = dueInstallments.length + openAssignments.length;

  return (
    <>
      <p className="eyebrow">Fall 2026</p>
      <h1 className="page-title">Welcome back, {name.split(" ")[0] || "student"}</h1>
      <p className="muted" style={{ marginBottom: 22 }}>Here&apos;s where things stand this term.</p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Enrolled courses</div><div className="value">{summary?.enrolledCourses ?? "—"}</div><div className="trend">{summary?.credits ?? 0} credits</div></div>
        <div className="kpi"><div className="label">GPA</div><div className="value">{summary?.gpa?.toFixed(2) ?? "—"}</div><div className="trend">{summary?.completedCredits ?? 0} credits completed</div></div>
        <div className="kpi"><div className="label">Balance due</div><div className="value">{formatXof(balance)}</div><div className={`trend ${balance > 0 ? "down" : "up"}`}>{balance > 0 ? "Payment due" : "Paid up"}</div></div>
        <div className="kpi"><div className="label">Announcements</div><div className="value">{news.length}</div><div className="trend">campus updates</div></div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: "2 1 340px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <p className="h1" style={{ fontSize: 16 }}>
              Today · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <span style={{ flex: 1 }} />
            <Link href="/student/schedule">Full schedule →</Link>
          </div>
          {todayClasses.length === 0 ? (
            <p className="muted">No classes scheduled today.</p>
          ) : (
            todayClasses.map((c, i) => (
              <div key={c.enrollmentId} style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 52, textAlign: "right", paddingTop: 14, flexShrink: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{c.startTime}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: i === 0 ? ORANGE : "var(--surface, #fff)", border: `2.5px solid ${i === 0 ? ORANGE : NAVY}`, marginTop: 15 }} />
                  {i < todayClasses.length - 1 && <span style={{ flex: 1, width: 2, background: "var(--divider)" }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: i < todayClasses.length - 1 ? 14 : 0 }}>
                  <div style={{ background: "var(--gray-50)", border: "1px solid var(--divider)", borderRadius: 12, padding: "12px 15px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.courseCode} — {c.title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.room ?? "Room TBA"} · until {c.endTime}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card" style={{ flex: "1 1 280px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <p className="h1" style={{ fontSize: 16 }}>Action items</p>
            {actionCount > 0 && <span className="badge pending" style={{ marginLeft: 10 }}>{actionCount}</span>}
          </div>
          {actionCount === 0 ? (
            <p className="muted">All caught up. Nothing needs your attention.</p>
          ) : (
            <>
              {dueInstallments.slice(0, 3).map((inst) => {
                const overdue = inst.status === "overdue" || new Date(inst.dueDate).getTime() < now;
                return (
                  <Link key={inst.id} href="/student/billing" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--divider)", color: "inherit", textDecoration: "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Installment {inst.sequence} — {formatXof(inst.amountDue - inst.amountPaid)}</div>
                      <div style={{ fontSize: 12, color: overdue ? "var(--danger)" : "var(--fg2)", marginTop: 2 }}>
                        {overdue ? "Overdue since" : "Due"} {new Date(inst.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`badge ${overdue ? "overdue" : "pending"}`}>{overdue ? "overdue" : "unpaid"}</span>
                  </Link>
                );
              })}
              {openAssignments.slice(0, 3).map((a) => (
                <Link key={a.assignmentId} href="/student/assignments" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--divider)", color: "inherit", textDecoration: "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.courseCode} · due {new Date(a.dueDate).toLocaleDateString()}</div>
                  </div>
                  <span className="badge pending">to submit</span>
                </Link>
              ))}
            </>
          )}
        </div>

        <div className="card" style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: NAVY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22 }}>
            {initials(name) || "ID"}
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{name || "Student"}</div>
            <div className="muted" style={{ fontSize: 12 }}>DAUST student ID</div>
          </div>
          <Link href="/student/id" style={{ fontWeight: 600, color: ORANGE }}>Open ID →</Link>
        </div>
      </div>

      <div className="row">
        <div className="card" style={{ flex: "2 1 360px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <p className="h1" style={{ fontSize: 16 }}>My courses</p>
            <span style={{ flex: 1 }} />
            <Link href="/student/courses">Register →</Link>
          </div>
          {courses.length === 0 ? (
            <p className="muted">Not enrolled yet. <Link href="/student/courses">Browse sections</Link>.</p>
          ) : (
            <table>
              <thead><tr><th>Course</th><th>Schedule</th><th>Room</th></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.enrollmentId}>
                    <td>{c.courseCode} — {c.title}</td>
                    <td>{c.schedule}</td>
                    <td>{c.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ flex: "1 1 280px" }}>
          <p className="h1" style={{ fontSize: 16 }}>Announcements</p>
          {news.slice(0, 4).map((a) => (
            <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--divider)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--daust-orange)", letterSpacing: ".08em", textTransform: "uppercase" }}>{a.category}</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{a.body}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type Announcement,
  type BillingInvoice,
  type MyEnrollment,
  type MySummary,
  getAnnouncements,
  getMe,
  getMyBilling,
  getMyEnrollments,
  getMySummary,
} from "@/lib/api";
import { formatXof } from "@/lib/format";

export default function StudentDashboard() {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [courses, setCourses] = useState<MyEnrollment[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);

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
  }, []);

  const balance = invoices.reduce((b, i) => b + i.balance, 0);

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

"use client";

import { useEffect, useMemo, useState } from "react";
import { type DiningStudent, getDiningStudents } from "@/lib/api-dining";

const FILTERS = ["all", "full", "half", "none"] as const;
type Filter = (typeof FILTERS)[number];

export default function DiningStudentsPage() {
  const [students, setStudents] = useState<DiningStudent[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    getDiningStudents().then(setStudents).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: students.length, full: 0, half: 0, none: 0 };
    for (const s of students) if (s.plan === "full" || s.plan === "half" || s.plan === "none") c[s.plan] += 1;
    return c;
  }, [students]);

  const filtered = students.filter((s) => {
    if (filter !== "all" && s.plan !== filter) return false;
    if (q && !`${s.name} ${s.studentNo}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <p className="eyebrow">Meal plans</p>
      <h1 className="page-title">Students</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or student no…" style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", width: 260 }} />
        <div style={{ display: "flex", gap: 6, background: "var(--gray-100)", padding: 4, borderRadius: 999 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                border: "none",
                cursor: "pointer",
                borderRadius: 999,
                padding: "6px 14px",
                fontWeight: 600,
                fontSize: 12.5,
                textTransform: "capitalize",
                background: filter === f ? "var(--surface, #fff)" : "transparent",
                color: filter === f ? "var(--daust-navy)" : "var(--fg2)",
              }}
            >
              {f} <span style={{ color: "var(--fg3)" }}>{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Student</th><th>Student no</th><th>Plan</th><th>Term</th><th>Status</th><th>Meals today</th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.studentId}>
                <td><strong>{s.name}</strong></td>
                <td className="muted">{s.studentNo}</td>
                <td style={{ textTransform: "capitalize" }}>{s.plan}</td>
                <td>{s.term}</td>
                <td>{s.active ? <span className="badge completed">Active</span> : <span className="badge overdue">Inactive</span>}</td>
                <td>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{s.scansToday}</span>
                  <span className="muted" style={{ fontSize: 12 }}> / 3</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted">No students match.</p>}
      </div>
    </>
  );
}

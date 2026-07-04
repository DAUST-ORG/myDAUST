"use client";

import { BookOpen, CalendarDays, GraduationCap, Plane } from "lucide-react";

const RESOURCES: { title: string; description: string; icon: typeof BookOpen; color: string }[] = [
  {
    title: "Faculty Handbook",
    description: "Policies, expectations and procedures for all DAUST teaching staff.",
    icon: BookOpen,
    color: "var(--daust-navy)",
  },
  {
    title: "Academic Calendar",
    description: "Term dates, add/drop deadlines, exam weeks and university holidays.",
    icon: CalendarDays,
    color: "var(--daust-orange)",
  },
  {
    title: "Grading Policy",
    description: "Letter-grade scale, GPA computation rules and grade-change procedure.",
    icon: GraduationCap,
    color: "#2e7d52",
  },
  {
    title: "Leave Policy",
    description: "Annual, sick and mission leave entitlements and the approval workflow.",
    icon: Plane,
    color: "#6c7884",
  },
];

export default function FacultyDocumentsPage() {
  return (
    <>
      <p className="eyebrow">Campus</p>
      <h1 className="page-title">Documents</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Institutional resources for faculty. Downloadable files are coming with the S3 document store.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {RESOURCES.map((r) => (
          <div key={r.title} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `color-mix(in srgb, ${r.color} 14%, white)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <r.icon size={19} color={r.color} />
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: "var(--fg1)" }}>{r.title}</div>
            <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{r.description}</p>
            <span className="badge pending" style={{ alignSelf: "flex-start", marginTop: "auto" }}>Upload coming with S3</span>
          </div>
        ))}
      </div>
    </>
  );
}

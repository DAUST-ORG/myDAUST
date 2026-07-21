"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, Stat } from "@/components/ui";
import { type FacultyOverview, getFacultyOverview, getMe } from "@/lib/api";

/** "CSC 301" → "C3": first character of each whitespace-separated part. */
function codeInitials(code: string): string {
  return code
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export default function FacultyDashboard() {
  const router = useRouter();
  const [ov, setOv] = useState<FacultyOverview | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFacultyOverview().then(setOv).catch((e: Error) => setError(e.message));
    getMe().then((me) => setName(me.name)).catch(() => {});
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!ov) return <p className="muted">Loading…</p>;

  const k = ov.kpis;
  const term = ov.classes[0]?.term;

  return (
    <>
      {term && <p className="eyebrow">{term}</p>}
      <h1 className="page-title">{name ? `Welcome, Prof. ${lastName(name)}` : "Welcome"}</h1>
      <p className="muted" style={{ margin: "2px 0 22px", fontSize: 14 }}>
        Your teaching load and what needs attention.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <Stat label="Active courses" value={k.activeCourses} />
        <Stat label="Students taught" value={k.studentsTaught} />
        <Stat label="To grade" value={k.itemsToGrade} sub="submissions" tone="var(--daust-orange)" />
        {k.avgAttendance !== null && (
          <Stat label="Avg attendance" value={`${k.avgAttendance}%`} tone="var(--success-500)" />
        )}
      </div>

      <Card
        title={
          <div>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 700 }}>My classes</h3>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>This term</p>
          </div>
        }
      >
        {ov.classes.length === 0 ? (
          <EmptyState
            title="You are not teaching any sections"
            note="Sections appear here once the registrar assigns you as instructor."
          />
        ) : (
          ov.classes.map((c, i) => (
            <div
              key={c.sectionId}
              className="sis-row"
              onClick={() => router.push("/faculty/gradebook")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 8px",
                borderBottom: i < ov.classes.length - 1 ? "1px solid var(--divider)" : "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--accent-bg)",
                  color: "var(--daust-navy)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                {codeInitials(c.code)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.code}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {c.title} · {c.room ?? "room TBA"} · {c.students} students
                </div>
              </div>
              <Badge tone="navy">{c.students}</Badge>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

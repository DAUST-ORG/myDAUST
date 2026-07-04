"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type FacultyClass, getFacultyOverview } from "@/lib/api";

export default function MyClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<FacultyClass[]>([]);

  useEffect(() => {
    getFacultyOverview().then((o) => setClasses(o.classes)).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">{classes.length} active courses · Fall 2026</p>
      <h1 className="page-title">My Classes</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
        {classes.map((c) => (
          <div
            key={c.sectionId}
            onClick={() => router.push(`/faculty/classes/${c.sectionId}`)}
            style={{ background: "var(--surface)", border: "1px solid var(--gray-100)", borderRadius: 16, overflow: "hidden", cursor: "pointer", boxShadow: "var(--shadow-sm)" }}
          >
            <div style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}cc 100%)`, padding: "18px 20px", color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{c.code}</span>
                {c.ungraded > 0 && (
                  <span style={{ background: "rgba(255,255,255,.18)", color: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{c.ungraded} to grade</span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 14, marginTop: 6, color: "rgba(255,255,255,.92)" }}>{c.title}</div>
            </div>
            <div style={{ padding: 18, display: "flex", gap: 22 }}>
              {[["Students", String(c.students)], ["Attendance", c.attendance !== null ? `${c.attendance}%` : "—"], ["Starts", c.startTime]].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--fg1)" }}>{v}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {classes.length === 0 && <p className="muted">No sections assigned.</p>}
    </>
  );
}

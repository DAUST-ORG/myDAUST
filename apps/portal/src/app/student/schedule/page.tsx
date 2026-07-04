"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type MyEnrollment, getMyEnrollments } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START_HOUR = 8;
const END_HOUR = 18;
const ROW_H = 56;

function parseDays(s: string): number[] {
  const out: number[] = [];
  let i = 0;
  const map: Record<string, number> = { M: 0, T: 1, W: 2, F: 4 };
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
function hourFloat(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! + (m ?? 0) / 60;
}

export default function SchedulePage() {
  const [items, setItems] = useState<MyEnrollment[]>([]);
  useEffect(() => {
    getMyEnrollments().then(setItems).catch(() => {});
  }, []);

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const today = new Date().getDay() - 1; // Mon=0

  return (
    <>
      <p className="eyebrow">Fall 2026</p>
      <h1 className="page-title">Schedule</h1>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `56px repeat(5, minmax(150px, 1fr))`, minWidth: 760 }}>
          {/* header */}
          <div />
          {DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontWeight: 700, fontFamily: "var(--font-display)", padding: "6px 0", color: i === today ? "var(--daust-orange)" : "var(--fg1)", borderBottom: "1px solid var(--border)" }}>
              {d}
            </div>
          ))}

          {/* hours gutter */}
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: ROW_H, fontSize: 11, color: "var(--fg3)", textAlign: "right", paddingRight: 8, transform: "translateY(-6px)" }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* day columns */}
          {DAYS.map((d, di) => (
            <div key={d} style={{ position: "relative", height: hours.length * ROW_H, borderLeft: "1px solid var(--divider)", background: di === today ? "rgba(237,132,37,.03)" : undefined }}>
              {hours.map((h) => (
                <div key={h} style={{ height: ROW_H, borderBottom: "1px solid var(--divider)" }} />
              ))}
              {items
                .filter((e) => parseDays(e.days).includes(di))
                .map((e) => {
                  const top = (hourFloat(e.startTime) - START_HOUR) * ROW_H;
                  const height = (hourFloat(e.endTime) - hourFloat(e.startTime)) * ROW_H;
                  return (
                    <Link
                      key={e.enrollmentId}
                      href={`/student/courses/${e.sectionId}`}
                      style={{
                        position: "absolute", top, left: 4, right: 4, height: height - 4,
                        background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "3px solid var(--daust-navy)",
                        borderRadius: 8, padding: "6px 8px", boxShadow: "var(--shadow-sm)", overflow: "hidden",
                        textDecoration: "none", color: "inherit", display: "block",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{e.courseCode}</div>
                      <div style={{ fontSize: 11, color: "var(--fg2)", lineHeight: 1.2 }}>{e.title}</div>
                      <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>{e.startTime}–{e.endTime} · {e.room}</div>
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No enrolled courses.</p>}
      </div>
    </>
  );
}

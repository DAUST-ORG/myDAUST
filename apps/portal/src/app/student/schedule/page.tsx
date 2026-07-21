"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type MyEnrollment, getCurrentTerm, getMyEnrollments } from "@/lib/api";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { COURSE_COLORS, hourFloat, parseDayIndexes } from "@/lib/student-schedule";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const START_HOUR = 8;
const END_HOUR = 18;
const ROW_H = 56;

export default function SchedulePage() {
  const [items, setItems] = useState<MyEnrollment[]>([]);
  const [term, setTerm] = useState("");

  useEffect(() => {
    getMyEnrollments().then(setItems).catch(() => {});
    getCurrentTerm().then((t) => setTerm(t.name)).catch(() => {});
  }, []);

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const credits = items.reduce((s, e) => s + e.credits, 0);
  const jsDay = new Date().getDay();
  const today = jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : -1;

  return (
    <>
      <PageHeader
        title="Weekly Schedule"
        subtitle={[term || null, `${credits} credits`, `${items.length} courses`].filter(Boolean).join(" · ")}
      />

      {items.length === 0 ? (
        <EmptyState title="No enrolled courses" note="Add sections from Registration to build your week." />
      ) : (
        <Card pad={false}>
          <div style={{ overflowX: "auto", padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "58px repeat(5, minmax(150px, 1fr))", minWidth: 800 }}>
              <div />
              {DAYS.map((d, i) => (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 12.5,
                    padding: "7px 0",
                    color: i === today ? "var(--daust-orange)" : "var(--fg1)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {d}
                </div>
              ))}

              <div>
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{
                      height: ROW_H,
                      fontSize: 11,
                      color: "var(--fg3)",
                      textAlign: "right",
                      paddingRight: 9,
                      transform: "translateY(-6px)",
                    }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {DAYS.map((d, di) => (
                <div
                  key={d}
                  style={{
                    position: "relative",
                    height: hours.length * ROW_H,
                    borderLeft: "1px solid var(--divider)",
                    background: di === today ? "rgba(237,132,37,.03)" : undefined,
                  }}
                >
                  {hours.map((h) => (
                    <div key={h} style={{ height: ROW_H, borderBottom: "1px solid var(--divider)" }} />
                  ))}
                  {items
                    .filter((e) => parseDayIndexes(e.days).includes(di))
                    .map((e) => {
                      const start = hourFloat(e.startTime);
                      const end = hourFloat(e.endTime);
                      if (Number.isNaN(start) || Number.isNaN(end)) return null;
                      const idx = items.findIndex((x) => x.courseCode === e.courseCode);
                      return (
                        <Link
                          key={e.enrollmentId}
                          href={`/student/courses/${e.sectionId}`}
                          style={{
                            position: "absolute",
                            top: (start - START_HOUR) * ROW_H,
                            left: 4,
                            right: 4,
                            height: (end - start) * ROW_H - 6,
                            background: COURSE_COLORS[idx % COURSE_COLORS.length],
                            color: "#fff",
                            borderRadius: 8,
                            padding: "6px 9px",
                            boxShadow: "var(--shadow-sm)",
                            overflow: "hidden",
                            textDecoration: "none",
                            display: "block",
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 11.5 }}>{e.courseCode}</div>
                          <div style={{ fontSize: 10.5, opacity: 0.9, lineHeight: 1.2 }}>{e.title}</div>
                          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>{e.room ?? "Room TBA"}</div>
                        </Link>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

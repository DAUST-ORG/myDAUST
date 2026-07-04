"use client";

import { useEffect, useState } from "react";
import { type Section, type Term, getCurrentTerm, getSections } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START_HOUR = 8;
const END_HOUR = 18;
const ROW_H = 52;
const COLORS = ["#153b6a", "#ed8425", "#1d4a82", "#2e7d52", "#9da6ae", "#c4660f", "#7c3aed"];

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
function hourFloat(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! + (m ?? 0) / 60;
}

export default function MasterSchedulePage() {
  const [term, setTerm] = useState<Term | null>(null);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    getCurrentTerm().then((t) => {
      setTerm(t);
      getSections(t.id).then(setSections).catch(() => {});
    }).catch(() => {});
  }, []);

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <>
      <p className="eyebrow">{term?.name ?? "Current term"}</p>
      <h1 className="page-title">Master Schedule</h1>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `56px repeat(5, minmax(170px, 1fr))`, minWidth: 900 }}>
          <div />
          {DAYS.map((d) => (
            <div key={d} style={{ textAlign: "center", fontWeight: 700, fontFamily: "var(--font-display)", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>{d}</div>
          ))}
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: ROW_H, fontSize: 11, color: "var(--fg3)", textAlign: "right", paddingRight: 8, transform: "translateY(-6px)" }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {DAYS.map((d, di) => (
            <div key={d} style={{ position: "relative", height: hours.length * ROW_H, borderLeft: "1px solid var(--divider)" }}>
              {hours.map((h) => <div key={h} style={{ height: ROW_H, borderBottom: "1px solid var(--divider)" }} />)}
              {sections
                .map((s, i) => ({ s, color: COLORS[i % COLORS.length]! }))
                .filter(({ s }) => {
                  const [days] = s.schedule.split(" ");
                  return parseDays(days ?? "").includes(di);
                })
                .map(({ s, color }) => {
                  const [, times] = s.schedule.split(" ");
                  const [start, end] = (times ?? "").split("–");
                  if (!start || !end) return null;
                  const top = (hourFloat(start) - START_HOUR) * ROW_H;
                  const height = (hourFloat(end) - hourFloat(start)) * ROW_H;
                  return (
                    <div key={s.id} style={{ position: "absolute", top, left: 3, right: 3, height: height - 4, background: "var(--surface)", border: "1px solid var(--gray-100)", borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "4px 7px", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                      <div style={{ fontWeight: 700, fontSize: 11.5 }}>{s.courseCode} · {s.sectionCode}</div>
                      <div className="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>{s.instructor ?? "TBA"} · {s.room ?? "—"}</div>
                      <div className="muted" style={{ fontSize: 10 }}>{s.seatsTaken}/{s.capacity} enrolled</div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="h1" style={{ fontSize: 16 }}>Sections ({sections.length})</p>
        <table>
          <thead><tr><th>Course</th><th>Sec</th><th>Schedule</th><th>Room</th><th>Instructor</th><th>Enrollment</th></tr></thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.courseCode}</strong> — {s.title}</td>
                <td>{s.sectionCode}</td>
                <td>{s.schedule}</td>
                <td>{s.room ?? "—"}</td>
                <td>{s.instructor ?? "TBA"}</td>
                <td>{s.seatsTaken}/{s.capacity} {s.seatsLeft === 0 && <span className="badge overdue">full</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Panel } from "@/components/Panel";
import { type Advisee, getAdvisees } from "@/lib/api";

const OFFICE_SLOTS = [
  { time: "10:00", student: "Open slot" },
  { time: "10:30", student: "Open slot" },
  { time: "11:00", student: "Open slot" },
  { time: "11:30", student: "Open slot" },
];

export default function AdvisingPage() {
  const [advisees, setAdvisees] = useState<Advisee[]>([]);
  useEffect(() => {
    getAdvisees().then(setAdvisees).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Student support</p>
      <h1 className="page-title">Advising</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}>
        <Panel title={`My advisees · ${advisees.length}`} pad="4px 20px 12px">
          {advisees.length === 0 && <p className="muted" style={{ padding: "14px 0" }}>No advisees yet.</p>}
          {advisees.map((a, i) => (
            <div key={a.studentNo} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: i < advisees.length - 1 ? "1px solid var(--divider)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                  {a.atRisk && <span className="badge overdue">At risk</span>}
                  {a.deansList && <span className="badge completed">Dean&rsquo;s list</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.studentNo} · {a.program}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: a.gpa > 0 && a.gpa < 2.5 ? "#c0392b" : "var(--fg1)" }}>{a.gpa > 0 ? a.gpa.toFixed(1) : "—"}</div>
                <div className="muted" style={{ fontSize: 10.5, letterSpacing: ".04em" }}>GPA</div>
              </div>
            </div>
          ))}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Panel title="Office hours · Today">
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Tue & Thu 10:00–12:00 · Engineering Block, Room 214</div>
            {OFFICE_SLOTS.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < OFFICE_SLOTS.length - 1 ? "1px solid var(--divider)" : "none" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, width: 46 }}>{s.time}</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--gray-300)" }}>{s.student}</span>
                <span className="badge pending">Open</span>
              </div>
            ))}
          </Panel>
          <Panel title="Booking link">
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Students can book open slots via your advising link.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, background: "var(--gray-50)", border: "1px solid var(--gray-100)", borderRadius: 9, padding: "10px 12px" }}>
              <MapPin size={15} color="var(--daust-steel)" />
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>daust.edu/advising/a.ba</span>
              <button className="primary" style={{ padding: "6px 12px", fontSize: 12 }}>Copy</button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

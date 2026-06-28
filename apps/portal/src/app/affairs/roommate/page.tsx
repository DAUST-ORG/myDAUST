"use client";

import { useEffect, useState } from "react";
import { type RoommateMatches, getRoommateMatches, getRoommateSubjects } from "@/lib/api";

export default function RoommatePage() {
  const [subjects, setSubjects] = useState<{ studentId: string; name: string }[]>([]);
  const [sel, setSel] = useState("");
  const [data, setData] = useState<RoommateMatches | null>(null);

  useEffect(() => {
    getRoommateSubjects().then((s) => { setSubjects(s); if (s[0]) setSel(s[0].studentId); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sel) return;
    getRoommateMatches(sel).then(setData).catch(() => setData(null));
  }, [sel]);

  function scoreColor(s: number) {
    return s >= 80 ? "#2e7d52" : s >= 60 ? "var(--daust-orange)" : "var(--daust-steel)";
  }

  return (
    <>
      <p className="eyebrow">Residence</p>
      <h1 className="page-title">Roommate Matching</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <label><span className="muted" style={{ fontSize: 12, marginRight: 8 }}>Match for</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>{subjects.map((s) => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}</select>
        </label>
        {data && (
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Preferences: {Object.entries(data.subject.prefs).map(([k, v]) => `${k} ${v}`).join(" · ")}
          </p>
        )}
      </div>

      {data?.matches.length === 0 && <p className="muted">No candidates with a roommate profile yet.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {data?.matches.map((m) => (
          <div key={m.studentId} className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", border: `3px solid ${scoreColor(m.score)}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, color: scoreColor(m.score), flexShrink: 0 }}>{m.score}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{m.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{m.hall} · {m.room}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {m.shared.map((s) => <span key={s} className="badge completed" style={{ fontSize: 11 }}>{s}</span>)}
              {m.diff.map((d) => <span key={d} className="badge pending" style={{ fontSize: 11 }}>≠ {d}</span>)}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Compatibility is a weighted preference overlap (sleep 30 · tidiness 30 · social 20 · study 20). Phase 6 upgrades this to the AI matcher.</p>
    </>
  );
}

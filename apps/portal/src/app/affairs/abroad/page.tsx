"use client";

import { useCallback, useEffect, useState } from "react";
import { type AbroadProgram, adjustAbroadSeat, getAbroadPrograms } from "@/lib/api-affairs";

const STATUS_BADGE: Record<string, string> = {
  open: "completed",
  full: "pending",
  closed: "cancelled",
};

export default function AbroadPage() {
  const [programs, setPrograms] = useState<AbroadProgram[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getAbroadPrograms().then(setPrograms).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function seat(id: string, delta: 1 | -1) {
    setBusy(id);
    try {
      await adjustAbroadSeat(id, delta);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="eyebrow">Global</p>
      <h1 className="page-title">Study Abroad & Internships</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Exchange partnerships and internship placements — seats, deadlines, and application status.
      </p>

      {programs.length === 0 && <p className="muted">No programs.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {programs.map((p) => {
          const pct = p.seatsTotal === 0 ? 0 : Math.round((p.seatsTaken / p.seatsTotal) * 100);
          return (
            <div key={p.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 15 }}>{p.name}</p>
                  <p className="muted" style={{ margin: "3px 0 0", fontSize: 12.5 }}>
                    {p.kind} &middot; {p.partner}
                  </p>
                </div>
                <span className={`badge ${STATUS_BADGE[p.status] ?? "pending"}`}>{p.status}</span>
              </div>

              <div style={{ margin: "14px 0 6px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Seats {p.seatsTaken}/{p.seatsTotal}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{pct}% filled</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "var(--gray-100)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: pct >= 100 ? "#b45f13" : "var(--daust-navy)",
                    transition: "width 200ms",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Deadline: {p.deadline ? new Date(p.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button
                    onClick={() => seat(p.id, -1)}
                    disabled={busy === p.id || p.seatsTaken <= 0}
                    title="Release a seat"
                    style={{ width: 30, fontSize: 14 }}
                  >
                    −
                  </button>
                  <button
                    onClick={() => seat(p.id, 1)}
                    disabled={busy === p.id || p.seatsTaken >= p.seatsTotal}
                    title="Fill a seat"
                    style={{ width: 30, fontSize: 14 }}
                  >
                    +
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

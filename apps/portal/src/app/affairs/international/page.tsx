"use client";

import { useCallback, useEffect, useState } from "react";
import { type OnboardingCase, getInternationalCases, toggleOnboardingTask } from "@/lib/api-affairs";

const VISA_COLORS: Record<string, { bg: string; fg: string }> = {
  Valid: { bg: "rgba(34,150,83,0.12)", fg: "#227a4a" },
  Pending: { bg: "rgba(237,132,37,0.14)", fg: "#b45f13" },
  "Action needed": { bg: "rgba(220,53,69,0.12)", fg: "#b02a37" },
};

function VisaBadge({ status }: { status: string }) {
  const c = VISA_COLORS[status] ?? { bg: "var(--gray-100)", fg: "var(--fg2)" };
  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.fg, border: "none" }}
    >
      Visa: {status}
    </span>
  );
}

export default function InternationalPage() {
  const [cases, setCases] = useState<OnboardingCase[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getInternationalCases().then(setCases).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function toggle(c: OnboardingCase, index: number) {
    const task = c.tasks[index];
    if (!task) return;
    setBusy(`${c.id}:${index}`);
    try {
      await toggleOnboardingTask(c.id, index, !task.done);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="eyebrow">Global</p>
      <h1 className="page-title">International Onboarding</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Arrival cases for exchange, graduate, and degree-seeking international students — visa status and onboarding checklists.
      </p>

      {cases.length === 0 && <p className="muted">No onboarding cases.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {cases.map((c) => {
          const done = c.tasks.filter((t) => t.done).length;
          const pct = c.tasks.length === 0 ? 0 : Math.round((done / c.tasks.length) * 100);
          return (
            <div key={c.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 16 }}>{c.name}</p>
                  <p className="muted" style={{ margin: "3px 0 0", fontSize: 12.5 }}>
                    {c.origin} &middot; {c.kind}
                  </p>
                </div>
                <VisaBadge status={c.visaStatus} />
              </div>

              <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 12px" }}>
                Arrival: {c.arrivalDate ? new Date(c.arrivalDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "TBD"}
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--gray-100)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 4,
                      background: pct === 100 ? "#229653" : "var(--daust-orange)",
                      transition: "width 200ms",
                    }}
                  />
                </div>
                <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {done}/{c.tasks.length}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {c.tasks.map((t, i) => (
                  <label
                    key={`${t.label}-${i}`}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: t.done ? "var(--fg3)" : "var(--fg1)" }}
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      disabled={busy === `${c.id}:${i}`}
                      onChange={() => toggle(c, i)}
                    />
                    <span style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

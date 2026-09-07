"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type FeeItem,
  type PlanPickingConfig,
  getFeeConfig,
  getMe,
  getPlanPicking,
  updateFeeItem,
  updatePlanPicking,
} from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;
// The admissions office owns these two; tuition / housing / cafeteria live in
// Finance (Fees & Payment Schedule) and never appear here.
const ADMISSIONS_KEYS = ["application_fee", "insurance"];

export default function AdmissionsFeesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [picking, setPicking] = useState<PlanPickingConfig | null>(null);
  const [pickEnabled, setPickEnabled] = useState(false);
  const [pickDeadline, setPickDeadline] = useState("");
  const [pickNote, setPickNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getFeeConfig()
      .then((all) => setFees(all.filter((f) => ADMISSIONS_KEYS.includes(f.key))))
      .catch(() => {});
    getPlanPicking()
      .then((p) => {
        setPicking(p);
        setPickEnabled(p.enabled);
        setPickDeadline(p.deadline ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getMe()
      .then((m) =>
        setAllowed(m.roles.includes("admissions") || m.roles.includes("admin")),
      )
      .catch(() => setAllowed(false));
    load();
  }, [load]);

  async function save(key: string) {
    try {
      await updateFeeItem(key, { minXof: Number(amount) });
      setEditKey(null);
      setNote("Fee updated (audit-logged) — checkout and revenue use the new value.");
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function savePicking() {
    try {
      await updatePlanPicking({
        enabled: pickEnabled,
        deadline: pickDeadline === "" ? null : pickDeadline,
      });
      setPickNote("Plan-picking window saved.");
      load();
    } catch (e) {
      setPickNote((e as Error).message);
    }
  }

  if (allowed === null) return <p className="muted">Loading…</p>;
  if (!allowed)
    return <p className="muted">Only the admissions office can edit these fees.</p>;

  return (
    <>
      <p className="eyebrow">Admissions</p>
      <h1 className="page-title">Admissions Fees</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 20 }}>
        Application fee and student insurance — kept apart from system settings and the
        annual Finance package (tuition, housing, cafeteria).
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 16 }}>Applicant plan picking</p>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Accepted applicants pick their own housing/cafeteria plan from their status
          page until the deadline. Picks arrive as preferences that staff apply at accept.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={pickEnabled}
              onChange={(e) => setPickEnabled(e.target.checked)}
            />
            Open for picking
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
            Deadline
            <input
              type="date"
              value={pickDeadline}
              onChange={(e) => setPickDeadline(e.target.value)}
            />
          </label>
          <button className="primary" onClick={savePicking} style={{ fontSize: 12 }}>
            Save window
          </button>
          {pickNote && (
            <span className="muted" style={{ fontSize: 12 }}>{pickNote}</span>
          )}
        </div>
        {picking && !picking.enabled && (
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Currently closed — applicants see their saved pick but cannot change it.
          </p>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="h1" style={{ fontSize: 16, flex: 1 }}>Fee references</p>
          {note && (
            <span className="muted" style={{ fontSize: 12 }}>{note}</span>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Fee</th>
              <th>Amount</th>
              <th>Period</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.key}>
                <td><strong>{f.label}</strong></td>
                <td>
                  {editKey === f.key ? (
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      style={{ width: 140 }}
                    />
                  ) : (
                    <>{xof(f.minXof)}{f.maxXof != null && ` – ${xof(f.maxXof)}`}</>
                  )}
                </td>
                <td><span className="muted">/ {f.period}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{f.note}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editKey === f.key ? (
                    <>
                      <button className="primary" onClick={() => save(f.key)} style={{ fontSize: 12, marginRight: 6 }}>
                        Save
                      </button>
                      <button onClick={() => setEditKey(null)} style={{ fontSize: 12 }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setEditKey(f.key);
                        setAmount(f.minXof);
                      }}
                      style={{ fontSize: 12 }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

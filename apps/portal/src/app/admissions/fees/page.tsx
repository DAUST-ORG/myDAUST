"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type FeeItem,
  getFeeConfig,
  getMe,
  updateFeeItem,
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

  const load = useCallback(() => {
    getFeeConfig()
      .then((all) => setFees(all.filter((f) => ADMISSIONS_KEYS.includes(f.key))))
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

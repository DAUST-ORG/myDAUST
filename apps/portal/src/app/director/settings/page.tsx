"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  type FeeItem,
  getCurrentTerm,
  getFeeConfig,
  getMe,
  updateFeeItem,
} from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;
const PACKAGE_FEE_KEYS = new Set(["tuition", "housing", "cafeteria"]);
const managedInFeeSchedule = (fee: FeeItem) =>
  fee.managedBy === "fee_schedule" ||
  fee.editable === false ||
  PACKAGE_FEE_KEYS.has(fee.key);

/** Institution facts; `Current term` is filled from live Term data at render. */
function generalRows(currentTerm: string): [string, string][] {
  return [
    ["Institution", "Dakar American University of Science & Technology"],
    ["Current term", currentTerm],
    ["Language of instruction", "English"],
    ["Accreditation", "ANAQ-Sup"],
    ["Payment operations", "Wave · Orange Money · Bank · PI-SPI"],
  ];
}

export default function SettingsPage() {
  // Fees and templates are admin-only writes on this screen; the admissions
  // office edits its own templates and fees under /admissions.
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentTerm, setCurrentTerm] = useState("—");

  const load = useCallback(() => {
    getMe()
      .then((m) => {
        setIsAdmin(m.roles.includes("admin"));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    getCurrentTerm()
      .then((t) => setCurrentTerm(t.name))
      .catch(() => {});
  }, [load]);


  return (
    <>
      <p className="eyebrow">System</p>
      <h1 className="page-title">System Settings</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 20 }}>
        Institution configuration and fee references.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 16 }}>
          General
        </p>
        <table>
          <tbody>
            {generalRows(currentTerm).map(([k, v]) => (
              <tr key={k}>
                <td className="muted" style={{ width: "35%" }}>
                  {k}
                </td>
                <td>
                  <strong>{v}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FeesEditor editable={isAdmin} />

      {isAdmin && (
        <div className="card">
          <p className="h1" style={{ fontSize: 16 }}>Users &amp; roles</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Accounts, roles, password resets and suspension moved to{" "}
            <a href="/director/users">Director &rarr; Users</a>, which covers every account
            rather than only those already holding a role.
          </p>
        </div>
      )}
    </>
  );
}

function FeesEditor({ editable }: { editable: boolean }) {
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [row, setRow] = useState<{
    minXof: number;
    maxXof: string;
    period: string;
  }>({ minXof: 0, maxXof: "", period: "year" });
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getFeeConfig()
      .then(setFees)
      .catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function save(key: string) {
    try {
      await updateFeeItem(key, {
        minXof: Number(row.minXof),
        maxXof: row.maxXof === "" ? null : Number(row.maxXof),
        period: row.period,
      });
      setEditKey(null);
      setNote(
        "Fee updated (audit-logged) — vitrine, checkout, and revenue now use the new value.",
      );
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <p className="h1" style={{ fontSize: 16, flex: 1 }}>
          Fee references
        </p>
        {note && (
          <span className="muted" style={{ fontSize: 12 }}>
            {note}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 12px",
          margin: "10px 0 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--accent-bg)",
          color: "var(--fg2)",
          fontSize: 12,
        }}
      >
        <span>
          Annual student charges are controlled by the approved package and are
          read-only here.
        </span>
        <Link
          href="/finance/fee-schedule"
          style={{ color: "var(--daust-navy)", fontWeight: 700 }}
        >
          Open Fees &amp; Payment Schedule →
        </Link>
      </div>
      <table>
        <thead>
          <tr>
            <th>Fee</th>
            <th>Amount</th>
            <th>Period</th>
            <th>Note</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {fees.map((f) => (
            <tr key={f.key}>
              <td>
                <strong>{f.label}</strong>
              </td>
              <td>
                {editKey === f.key ? (
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="number"
                      value={row.minXof}
                      onChange={(e) =>
                        setRow({ ...row, minXof: Number(e.target.value) })
                      }
                      style={{ width: 120 }}
                    />
                    <span className="muted">–</span>
                    <input
                      type="number"
                      value={row.maxXof}
                      onChange={(e) =>
                        setRow({ ...row, maxXof: e.target.value })
                      }
                      placeholder="max (opt.)"
                      style={{ width: 120 }}
                    />
                  </span>
                ) : (
                  <>
                    {xof(f.minXof)}
                    {f.maxXof != null && ` – ${xof(f.maxXof)}`}
                  </>
                )}
              </td>
              <td>
                {editKey === f.key ? (
                  <select
                    value={row.period}
                    onChange={(e) => setRow({ ...row, period: e.target.value })}
                  >
                    <option value="year">year</option>
                    <option value="semester">semester</option>
                    <option value="one-time">one-time</option>
                  </select>
                ) : (
                  <span className="muted">/ {f.period}</span>
                )}
              </td>
              <td className="muted" style={{ fontSize: 12 }}>
                {f.note}
              </td>
              {editable && (
                <td style={{ whiteSpace: "nowrap" }}>
                  {managedInFeeSchedule(f) ? (
                    <span className="badge pending">Managed in Finance</span>
                  ) : editKey === f.key ? (
                    <>
                      <button
                        className="primary"
                        onClick={() => save(f.key)}
                        style={{ fontSize: 12, marginRight: 6 }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditKey(null)}
                        style={{ fontSize: 12 }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setEditKey(f.key);
                        setRow({
                          minXof: f.minXof,
                          maxXof: f.maxXof?.toString() ?? "",
                          period: f.period,
                        });
                      }}
                      style={{ fontSize: 12 }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

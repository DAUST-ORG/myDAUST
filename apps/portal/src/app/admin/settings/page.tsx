"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  type FeeItem,
  getCurrentTerm,
  getFeeConfig,
  getMe,
  updateFeeItem,
  getEmailTemplates,
  updateEmailTemplates,
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
  // Fees are admin-only writes; a plain registrar views this read-only.
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRegistrar, setIsRegistrar] = useState(false);
  const [currentTerm, setCurrentTerm] = useState("—");

  const load = useCallback(() => {
    getMe()
      .then((m) => {
        setIsAdmin(m.roles.includes("admin"));
        setIsRegistrar(m.roles.includes("registrar"));
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
      <h1 className="page-title">Security & System</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 20 }}>
        Institution configuration, fees and role assignment.
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
      <EmailTemplatesEditor editable={isAdmin || isRegistrar} />

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

// tr fragments need a keyed wrapper when reused; render children directly.
function TrKeyed({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const toArray = (str: string) =>
  str
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
const toStr = (arr?: string[]) => (arr || []).join(", ");

function EmailTemplatesEditor({ editable }: { editable: boolean }) {
  const [templates, setTemplates] = useState({
    applicationSubject: "",
    applicationBody: "",
    applicationCc: [] as string[],
    applicationBcc: [] as string[],
    acceptanceSubject: "",
    acceptanceBody: "",
    acceptanceCc: [] as string[],
    acceptanceBcc: [] as string[],
  });
  const [appCc, setAppCc] = useState("");
  const [appBcc, setAppBcc] = useState("");
  const [accCc, setAccCc] = useState("");
  const [accBcc, setAccBcc] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getEmailTemplates()
      .then((res) => {
        setTemplates({
          applicationSubject: res.applicationSubject || "",
          applicationBody: res.applicationBody || "",
          applicationCc: res.applicationCc || [],
          applicationBcc: res.applicationBcc || [],
          acceptanceSubject: res.acceptanceSubject || "",
          acceptanceBody: res.acceptanceBody || "",
          acceptanceCc: res.acceptanceCc || [],
          acceptanceBcc: res.acceptanceBcc || [],
        });
        setAppCc(toStr(res.applicationCc));
        setAppBcc(toStr(res.applicationBcc));
        setAccCc(toStr(res.acceptanceCc));
        setAccBcc(toStr(res.acceptanceBcc));
      })
      .catch(() => {});
  }, []);

  async function save() {
    try {
      const payload = {
        ...templates,
        applicationCc: toArray(appCc),
        applicationBcc: toArray(appBcc),
        acceptanceCc: toArray(accCc),
        acceptanceBcc: toArray(accBcc),
      };
      await updateEmailTemplates(payload);
      setNote("Saved");
      setTimeout(() => setNote(null), 1500);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <p className="h1" style={{ fontSize: 16, flex: 1 }}>
          Email Templates & Recipient Routing
        </p>
        {note && (
          <span className="muted" style={{ fontSize: 13 }}>
            {note}
          </span>
        )}
        {editable && (
          <button className="primary" onClick={save} style={{ fontSize: 12 }}>
            Save Templates
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Available variables: {"{{firstName}}"}, {"{{lastName}}"},{" "}
        {"{{appFee}}"}
      </p>

      <div style={{ marginTop: 16 }}>
        <strong>Application Submitted Email</strong>
        <div style={{ marginTop: 8 }}>
          <input
            value={templates.applicationSubject}
            onChange={(e) =>
              setTemplates({ ...templates, applicationSubject: e.target.value })
            }
            disabled={!editable}
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="Subject"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 2,
                }}
              >
                CC (comma-separated)
              </label>
              <input
                value={appCc}
                onChange={(e) => setAppCc(e.target.value)}
                disabled={!editable}
                style={{ width: "100%", fontSize: 13 }}
                placeholder="admissions@daust.org"
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 2,
                }}
              >
                BCC (comma-separated)
              </label>
              <input
                value={appBcc}
                onChange={(e) => setAppBcc(e.target.value)}
                disabled={!editable}
                style={{ width: "100%", fontSize: 13 }}
                placeholder="sndao@daust.org"
              />
            </div>
          </div>
          <textarea
            value={templates.applicationBody}
            onChange={(e) =>
              setTemplates({ ...templates, applicationBody: e.target.value })
            }
            disabled={!editable}
            style={{ width: "100%", height: 120, fontFamily: "monospace" }}
            placeholder="HTML Body"
          />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <strong>Application Accepted Email</strong>
        <div style={{ marginTop: 8 }}>
          <input
            value={templates.acceptanceSubject}
            onChange={(e) =>
              setTemplates({ ...templates, acceptanceSubject: e.target.value })
            }
            disabled={!editable}
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="Subject"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 2,
                }}
              >
                CC (comma-separated)
              </label>
              <input
                value={accCc}
                onChange={(e) => setAccCc(e.target.value)}
                disabled={!editable}
                style={{ width: "100%", fontSize: 13 }}
                placeholder="admissions@daust.org"
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 2,
                }}
              >
                BCC (comma-separated)
              </label>
              <input
                value={accBcc}
                onChange={(e) => setAccBcc(e.target.value)}
                disabled={!editable}
                style={{ width: "100%", fontSize: 13 }}
                placeholder="sndao@daust.org"
              />
            </div>
          </div>
          <textarea
            value={templates.acceptanceBody}
            onChange={(e) =>
              setTemplates({ ...templates, acceptanceBody: e.target.value })
            }
            disabled={!editable}
            style={{ width: "100%", height: 120, fontFamily: "monospace" }}
            placeholder="HTML Body"
          />
        </div>
      </div>
    </div>
  );
}

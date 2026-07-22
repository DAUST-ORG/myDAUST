"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_ROLES } from "@mydaust/shared";
import {
  type AppUser,
  type FeeItem,
  type ScholarshipTierRow,
  createScholarshipTier,
  deleteScholarshipTier,
  getFeeConfig,
  getMe,
  getScholarshipConfig,
  getUsers,
  updateFeeItem,
  updateScholarshipTier,
  updateUserRoles,
} from "@/lib/api";

const xof = (n: number) => `${n.toLocaleString("en-US")} XOF`;

const GENERAL = [
  ["Institution", "Dakar American University of Science & Technology"],
  ["Current term", "Fall 2026"],
  ["Language of instruction", "English"],
  ["Accreditation", "ANAQ-Sup"],
  ["Payment gateway", "PayTech (Wave · Orange Money · Card)"],
];

export default function SettingsPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [myId, setMyId] = useState<string>("");
  // Fees, scholarships and role management are all admin-only writes. A plain
  // registrar views this page read-only, and must not fetch the admin users list
  // (that endpoint 403s for them).
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getMe()
      .then((m) => {
        setMyId(m.personId);
        const admin = m.roles.includes("admin");
        setIsAdmin(admin);
        if (admin) getUsers().then(setUsers).catch(() => {});
      })
      .catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  function startEdit(u: AppUser) {
    setEditing(u.id);
    setDraft([...u.roles]);
    setNote(null);
  }
  async function saveRoles(id: string) {
    try {
      await updateUserRoles(id, draft);
      setEditing(null);
      setNote("Roles updated (audit-logged).");
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <>
      <p className="eyebrow">System</p>
      <h1 className="page-title">Security & System</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 20 }}>Institution configuration, fees, scholarships and role assignment.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 16 }}>General</p>
        <table>
          <tbody>
            {GENERAL.map(([k, v]) => (
              <tr key={k}><td className="muted" style={{ width: "35%" }}>{k}</td><td><strong>{v}</strong></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <FeesEditor editable={isAdmin} />
      <TiersEditor editable={isAdmin} />

      {isAdmin && (
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="h1" style={{ fontSize: 16, flex: 1 }}>Users & roles ({users.length})</p>
          {note && <span className="muted" style={{ fontSize: 13 }}>{note}</span>}
        </div>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="muted">{u.email}</td>
                <td>
                  {editing === u.id ? (
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {APP_ROLES.map((r) => (
                        <label key={r} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={draft.includes(r)}
                            onChange={(e) => setDraft(e.target.checked ? [...draft, r] : draft.filter((x) => x !== r))}
                          />
                          {r}
                        </label>
                      ))}
                    </span>
                  ) : (
                    u.roles.map((r) => <span key={r} className="badge pending" style={{ marginRight: 4 }}>{r}</span>)
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {editing === u.id ? (
                    <>
                      <button className="primary" onClick={() => saveRoles(u.id)} style={{ fontSize: 12, marginRight: 6 }}>Save</button>
                      <button onClick={() => setEditing(null)} style={{ fontSize: 12 }}>Cancel</button>
                    </>
                  ) : (
                    u.id !== myId && <button onClick={() => startEdit(u)} style={{ fontSize: 12 }}>Edit roles</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Role changes are audit-logged. You cannot edit your own roles.</p>
      </div>
      )}
    </>
  );
}

function FeesEditor({ editable }: { editable: boolean }) {
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [row, setRow] = useState<{ minXof: number; maxXof: string; period: string }>({ minXof: 0, maxXof: "", period: "year" });
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getFeeConfig().then(setFees).catch(() => {});
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
      setNote("Fee updated (audit-logged) — vitrine, checkout, and revenue now use the new value.");
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <p className="h1" style={{ fontSize: 16, flex: 1 }}>Fee structure (director-configurable)</p>
        {note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
      </div>
      <table>
        <thead><tr><th>Fee</th><th>Amount</th><th>Period</th><th>Note</th>{editable && <th />}</tr></thead>
        <tbody>
          {fees.map((f) => (
            <tr key={f.key}>
              <td><strong>{f.label}</strong></td>
              <td>
                {editKey === f.key ? (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="number" value={row.minXof} onChange={(e) => setRow({ ...row, minXof: Number(e.target.value) })} style={{ width: 120 }} />
                    <span className="muted">–</span>
                    <input type="number" value={row.maxXof} onChange={(e) => setRow({ ...row, maxXof: e.target.value })} placeholder="max (opt.)" style={{ width: 120 }} />
                  </span>
                ) : (
                  <>{xof(f.minXof)}{f.maxXof != null && ` – ${xof(f.maxXof)}`}</>
                )}
              </td>
              <td>
                {editKey === f.key ? (
                  <select value={row.period} onChange={(e) => setRow({ ...row, period: e.target.value })}>
                    <option value="year">year</option><option value="semester">semester</option><option value="one-time">one-time</option>
                  </select>
                ) : (
                  <span className="muted">/ {f.period}</span>
                )}
              </td>
              <td className="muted" style={{ fontSize: 12 }}>{f.note}</td>
              {editable && (
              <td style={{ whiteSpace: "nowrap" }}>
                {editKey === f.key ? (
                  <>
                    <button className="primary" onClick={() => save(f.key)} style={{ fontSize: 12, marginRight: 6 }}>Save</button>
                    <button onClick={() => setEditKey(null)} style={{ fontSize: 12 }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => { setEditKey(f.key); setRow({ minXof: f.minXof, maxXof: f.maxXof?.toString() ?? "", period: f.period }); }} style={{ fontSize: 12 }}>Edit</button>
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

function TiersEditor({ editable }: { editable: boolean }) {
  const [tiers, setTiers] = useState<ScholarshipTierRow[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [row, setRow] = useState({ minScore: 12, pct: 10, band: "" });
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getScholarshipConfig().then(setTiers).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  async function save() {
    try {
      if (adding) await createScholarshipTier(row);
      else if (editId) await updateScholarshipTier(editId, row);
      setEditId(null);
      setAdding(false);
      setNote("Scholarship tiers updated (audit-logged) — new applications award from these.");
      load();
    } catch (e) {
      setNote((e as Error).message);
    }
  }
  async function remove(id: string) {
    await deleteScholarshipTier(id);
    setNote("Tier removed (audit-logged).");
    load();
  }

  const editorRow = (
    <tr>
      <td><input type="number" step="0.1" value={row.minScore} onChange={(e) => setRow({ ...row, minScore: Number(e.target.value) })} style={{ width: 80 }} /></td>
      <td><input type="number" value={row.pct} onChange={(e) => setRow({ ...row, pct: Number(e.target.value) })} style={{ width: 70 }} />%</td>
      <td><input value={row.band} onChange={(e) => setRow({ ...row, band: e.target.value })} placeholder="Band label" /></td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button className="primary" onClick={save} disabled={!row.band.trim()} style={{ fontSize: 12, marginRight: 6 }}>Save</button>
        <button onClick={() => { setEditId(null); setAdding(false); }} style={{ fontSize: 12 }}>Cancel</button>
      </td>
    </tr>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <p className="h1" style={{ fontSize: 16, flex: 1 }}>Merit scholarships — auto-awarded on BAC (director-configurable)</p>
        {note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
        {editable && <button className="primary" onClick={() => { setAdding(true); setEditId(null); setRow({ minScore: 12, pct: 10, band: "" }); }} style={{ fontSize: 12 }}>Add tier</button>}
      </div>
      <table>
        <thead><tr><th>Min BAC</th><th>Discount</th><th>Band</th>{editable && <th />}</tr></thead>
        <tbody>
          {tiers.map((t) =>
            editId === t.id ? (
              <TrKeyed key={t.id}>{editorRow}</TrKeyed>
            ) : (
              <tr key={t.id}>
                <td>≥ {t.minScore}</td>
                <td><strong>{t.pct}%</strong></td>
                <td>{t.band}{t.note && <div className="muted" style={{ fontSize: 11 }}>{t.note}</div>}</td>
                {editable && (
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => { setEditId(t.id); setAdding(false); setRow({ minScore: t.minScore, pct: t.pct, band: t.band }); }} style={{ fontSize: 12, marginRight: 6 }}>Edit</button>
                  <button onClick={() => remove(t.id)} style={{ fontSize: 12 }}>Delete</button>
                </td>
                )}
              </tr>
            ),
          )}
          {adding && <TrKeyed key="new">{editorRow}</TrKeyed>}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Highest matching threshold wins. Changes apply to new applications immediately; the vitrine reads these live.</p>
    </div>
  );
}

// tr fragments need a keyed wrapper when reused; render children directly.
function TrKeyed({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

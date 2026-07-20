"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Link2, LogOut, Plus, Receipt, Search, Trash2, UserPlus, Users, Wallet, X } from "lucide-react";
import {
  type AccountInvoice,
  type Me,
  type StudentAccount,
  type StudentAccountRow,
  addCharge,
  createStudent,
  getMe,
  getStudentAccount,
  listStudentAccounts,
  login,
  logout,
  removeCharge,
} from "@/lib/api";

const fcfa = (n: number) => n.toLocaleString("fr-FR");
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const canAdmin = (me: Me | null): me is Me => !!me && (me.roles.includes("bursar") || me.roles.includes("admin"));
const payBillLink = (studentNo: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/pay-bill?sid=${encodeURIComponent(studentNo)}`;

// Preset charges (label + amount + cost center). Frontend convenience — the API accepts any
// description/amount/cost-center, so staff can also type a custom charge.
const CHARGE_CATALOG = [
  { label: "Tuition — Fall 2026", amountXof: 2_975_000, costCenterCode: "9100" },
  { label: "Lab & technology fee", amountXof: 180_000, costCenterCode: "9100" },
  { label: "Student services fee", amountXof: 95_000, costCenterCode: "9100" },
  { label: "Housing — semester", amountXof: 340_000, costCenterCode: "3700" },
  { label: "Late payment penalty", amountXof: 25_000, costCenterCode: "9100" },
  { label: "Graduation fee", amountXof: 120_000, costCenterCode: "9100" },
  { label: "Field trip levy", amountXof: 120_000, costCenterCode: "9100" },
];
const PROGRAMS = [
  { code: "BSCE", name: "B.Sc. Computer Engineering" },
  { code: "BSEE", name: "B.Sc. Electrical Engineering" },
  { code: "BSME", name: "B.Sc. Mechanical Engineering" },
];

export default function BillingAdminPage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    getMe().then(setMe).catch(() => setMe(null));
  }, []);

  if (me === undefined) {
    return <Centered><p style={{ color: "#5b6675" }}>Loading…</p></Centered>;
  }
  if (!canAdmin(me)) return <LoginView onAuthed={setMe} me={me} />;
  return <Dashboard me={me} onSignOut={() => { logout().finally(() => setMe(null)); }} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: "#e9edf2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-body)" }}>
      {children}
    </main>
  );
}

// ---------------------------------------------------------------- Login
function LoginView({ onAuthed, me }: { onAuthed: (m: Me) => void; me: Me | null }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(me ? "This account isn't a finance user. Sign in as a bursar or admin." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const user = await login(email.trim(), pass);
      if (!canAdmin(user)) { setErr("This account isn't authorized for billing admin."); return; }
      onAuthed(user);
    } catch {
      setErr("Wrong email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, boxShadow: "0 24px 60px rgba(15,44,80,.22)", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(158deg,var(--daust-navy-deep),var(--daust-navy) 70%)", padding: 30, textAlign: "center" }}>
          <img src="/logo-daust.png" alt="DAUST" style={{ height: 30, filter: "brightness(0) invert(1)" }} />
          <div style={{ display: "inline-flex", gap: 5, marginTop: 14 }}>
            <span style={{ width: 22, height: 4, borderRadius: 2, background: "#fff" }} />
            <span style={{ width: 22, height: 4, borderRadius: 2, background: "var(--daust-orange)" }} />
            <span style={{ width: 22, height: 4, borderRadius: 2, background: "var(--daust-steel)" }} />
          </div>
        </div>
        <form onSubmit={submit} style={{ padding: "28px 30px 30px" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, textAlign: "center" }}>Billing Admin</h1>
          <p style={{ color: "#6c7884", fontSize: 13, textAlign: "center", margin: "5px 0 22px" }}>Finance staff sign-in. Manage student bills and payment links.</p>
          {err && <p style={{ background: "rgba(192,57,43,.08)", color: "#c0392b", fontSize: 12.5, fontWeight: 600, padding: "10px 13px", borderRadius: 8, marginBottom: 15 }}>{err}</p>}
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Staff email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={inputStyle} />
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Password</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" style={inputStyle} />
          <button type="submit" disabled={busy || !email || !pass} style={{ ...primaryBtn, width: "100%", marginTop: 6, opacity: busy || !email || !pass ? 0.6 : 1 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ marginTop: 16, textAlign: "center", fontSize: 11.5, color: "#6c7884" }}>Restricted · Finance Office access only</p>
        </form>
      </div>
    </Centered>
  );
}

// ---------------------------------------------------------------- Dashboard
function Dashboard({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [rows, setRows] = useState<StudentAccountRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [charge, setCharge] = useState<{ ids: string[]; label: string } | null>(null);
  const [links, setLinks] = useState<{ studentNo: string; name: string; balance: number }[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => { listStudentAccounts().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => load(), [load]);

  const flash = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2400); }, []);

  const kpis = useMemo(() => {
    const r = rows ?? [];
    return {
      students: r.length,
      outstanding: r.reduce((a, s) => a + s.balance, 0),
      withBalance: r.filter((s) => s.balance > 0).length,
      overdue: r.filter((s) => s.status === "overdue").length,
    };
  }, [rows]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((s) => {
      if (filter === "due" && s.balance <= 0) return false;
      if (filter === "paid" && s.balance > 0) return false;
      if (filter === "over" && s.status !== "overdue") return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.studentNo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filter]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allShownSelected = list.length > 0 && list.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allShownSelected) list.forEach((s) => next.delete(s.id));
    else list.forEach((s) => next.add(s.id));
    return next;
  });

  const rowsById = useMemo(() => new Map((rows ?? []).map((s) => [s.id, s])), [rows]);
  const linksFor = (ids: string[]) =>
    ids
      .map((id) => rowsById.get(id))
      .filter((s): s is StudentAccountRow => !!s && s.balance > 0)
      .map((s) => ({ studentNo: s.studentNo, name: s.name, balance: s.balance }));

  return (
    <main style={{ minHeight: "100vh", background: "#eef1f5", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>
      <header style={{ height: 60, background: "var(--daust-navy)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(16px,3vw,32px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/logo-daust.png" alt="DAUST" style={{ height: 26, filter: "brightness(0) invert(1)" }} />
          <span style={{ color: "rgba(255,255,255,.7)", fontSize: 12, fontWeight: 600, borderLeft: "1px solid rgba(255,255,255,.2)", paddingLeft: 14, letterSpacing: ".02em" }}>Billing Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#fff" }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--daust-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)" }}>{initials(me.name || me.email)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>{me.name || me.email}<br /><span style={{ fontSize: 11, color: "rgba(255,255,255,.68)", fontWeight: 500 }}>{me.roles.includes("bursar") ? "Finance Officer" : "Administrator"}</span></span>
          </div>
          <button onClick={onSignOut} style={{ color: "rgba(255,255,255,.7)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer" }}><LogOut size={15} /> Sign out</button>
        </div>
      </header>

      <div style={{ flex: 1, padding: "clamp(18px,3vw,30px)", maxWidth: 1240, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={kickStyle}>Student Accounts</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26 }}>Manage bills &amp; payment links</h1>
            <p style={{ color: "#6c7884", fontSize: 13.5, marginTop: 4 }}>Add charges to one, several, or all students — then generate payment links.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setAddOpen(true)} style={outlineBtn}><UserPlus size={15} /> Add student</button>
            <button onClick={() => setCharge({ ids: (rows ?? []).map((s) => s.id), label: `all ${kpis.students} students` })} style={navBtn}><Plus size={15} /> Add charge to all students</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
          <Kpi icon={<Users size={15} />} label="Students" value={String(kpis.students)} />
          <Kpi icon={<Wallet size={15} />} label="Total outstanding" value={fcfa(kpis.outstanding)} unit="FCFA" accent />
          <Kpi icon={<Receipt size={15} />} label="With a balance" value={String(kpis.withBalance)} unit={`of ${kpis.students}`} />
          <Kpi icon={<AlertTriangle size={15} />} label="Overdue" value={String(kpis.overdue)} unit="accounts" danger />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 340 }}>
            <Search size={16} color="#6c7884" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID…" style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1.5px solid #d7dee6", borderRadius: 999, fontSize: 13.5, background: "#fff", outline: "none" }} />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "10px 13px", border: "1.5px solid #d7dee6", borderRadius: 999, fontSize: 13, fontWeight: 600, color: "#4d5965", background: "#fff", cursor: "pointer" }}>
            <option value="all">All accounts</option>
            <option value="due">With balance</option>
            <option value="paid">Fully paid</option>
            <option value="over">Overdue</option>
          </select>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setLinks(linksFor((rows ?? []).map((s) => s.id)))}
            style={outlineBtn}
          ><Link2 size={15} /> Bulk links for all with balance</button>
        </div>

        {selected.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--daust-navy)", color: "#fff", borderRadius: 14, padding: "11px 16px", marginBottom: 14, boxShadow: "0 6px 20px rgba(15,44,80,.12)" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}><span style={{ color: "var(--daust-orange)" }}>{selected.size}</span> selected</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setCharge({ ids: [...selected], label: `${selected.size} selected student${selected.size > 1 ? "s" : ""}` })} style={bulkBtn("var(--daust-orange)")}><Plus size={15} /> Add charge</button>
            <button onClick={() => setLinks(linksFor([...selected]))} style={bulkBtn("rgba(255,255,255,.14)")}><Link2 size={15} /> Generate links</button>
            <button onClick={() => setSelected(new Set())} style={{ ...bulkBtn("transparent"), color: "rgba(255,255,255,.72)" }}>Clear</button>
          </div>
        )}

        <div style={{ background: "#fff", border: "1px solid #d7dee6", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,44,80,.1)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 44 }}><CheckBox on={allShownSelected} onClick={toggleAll} /></th>
                  {["Student", "Program", "Charges", "Balance", "Status", ""].map((h, i) => (
                    <th key={h || "act"} style={{ ...thStyle, textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#6c7884" }}>Loading accounts…</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#6c7884" }}>No students match.</td></tr>
                ) : list.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid #edf1f5", background: selected.has(s.id) ? "#eef2f8" : undefined }}>
                    <td style={tdStyle}><CheckBox on={selected.has(s.id)} onClick={() => toggle(s.id)} /></td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)", flexShrink: 0 }}>{initials(s.name)}</span>
                        <span><span style={{ display: "block", color: "#141a21", fontWeight: 600 }}>{s.name}</span><span style={{ fontSize: 11.5, color: "#6c7884" }}>{s.studentNo}</span></span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: "#6c7884" }}>{s.program ?? "—"}</td>
                    <td style={{ ...tdStyle, color: "#6c7884" }}>{s.openCharges} open</td>
                    <td style={tdStyle}><span style={{ fontWeight: 700, color: s.balance <= 0 ? "#2e7d52" : "#141a21", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{s.balance <= 0 ? "Cleared" : `${fcfa(s.balance)} FCFA`}</span></td>
                    <td style={tdStyle}><StatusPill status={s.status} /></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => setDrawerId(s.id)} style={{ color: "var(--daust-navy)", fontWeight: 600, fontSize: 12.5, padding: "6px 12px", borderRadius: 999, border: "1px solid #d7dee6", background: "#fff", cursor: "pointer" }}>Manage</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer style={{ textAlign: "center", padding: 16, fontSize: 11.5, color: "#7b8794" }}><strong style={{ color: "#4d5965" }}>DAUST Pay</strong> · Billing Admin</footer>

      {drawerId && <ManageDrawer studentId={drawerId} onClose={() => setDrawerId(null)} onChanged={load} flash={flash} />}
      {addOpen && (
        <AddStudentModal
          onClose={() => setAddOpen(false)}
          onCreated={(id) => { setAddOpen(false); load(); setDrawerId(id); flash("Student created"); }}
        />
      )}
      {charge && (
        <BulkChargeModal
          scopeLabel={charge.label}
          onClose={() => setCharge(null)}
          onApply={async (description, amountXof, costCenterCode) => {
            const res = await addCharge({ studentIds: charge.ids, description, amountXof, costCenterCode });
            setCharge(null); setSelected(new Set()); load();
            flash(`Charge added to ${res.count} student${res.count > 1 ? "s" : ""}`);
          }}
        />
      )}
      {links && <LinksModal items={links} onClose={() => setLinks(null)} />}
      {toast && <Toast>{toast}</Toast>}
    </main>
  );
}

function CheckBox({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ width: 18, height: 18, border: `1.5px solid ${on ? "var(--daust-navy)" : "#bcc6d1"}`, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: on ? "var(--daust-navy)" : "#fff", flexShrink: 0, verticalAlign: "middle" }}
    >
      {on && <Check size={12} color="#fff" strokeWidth={3} />}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    paid: { bg: "rgba(46,125,82,.13)", fg: "#2e7d52", label: "Paid" },
    overdue: { bg: "rgba(192,57,43,.1)", fg: "#c0392b", label: "Overdue" },
    due: { bg: "rgba(237,132,37,.14)", fg: "#d6731a", label: "Due" },
  };
  const s = map[status] ?? { bg: "rgba(237,132,37,.14)", fg: "#d6731a", label: "Due" };
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.fg }}>{s.label}</span>;
}

function Kpi({ icon, label, value, unit, accent, danger }: { icon: React.ReactNode; label: string; value: string; unit?: string; accent?: boolean; danger?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #d7dee6", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 3px rgba(15,44,80,.1)" }}>
      <div style={{ fontSize: 12, color: "#6c7884", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "var(--daust-navy)", display: "inline-flex" }}>{icon}</span>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, marginTop: 8, color: danger ? "#c0392b" : accent ? "#d6731a" : "#141a21" }}>{value}{unit && <small style={{ fontSize: 12, fontWeight: 600, color: "#6c7884" }}> {unit}</small>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Shared add-charge form
function AddChargeForm({ onSubmit, busy }: { onSubmit: (description: string, amountXof: number, costCenterCode: string) => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cc, setCc] = useState("9100");
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        {CHARGE_CATALOG.map((c, i) => (
          <button
            key={c.label}
            type="button"
            onClick={() => { setName(c.label); setAmount(fcfa(c.amountXof)); setCc(c.costCenterCode); setPicked(i); }}
            style={{ border: `1.5px solid ${picked === i ? "var(--daust-navy)" : "#d7dee6"}`, borderRadius: 999, background: picked === i ? "#eef2f8" : "#fff", color: picked === i ? "var(--daust-navy)" : "#4d5965", fontWeight: 600, fontSize: 12, padding: "7px 12px", cursor: "pointer" }}
          >{c.label}</button>
        ))}
      </div>
      <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Description</label>
      <input value={name} onChange={(e) => { setName(e.target.value); setPicked(null); }} placeholder="e.g. Tuition — Fall 2026" style={inputStyle} />
      <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Amount</label>
      <div style={{ position: "relative", margin: "6px 0 15px" }}>
        <input value={amount} onChange={(e) => setAmount(digits(e.target.value) ? fcfa(digits(e.target.value)) : "")} inputMode="numeric" placeholder="0" style={{ ...inputStyle, margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, paddingRight: 50 }} />
        <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, fontWeight: 600, color: "#6c7884" }}>FCFA</span>
      </div>
      <button
        disabled={busy || !name.trim() || digits(amount) <= 0}
        onClick={() => onSubmit(name.trim(), digits(amount), cc)}
        style={{ ...primaryBtn, width: "100%", opacity: busy || !name.trim() || digits(amount) <= 0 ? 0.5 : 1 }}
      ><Plus size={16} /> {busy ? "Adding…" : "Add charge"}</button>
    </>
  );
}

// ---------------------------------------------------------------- Add student
function AddStudentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [programCode, setProgramCode] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");
  const [billTuition, setBillTuition] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!fullName.trim() || !dob) return;
    setBusy(true); setErr(null);
    try {
      const { id } = await createStudent({
        fullName: fullName.trim(),
        dateOfBirth: dob,
        studentNo: studentNo.trim() || undefined,
        email: email.trim() || undefined,
        programCode: programCode || undefined,
        billTuition,
      });
      onCreated(id);
    } catch (e) {
      setErr((e as Error).message.replace(/^\d+:\s*/, "") || "Could not create the student.");
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Add student" onClose={onClose}>
      <div style={scopeNote}><UserPlus size={18} color="var(--daust-orange)" style={{ flexShrink: 0 }} /><span>Creates a real student on the platform. Leave the ID blank to auto-generate one.</span></div>
      {err && <p style={{ background: "rgba(192,57,43,.08)", color: "#c0392b", fontSize: 12.5, fontWeight: 600, padding: "10px 13px", borderRadius: 8, marginBottom: 14 }}>{err}</p>}
      <label style={fieldLabel}>Full name</label>
      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Awa Diop" style={inputStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={fieldLabel}>Date of birth</label>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max="2012-12-31" min="1975-01-01" style={inputStyle} />
        </div>
        <div>
          <label style={fieldLabel}>Program</label>
          <select value={programCode} onChange={(e) => setProgramCode(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">— None —</option>
            {PROGRAMS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <label style={fieldLabel}>Student ID <span style={{ fontWeight: 500, color: "#9aa4b0" }}>· optional (auto if blank)</span></label>
      <input value={studentNo} onChange={(e) => setStudentNo(e.target.value)} placeholder="Registrar ID, or leave blank" style={inputStyle} />
      <label style={fieldLabel}>Email <span style={{ fontWeight: 500, color: "#9aa4b0" }}>· optional</span></label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="auto-generated from ID" style={inputStyle} />
      <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 600, color: "#4d5965", cursor: "pointer", marginTop: 2 }}>
        <input type="checkbox" checked={billTuition} onChange={(e) => setBillTuition(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--daust-navy)" }} />
        Bill standard tuition ({fcfa(2_975_000)} FCFA, 4 installments)
      </label>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy || !fullName.trim() || !dob} style={{ ...primaryBtn, opacity: busy || !fullName.trim() || !dob ? 0.5 : 1 }}>{busy ? "Creating…" : "Create student"}</button>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------- Bulk / all add-charge
function BulkChargeModal({ scopeLabel, onClose, onApply }: { scopeLabel: string; onClose: () => void; onApply: (description: string, amountXof: number, costCenterCode: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <ModalShell title="Add charge" onClose={onClose}>
      <div style={scopeNote}><Users size={18} color="var(--daust-orange)" style={{ flexShrink: 0 }} /><span>This charge will be applied to <b>{scopeLabel}</b>.</span></div>
      {err && <p style={{ background: "rgba(192,57,43,.08)", color: "#c0392b", fontSize: 12.5, fontWeight: 600, padding: "10px 13px", borderRadius: 8, marginBottom: 14 }}>{err}</p>}
      <AddChargeForm
        busy={busy}
        onSubmit={async (d, a, cc) => {
          setBusy(true); setErr(null);
          try { await onApply(d, a, cc); }
          catch (e) { setErr((e as Error).message.replace(/^\d+:\s*/, "") || "Could not add the charge."); setBusy(false); }
        }}
      />
    </ModalShell>
  );
}

// ---------------------------------------------------------------- Payment links list
function LinksModal({ items, onClose }: { items: { studentNo: string; name: string; balance: number }[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1400); };

  return (
    <ModalShell title={items.length > 1 ? "Payment links" : "Payment link"} onClose={onClose}>
      {items.length === 0 ? (
        <div style={{ padding: "34px 10px", textAlign: "center", color: "#6c7884" }}>
          <Check size={38} color="#2e7d52" style={{ margin: "0 auto 8px", display: "block" }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "#4d5965" }}>Nothing to collect</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>All selected accounts are fully paid.</div>
        </div>
      ) : (
        <>
          <div style={scopeNote}><Link2 size={18} color="var(--daust-orange)" style={{ flexShrink: 0 }} /><span><b>{items.length}</b> payment link{items.length > 1 ? "s" : ""}. Each opens the pay page with the ID pre-filled; the payer enters their date of birth.</span></div>
          {items.map((s) => {
            const url = payBillLink(s.studentNo);
            return (
              <div key={s.studentNo} style={{ border: "1px solid #d7dee6", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, fontFamily: "var(--font-display)" }}>{initials(s.name)}</span>
                  <span style={{ fontWeight: 600, color: "#141a21", fontSize: 13.5 }}>{s.name}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 700, color: "#d6731a", fontVariantNumeric: "tabular-nums" }}>{fcfa(s.balance)} FCFA</span>
                </div>
                <div style={linkBox}>
                  <input readOnly value={url} style={{ flex: 1, border: "none", background: "none", fontSize: 12.5, color: "#4d5965", outline: "none", textOverflow: "ellipsis" }} />
                  <button onClick={() => copy(s.studentNo, url)} style={copyBtn(copied === s.studentNo)}>{copied === s.studentNo ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
                </div>
              </div>
            );
          })}
          {items.length > 1 && (
            <button
              onClick={() => copy("__all", items.map((s) => `${s.name}: ${payBillLink(s.studentNo)}`).join("\n"))}
              style={{ ...primaryBtn, width: "100%", marginTop: 4 }}
            >{copied === "__all" ? <><Check size={15} /> Copied all</> : <><Copy size={15} /> Copy all {items.length} links</>}</button>
          )}
        </>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------- Manage drawer
function ManageDrawer({ studentId, onClose, onChanged, flash }: { studentId: string; onClose: () => void; onChanged: () => void; flash: (m: string) => void }) {
  const [acct, setAcct] = useState<StudentAccount | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<AccountInvoice | null>(null);

  const reload = useCallback(() => { getStudentAccount(studentId).then(setAcct).catch(() => setAcct(null)); }, [studentId]);
  useEffect(() => reload(), [reload]);

  const balance = acct?.totals.balance ?? 0;
  const payments = acct?.invoices.flatMap((i) => i.payments) ?? [];
  const link = acct ? payBillLink(acct.student.studentNo) : "";

  async function onAddCharge(description: string, amountXof: number, costCenterCode: string) {
    setBusy(true);
    try {
      await addCharge({ studentIds: [studentId], description, amountXof, costCenterCode });
      reload(); onChanged(); flash("Charge added");
    } finally {
      setBusy(false);
    }
  }
  async function confirmRemove() {
    if (!pendingRemove) return;
    const wasPaid = pendingRemove.paid > 0;
    setBusy(true);
    try {
      await removeCharge(pendingRemove.id);
      setPendingRemove(null);
      reload(); onChanged();
      flash(wasPaid ? "Charge removed — paid amount reversed to account credit" : "Charge removed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,44,80,.34)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "96vw", height: "100%", background: "#fff", boxShadow: "0 24px 60px rgba(15,44,80,.22)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #d7dee6" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Manage bill</h3>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: "50%", color: "#6c7884", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
          {!acct ? <p style={{ color: "#6c7884" }}>Loading…</p> : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <span style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, fontFamily: "var(--font-display)" }}>{initials(acct.student.name)}</span>
                <div><div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{acct.student.name}</div><div style={{ fontSize: 12.5, color: "#6c7884" }}>{acct.student.studentNo} · {acct.student.program}</div></div>
              </div>

              <div style={{ background: "linear-gradient(158deg,var(--daust-navy-deep),var(--daust-navy) 70%)", color: "#fff", borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)" }}>{balance < 0 ? "Account credit" : "Outstanding balance"}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, marginTop: 4 }}>{fcfa(Math.abs(balance))}<small style={{ fontSize: ".4em", color: "rgba(255,255,255,.72)", marginLeft: 5 }}>FCFA{balance < 0 ? " credit" : ""}</small></div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.72)", marginTop: 6 }}>Billed {fcfa(acct.totals.billed)} · Paid {fcfa(acct.totals.paid)} FCFA</div>
              </div>

              <SectionKick>Charges on account</SectionKick>
              {acct.invoices.length === 0 ? <p style={{ color: "#6c7884", fontSize: 13 }}>No charges yet.</p> : acct.invoices.map((inv) => {
                const isCredit = inv.total < 0;
                return (
                  <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #edf1f5" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: isCredit ? "#2e7d52" : "#141a21", fontWeight: 600, fontSize: 13.5 }}>{inv.description ?? `${inv.term} tuition`}</div>
                      <div style={{ fontSize: 11.5, color: "#6c7884" }}>
                        {isCredit ? "Reversal credit — offsets other charges" : inv.paid > 0 && inv.balance > 0 ? `Partly paid · ${fcfa(inv.paid)} of ${fcfa(inv.total)}` : inv.balance <= 0 ? `Paid · ${fcfa(inv.paid)} FCFA` : `${inv.installments.length || 1} installment${(inv.installments.length || 1) > 1 ? "s" : ""}`}
                      </div>
                    </div>
                    {isCredit ? (
                      <span style={{ fontWeight: 700, color: "#2e7d52", fontVariantNumeric: "tabular-nums" }}>−{fcfa(-inv.total)} FCFA</span>
                    ) : (
                      <>
                        {inv.balance <= 0 ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#2e7d52", background: "rgba(46,125,82,.12)", padding: "2px 8px", borderRadius: 999 }}>Paid</span>
                        ) : (
                          <span style={{ fontWeight: 700, color: "#141a21", fontVariantNumeric: "tabular-nums" }}>{fcfa(inv.balance)} FCFA</span>
                        )}
                        <button onClick={() => setPendingRemove(inv)} title="Remove charge" style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, color: "#c0392b", background: "#fdeeeb", border: "1px solid #f1c9c1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Trash2 size={13} /> Remove</button>
                      </>
                    )}
                  </div>
                );
              })}

              <SectionKick style={{ marginTop: 22 }}>Add a charge</SectionKick>
              <AddChargeForm busy={busy} onSubmit={onAddCharge} />

              {balance > 0 && (
                <>
                  <SectionKick style={{ marginTop: 22 }}>Payment link</SectionKick>
                  <div style={linkBox}>
                    <input readOnly value={link} style={{ flex: 1, border: "none", background: "none", fontSize: 12.5, color: "#4d5965", outline: "none", textOverflow: "ellipsis" }} />
                    <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1400); }} style={copyBtn(copied)}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
                  </div>
                </>
              )}

              <SectionKick style={{ marginTop: 22 }}>Payments received</SectionKick>
              {payments.length === 0 ? <p style={{ color: "#6c7884", fontSize: 13 }}>No payments yet.</p> : payments.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #edf1f5", fontSize: 13 }}>
                  <div><span style={{ fontWeight: 600, color: "#141a21", textTransform: "capitalize" }}>{p.method.replace("_", " ")}</span> <span style={{ color: "#6c7884", fontSize: 11.5 }}>· {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fcfa(p.amount)} FCFA</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p.status === "success" ? "rgba(46,125,82,.12)" : "rgba(237,132,37,.14)", color: p.status === "success" ? "#2e7d52" : "#d6731a", textTransform: "capitalize" }}>{p.status}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {pendingRemove && (
        <div onClick={(e) => { e.stopPropagation(); if (!busy) setPendingRemove(null); }} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,44,80,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: "94vw", background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 24px 60px rgba(15,44,80,.28)" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Remove charge?</h3>
            <p style={{ fontSize: 13.5, color: "#4d5965", lineHeight: 1.5, margin: 0 }}>
              <strong>{pendingRemove.description ?? `${pendingRemove.term} tuition`}</strong>
              {pendingRemove.paid > 0 ? (
                <> — {fcfa(pendingRemove.paid)} FCFA has been paid. This will <strong>reverse that amount into an account credit</strong> (no cash refund); the credit offsets the student&apos;s other or future charges.</>
              ) : (
                <> — this charge is unpaid and will be deleted.</>
              )}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setPendingRemove(null)} disabled={busy}>Cancel</button>
              <button onClick={confirmRemove} disabled={busy} style={{ background: "var(--danger, #c0392b)", color: "#fff", border: "none" }}>{busy ? "Removing…" : pendingRemove.paid > 0 ? "Reverse to credit" : "Remove"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Shared bits
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(15,44,80,.34)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 60px rgba(15,44,80,.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #d7dee6" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: "50%", color: "#6c7884", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

function SectionKick({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#6c7884", margin: "4px 0 10px", ...style }}>{children}</div>;
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--daust-navy)", color: "#fff", padding: "12px 20px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, boxShadow: "0 24px 60px rgba(15,44,80,.22)", zIndex: 200, display: "flex", alignItems: "center", gap: 9 }}>
      <Check size={16} color="#7ee0a8" /> {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 13px", border: "1.5px solid #d7dee6", borderRadius: 8, fontSize: 14, color: "#141a21", outline: "none", margin: "6px 0 15px" };
const fieldLabel: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "#4d5965" };
const primaryBtn: React.CSSProperties = { background: "var(--daust-orange)", color: "#fff", fontWeight: 700, fontSize: 14.5, padding: "12px 20px", borderRadius: 999, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
const ghostBtn: React.CSSProperties = { background: "none", color: "#4d5965", fontWeight: 600, fontSize: 13.5, padding: "11px 16px", borderRadius: 999, border: "none", cursor: "pointer" };
const outlineBtn: React.CSSProperties = { background: "#fff", border: "1.5px solid #bcc6d1", color: "#4d5965", fontWeight: 600, fontSize: 13, padding: "10px 16px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" };
const navBtn: React.CSSProperties = { background: "var(--daust-navy)", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 16px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", border: "none" };
const bulkBtn = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", fontWeight: 600, fontSize: 13, padding: "8px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", border: "none" });
const scopeNote: React.CSSProperties = { background: "#f5f7f9", border: "1px solid #d7dee6", borderRadius: 14, padding: "12px 14px", fontSize: 12.5, color: "#4d5965", display: "flex", alignItems: "center", gap: 9, marginBottom: 16 };
const linkBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, background: "#f5f7f9", border: "1.5px solid #d7dee6", borderRadius: 8, padding: "4px 4px 4px 13px" };
const copyBtn = (done: boolean): React.CSSProperties => ({ background: done ? "#2e7d52" : "var(--daust-navy)", color: "#fff", fontWeight: 600, fontSize: 12, padding: "8px 13px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer", flexShrink: 0 });
const kickStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#6c7884", marginBottom: 6 };
const thStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#6c7884", fontWeight: 700, padding: "12px 14px", borderBottom: "1px solid #d7dee6", whiteSpace: "nowrap", background: "#f5f7f9" };
const tdStyle: React.CSSProperties = { padding: "12px 14px", verticalAlign: "middle" };

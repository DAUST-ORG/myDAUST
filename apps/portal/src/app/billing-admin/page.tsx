"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, LogOut, Receipt, Search, Users, Wallet, X } from "lucide-react";
import {
  type Me,
  type StudentAccount,
  type StudentAccountRow,
  createPaymentLink,
  getMe,
  getStudentAccount,
  listStudentAccounts,
  login,
  logout,
} from "@/lib/api";

const fcfa = (n: number) => n.toLocaleString("fr-FR");
const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const canAdmin = (me: Me | null): me is Me => !!me && (me.roles.includes("bursar") || me.roles.includes("admin"));

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
          <p style={{ color: "#6c7884", fontSize: 13, textAlign: "center", margin: "5px 0 22px" }}>Finance staff sign-in. Track student bills and payments.</p>
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

  const load = useCallback(() => { listStudentAccounts().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => load(), [load]);

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
        <div style={{ marginBottom: 20 }}>
          <div style={kickStyle}>Student Accounts</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26 }}>Track bills &amp; payments</h1>
          <p style={{ color: "#6c7884", fontSize: 13.5, marginTop: 4 }}>Live balances and payment status across all student accounts.</p>
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
        </div>

        <div style={{ background: "#fff", border: "1px solid #d7dee6", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,44,80,.1)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr>{["Student", "Program", "Charges", "Balance", "Status", ""].map((h, i) => (
                  <th key={h || "act"} style={{ ...thStyle, textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#6c7884" }}>Loading accounts…</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#6c7884" }}>No students match.</td></tr>
                ) : list.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid #edf1f5" }}>
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

      {drawerId && <ManageDrawer studentId={drawerId} onClose={() => setDrawerId(null)} onChanged={load} />}
    </main>
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

// ---------------------------------------------------------------- Manage drawer
function ManageDrawer({ studentId, onClose, onChanged }: { studentId: string; onClose: () => void; onChanged: () => void }) {
  const [acct, setAcct] = useState<StudentAccount | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getStudentAccount(studentId).then(setAcct).catch(() => setAcct(null)); }, [studentId]);

  async function genLink() {
    if (!acct || acct.totals.balance <= 0) return;
    setBusy(true);
    try {
      const inv = acct.invoices.find((i) => i.balance > 0) ?? acct.invoices[0];
      const row = await createPaymentLink({
        payeeName: acct.student.name,
        payeeMeta: `${acct.student.studentNo} · ${acct.student.program}`,
        studentId,
        invoiceId: inv?.id,
        amountXof: acct.totals.balance,
        purpose: "Tuition balance",
      });
      setLinkUrl(row.url);
      onChanged();
    } catch {
      setLinkUrl(null);
    } finally {
      setBusy(false);
    }
  }

  const balance = acct?.totals.balance ?? 0;
  const installments = acct?.invoices.flatMap((i) => i.installments) ?? [];
  const payments = acct?.invoices.flatMap((i) => i.payments) ?? [];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,44,80,.34)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "96vw", height: "100%", background: "#fff", boxShadow: "0 24px 60px rgba(15,44,80,.22)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #d7dee6" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Account detail</h3>
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
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)" }}>Outstanding balance</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, marginTop: 4 }}>{balance <= 0 ? "0" : fcfa(balance)}<small style={{ fontSize: ".4em", color: "rgba(255,255,255,.72)", marginLeft: 5 }}>FCFA</small></div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.72)", marginTop: 6 }}>Billed {fcfa(acct.totals.billed)} · Paid {fcfa(acct.totals.paid)} FCFA</div>
              </div>

              <SectionKick>Payment schedule</SectionKick>
              {installments.length === 0 ? <p style={{ color: "#6c7884", fontSize: 13 }}>No schedule.</p> : installments.map((i) => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #edf1f5" }}>
                  <div style={{ flex: 1 }}><div style={{ color: "#141a21", fontWeight: 600, fontSize: 13.5 }}>Installment {i.sequence}</div><div style={{ fontSize: 11.5, color: "#6c7884" }}>Due {new Date(i.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div></div>
                  {i.status === "paid" ? <span style={{ fontSize: 10, fontWeight: 700, color: "#2e7d52", background: "rgba(46,125,82,.12)", padding: "2px 8px", borderRadius: 999 }}>Paid</span> : <span style={{ fontWeight: 700, color: "#141a21", fontVariantNumeric: "tabular-nums" }}>{fcfa(i.amountDue - i.amountPaid)} FCFA</span>}
                </div>
              ))}

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

              {linkUrl && (
                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, background: "#f5f7f9", border: "1.5px solid #d7dee6", borderRadius: 8, padding: "4px 4px 4px 13px" }}>
                  <input readOnly value={linkUrl} style={{ flex: 1, border: "none", background: "none", fontSize: 12.5, color: "#4d5965", outline: "none", textOverflow: "ellipsis" }} />
                  <button onClick={() => { navigator.clipboard?.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 1400); }} style={{ background: copied ? "#2e7d52" : "var(--daust-navy)", color: "#fff", fontWeight: 600, fontSize: 12, padding: "8px 13px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer", flexShrink: 0 }}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
                </div>
              )}
            </>
          )}
        </div>
        {acct && balance > 0 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid #d7dee6", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={genLink} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Generating…" : linkUrl ? "New link" : "Generate payment link"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionKick({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#6c7884", margin: "4px 0 10px", ...style }}>{children}</div>;
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 13px", border: "1.5px solid #d7dee6", borderRadius: 8, fontSize: 14, color: "#141a21", outline: "none", margin: "6px 0 15px" };
const primaryBtn: React.CSSProperties = { background: "var(--daust-orange)", color: "#fff", fontWeight: 700, fontSize: 14.5, padding: "12px 20px", borderRadius: 999, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
const kickStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#6c7884", marginBottom: 6 };
const thStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#6c7884", fontWeight: 700, padding: "12px 14px", borderBottom: "1px solid #d7dee6", whiteSpace: "nowrap", background: "#f5f7f9" };
const tdStyle: React.CSSProperties = { padding: "12px 14px", verticalAlign: "middle" };

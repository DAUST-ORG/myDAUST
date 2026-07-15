"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, CreditCard, Lock, Search, ShieldCheck } from "lucide-react";
import { type BillLookup, checkoutBill, lookupBill } from "@/lib/api";

const fcfa = (n: number) => n.toLocaleString("fr-FR");
const STORE_KEY = "daust-pay-bill";

const METHODS = [
  { key: "orange_money", label: "Orange Money", sub: "Mobile wallet", badge: "OM", badgeBg: "#f48120" },
  { key: "wave", label: "Wave", sub: "Mobile wallet", badge: "WV", badgeBg: "#00b8d9" },
  { key: "card", label: "Card", sub: "Visa · Mastercard", badge: null, badgeBg: "#153b6a" },
] as const;

interface Creds {
  studentNo: string;
  dob: string;
}

function PayBillInner() {
  const search = useSearchParams();
  const justPaid = search.get("paid") === "1";

  // A staff-shared link prefills the ID (e.g. .../pay-bill?sid=DAUST-2026-0007); DOB is still required.
  const [studentNo, setStudentNo] = useState(() => search.get("sid") ?? "");
  const [dob, setDob] = useState("");
  const [bill, setBill] = useState<BillLookup | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runLookup = useCallback(async (c: Creds) => {
    const data = await lookupBill(c.studentNo, c.dob);
    setBill(data);
    setCreds(c);
    setAmount(String(data.balanceXof));
    sessionStorage.setItem(STORE_KEY, JSON.stringify(c));
  }, []);

  // On return from the gateway, re-fetch the (now reduced) balance for the same student.
  useEffect(() => {
    if (!justPaid) return;
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    runLookup(JSON.parse(raw) as Creds).catch(() => setBill(null));
  }, [justPaid, runLookup]);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await runLookup({ studentNo: studentNo.trim(), dob });
    } catch {
      setErr("No account matches that Student ID and date of birth. Check both and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!creds || !method) return;
    const amt = Number(String(amount).replace(/[^\d]/g, ""));
    if (!amt || amt < 1) return setErr("Enter an amount to pay.");
    setBusy(true);
    setErr(null);
    try {
      const { redirectUrl } = await checkoutBill({ ...creds, amountXof: amt, method });
      window.location.href = redirectUrl;
    } catch {
      setErr("Payment could not be started. Please try again or contact the Finance Office.");
      setBusy(false);
    }
  }

  function reset() {
    setBill(null);
    setCreds(null);
    setMethod(null);
    setErr(null);
    sessionStorage.removeItem(STORE_KEY);
  }

  const card: React.CSSProperties = {
    background: "#fff", borderRadius: 20, boxShadow: "0 28px 70px rgba(15,44,80,.22)",
    width: "100%", maxWidth: 480, overflow: "hidden",
  };
  const fieldInput: React.CSSProperties = {
    width: "100%", padding: "13px 14px", border: "1.5px solid #d7dee6", borderRadius: 8,
    fontSize: 15, color: "#141a21", outline: "none",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#e9edf2", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>
      <header style={{ background: "var(--daust-navy-deep)", color: "#fff", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src="/logo-daust.png" alt="DAUST" style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "rgba(255,255,255,.85)" }}>
          <Lock size={14} /> Secure payment
        </span>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {!bill ? (
          <div style={card}>
            <div style={{ padding: "30px 30px 4px", textAlign: "center" }}>
              <div style={{ display: "inline-flex", gap: 5, marginBottom: 16 }}>
                <span style={{ width: 22, height: 4, borderRadius: 2, background: "var(--daust-navy)" }} />
                <span style={{ width: 22, height: 4, borderRadius: 2, background: "var(--daust-orange)" }} />
                <span style={{ width: 22, height: 4, borderRadius: 2, background: "var(--daust-steel)" }} />
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, margin: 0 }}>Pay my bill</h1>
              <p style={{ color: "#6c7884", fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
                Enter the Student ID and date of birth to view the outstanding balance and pay it.
              </p>
            </div>
            <form onSubmit={onLookup} style={{ padding: "22px 30px 30px" }}>
              {err && <p style={{ background: "rgba(192,57,43,.08)", color: "#c0392b", fontSize: 12.5, fontWeight: 600, padding: "10px 13px", borderRadius: 8, marginBottom: 16 }}>{err}</p>}
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Student ID</label>
              <input value={studentNo} onChange={(e) => setStudentNo(e.target.value)} placeholder="e.g. S202612AF" autoCapitalize="characters" spellCheck={false} style={{ ...fieldInput, margin: "7px 0 16px" }} />
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Date of birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} min="1975-01-01" max="2012-12-31" style={{ ...fieldInput, margin: "7px 0 20px" }} />
              <button type="submit" disabled={busy || !studentNo || !dob} style={{ width: "100%", padding: "14px", borderRadius: 999, border: "none", background: busy || !studentNo || !dob ? "#c3ccd6" : "var(--daust-orange)", color: "#fff", fontWeight: 700, fontSize: 15.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                <Search size={16} /> {busy ? "Looking up…" : "View my balance"}
              </button>
              <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#6c7884", fontSize: 11.5, marginTop: 16 }}>
                <ShieldCheck size={13} color="#2e7d52" /> Your information is encrypted and never stored on this device.
              </p>
            </form>
          </div>
        ) : (
          <div style={card}>
            {justPaid && (
              <div style={{ background: "rgba(46,125,82,.10)", color: "#2e7d52", display: "flex", alignItems: "center", gap: 9, padding: "13px 22px", fontSize: 13.5, fontWeight: 600 }}>
                <CheckCircle2 size={17} /> Payment received — your balance below reflects it once Finance confirms (usually seconds).
              </div>
            )}
            <div style={{ background: "linear-gradient(158deg, var(--daust-navy-deep) 0%, var(--daust-navy) 70%)", color: "#fff", padding: "26px 30px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: -20, bottom: -64, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 220, lineHeight: 0.8, color: "rgba(255,255,255,.05)", pointerEvents: "none" }}>D</div>
              <div style={{ display: "flex", alignItems: "center", gap: 13, position: "relative" }}>
                <span style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--daust-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                  {bill.studentName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16.5 }}>{bill.studentName}</div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)" }}>{bill.studentNo}{bill.program ? ` · ${bill.program}` : ""}</div>
                </div>
              </div>
              <div style={{ marginTop: 22, position: "relative" }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)" }}>{bill.balanceXof < 0 ? "Account credit" : "Outstanding balance"}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px,7vw,40px)", lineHeight: 1, marginTop: 5 }}>
                  {fcfa(Math.abs(bill.balanceXof))} <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,.72)" }}>FCFA{bill.balanceXof < 0 ? " credit" : ""}</span>
                </div>
                {bill.dueDate && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.10)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, marginTop: 14 }}>
                    <CalendarDays size={13} /> Next due {new Date(bill.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>

            {bill.charges.length > 0 && (
              <div style={{ padding: "18px 30px 4px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#6c7884", marginBottom: 8 }}>Charges on this account</div>
                {bill.charges.map((c) => (
                  <div key={c.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #edf1f5", fontSize: 13.5 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#141a21" }}>{c.label}</div>
                      <div style={{ fontSize: 11.5, color: "#6c7884" }}>{c.dueDate ? `Due ${new Date(c.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</div>
                    </div>
                    {c.status === "paid" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#2e7d52", background: "rgba(46,125,82,.12)", padding: "2px 8px", borderRadius: 999 }}><CheckCircle2 size={11} /> Paid</span>
                    ) : (
                      <div style={{ fontWeight: 700, color: "#141a21", fontVariantNumeric: "tabular-nums" }}>{fcfa(c.amountXof - c.paidXof)} FCFA</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {bill.balanceXof > 0 ? (
              <div style={{ padding: "16px 30px 30px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#6c7884", margin: "6px 0 10px" }}>Make a payment</div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "#4d5965" }}>Amount to pay</label>
                <div style={{ position: "relative", margin: "7px 0 12px" }}>
                  <input
                    inputMode="numeric"
                    value={amount ? fcfa(Number(String(amount).replace(/[^\d]/g, ""))) : ""}
                    onChange={(e) => {
                      const n = Math.min(Number(e.target.value.replace(/[^\d]/g, "")) || 0, bill.balanceXof);
                      setAmount(n ? String(n) : "");
                    }}
                    placeholder="0"
                    style={{ ...fieldInput, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, paddingRight: 52 }}
                  />
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 600, color: "#6c7884" }}>FCFA</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {[["Full balance", bill.balanceXof], ["Half", Math.round(bill.balanceXof / 2)]].map(([label, val]) => (
                    <button key={label as string} type="button" onClick={() => setAmount(String(val))} style={{ flex: 1, border: "1.5px solid #d7dee6", borderRadius: 8, background: "#fff", color: "#4d5965", fontWeight: 600, fontSize: 12.5, padding: "9px 8px", cursor: "pointer" }}>
                      {label} · {fcfa(val as number)}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {METHODS.map((m) => (
                    <button key={m.key} type="button" onClick={() => setMethod(m.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12, cursor: "pointer", textAlign: "left", background: "#fff", border: method === m.key ? "2px solid var(--daust-orange)" : "1.5px solid #d7dee6", boxShadow: method === m.key ? "0 4px 14px rgba(237,132,37,.18)" : "none" }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: m.badgeBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10.5, flexShrink: 0 }}>
                        {m.badge ?? <CreditCard size={16} />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#141a21" }}>{m.label}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: "#6c7884" }}>{m.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <button onClick={pay} disabled={!method || busy} style={{ width: "100%", padding: "14px", borderRadius: 999, border: "none", background: method && !busy ? "var(--daust-orange)" : "#c3ccd6", color: "#fff", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5, cursor: method ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                  <Lock size={15} /> {busy ? "Redirecting…" : method ? `Pay ${fcfa(Number(String(amount).replace(/[^\d]/g, "")) || 0)} FCFA` : "Select a payment method"}
                </button>
                {err && <p style={{ color: "#c0392b", fontSize: 13, marginTop: 10 }}>{err}</p>}
                <button onClick={reset} style={{ width: "100%", background: "none", border: "none", color: "#6c7884", fontWeight: 600, fontSize: 13.5, padding: "11px", cursor: "pointer", marginTop: 4 }}>Not you? Search again</button>
              </div>
            ) : (
              <div style={{ padding: "24px 30px 30px", textAlign: "center" }}>
                <CheckCircle2 size={46} color="#2e7d52" style={{ margin: "0 auto 8px" }} />
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20 }}>{bill.balanceXof < 0 ? "Credit on account" : "Balance cleared"}</div>
                <p style={{ color: "#6c7884", fontSize: 13.5, marginTop: 6 }}>
                  {bill.balanceXof < 0
                    ? `You have a credit of ${fcfa(-bill.balanceXof)} FCFA that will apply to future charges. Nothing is due right now.`
                    : "This account is fully paid. Thank you!"}
                </p>
                <button onClick={reset} style={{ marginTop: 16, border: "1px solid #d7dee6", background: "#fff", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "#16202e" }}>Pay another bill</button>
              </div>
            )}
          </div>
        )}
      </div>

      <footer style={{ textAlign: "center", padding: "16px 0 22px", fontSize: 12.5, color: "#7b8794" }}>
        <strong style={{ color: "#3c4756" }}>DAUST Pay</strong> · Dakar American University of Science &amp; Technology · finance@daust.edu.sn
        <span style={{ margin: "0 6px", color: "#bcc6d1" }}>·</span>
        <a href="/admin" style={{ color: "var(--daust-navy)", fontWeight: 600 }}>Staff login</a>
      </footer>
    </main>
  );
}

export default function PayBillPage() {
  return (
    <Suspense fallback={null}>
      <PayBillInner />
    </Suspense>
  );
}

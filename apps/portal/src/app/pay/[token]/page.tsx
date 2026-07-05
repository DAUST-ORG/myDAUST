"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Banknote, CalendarDays, CheckCircle2, CreditCard, Info, Lock, ShieldCheck } from "lucide-react";
import { type PublicPaymentLink, checkoutPaymentLink, getPublicPaymentLink } from "@/lib/api";

const fcfa = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");

const METHODS = [
  { key: "orange_money", label: "Orange Money", sub: "Mobile wallet", badge: "OM", badgeBg: "#f48120", kind: "gateway" },
  { key: "wave", label: "Wave", sub: "Mobile wallet", badge: "WV", badgeBg: "#00b8d9", kind: "gateway" },
  { key: "card", label: "Card", sub: "Visa · Mastercard", badge: null, badgeBg: "#153b6a", kind: "gateway" },
  { key: "bank", label: "Bank transfer", sub: "CBAO account", badge: null, badgeBg: "#8a97a8", kind: "offline" },
] as const;

export default function PayLinkPage() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const [link, setLink] = useState<PublicPaymentLink | null>(null);
  const [missing, setMissing] = useState(false);
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const polls = useRef(0);

  const load = useCallback(() => {
    getPublicPaymentLink(token)
      .then(setLink)
      .catch(() => setMissing(true));
  }, [token]);
  useEffect(() => load(), [load]);

  // Back from the gateway: the IPN settles asynchronously, so poll briefly.
  useEffect(() => {
    if (!search.get("back") || link?.status !== "active") return;
    const t = setInterval(() => {
      polls.current += 1;
      if (polls.current > 20) clearInterval(t);
      load();
    }, 3000);
    return () => clearInterval(t);
  }, [search, link?.status, load]);

  async function pay() {
    if (!method || method === "bank") return;
    setBusy(true);
    setErr(null);
    try {
      const { redirectUrl } = await checkoutPaymentLink(token, method);
      window.location.href = redirectUrl;
    } catch (e) {
      setErr((e as Error).message.includes("expired") ? "This payment link has expired." : "Payment could not be started. Try again or contact the Finance Office.");
      setBusy(false);
    }
  }

  const shell: React.CSSProperties = { minHeight: "100vh", background: "#e9edf2", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" };

  return (
    <main style={shell}>
      {/* Header */}
      <header style={{ background: "var(--daust-navy-deep)", color: "#fff", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <img src="/logo-daust.png" alt="DAUST" style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)", verticalAlign: "middle" }} />
          <span style={{ display: "inline-flex", gap: 4, marginLeft: 10, verticalAlign: "middle" }}>
            <span style={{ width: 18, height: 3.5, borderRadius: 99, background: "#fff" }} />
            <span style={{ width: 18, height: 3.5, borderRadius: 99, background: "var(--daust-orange)" }} />
            <span style={{ width: 18, height: 3.5, borderRadius: 99, background: "var(--daust-steel)" }} />
          </span>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "rgba(255,255,255,.85)" }}>
          <Lock size={14} /> Secure payment
        </span>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {missing ? (
          <div style={{ background: "#fff", borderRadius: 18, padding: "44px 48px", textAlign: "center", boxShadow: "0 24px 60px rgba(15,44,80,.18)", maxWidth: 420 }}>
            <Info size={40} color="var(--daust-steel)" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>Link not found</div>
            <p style={{ color: "#5b6675", fontSize: 14, marginTop: 8 }}>This payment link does not exist or was cancelled. Contact the DAUST Finance Office for a new one.</p>
          </div>
        ) : !link ? (
          <p style={{ color: "#5b6675" }}>Loading…</p>
        ) : (
          <div className="pay-card" style={{ display: "flex", width: "100%", maxWidth: 940, borderRadius: 20, overflow: "hidden", boxShadow: "0 28px 70px rgba(15,44,80,.22)" }}>
            {/* Left: navy summary panel */}
            <section className="pay-left" style={{ flex: "0 0 40%", background: "linear-gradient(165deg, var(--daust-navy) 0%, var(--daust-navy-deep) 100%)", color: "#fff", padding: "34px 32px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: -30, bottom: -40, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 260, lineHeight: 1, color: "rgba(255,255,255,.04)", pointerEvents: "none" }}>D</div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--daust-orange)" }}>{link.purpose}</div>
              <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                <span style={{ width: 26, height: 5, borderRadius: 99, background: "#fff" }} />
                <span style={{ width: 26, height: 5, borderRadius: 99, background: "var(--daust-orange)" }} />
                <span style={{ width: 26, height: 5, borderRadius: 99, background: "rgba(255,255,255,.35)" }} />
              </div>

              <div style={{ marginTop: 30, fontSize: 13.5, color: "rgba(255,255,255,.75)" }}>Amount due</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px, 3.6vw, 44px)", lineHeight: 1.1, marginTop: 4 }}>
                {fcfa(link.amountXof)} <span style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,.8)" }}>FCFA</span>
              </div>
              {link.dueDate && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.12)", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, marginTop: 14, alignSelf: "flex-start" }}>
                  <CalendarDays size={13} /> Due {new Date(link.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}

              <div style={{ borderTop: "1px solid rgba(255,255,255,.16)", margin: "24px 0 20px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                <span style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--daust-orange)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15 }}>
                  {link.payeeName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{link.payeeName}</div>
                  {link.payeeMeta && <div style={{ fontSize: 13, color: "rgba(255,255,255,.68)" }}>{link.payeeMeta}</div>}
                </div>
              </div>

              <div style={{ marginTop: "auto", paddingTop: 30, display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(255,255,255,.62)" }}>
                <Info size={13} />
                <span>Ref <strong style={{ color: "rgba(255,255,255,.85)" }}>{link.ref}</strong>{link.expiresAt && <> · link expires {new Date(link.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}</span>
              </div>
            </section>

            {/* Right: action panel */}
            <section style={{ flex: 1, background: "#fff", padding: "36px 40px" }}>
              {link.status === "paid" ? (
                <div style={{ paddingTop: 12 }}>
                  <div style={{ textAlign: "center" }}>
                    <CheckCircle2 size={56} color="#2e7d52" style={{ margin: "0 auto" }} />
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, marginTop: 12 }}>Payment received</div>
                    <p style={{ color: "#5b6675", fontSize: 13.5, marginTop: 6 }}>
                      This page is the payment confirmation — anyone with this link can view it at any time.
                    </p>
                  </div>
                  <div style={{ border: "1px solid #d9e0e8", borderRadius: 14, marginTop: 20, overflow: "hidden" }}>
                    {[
                      ["Amount", `${fcfa(link.amountXof)} FCFA`],
                      ["For", link.purpose],
                      ["Paid by", link.payeeMeta ? `${link.payeeName} — ${link.payeeMeta}` : link.payeeName],
                      ["Reference", link.ref],
                      ["Date", link.paidAt ? new Date(link.paidAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"],
                      ["Method", link.method === "manual" ? "Bank transfer (confirmed by DAUST Finance)" : (link.method ?? "—").replace("_", " ")],
                    ].map(([k, v], i) => (
                      <div key={k} style={{ display: "flex", padding: "11px 18px", fontSize: 13.5, borderTop: i > 0 ? "1px solid #eef1f5" : "none", background: i % 2 ? "#fafbfc" : "#fff" }}>
                        <span style={{ width: 110, color: "#7b8794", flexShrink: 0 }}>{k}</span>
                        <span style={{ fontWeight: 600, color: "#16202e", textTransform: k === "Method" ? "capitalize" : undefined }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
                    <button onClick={() => window.print()} style={{ border: "1px solid #d9e0e8", background: "#fff", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "#16202e" }}>
                      Print / save PDF
                    </button>
                  </div>
                  <p style={{ textAlign: "center", color: "#7b8794", fontSize: 12, marginTop: 14 }}>
                    Questions? finance@daust.edu.sn — quote reference {link.ref}.
                  </p>
                </div>
              ) : link.status === "expired" ? (
                <div style={{ textAlign: "center", paddingTop: 60 }}>
                  <Info size={54} color="var(--daust-orange)" style={{ margin: "0 auto" }} />
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, marginTop: 14 }}>This link has expired</div>
                  <p style={{ color: "#5b6675", fontSize: 14, marginTop: 8 }}>Contact the Finance Office (finance@daust.edu.sn) to request a new payment link.</p>
                </div>
              ) : (
                <>
                  <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 23, margin: 0 }}>Complete your payment</h1>
                  <p style={{ color: "#5b6675", fontSize: 13.5, margin: "8px 0 22px", lineHeight: 1.5 }}>
                    Choose how you&rsquo;d like to pay. The amount is set by DAUST Finance and can&rsquo;t be changed.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {METHODS.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setMethod(m.key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                          background: "#fff",
                          border: method === m.key ? "2px solid var(--daust-orange)" : "1px solid #d9e0e8",
                          boxShadow: method === m.key ? "0 4px 14px rgba(237,132,37,.18)" : "none",
                        }}
                      >
                        <span style={{ width: 38, height: 38, borderRadius: 9, background: m.badgeBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                          {m.badge ?? (m.kind === "gateway" ? <CreditCard size={18} /> : <Banknote size={18} />)}
                        </span>
                        <span>
                          <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, color: "#16202e" }}>{m.label}</span>
                          <span style={{ display: "block", fontSize: 12, color: "#7b8794" }}>{m.sub}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {method === "bank" ? (
                    <div style={{ background: "#f3f6fa", border: "1px solid #d9e0e8", borderRadius: 12, padding: "16px 18px", marginTop: 18, fontSize: 13.5, lineHeight: 1.65, color: "#3c4756" }}>
                      Transfer <strong>{fcfa(link.amountXof)} FCFA</strong> to the DAUST account at <strong>CBAO</strong> with reference <strong>{link.ref}</strong>.
                      The Finance Office confirms transfers within one business day; this page will show “Payment received” once recorded.
                    </div>
                  ) : (
                    <button
                      onClick={pay}
                      disabled={!method || busy}
                      style={{
                        width: "100%", marginTop: 18, padding: "15px 0", borderRadius: 999, border: "none",
                        background: method ? "var(--daust-orange)" : "#c3ccd6", color: "#fff",
                        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: ".01em",
                        cursor: method ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                      }}
                    >
                      <Lock size={15} /> {busy ? "Redirecting…" : method ? `Pay ${fcfa(link.amountXof)} FCFA` : "Select a payment method"}
                    </button>
                  )}
                  {err && <p style={{ color: "#c0392b", fontSize: 13, marginTop: 10 }}>{err}</p>}

                  <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#7b8794", fontSize: 12, marginTop: 16 }}>
                    <ShieldCheck size={14} /> 256-bit encrypted · DAUST Finance Office
                  </p>
                </>
              )}
            </section>
          </div>
        )}
      </div>

      <footer style={{ textAlign: "center", padding: "16px 0 22px", fontSize: 12.5, color: "#7b8794" }}>
        Powered by <strong style={{ color: "#3c4756" }}>DAUST Pay</strong> · Dakar American University of Science &amp; Technology · finance@daust.edu.sn
      </footer>

      <style jsx global>{`
        @media (max-width: 760px) {
          .pay-card { flex-direction: column; }
          .pay-left { flex: none !important; }
        }
      `}</style>
    </main>
  );
}

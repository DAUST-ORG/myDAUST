"use client";

import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { type DiningPass, type Me, getDiningPass, getMe } from "@/lib/api";

export default function StudentIdPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [pass, setPass] = useState<DiningPass | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
    getDiningPass().then(setPass).catch(() => {});
  }, []);

  return (
    <>
      <p className="eyebrow">Identity</p>
      <h1 className="page-title">Student ID</h1>

      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-lg)", background: "var(--surface)" }}>
          <div style={{ background: "linear-gradient(135deg, var(--daust-navy) 0%, var(--daust-navy-deep) 100%)", color: "#fff", padding: "20px 24px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: ".04em" }}>DAUST</span>
            <div className="tri-dash" style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 22, height: 4, background: "#fff", borderRadius: 999 }} />
              <span style={{ width: 22, height: 4, background: "var(--daust-orange)", borderRadius: 999 }} />
              <span style={{ width: 22, height: 4, background: "var(--daust-steel)", borderRadius: 999 }} />
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, letterSpacing: ".1em", opacity: 0.8 }}>STUDENT ID</span>
          </div>
          <div style={{ padding: 24, display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ width: 90, height: 90, borderRadius: 14, background: "var(--daust-navy)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, flexShrink: 0 }}>
              {me?.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{me?.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>{pass?.studentNo ?? "—"}</div>
              <div className="muted" style={{ fontSize: 13 }}>{me?.email}</div>
              <div style={{ marginTop: 8 }}>
                {pass?.active ? <span className="badge completed">Active · {pass.plan} meal plan</span> : <span className="badge pending">Enrolled</span>}
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--divider)", padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {pass && <QrCode value={pass.token} size={180} />}
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Scan for campus access & dining entry</p>
          </div>
        </div>
      </div>
    </>
  );
}

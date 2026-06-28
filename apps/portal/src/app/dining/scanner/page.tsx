"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ScanLine, XCircle } from "lucide-react";
import { type LiveScans, type ScanResult, diningScan, getLiveScans } from "@/lib/api";

const PERIODS = ["breakfast", "lunch", "dinner"] as const;

export default function ScannerPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("lunch");
  const [token, setToken] = useState("");
  const [last, setLast] = useState<ScanResult | null>(null);
  const [feed, setFeed] = useState<LiveScans | null>(null);

  const refresh = useCallback(() => {
    getLiveScans(period).then(setFeed).catch(() => {});
  }, [period]);
  useEffect(() => refresh(), [refresh]);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    const res = await diningScan(token.trim(), period);
    setLast(res);
    setToken("");
    refresh();
  }

  const served = last?.result === "served";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Scanner Station</h1>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={period === p ? "primary" : ""} style={{ textTransform: "capitalize" }}>{p}</button>
          ))}
        </div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, background: last ? (served ? "rgba(46,125,82,.08)" : "rgba(192,57,43,.07)") : undefined }}>
          {last ? (
            <div style={{ textAlign: "center" }}>
              {served ? <CheckCircle2 size={72} color="#2e7d52" /> : <XCircle size={72} color="#c0392b" />}
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, marginTop: 12, color: served ? "#2e7d52" : "#c0392b" }}>
                {served ? "SERVED" : "TURNED AWAY"}
              </div>
              {last.name && <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{last.name}</div>}
              {last.studentNo && <div className="muted">{last.studentNo}</div>}
              {last.reason && <div className="muted" style={{ marginTop: 6 }}>{last.reason}</div>}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--fg3)" }}>
              <ScanLine size={64} color="var(--daust-orange)" />
              <p style={{ marginTop: 10 }}>Scan a student&rsquo;s dining pass</p>
            </div>
          )}
          <form onSubmit={scan} style={{ display: "flex", gap: 8, marginTop: 24, width: "100%", maxWidth: 460 }}>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste / scan pass token…" autoFocus style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)" }} />
            <button className="primary" type="submit">Scan</button>
          </form>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "#2e7d52" }}>{feed?.served ?? 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>Served · {period}</div>
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "#c0392b" }}>{feed?.turnedAway ?? 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>Turned away</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Recent scans</p>
          {feed?.recent.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--divider)" }}>
              {s.result === "served" ? <CheckCircle2 size={16} color="#2e7d52" /> : <XCircle size={16} color="#c0392b" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{s.reason ?? s.studentNo}</div>
              </div>
            </div>
          ))}
          {(!feed || feed.recent.length === 0) && <p className="muted">No scans yet.</p>}
        </div>
      </div>
    </>
  );
}

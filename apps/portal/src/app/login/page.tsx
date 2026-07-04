"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(email.trim(), password);
      const r = me.roles;
      const home = r.includes("student")
        ? "/student"
        : r.includes("faculty")
          ? "/faculty"
          : r.includes("dining")
            ? "/dining"
            : r.includes("student_affairs")
              ? "/affairs"
              : r.includes("innovation")
                ? "/innovation"
                : "/admin";
      router.push(home);
    } catch {
      setError("Invalid email or password");
      setBusy(false);
    }
  }

  return (
    <main className="login-split" style={{ display: "flex", minHeight: "100vh" }}>
      {/* Brand hero */}
      <section
        className="login-hero"
        style={{
          flex: "1 1 52%",
          background: "linear-gradient(160deg, var(--daust-navy) 0%, var(--daust-navy-deep) 100%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, letterSpacing: ".04em" }}>DAUST</span>
            <span style={{ display: "flex", gap: 7 }}>
              <span style={{ width: 30, height: 5, borderRadius: 999, background: "#fff" }} />
              <span style={{ width: 30, height: 5, borderRadius: 999, background: "var(--daust-orange)" }} />
              <span style={{ width: 30, height: 5, borderRadius: 999, background: "var(--daust-steel)" }} />
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(28px, 3.4vw, 44px)", lineHeight: 1.12, margin: "26px 0 0", maxWidth: 460 }}>
            One campus.<br />Every portal.
          </h1>
          <p style={{ color: "rgba(255,255,255,.72)", fontSize: 15.5, lineHeight: 1.65, maxWidth: 420, marginTop: 16 }}>
            myDAUST brings academics, payments, dining, housing and innovation together —
            sign in with your DAUST account to reach your portal.
          </p>
          <div style={{ display: "flex", gap: 34, marginTop: 44 }}>
            {[["6", "role portals"], ["1", "student record"], ["0", "paper forms"]].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: "var(--daust-orange)", lineHeight: 1 }}>{v}</div>
                <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12.5, marginTop: 5 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section style={{ flex: "1 1 48%", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "var(--gray-50)" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <p className="eyebrow">Welcome back</p>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, margin: "4px 0 20px" }}>Sign in to myDAUST</h2>
          <form className="card" onSubmit={submit} style={{ padding: 24 }}>
            <label className="muted" style={{ fontSize: 13 }}>Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@daust.edu"
              style={{ width: "100%", margin: "6px 0 14px" }}
            />
            <label className="muted" style={{ fontSize: 13 }}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", margin: "6px 0 16px" }}
            />
            {error && <p style={{ color: "var(--bad)", marginTop: 0 }}>{error}</p>}
            <button className="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
              Google Workspace sign-in is coming; use your DAUST email + password for now.
            </p>
          </form>
          <details style={{ marginTop: 14 }}>
            <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>Dev seed accounts</summary>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              Password <code>daust-dev-2026</code> — <code>aissatou.diallo@daust.edu</code> (student), <code>amadou.ba@daust.edu</code> (faculty),
              <code> admin@daust.edu</code>, <code>dining@daust.edu</code>, <code>studentaffairs@daust.edu</code>, <code>innovation@daust.edu</code>.
            </p>
          </details>
        </div>
      </section>
    </main>
  );
}

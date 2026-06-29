"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { login } from "@/lib/api";

const DEMO_ACCOUNTS = [
  { email: "aissatou.diallo@daust.edu", role: "Student" },
  { email: "bursar@daust.edu", role: "Bursar" },
  { email: "registrar@daust.edu", role: "Registrar" },
  { email: "admin@daust.edu", role: "Admin" },
];
const DEMO_PASSWORD = "daust-dev-2026";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="login-screen">
      <div className="login-brand">
        <div className="login-brand-bg" />
        <div className="login-brand-fade" />
        <div className="login-brand-content">
          <div className="login-brand-top">
            <img src="/logo-daust.png" alt="DAUST" style={{ height: 30, width: "auto" }} />
            <div className="tri-dash" style={{ margin: "14px 0 0" }}>
              <span />
              <span />
              <span />
            </div>
          </div>
          <div>
            <p className="login-quote">
              &ldquo;DAUST strives to provide a high-quality education that prepares its students
              for successful careers and to contribute to the development of their communities
              and the African continent.&rdquo;
            </p>
            <p className="login-quote-attr">Dr. Sidy Ndao &mdash; Founder &amp; President</p>
          </div>
          <div className="login-brand-foot">
            <span>ANAQ-Sup Accredited</span>
            <span className="login-dot" />
            <span>Est. 2017</span>
            <span className="login-dot" />
            <span>Somone, Senegal</span>
          </div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <img src="/logo-daust.png" alt="DAUST" className="login-mobile-logo" />
            <p className="eyebrow" style={{ marginBottom: 6 }}>Campus Portal</p>
            <h1 className="page-title" style={{ fontSize: 28 }}>Welcome back</h1>
            <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>
              Sign in with your DAUST account to continue.
            </p>
          </div>

          <form onSubmit={submit} className="login-form">
            <label className="login-label" htmlFor="email">Email</label>
            <div className="login-input-wrap">
              <Mail size={16} className="login-input-icon" />
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@daust.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input"
              />
            </div>

            <label className="login-label" htmlFor="password">Password</label>
            <div className="login-input-wrap">
              <Lock size={16} className="login-input-icon" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="login-input"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="login-input-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div className="login-error">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <button className="primary login-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="login-spin" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="muted" style={{ fontSize: 12.5, textAlign: "center", marginTop: 18 }}>
            Need help? <a href="mailto:info@daust.org">Contact IT support</a>
          </p>

          <details className="login-demo">
            <summary>Demo accounts (dev only)</summary>
            <div className="login-demo-chips">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" className="login-demo-chip" onClick={() => fillDemo(a.email)}>
                  <span className="login-demo-role">{a.role}</span>
                  <span className="login-demo-email">{a.email}</span>
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Click a role to autofill. Password: <code>{DEMO_PASSWORD}</code>. Google Workspace SSO replaces this later.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

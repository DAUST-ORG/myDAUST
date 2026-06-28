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
    <main className="container" style={{ maxWidth: 420 }}>
      <p className="h1">Sign in</p>
      <form className="card" onSubmit={submit}>
        <label className="muted" style={{ fontSize: 13 }}>Email</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
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
      </form>
      <p className="muted" style={{ fontSize: 13 }}>
        Dev seed users (password <code>daust-dev-2026</code>): <code>aissatou.diallo@daust.edu</code> (student),
        <code> bursar@daust.edu</code>, <code>admin@daust.edu</code>, <code>registrar@daust.edu</code>, etc.
        Google Workspace SSO replaces this later.
      </p>
    </main>
  );
}

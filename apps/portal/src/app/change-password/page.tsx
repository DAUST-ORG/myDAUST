"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { changePassword, getMe, type Me } from "@/lib/api";
import { portalForRoles } from "@/lib/nav";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => router.replace("/login"));
  }, [router]);

  const forced = me?.mustChangePassword === true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next.length < 10) return setErr("New password must be at least 10 characters.");
    if (next !== confirm) return setErr("New passwords do not match.");
    setBusy(true);
    try {
      await changePassword(current, next);
      router.replace(me ? portalForRoles(me.roles).home : "/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not change your password.");
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg, #f4f6f8)", padding: 24 }}>
      <div className="login-card" style={{ width: "100%", maxWidth: 420 }}>
        <div className="login-card-head">
          <p className="eyebrow" style={{ marginBottom: 6 }}>Account security</p>
          <h1 className="page-title" style={{ fontSize: 26 }}>Change your password</h1>
          <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>
            {forced ? "Set a new password to finish signing in." : "Update the password for your DAUST account."}
          </p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label className="login-label" htmlFor="current">Current password</label>
          <div className="login-input-wrap">
            <Lock size={16} className="login-input-icon" />
            <input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="login-input" />
          </div>
          <label className="login-label" htmlFor="next">New password</label>
          <div className="login-input-wrap">
            <Lock size={16} className="login-input-icon" />
            <input id="next" type="password" autoComplete="new-password" placeholder="At least 10 characters" value={next} onChange={(e) => setNext(e.target.value)} required className="login-input" />
          </div>
          <label className="login-label" htmlFor="confirm">Confirm new password</label>
          <div className="login-input-wrap">
            <Lock size={16} className="login-input-icon" />
            <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="login-input" />
          </div>
          {err && <div className="login-error"><AlertCircle size={15} /><span>{err}</span></div>}
          <button className="primary login-submit" type="submit" disabled={busy}>
            {busy ? <><Loader2 size={16} className="login-spin" /> Saving…</> : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

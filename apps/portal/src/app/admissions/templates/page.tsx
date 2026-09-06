"use client";

import { useEffect, useMemo, useState } from "react";
import { MailCheck } from "lucide-react";
import {
  getEmailTemplates,
  getMe,
  updateEmailTemplates,
} from "@/lib/api";
import { Modal } from "@/components/ui";

const toArray = (str: string) =>
  str
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
const toStr = (arr?: string[]) => (arr || []).join(", ");

interface Templates {
  applicationSubject: string;
  applicationBody: string;
  applicationCc: string[];
  applicationBcc: string[];
  acceptanceSubject: string;
  acceptanceBody: string;
  acceptanceCc: string[];
  acceptanceBcc: string[];
}

const keyOf = (t: Templates, cc: string, bcc: string, accCc: string, accBcc: string) =>
  JSON.stringify({ ...t, applicationCc: toArray(cc), applicationBcc: toArray(bcc), acceptanceCc: toArray(accCc), acceptanceBcc: toArray(accBcc) });

export default function AdmissionsTemplatesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<Templates | null>(null);
  const [savedCc, setSavedCc] = useState({ appCc: "", appBcc: "", accCc: "", accBcc: "" });
  const [t, setT] = useState<Templates>({
    applicationSubject: "",
    applicationBody: "",
    applicationCc: [],
    applicationBcc: [],
    acceptanceSubject: "",
    acceptanceBody: "",
    acceptanceCc: [],
    acceptanceBcc: [],
  });
  const [appCc, setAppCc] = useState("");
  const [appBcc, setAppBcc] = useState("");
  const [accCc, setAccCc] = useState("");
  const [accBcc, setAccBcc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    getMe()
      .then((m) =>
        setAllowed(m.roles.includes("admissions") || m.roles.includes("admin")),
      )
      .catch(() => setAllowed(false));
    getEmailTemplates()
      .then((res) => {
        const next: Templates = {
          applicationSubject: res.applicationSubject || "",
          applicationBody: res.applicationBody || "",
          applicationCc: res.applicationCc || [],
          applicationBcc: res.applicationBcc || [],
          acceptanceSubject: res.acceptanceSubject || "",
          acceptanceBody: res.acceptanceBody || "",
          acceptanceCc: res.acceptanceCc || [],
          acceptanceBcc: res.acceptanceBcc || [],
        };
        setT(next);
        setSaved(next);
        const cc = {
          appCc: toStr(res.applicationCc),
          appBcc: toStr(res.applicationBcc),
          accCc: toStr(res.acceptanceCc),
          accBcc: toStr(res.acceptanceBcc),
        };
        setAppCc(cc.appCc);
        setAppBcc(cc.appBcc);
        setAccCc(cc.accCc);
        setAccBcc(cc.accBcc);
        setSavedCc(cc);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return (
      keyOf(t, appCc, appBcc, accCc, accBcc) !==
      keyOf(saved, savedCc.appCc, savedCc.appBcc, savedCc.accCc, savedCc.accBcc)
    );
  }, [t, saved, savedCc, appCc, appBcc, accCc, accBcc]);

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        ...t,
        applicationCc: toArray(appCc),
        applicationBcc: toArray(appBcc),
        acceptanceCc: toArray(accCc),
        acceptanceBcc: toArray(accBcc),
      };
      await updateEmailTemplates(payload);
      setSaved({ ...t });
      setSavedCc({ appCc, appBcc, accCc, accBcc });
      setShowSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save templates.");
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null) return <p className="muted">Loading…</p>;
  if (!allowed)
    return <p className="muted">Only the admissions office can edit email templates.</p>;

  return (
    <>
      <p className="eyebrow">Admissions</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ flex: 1 }}>Email Templates</h1>
        <button
          className="primary"
          onClick={save}
          disabled={!dirty || busy}
          title={dirty ? "Save changes" : "No changes to save"}
          style={{ opacity: dirty && !busy ? 1 : 0.45, cursor: dirty && !busy ? "pointer" : "not-allowed" }}
        >
          {busy ? "Saving…" : "Save Templates"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
        Sent automatically when an application arrives and when an applicant is accepted.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="h1" style={{ fontSize: 15 }}>How to write a template</p>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--fg2)", lineHeight: 1.7 }}>
          <li>
            Use <code>{"{{firstName}}"}</code>, <code>{"{{lastName}}"}</code> and{" "}
            <code>{"{{appFee}}"}</code> — they are replaced per applicant (appFee is the
            live application fee, e.g. 30,000).
          </li>
          <li>The body is HTML: plain paragraphs work, and links or bold text are fine.</li>
          <li>CC / BCC take comma-separated addresses — the admissions inbox stays looped in.</li>
          <li>Save lights up only after you change something; nothing sends until the event happens.</li>
        </ul>
      </div>

      {err && (
        <div className="badge overdue" style={{ padding: "8px 12px", marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Application received email</strong>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={t.applicationSubject}
            onChange={(e) => setT({ ...t, applicationSubject: e.target.value })}
            style={{ width: "100%" }}
            placeholder="Subject"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600 }}>
              CC (comma-separated)
              <input value={appCc} onChange={(e) => setAppCc(e.target.value)} style={{ width: "100%", fontSize: 13, marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 600 }}>
              BCC (comma-separated)
              <input value={appBcc} onChange={(e) => setAppBcc(e.target.value)} style={{ width: "100%", fontSize: 13, marginTop: 2 }} />
            </label>
          </div>
          <textarea
            value={t.applicationBody}
            onChange={(e) => setT({ ...t, applicationBody: e.target.value })}
            style={{ width: "100%", height: 140, fontFamily: "monospace" }}
            placeholder="HTML Body"
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Acceptance email</strong>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={t.acceptanceSubject}
            onChange={(e) => setT({ ...t, acceptanceSubject: e.target.value })}
            style={{ width: "100%" }}
            placeholder="Subject"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600 }}>
              CC (comma-separated)
              <input value={accCc} onChange={(e) => setAccCc(e.target.value)} style={{ width: "100%", fontSize: 13, marginTop: 2 }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 600 }}>
              BCC (comma-separated)
              <input value={accBcc} onChange={(e) => setAccBcc(e.target.value)} style={{ width: "100%", fontSize: 13, marginTop: 2 }} />
            </label>
          </div>
          <textarea
            value={t.acceptanceBody}
            onChange={(e) => setT({ ...t, acceptanceBody: e.target.value })}
            style={{ width: "100%", height: 140, fontFamily: "monospace" }}
            placeholder="HTML Body"
          />
        </div>
      </div>

      {showSaved && (
        <Modal
          open
          onClose={() => setShowSaved(false)}
          title="Templates saved"
          width={420}
          footer={
            <button className="primary" onClick={() => setShowSaved(false)}>
              Done
            </button>
          }
        >
          <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <MailCheck size={18} style={{ color: "var(--success)" }} />
            New applications and acceptances will use the updated emails.
          </p>
        </Modal>
      )}
    </>
  );
}

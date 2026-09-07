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

type Kind = "application" | "acceptance" | "rejected" | "stale";

const SECTIONS: { kind: Kind; title: string; note: string }[] = [
  {
    kind: "application",
    title: "Application received email",
    note: "Sent the moment an application arrives, with the fee payment link.",
  },
  {
    kind: "acceptance",
    title: "Acceptance email",
    note: "Sent when an applicant is accepted, with the private status link.",
  },
  {
    kind: "rejected",
    title: "Rejection email",
    note: "Sent automatically the moment a file is moved to Rejected.",
  },
  {
    kind: "stale",
    title: "Stale application nudge",
    note: "Sent when an officer pings a file that has sat too long (detail page → Send stale nudge).",
  },
];

interface Templates {
  applicationSubject: string;
  applicationBody: string;
  applicationCc: string[];
  applicationBcc: string[];
  acceptanceSubject: string;
  acceptanceBody: string;
  acceptanceCc: string[];
  acceptanceBcc: string[];
  rejectedSubject: string;
  rejectedBody: string;
  rejectedCc: string[];
  rejectedBcc: string[];
  staleSubject: string;
  staleBody: string;
  staleCc: string[];
  staleBcc: string[];
}

const EMPTY: Templates = {
  applicationSubject: "",
  applicationBody: "",
  applicationCc: [],
  applicationBcc: [],
  acceptanceSubject: "",
  acceptanceBody: "",
  acceptanceCc: [],
  acceptanceBcc: [],
  rejectedSubject: "",
  rejectedBody: "",
  rejectedCc: [],
  rejectedBcc: [],
  staleSubject: "",
  staleBody: "",
  staleCc: [],
  staleBcc: [],
};

function snapshot(t: Templates, cc: Record<Kind, { cc: string; bcc: string }>) {
  return JSON.stringify({
    ...t,
    applicationCc: toArray(cc.application.cc),
    applicationBcc: toArray(cc.application.bcc),
    acceptanceCc: toArray(cc.acceptance.cc),
    acceptanceBcc: toArray(cc.acceptance.bcc),
    rejectedCc: toArray(cc.rejected.cc),
    rejectedBcc: toArray(cc.rejected.bcc),
    staleCc: toArray(cc.stale.cc),
    staleBcc: toArray(cc.stale.bcc),
  });
}

function fieldLabel(kind: Kind, field: "Subject" | "Body" | "CC" | "BCC") {
  const name =
    kind === "application"
      ? "Application"
      : kind === "acceptance"
        ? "Acceptance"
        : kind === "rejected"
          ? "Rejection"
          : "Stale nudge";
  return `${name} ${field.toLowerCase()}`;
}

function diffSummary(before: Templates, after: Templates): { label: string; from: string; to: string }[] {
  const rows: { label: string; from: string; to: string }[] = [];
  (Object.keys(EMPTY) as (keyof Templates)[]).forEach((key) => {
    const m = key.match(/^(application|acceptance|rejected|stale)(Subject|Body|Cc|Bcc)$/);
    if (!m) return;
    const kind = m[1] as Kind;
    const field = (m[2] === "Cc" ? "CC" : m[2] === "Bcc" ? "BCC" : m[2]) as
      | "Subject"
      | "Body"
      | "CC"
      | "BCC";
    const a = Array.isArray(before[key]) ? toStr(before[key] as string[]) : (before[key] as string);
    const b = Array.isArray(after[key]) ? toStr(after[key] as string[]) : (after[key] as string);
    if (a !== b) rows.push({ label: fieldLabel(kind, field), from: a, to: b });
  });
  return rows;
}

const clip = (s: string, n = 140) =>
  s.length > n ? `${s.slice(0, n)}…` : s || "—";

export default function AdmissionsTemplatesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [t, setT] = useState<Templates>(EMPTY);
  const [saved, setSaved] = useState<Templates | null>(null);
  const [cc, setCc] = useState<Record<Kind, { cc: string; bcc: string }>>({
    application: { cc: "", bcc: "" },
    acceptance: { cc: "", bcc: "" },
    rejected: { cc: "", bcc: "" },
    stale: { cc: "", bcc: "" },
  });
  const [savedCc, setSavedCc] = useState(cc);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [changes, setChanges] = useState<
    { label: string; from: string; to: string }[] | null
  >(null);

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
          rejectedSubject: res.rejectedSubject || "",
          rejectedBody: res.rejectedBody || "",
          rejectedCc: res.rejectedCc || [],
          rejectedBcc: res.rejectedBcc || [],
          staleSubject: res.staleSubject || "",
          staleBody: res.staleBody || "",
          staleCc: res.staleCc || [],
          staleBcc: res.staleBcc || [],
        };
        setT(next);
        setSaved(next);
        const c: Record<Kind, { cc: string; bcc: string }> = {
          application: { cc: toStr(res.applicationCc), bcc: toStr(res.applicationBcc) },
          acceptance: { cc: toStr(res.acceptanceCc), bcc: toStr(res.acceptanceBcc) },
          rejected: { cc: toStr(res.rejectedCc), bcc: toStr(res.rejectedBcc) },
          stale: { cc: toStr(res.staleCc), bcc: toStr(res.staleBcc) },
        };
        setCc(c);
        setSavedCc(c);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return snapshot(t, cc) !== snapshot(saved, savedCc);
  }, [t, saved, cc, savedCc]);

  async function save() {
    if (!dirty || busy || !saved) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        ...t,
        applicationCc: toArray(cc.application.cc),
        applicationBcc: toArray(cc.application.bcc),
        acceptanceCc: toArray(cc.acceptance.cc),
        acceptanceBcc: toArray(cc.acceptance.bcc),
        rejectedCc: toArray(cc.rejected.cc),
        rejectedBcc: toArray(cc.rejected.bcc),
        staleCc: toArray(cc.stale.cc),
        staleBcc: toArray(cc.stale.bcc),
      };
      await updateEmailTemplates(payload);
      setChanges(diffSummary(saved, { ...payload }));
      setSaved({ ...payload });
      setSavedCc(cc);
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
        Sent automatically as applications move through the pipeline.
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

      {SECTIONS.map((s) => (
        <div className="card" style={{ marginBottom: 16 }} key={s.kind}>
          <strong>{s.title}</strong>
          <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 0" }}>{s.note}</p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={t[`${s.kind}Subject`]}
              onChange={(e) => setT({ ...t, [`${s.kind}Subject`]: e.target.value })}
              style={{ width: "100%" }}
              placeholder="Subject"
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600 }}>
                CC (comma-separated)
                <input
                  value={cc[s.kind].cc}
                  onChange={(e) => setCc({ ...cc, [s.kind]: { ...cc[s.kind], cc: e.target.value } })}
                  style={{ width: "100%", fontSize: 13, marginTop: 2 }}
                />
              </label>
              <label style={{ fontSize: 11, fontWeight: 600 }}>
                BCC (comma-separated)
                <input
                  value={cc[s.kind].bcc}
                  onChange={(e) => setCc({ ...cc, [s.kind]: { ...cc[s.kind], bcc: e.target.value } })}
                  style={{ width: "100%", fontSize: 13, marginTop: 2 }}
                />
              </label>
            </div>
            <textarea
              value={t[`${s.kind}Body`]}
              onChange={(e) => setT({ ...t, [`${s.kind}Body`]: e.target.value })}
              style={{ width: "100%", height: 140, fontFamily: "monospace" }}
              placeholder="HTML Body"
            />
          </div>
        </div>
      ))}

      {changes && (
        <Modal
          open
          onClose={() => setChanges(null)}
          title="Templates saved"
          width={560}
          footer={
            <button className="primary" onClick={() => setChanges(null)}>
              Done
            </button>
          }
        >
          <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 0 }}>
            <MailCheck size={18} style={{ color: "var(--success)" }} />
            {changes.length} field{changes.length === 1 ? "" : "s"} changed:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
            {changes.map((c) => (
              <div key={c.label} style={{ fontSize: 13 }}>
                <strong>{c.label}</strong>
                <div style={{ color: "var(--danger)", textDecoration: "line-through", wordBreak: "break-word" }}>
                  {clip(c.from)}
                </div>
                <div style={{ color: "var(--success)", wordBreak: "break-word" }}>
                  → {clip(c.to, 400)}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

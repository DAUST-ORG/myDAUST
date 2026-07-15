"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronRight, Download, Filter, UserPlus, X } from "lucide-react";
import { type Admissions, type Applicant, createApplicant, getAdmissions, setApplicantStage } from "@/lib/api";
import { Avatar, Badge, type BadgeTone, Drawer, Field, Modal, PageHeader, SearchInput, Select, SortTh, useSort } from "@/components/ui";

const STAGES = ["submitted", "review", "interview", "offer", "accepted", "rejected"];
const STAGE_TONE: Record<string, BadgeTone> = {
  submitted: "neutral",
  review: "info",
  interview: "warning",
  offer: "teal",
  accepted: "success",
  rejected: "error",
};
const STAGE_LABEL: Record<string, string> = {
  submitted: "Submitted",
  review: "Under review",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
};

function nextStage(stage: string): string | null {
  const flow = ["submitted", "review", "interview", "offer", "accepted"];
  const i = flow.indexOf(stage);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1]! : null;
}

export default function AdmissionsPage() {
  const [d, setD] = useState<Admissions | null>(null);
  const [q, setQ] = useState("");
  const [stageF, setStageF] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [progF, setProgF] = useState("all");
  const [sel, setSel] = useState<Applicant | null>(null);
  const [adding, setAdding] = useState(false);
  const { sort, toggle, apply } = useSort({ key: "score", dir: "desc" });

  function load() {
    getAdmissions().then(setD).catch(() => {});
  }
  useEffect(() => load(), []);

  const programs = useMemo(() => Array.from(new Set((d?.applicants ?? []).map((a) => a.program).filter((p) => p && p !== "—"))), [d]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = (d?.applicants ?? []).filter(
      (a) =>
        (stageF === "all" || a.stage === stageF) &&
        (progF === "all" || a.program === progF) &&
        (!needle || a.name.toLowerCase().includes(needle) || a.email.toLowerCase().includes(needle)),
    );
    return apply(base, {
      name: (a) => a.name,
      program: (a) => a.program,
      country: (a) => a.country ?? "",
      score: (a) => a.score ?? -1,
      stage: (a) => STAGES.indexOf(a.stage),
      submitted: (a) => a.submittedAt,
    });
  }, [d, q, stageF, progF, apply]);

  async function move(a: Applicant, stage: string) {
    await setApplicantStage(a.id, stage);
    setSel(null);
    load();
  }

  function exportCsv() {
    const header = ["Name", "Email", "Program", "Country", "BAC", "Fee paid", "Stage", "Submitted"];
    const lines = rows.map((a) => [a.name, a.email, a.program, a.country ?? "", a.score ?? "", a.feePaid ? "yes" : "no", a.stage, a.submittedAt.slice(0, 10)]);
    const csv = [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "applicants.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        eyebrow="Admissions & Registration"
        title="Admissions"
        subtitle="Track applicants through the pipeline — from first submission to enrollment."
        actions={
          <>
            <button onClick={() => setShowFilters((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 7 }}><Filter size={15} /> Filters</button>
            <button className="primary" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}><UserPlus size={15} /> Add applicant</button>
          </>
        }
      />

      {/* Funnel */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {STAGES.map((st) => {
          const count = d.funnel.find((f) => f.stage === st)?.count ?? 0;
          const on = stageF === st;
          return (
            <button
              key={st}
              onClick={() => setStageF(on ? "all" : st)}
              className="card lift"
              style={{ flex: "1 1 130px", minWidth: 0, margin: 0, textAlign: "left", padding: 16, cursor: "pointer", borderColor: on ? "var(--daust-navy)" : "var(--border)" }}
            >
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{STAGE_LABEL[st]}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginTop: 6 }}>{count}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search applicants…" width={280} />
        {showFilters && (
          <>
            <Select value={stageF} onChange={setStageF} options={[{ value: "all", label: "All stages" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s]! }))]} />
            <Select value={progF} onChange={setProgF} options={[{ value: "all", label: "All programs" }, ...programs.map((p) => ({ value: p, label: p }))]} />
          </>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={exportCsv} style={{ display: "flex", alignItems: "center", gap: 7 }}><Download size={15} /> Export</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <SortTh label="Applicant" sortKey="name" sort={sort} onSort={toggle} />
                <SortTh label="Program" sortKey="program" sort={sort} onSort={toggle} />
                <SortTh label="Country" sortKey="country" sort={sort} onSort={toggle} />
                <SortTh label="BAC" sortKey="score" sort={sort} onSort={toggle} />
                <th>Fee</th>
                <SortTh label="Stage" sortKey="stage" sort={sort} onSort={toggle} />
                <SortTh label="Submitted" sortKey="submitted" sort={sort} onSort={toggle} />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setSel(a)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={a.name} size={30} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone="neutral">{a.program}</Badge></td>
                  <td>{a.country ?? "—"}</td>
                  <td style={{ fontWeight: 700 }}>{a.score ?? "—"}</td>
                  <td>{a.feePaid ? <Badge tone="success">Paid</Badge> : <Badge tone="warning">Due</Badge>}</td>
                  <td><Badge tone={STAGE_TONE[a.stage] ?? "neutral"}>{STAGE_LABEL[a.stage] ?? a.stage}</Badge></td>
                  <td style={{ whiteSpace: "nowrap" }}>{a.submittedAt.slice(0, 10)}</td>
                  <td style={{ textAlign: "right" }}><ChevronRight size={16} color="var(--fg3)" /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>No applicants match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSel(null)}
        title="Applicant"
        footer={
          sel && sel.stage !== "rejected" && sel.stage !== "accepted" ? (
            <>
              <button onClick={() => move(sel, "rejected")} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--danger)" }}><X size={15} /> Reject</button>
              {nextStage(sel.stage) && nextStage(sel.stage) !== "accepted" && (
                <button onClick={() => move(sel, nextStage(sel.stage)!)} style={{ display: "flex", alignItems: "center", gap: 6 }}><ArrowRight size={15} /> Advance</button>
              )}
              <button className="primary" onClick={() => move(sel, sel.stage === "offer" ? "accepted" : "offer")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={15} /> {sel.stage === "offer" ? "Accept" : "Make offer"}
              </button>
            </>
          ) : null
        }
      >
        {sel && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar name={sel.name} size={56} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{sel.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{sel.program} · {sel.country ?? "—"}</div>
                <div style={{ marginTop: 6 }}><Badge tone={STAGE_TONE[sel.stage] ?? "neutral"}>{STAGE_LABEL[sel.stage] ?? sel.stage}</Badge></div>
              </div>
            </div>
            <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-lg)", padding: 16, display: "flex", justifyContent: "space-around", textAlign: "center" }}>
              <div><div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--daust-navy)" }}>{sel.score ?? "—"}</div><div className="muted" style={{ fontSize: 11.5 }}>BAC score</div></div>
              <div style={{ width: 1, background: "var(--border)" }} />
              <div><div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: sel.feePaid ? "var(--success)" : "var(--warning)" }}>{sel.feePaid ? "Paid" : "Due"}</div><div className="muted" style={{ fontSize: 11.5 }}>Application fee</div></div>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg2)", marginBottom: 10 }}>Pipeline</div>
              {STAGES.filter((s) => s !== "rejected").map((st, i) => {
                const reached = STAGES.indexOf(sel.stage) >= STAGES.indexOf(st) && sel.stage !== "rejected";
                return (
                  <div key={st} style={{ display: "flex", gap: 12, paddingBottom: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: reached ? "var(--daust-navy)" : "var(--bg-subtle)", border: reached ? "none" : "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {reached && <Check size={11} color="#fff" />}
                      </span>
                      {i < 4 && <span style={{ width: 1, flex: 1, minHeight: 14, background: "var(--border)" }} />}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: reached ? "var(--fg1)" : "var(--fg3)" }}>{STAGE_LABEL[st]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Drawer>

      {adding && <AddApplicantModal programs={programs} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load(); }} />}
    </>
  );
}

function AddApplicantModal({ programs, onClose, onCreated }: { programs: string[]; onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState("");
  const [country, setCountry] = useState("");
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErr("First name, last name and email are required.");
      return;
    }
    setBusy(true);
    try {
      await createApplicant({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        programCode: program || null,
        country: country.trim() || null,
        score: score.trim() === "" ? null : Number(score),
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add applicant.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add applicant"
      width={480}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>{busy ? "Adding…" : "Add applicant"}</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div className="badge overdue" style={{ padding: "8px 12px" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="First name"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
          <Field label="Last name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
        </div>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Program" hint="Optional">
            <Select value={program} onChange={setProgram} options={[{ value: "", label: "—" }, ...programs.map((p) => ({ value: p, label: p }))]} />
          </Field>
          <Field label="BAC score" hint="0–20, optional"><input type="number" min={0} max={20} step="0.01" value={score} onChange={(e) => setScore(e.target.value)} /></Field>
        </div>
        <Field label="Country" hint="Optional"><input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

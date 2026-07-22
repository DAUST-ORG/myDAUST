"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, FilePlus2, Filter } from "lucide-react";
import { type Admissions, getAdmissions, getAdminPrograms, setApplicantStage } from "@/lib/api";
import { Avatar, Badge, type BadgeTone, Button, PageHeader, SearchInput, Select, SortTh, Stat, useSort } from "@/components/ui";
import { ApplicationModal, type ProgramOption } from "./ApplicationModal";

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

interface StageAction {
  label: string;
  next: string;
  variant: "primary" | "navy" | "secondary";
}
/** One contextual advance per stage; accepted and rejected are terminal. */
const STAGE_ACTION: Record<string, StageAction> = {
  submitted: { label: "Submit for review", next: "review", variant: "primary" },
  review: { label: "Admit", next: "offer", variant: "secondary" },
  interview: { label: "Admit", next: "offer", variant: "secondary" },
  offer: { label: "Confirm", next: "accepted", variant: "navy" },
};

export default function AdmissionsPage() {
  const router = useRouter();
  const [d, setD] = useState<Admissions | null>(null);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [q, setQ] = useState("");
  const [stageF, setStageF] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [progF, setProgF] = useState("all");
  const [adding, setAdding] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { sort, toggle, apply } = useSort({ key: "score", dir: "desc" });

  function load() {
    getAdmissions().then(setD).catch(() => {});
  }
  useEffect(() => load(), []);
  useEffect(() => {
    getAdminPrograms()
      .then((p) => setProgramOptions(p.programs.map((x) => ({ code: x.code, name: x.name }))))
      .catch(() => {});
  }, []);

  async function advance(id: string, next: string) {
    setAdvancing(id);
    setErr(null);
    try {
      await setApplicantStage(id, next);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the applicant stage.");
    } finally {
      setAdvancing(null);
    }
  }

  const programs = useMemo(() => Array.from(new Set((d?.applicants ?? []).map((a) => a.program).filter((p) => p && p !== "—"))), [d]);

  const stats = useMemo(() => {
    const cnt = (st: string) => d?.funnel.find((f) => f.stage === st)?.count ?? 0;
    const total = (d?.funnel ?? []).reduce((s, f) => s + f.count, 0);
    return {
      total,
      underReview: cnt("review") + cnt("interview"),
      admitted: cnt("offer"),
      confirmed: cnt("accepted"),
      // Funnel bars: cumulative narrowing of the pipeline.
      funApplied: total,
      funReviewed: total - cnt("submitted"),
      funAdmitted: cnt("offer") + cnt("accepted"),
      funConfirmed: cnt("accepted"),
    };
  }, [d]);

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
        title="Admissions"
        subtitle="Fall 2026 intake pipeline"
        actions={
          <button className="primary" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <FilePlus2 size={15} /> New application
          </button>
        }
      />

      {/* Semantic stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Stat label="Applications" value={stats.total} sub="FALL 2026" />
        <Stat label="Under review" value={stats.underReview} sub="awaiting decision" tone="var(--daust-orange)" />
        <Stat label="Admitted" value={stats.admitted} sub="offers sent" tone="var(--daust-navy)" />
        <Stat label="Confirmed" value={stats.confirmed} sub="deposits paid" tone="var(--success)" />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Pipeline funnel */}
        <div className="card" style={{ margin: 0, flex: "1 1 280px", maxWidth: 360, minWidth: 260 }}>
          <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>Pipeline funnel</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FunnelBar label="Applied" count={stats.funApplied} max={stats.funApplied} />
            <FunnelBar label="Reviewed" count={stats.funReviewed} max={stats.funApplied} />
            <FunnelBar label="Admitted" count={stats.funAdmitted} max={stats.funApplied} />
            <FunnelBar label="Confirmed" count={stats.funConfirmed} max={stats.funApplied} />
          </div>
        </div>

        {/* Applicant list */}
        <div style={{ flex: "3 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <SearchInput value={q} onChange={setQ} placeholder="Filter applicants…" width={280} />
            <button onClick={() => setShowFilters((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 7 }}><Filter size={15} /> Filters</button>
            {showFilters && (
              <>
                <Select value={stageF} onChange={setStageF} options={[{ value: "all", label: "All stages" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s]! }))]} />
                <Select value={progF} onChange={setProgF} options={[{ value: "all", label: "All programs" }, ...programs.map((p) => ({ value: p, label: p }))]} />
              </>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={exportCsv} style={{ display: "flex", alignItems: "center", gap: 7 }}><Download size={15} /> Export</button>
          </div>

          {err && <p className="card" style={{ margin: 0, color: "var(--danger)" }}>{err}</p>}

          <div className="card" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/admin/admissions/${a.id}`)}>
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
                      <td onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          {STAGE_ACTION[a.stage] && (
                            <Button
                              size="sm"
                              variant={STAGE_ACTION[a.stage]!.variant}
                              disabled={advancing === a.id}
                              onClick={() => advance(a.id, STAGE_ACTION[a.stage]!.next)}
                            >
                              {advancing === a.id ? "Saving…" : STAGE_ACTION[a.stage]!.label}
                            </Button>
                          )}
                          <ChevronRight size={16} color="var(--fg3)" />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>No applicants match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {adding && (
        <ApplicationModal
          mode="create"
          programs={programOptions}
          onClose={() => setAdding(false)}
          onSaved={(id) => router.push(`/admin/admissions/${id}`)}
        />
      )}
    </>
  );
}

function FunnelBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((count / max) * 100))) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
        <span style={{ color: "var(--fg2)" }}>{label}</span>
        <span style={{ color: "var(--fg1)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </div>
      <div style={{ height: 10, background: "var(--gray-100)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--daust-navy)", borderRadius: "var(--radius-pill)" }} />
      </div>
    </div>
  );
}

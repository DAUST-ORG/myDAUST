"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import {
  acceptApplicant,
  type ApplicantBillingProfileInput,
  type Admissions,
  getAdmissions,
  getAdminPrograms,
  setApplicantStage,
} from "@/lib/api";
import { formatDateTime, formatXof } from "@/lib/format";
import {
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  PageHeader,
  SearchInput,
  Select,
  SortTh,
  Stat,
  useSort,
} from "@/components/ui";
import { useAuth } from "@/lib/use-auth";
import { ApplicationModal, type ProgramOption } from "./ApplicationModal";
import { ApplicantBillingAcceptanceModal } from "./[id]/ApplicantBillingAcceptanceModal";

/**
 * How long ago an application landed. Sits under the timestamp because "3 hours ago" is
 * what tells an officer this one is new, and an absolute date is what they quote back.
 */
function relativeSince(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo ago` : `${Math.round(months / 12)} y ago`;
}

const STAGES = [
  "submitted",
  "review",
  "interview",
  "offer",
  "accepted",
  "rejected",
];
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
const ONBOARDING_LABEL: Record<string, string> = {
  not_started: "Accepted",
  payment_pending: "Payment pending",
  enrolled: "Enrolled",
  cancelled: "Onboarding cancelled",
};
const ONBOARDING_TONE: Record<string, BadgeTone> = {
  not_started: "success",
  payment_pending: "warning",
  enrolled: "success",
  cancelled: "error",
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
  offer: { label: "Accept", next: "accepted", variant: "navy" },
};

export default function AdmissionsPage() {
  const router = useRouter();
  const { me } = useAuth();
  const isAdmin = me?.roles.includes("admin") ?? false;
  const [d, setD] = useState<Admissions | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [q, setQ] = useState("");
  const [stageF, setStageF] = useState("all");
  const [queueF, setQueueF] = useState<"active" | "history" | "all">("active");
  const [adding, setAdding] = useState(false);
  const [pendingAcceptance, setPendingAcceptance] = useState<{
    id: string;
    name: string;
    score: number | null;
  } | null>(null);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { sort, toggle, apply } = useSort({ key: "score", dir: "desc" });

  function load() {
    // A swallowed failure here renders as a permanent "Loading…", which is indistinguishable
    // from a slow network.
    getAdmissions()
      .then(setD)
      .catch((e: Error) => setLoadErr(e.message));
  }
  useEffect(() => load(), []);
  useEffect(() => {
    getAdminPrograms()
      .then((p) =>
        setProgramOptions(
          p.programs.map((x) => ({ code: x.code, name: x.name })),
        ),
      )
      .catch(() => {});
  }, []);

  async function advance(id: string, next: string) {
    if (next === "accepted" && !isAdmin) return;
    if (next === "accepted") {
      const applicant = d?.applicants.find((candidate) => candidate.id === id);
      if (applicant) {
        setPendingAcceptance({
          id: applicant.id,
          name: applicant.name,
          score: applicant.score,
        });
      }
      return;
    }
    setAdvancing(id);
    setErr(null);
    try {
      await setApplicantStage(id, next);
      load();
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Could not update the applicant stage.",
      );
    } finally {
      setAdvancing(null);
    }
  }

  async function confirmAcceptance(
    billingProfile: ApplicantBillingProfileInput,
  ) {
    if (!pendingAcceptance || !isAdmin) return;
    setAdvancing(pendingAcceptance.id);
    setErr(null);
    setNotice(null);
    try {
      const { onboarding } = await acceptApplicant(
        pendingAcceptance.id,
        billingProfile,
      );
      setNotice(
        onboarding.emailDelivery === "not_sent"
          ? `${pendingAcceptance.name} was accepted, but the email failed. Open the record to copy or resend the private link.`
          : `${pendingAcceptance.name} was accepted and moved to payment pending.`,
      );
      setPendingAcceptance(null);
      load();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not accept this applicant.";
      setErr(message);
      throw cause;
    } finally {
      setAdvancing(null);
    }
  }

  const progName = (code: string | null) =>
    programOptions.find((p) => p.code === code)?.name ?? code ?? "—";

  const stats = useMemo(() => {
    const cnt = (st: string) =>
      d?.funnel.find((f) => f.stage === st)?.count ?? 0;
    const total = (d?.funnel ?? []).reduce((sum, item) => sum + item.count, 0);
    const awaitingPayment =
      d?.applicants.filter((a) => a.onboarding?.status === "payment_pending")
        .length ?? 0;
    const enrolled =
      d?.applicants.filter((a) => a.onboarding?.status === "enrolled").length ??
      0;
    return {
      total,
      underReview: cnt("review") + cnt("interview"),
      awaitingPayment,
      enrolled,
      funApplied: total,
      funReviewed: total - cnt("submitted"),
      funAdmitted: cnt("offer") + cnt("accepted"),
      funPaymentPending: awaitingPayment,
      funEnrolled: enrolled,
    };
  }, [d]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = (d?.applicants ?? []).filter((a) => {
      const completed =
        a.stage === "rejected" ||
        ["enrolled", "cancelled"].includes(a.onboarding?.status ?? "");
      const inQueue =
        queueF === "all" || (queueF === "history" ? completed : !completed);
      const stageMatches =
        stageF === "all" ||
        (["payment_pending", "enrolled", "cancelled"].includes(stageF)
          ? a.onboarding?.status === stageF
          : a.stage === stageF);
      return (
        inQueue &&
        stageMatches &&
        (!needle ||
          a.name.toLowerCase().includes(needle) ||
          a.email.toLowerCase().includes(needle) ||
          a.onboarding?.studentNo?.toLowerCase().includes(needle))
      );
    });
    return apply(base, {
      name: (a) => a.name,
      program: (a) => a.program,
      country: (a) => a.country ?? "",
      score: (a) => a.score ?? -1,
      stage: (a) => STAGES.indexOf(a.stage),
      submitted: (a) => a.submittedAt,
    });
  }, [d, q, queueF, stageF, apply]);

  if (loadErr)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {loadErr}
      </p>
    );
  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Admissions"
        subtitle="Fall 2026 intake pipeline"
        actions={
          <button
            className="primary"
            onClick={() => setAdding(true)}
            style={{ display: "flex", alignItems: "center", gap: 7 }}
          >
            <FilePlus2 size={15} /> New application
          </button>
        }
      />

      {/* Semantic stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <Stat label="Applications" value={stats.total} sub="FALL 2026" />
        <Stat
          label="Under review"
          value={stats.underReview}
          sub="awaiting decision"
          tone="var(--daust-orange)"
        />
        <Stat
          label="Payment pending"
          value={stats.awaitingPayment}
          sub="accepted applicants"
          tone="var(--daust-orange)"
        />
        <Stat
          label="Enrolled"
          value={stats.enrolled}
          sub="first payment verified"
          tone="var(--success)"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {/* Pipeline funnel */}
        <div
          className="card"
          style={{ margin: 0, flex: "1 1 280px", maxWidth: 360, minWidth: 260 }}
        >
          <h3
            style={{
              margin: "0 0 16px",
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Pipeline funnel
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FunnelBar
              label="Applied"
              count={stats.funApplied}
              max={stats.funApplied}
            />
            <FunnelBar
              label="Reviewed"
              count={stats.funReviewed}
              max={stats.funApplied}
            />
            <FunnelBar
              label="Admitted"
              count={stats.funAdmitted}
              max={stats.funApplied}
            />
            <FunnelBar
              label="Payment pending"
              count={stats.funPaymentPending}
              max={stats.funApplied}
            />
            <FunnelBar
              label="Enrolled"
              count={stats.funEnrolled}
              max={stats.funApplied}
            />
          </div>
        </div>

        {/* Applicant list */}
        <div
          style={{
            flex: "3 1 480px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Filter applicants…"
              width={280}
            />
            <Select
              ariaLabel="Queue"
              value={queueF}
              onChange={(value) => setQueueF(value as typeof queueF)}
              options={[
                { value: "active", label: "Active queue" },
                { value: "history", label: "History" },
                { value: "all", label: "All applications" },
              ]}
            />
            <Select
              value={stageF}
              onChange={setStageF}
              options={[
                { value: "all", label: "All stages" },
                ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s]! })),
                { value: "payment_pending", label: "Payment pending" },
                { value: "enrolled", label: "Enrolled" },
                { value: "cancelled", label: "Onboarding cancelled" },
              ]}
            />
          </div>

          {err && (
            <p className="card" style={{ margin: 0, color: "var(--danger)" }}>
              {err}
            </p>
          )}
          {notice && (
            <p
              className="card"
              role="status"
              style={{ margin: 0, color: "var(--success)" }}
            >
              {notice}
            </p>
          )}

          <div
            className="card"
            style={{ margin: 0, padding: 0, overflow: "hidden" }}
          >
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <SortTh
                      label="Applicant"
                      sortKey="name"
                      sort={sort}
                      onSort={toggle}
                    />
                    <SortTh
                      label="Score"
                      sortKey="score"
                      sort={sort}
                      onSort={toggle}
                    />
                    <SortTh
                      label="Stage"
                      sortKey="stage"
                      sort={sort}
                      onSort={toggle}
                    />
                    <SortTh
                      label="Submitted"
                      sortKey="submitted"
                      sort={sort}
                      onSort={toggle}
                    />
                    <th>First payment</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => router.push(`/admissions/${a.id}`)}
                    >
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <Avatar name={a.name} size={30} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{a.name}</div>
                            <div className="muted" style={{ fontSize: 11.5 }}>
                              {progName(a.program)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{a.score ?? "—"}</td>
                      <td>
                        <Badge
                          tone={
                            a.stage === "accepted" && a.onboarding
                              ? (ONBOARDING_TONE[a.onboarding.status] ??
                                "neutral")
                              : (STAGE_TONE[a.stage] ?? "neutral")
                          }
                        >
                          {a.stage === "accepted" && a.onboarding
                            ? (ONBOARDING_LABEL[a.onboarding.status] ??
                              a.onboarding.status)
                            : (STAGE_LABEL[a.stage] ?? a.stage)}
                        </Badge>
                        {a.stage === "accepted" && a.onboarding?.studentNo && (
                          <div
                            className="muted"
                            style={{ fontSize: 10.5, marginTop: 4 }}
                          >
                            {a.onboarding.studentNo}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ fontSize: 12.5 }}>
                          {formatDateTime(a.submittedAt)}
                        </div>
                        <div className="muted" style={{ fontSize: 10.5 }}>
                          {relativeSince(a.submittedAt)}
                        </div>
                      </td>
                      <td>
                        {a.onboarding?.status === "payment_pending" ? (
                          <div style={{ minWidth: 145 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                fontSize: 10.5,
                              }}
                            >
                              <span>{formatXof(a.onboarding.paidCashXof)}</span>
                              <span className="muted">
                                of {formatXof(a.onboarding.requiredCashXof)}
                              </span>
                            </div>
                            <div className="bar" style={{ marginTop: 5 }}>
                              <span
                                style={{
                                  width: `${a.onboarding.requiredCashXof > 0 ? Math.min(100, Math.round((a.onboarding.paidCashXof / a.onboarding.requiredCashXof) * 100)) : 0}%`,
                                  background: "var(--daust-orange)",
                                }}
                              />
                            </div>
                            {a.onboarding.proofStatus === "submitted" && (
                              <div
                                style={{
                                  color: "var(--warning)",
                                  fontSize: 10,
                                  marginTop: 4,
                                }}
                              >
                                Proof under review
                              </div>
                            )}
                          </div>
                        ) : a.onboarding?.status === "enrolled" ? (
                          <span
                            style={{
                              color: "var(--success)",
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            Verified
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "default", textAlign: "right" }}
                      >
                        {STAGE_ACTION[a.stage] &&
                          (STAGE_ACTION[a.stage]!.next !== "accepted" ||
                            isAdmin) && (
                            <Button
                              size="sm"
                              variant={STAGE_ACTION[a.stage]!.variant}
                              disabled={advancing === a.id}
                              onClick={() =>
                                STAGE_ACTION[a.stage]!.next === "accepted"
                                  ? setPendingAcceptance({
                                      id: a.id,
                                      name: a.name,
                                      score: a.score,
                                    })
                                  : advance(a.id, STAGE_ACTION[a.stage]!.next)
                              }
                            >
                              {advancing === a.id
                                ? "Saving…"
                                : STAGE_ACTION[a.stage]!.label}
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="muted"
                        style={{ textAlign: "center", padding: 32 }}
                      >
                        No applicants match this queue.
                      </td>
                    </tr>
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
          onSaved={(id) => router.push(`/admissions/${id}`)}
        />
      )}
      {pendingAcceptance && isAdmin && (
        <ApplicantBillingAcceptanceModal
          applicant={{
            id: pendingAcceptance.id,
            name: pendingAcceptance.name,
            score: pendingAcceptance.score,
          }}
          onClose={() => setPendingAcceptance(null)}
          onConfirm={confirmAcceptance}
        />
      )}
    </>
  );
}

function FunnelBar({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct =
    max > 0 ? Math.max(0, Math.min(100, Math.round((count / max) * 100))) : 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        <span style={{ color: "var(--fg2)" }}>{label}</span>
        <span
          style={{ color: "var(--fg1)", fontVariantNumeric: "tabular-nums" }}
        >
          {count}
        </span>
      </div>
      <div
        style={{
          height: 10,
          background: "var(--gray-100)",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--daust-navy)",
            borderRadius: "var(--radius-pill)",
          }}
        />
      </div>
    </div>
  );
}

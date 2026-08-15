"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Check, CheckCircle2, Clock, Copy, ExternalLink, Flag, Gift, GraduationCap, Mail, MapPin, Pencil, RefreshCw, Target, UserCheck, X } from "lucide-react";
import { acceptApplicant, cancelApplicantOnboarding, type ApplicantDetail, type ApplicantOnboardingView, getApplicant, getAdminPrograms, resendApplicantAcceptanceEmail, resendApplicantStudentInvite, rotateApplicantOnboardingLink, setApplicantStage } from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar, Badge, type BadgeTone, Modal, Tabs } from "@/components/ui";
import { useAuth } from "@/lib/use-auth";
import { ApplicationModal, type ProgramOption } from "../ApplicationModal";

const STAGES = ["submitted", "review", "interview", "offer", "accepted"];
const STAGE_TONE: Record<string, BadgeTone> = { submitted: "neutral", review: "info", interview: "warning", offer: "teal", accepted: "success", rejected: "error" };
const STAGE_LABEL: Record<string, string> = { submitted: "Submitted", review: "Under review", interview: "Interview", offer: "Offer", accepted: "Accepted", rejected: "Rejected" };
const ONBOARDING_LABEL: Record<string, string> = { not_started: "Accepted", payment_pending: "Payment pending", enrolled: "Enrolled", cancelled: "Onboarding cancelled" };
const ONBOARDING_TONE: Record<string, BadgeTone> = { not_started: "success", payment_pending: "warning", enrolled: "success", cancelled: "error" };

function nextStage(stage: string): string | null {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1]! : null;
}

// A single, non-overlapping forward action per stage (labels lean on the design's
// Submit-for-review / Admit / Confirm vocabulary without renaming the stored enum).
const ADVANCE_LABEL: Record<string, string> = {
  submitted: "Submit for review",
  review: "Move to interview",
  interview: "Make offer",
  offer: "Mark accepted",
};

export default function ApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const isAdmin = me?.roles.includes("admin") ?? false;
  const [a, setA] = useState<ApplicantDetail | null>(null);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [confirmAcceptanceOpen, setConfirmAcceptanceOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issuedStatusUrl, setIssuedStatusUrl] = useState<string | null>(null);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    getApplicant(id).then(setA).catch(() => setA(null));
  }, [id]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    getAdminPrograms()
      .then((p) => setProgramOptions(p.programs.map((x) => ({ code: x.code, name: x.name }))))
      .catch(() => {});
  }, []);

  async function move(stage: string) {
    if (stage === "accepted" && !isAdmin) return;
    setErr(null);
    setNotice(null);
    setBusyAction(stage);
    try {
      if (stage === "accepted") await acceptApplicant(id);
      else await setApplicantStage(id, stage);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the application stage.");
    } finally {
      setBusyAction(null);
    }
  }

  function updateOnboarding(onboarding: ApplicantOnboardingView, message: string) {
    setA((current) => current ? { ...current, stage: "accepted", onboarding } : current);
    setNotice(message);
  }

  function onboardingCancelled(next: ApplicantDetail) {
    setA(next);
    setErr(null);
    setIssuedStatusUrl(null);
    setNotice(`Onboarding cancelled. Student ID ${next.onboarding?.studentNo ?? "—"} remains permanently reserved; the applicant is now in Admissions history.`);
  }

  async function confirmAcceptance() {
    if (!isAdmin) return;
    setErr(null);
    setNotice(null);
    setBusyAction("accepted");
    try {
      const { onboarding } = await acceptApplicant(id);
      setIssuedStatusUrl(onboarding.statusUrl ?? null);
      updateOnboarding(onboarding, onboardingEmailNotice(
        onboarding,
        "Applicant accepted; the payment instructions were emailed.",
        "Applicant accepted, but email delivery failed. Copy the private status link below.",
        "Enrollment payment was already prepared.",
      ));
      setConfirmAcceptanceOpen(false);
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : "Could not accept this applicant.");
      throw cause;
    } finally {
      setBusyAction(null);
    }
  }

  if (!a) return <p className="muted">Loading…</p>;

  const reachedIdx = a.stage === "rejected" ? -1 : STAGES.indexOf(a.stage);
  const timeline: [string, boolean][] = [
    ["Application submitted", true],
    ["Under academic review", reachedIdx >= 1],
    ["Interview", reachedIdx >= 2],
    ["Offer extended", reachedIdx >= 3],
    [a.stage === "rejected" ? "Application rejected" : "Application accepted", reachedIdx >= 4 || a.stage === "rejected"],
  ];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Link href="/admin/admissions" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg3)", fontWeight: 600, fontSize: 13.5 }}>
          <ArrowLeft size={16} /> All applicants
        </Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(!a.onboarding || a.onboarding.status === "not_started") && <button onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}><Pencil size={15} /> Edit</button>}
          {a.stage !== "rejected" && a.stage !== "accepted" && (
            <>
              <button onClick={() => move("rejected")} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--danger)" }}><X size={15} /> Reject</button>
              {nextStage(a.stage) && (nextStage(a.stage) !== "accepted" || isAdmin) && (
                <button className="primary" disabled={busyAction !== null} onClick={() => nextStage(a.stage) === "accepted" ? setConfirmAcceptanceOpen(true) : move(nextStage(a.stage)!)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={15} /> {busyAction ? "Saving…" : ADVANCE_LABEL[a.stage] ?? "Advance"}
                </button>
              )}
            </>
          )}
          {isAdmin && a.stage === "accepted" && (!a.onboarding || a.onboarding.status === "not_started") && (
            <button className="primary" disabled={busyAction !== null} onClick={() => setConfirmAcceptanceOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}><UserCheck size={15} /> {busyAction ? "Preparing…" : "Prepare enrollment payment"}</button>
          )}
        </div>
      </div>

      {err && <div className="card" style={{ marginBottom: 16, color: "var(--danger)" }}>{err}</div>}
      {notice && <div className="card" role="status" style={{ marginBottom: 16, color: "var(--success)", display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={16} /> {notice}</div>}

      {/* Hero */}
      <div style={{ background: "linear-gradient(120deg, var(--daust-navy), var(--daust-navy-deep))", borderRadius: "var(--radius-xl)", padding: "26px 28px", color: "#fff", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <Avatar name={a.name} size={72} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800 }}>{a.name}</div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{a.id.slice(0, 8)} · {a.email}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <HeroPill icon={GraduationCap}>{a.program ?? a.programCode ?? "Undeclared"}</HeroPill>
            {a.country && <HeroPill icon={MapPin}>{a.country}</HeroPill>}
            <HeroPill icon={Flag}>{a.stage === "accepted" && a.onboarding ? ONBOARDING_LABEL[a.onboarding.status] ?? a.onboarding.status : STAGE_LABEL[a.stage] ?? a.stage}</HeroPill>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {STAGES.map((st, i) => {
            const done = reachedIdx >= i;
            return (
              <div key={st} style={{ flex: i < STAGES.length - 1 ? 1 : "0 0 auto", display: "flex", alignItems: "center", minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: done ? "var(--daust-navy)" : "var(--bg-subtle)", border: done ? "none" : "1px solid var(--border)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {done ? <Check size={15} /> : <span style={{ color: "var(--fg3)", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: done ? "var(--fg1)" : "var(--fg3)", whiteSpace: "nowrap" }}>{STAGE_LABEL[st]}</span>
                </div>
                {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: reachedIdx > i ? "var(--daust-navy)" : "var(--border)", margin: "0 6px", marginBottom: 20 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginTop: 16 }}>
        <Stat icon={Target} label="BAC score" value={a.score != null ? `${a.score} / 20` : "—"} color="var(--daust-navy)" />
        <Stat icon={BadgeCheck} label="Application fee" value={a.feePaid ? "Paid" : "Due"} color={a.feePaid ? "var(--success)" : "var(--warning)"} />
        <Stat icon={Gift} label="Merit scholarship" value={a.scholarship.pct > 0 ? `${a.scholarship.pct}%` : "None"} color={a.scholarship.pct > 0 ? "var(--success)" : "var(--fg1)"} />
        {a.onboarding?.firstInstallment && <Stat icon={UserCheck} label="First installment" value={a.onboarding.status === "enrolled" ? "Verified" : a.onboarding.status === "cancelled" ? "Cancelled" : formatXof(a.onboarding.firstInstallment.remainingAmount)} color={a.onboarding.status === "enrolled" ? "var(--success)" : a.onboarding.status === "cancelled" ? "var(--danger)" : "var(--daust-orange)"} />}
      </div>

      {a.stage === "accepted" && (
        <EnrollmentPanel applicantId={a.id} onboarding={a.onboarding} issuedStatusUrl={issuedStatusUrl} canAccept={isAdmin} canCancel={isAdmin} onPrepare={() => setConfirmAcceptanceOpen(true)} onUpdated={updateOnboarding} onCancelled={onboardingCancelled} onError={setErr} />
      )}

      <div style={{ marginTop: 22 }}>
        <Tabs tabs={[{ value: "overview", label: "Overview" }, { value: "timeline", label: "Timeline" }]} active={tab} onChange={setTab} />
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
            <Card title="Application">
              <KV k="Application ID" v={a.id.slice(0, 8)} />
              <KV k="Admission term" v={a.term ?? "—"} />
              <KV k="Program of choice" v={a.program ?? a.programCode ?? "Undeclared"} />
              <KV k="Applied on" v={a.submittedAt.slice(0, 10)} />
              <KV k="Entrance score" v={a.score != null ? `${a.score} / 20` : "—"} />
            </Card>
            <Card title="Personal">
              <KV k="Full name" v={a.name} />
              <KV k="Date of birth" v={a.dateOfBirth ?? "—"} />
              <KV k="Gender" v={a.gender ?? "—"} />
              <KV k="Nationality" v={a.nationality ?? "—"} />
              <KV k="City" v={a.city ?? "—"} />
              <KV k="Email" v={a.email} />
              <KV k="Phone" v={a.phone ?? "—"} />
            </Card>
            <Card title="Academic background">
              <KV k="Applying from" v={a.origin ?? "—"} />
              <KV k={a.origin === "University transfer" ? "Previous university" : "High school"} v={a.school ?? "—"} />
              <KV k="GPA / average" v={a.priorGpa ?? "—"} />
            </Card>
            <Card title="Parent / guardian">
              <KV k="Name" v={a.parentName ?? "—"} />
              <KV k="Phone" v={a.parentPhone ?? "—"} />
              <KV k="Email" v={a.parentEmail ?? "—"} />
            </Card>
            <Card title="Health & other">
              <KV k="Allergies" v={a.allergies ?? "—"} />
              <KV k="Heard about DAUST via" v={a.source ?? "—"} />
            </Card>
            <Card title="Scholarship (est.)">
              <KV k="Merit award" v={a.scholarship.pct > 0 ? `${a.scholarship.pct}%` : "No award"} />
              <KV k="Band" v={a.scholarship.band ?? "—"} />
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>Computed from the current BAC scholarship tiers; confirmed at enrolment.</p>
            </Card>
          </div>
          {a.essay && (
            <div style={{ marginTop: 16 }}>
              <Card title="Statement of purpose">
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{a.essay}</p>
              </Card>
            </div>
          )}
        </>
      )}

      {tab === "timeline" && (
        <Card title="Application timeline">
          {timeline.map(([label, done], i) => (
            <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--bg-subtle)", border: "1px solid var(--border)", color: done ? "var(--success)" : "var(--fg3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                </span>
                {i < timeline.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 16, background: "var(--border)", marginTop: 2 }} />}
              </div>
              <div style={{ paddingTop: 5, fontSize: 13.5, fontWeight: 600, color: done ? "var(--fg1)" : "var(--fg3)" }}>{label}</div>
            </div>
          ))}
        </Card>
      )}

      {editing && (
        <ApplicationModal
          mode="edit"
          applicantId={a.id}
          programs={programOptions}
          initial={{
            firstName: a.firstName,
            lastName: a.lastName,
            email: a.email,
            programCode: a.programCode,
            score: a.score,
            country: a.country,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
      {confirmAcceptanceOpen && isAdmin && (
        <ConfirmDialog
          title="Accept applicant and prepare payment?"
          message={<><strong>{a.name}</strong> will receive a permanent Student ID and first-installment invoice. They will remain payment pending, without student access, until Finance verifies the full installment.</>}
          confirmLabel="Accept and prepare payment"
          danger={false}
          onClose={() => setConfirmAcceptanceOpen(false)}
          onConfirm={confirmAcceptance}
        />
      )}
    </>
  );
}

function onboardingEmailNotice(
  onboarding: ApplicantOnboardingView,
  sent: string,
  notSent: string,
  notRequested = sent,
) {
  if (onboarding.emailDelivery === "not_sent") return notSent;
  if (onboarding.emailDelivery === "not_requested") return notRequested;
  return sent;
}

function EnrollmentPanel({
  applicantId,
  onboarding,
  issuedStatusUrl,
  canAccept,
  canCancel,
  onPrepare,
  onUpdated,
  onCancelled,
  onError,
}: {
  applicantId: string;
  onboarding: ApplicantOnboardingView | null;
  issuedStatusUrl: string | null;
  canAccept: boolean;
  canCancel: boolean;
  onPrepare: () => void;
  onUpdated: (next: ApplicantOnboardingView, message: string) => void;
  onCancelled: (next: ApplicantDetail) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [latestStatusUrl, setLatestStatusUrl] = useState<string | null>(issuedStatusUrl);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (issuedStatusUrl) setLatestStatusUrl(issuedStatusUrl);
  }, [issuedStatusUrl]);

  async function resend() {
    setBusy("resend");
    onError(null);
    try {
      const { onboarding: next } = await resendApplicantAcceptanceEmail(applicantId);
      setLatestStatusUrl(next.statusUrl ?? null);
      onUpdated(next, onboardingEmailNotice(
        next,
        "Acceptance email resent with a new private status link.",
        "A new private status link was created, but email delivery failed. Copy it below.",
      ));
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Could not resend the acceptance email.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function rotate() {
    setBusy("rotate");
    onError(null);
    try {
      const { onboarding: next } = await rotateApplicantOnboardingLink(applicantId);
      setLatestStatusUrl(next.statusUrl ?? null);
      setConfirmRotate(false);
      onUpdated(next, onboardingEmailNotice(
        next,
        "Old links cancelled; replacement links were emailed.",
        "Old links were cancelled and replacements created, but email delivery failed. Copy the new link below.",
      ));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not replace the enrollment links.");
      throw cause;
    } finally {
      setBusy(null);
    }
  }

  async function resendStudentInvite() {
    setBusy("student-invite");
    onError(null);
    try {
      const next = await resendApplicantStudentInvite(applicantId);
      setLatestInviteUrl(next.studentInvite.inviteUrl);
      if (next.onboarding)
        onUpdated(
          next.onboarding,
          next.studentInvite.delivery === "sent"
            ? "Account-setup invitation resent."
            : "Invitation created, but email delivery failed. Copy the one-time link below.",
        );
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Could not resend the account-setup invitation.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      onError(
        "Could not copy automatically. Open the link and copy it from the address bar.",
      );
    }
  }

  if (!onboarding || onboarding.status === "not_started") {
    return (
      <section
        className="card"
        style={{
          marginTop: 16,
          marginBottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: 16 }}>Enrollment payment not prepared</h3>
          <p className="muted" style={{ margin: "5px 0 0", fontSize: 12.5 }}>
            Generate the permanent Student ID and first-installment invoice. The
            applicant will remain outside the student roster until verified
            payment.
          </p>
        </div>
        {canAccept ? (
          <button
            className="primary"
            disabled={busy !== null}
            onClick={onPrepare}
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <UserCheck size={15} /> Prepare payment
          </button>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
            An administrator must issue the permanent Student ID and invoice.
          </p>
        )}
      </section>
    );
  }

  const installment = onboarding.firstInstallment;
  const required = installment?.amountDue ?? onboarding.requiredCashXof ?? 0;
  const paid = installment?.amountPaid ?? 0;
  const remaining =
    installment?.remainingAmount ?? Math.max(0, required - paid);
  const pct =
    required > 0 ? Math.min(100, Math.round((paid / required) * 100)) : 0;
  const enrolled = onboarding.status === "enrolled";
  const paymentPending = onboarding.status === "payment_pending";
  const cancelled = onboarding.status === "cancelled";
  const proofLabel: Record<string, string> = {
    none: "No proof",
    awaiting_proof: "Proof needed",
    submitted: "Proof under review",
    approved: "Proof approved",
    rejected: "Proof rejected",
    cancelled: "Attempt cancelled",
  };

  return (
    <section
      className="card"
      style={{ marginTop: 16, marginBottom: 0, padding: 0, overflow: "hidden" }}
      aria-labelledby="enrollment-payment-heading"
    >
      <div
        style={{
          padding: "18px 20px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Payment-gated activation
          </div>
          <h3 id="enrollment-payment-heading" style={{ fontSize: 17 }}>
            Enrollment payment
          </h3>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
            Student ID{" "}
            <strong style={{ color: "var(--fg1)" }}>
              {onboarding.studentNo ?? "—"}
            </strong>{" "}
            · {onboarding.academicYear?.label ?? "Academic year not set"}
          </p>
          <p className="muted" style={{ margin: "5px 0 0", fontSize: 10.5 }}>
            Identity and billing fields are locked after Student ID issuance;
            corrections require a reviewed Registrar/Finance workflow.
          </p>
        </div>
        <Badge tone={ONBOARDING_TONE[onboarding.status] ?? "neutral"}>
          {ONBOARDING_LABEL[onboarding.status] ?? onboarding.status}
        </Badge>
      </div>

      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <PaymentFigure label="Required" value={required} />
            <PaymentFigure
              label="Verified cash"
              value={paid}
              color="var(--success)"
            />
            <PaymentFigure
              label="Remaining"
              value={remaining}
              color={remaining > 0 ? "var(--daust-orange)" : "var(--success)"}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 20,
              fontSize: 10.5,
              color: "var(--fg3)",
            }}
          >
            <span>{pct}% verified</span>
            <span>
              {installment?.dueDate
                ? `Due ${formatDate(installment.dueDate)}`
                : "No due date"}
            </span>
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-label="Verified first installment"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            style={{ marginTop: 6 }}
          >
            <span
              style={{
                width: `${pct}%`,
                background: enrolled
                  ? "var(--success)"
                  : cancelled
                    ? "var(--danger)"
                    : "var(--daust-orange)",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              padding: "11px 12px",
              borderRadius: 8,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>
              {enrolled
                ? "First installment verified; account access issued."
                : cancelled
                  ? "Onboarding cancelled; Student ID retained and no access issued."
                  : (proofLabel[onboarding.proofStatus] ??
                    onboarding.proofStatus)}
            </span>
            {onboarding.acceptanceEmailSentAt && (
              <span className="muted" style={{ fontSize: 10 }}>
                Email sent{" "}
                {new Date(onboarding.acceptanceEmailSentAt).toLocaleDateString(
                  "en-GB",
                )}
              </span>
            )}
          </div>
        </div>

        <div
          style={{ borderLeft: "1px solid var(--divider)", paddingLeft: 24 }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--fg3)",
              marginBottom: 10,
            }}
          >
            STAFF ACTIONS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {onboarding.studentNo && (
              <button
                type="button"
                onClick={() => copy("student-id", onboarding.studentNo!)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <Copy size={14} />{" "}
                {copied === "student-id" ? "Student ID copied" : "Copy Student ID"}
              </button>
            )}
            {onboarding.paymentLink?.url && paymentPending && (
              <a
                href={onboarding.paymentLink.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "9px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Open payment page <ExternalLink size={14} />
              </a>
            )}
            {onboarding.paymentLink?.url && paymentPending && (
              <button
                type="button"
                onClick={() => copy("payment", onboarding.paymentLink!.url)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <Copy size={14} />{" "}
                {copied === "payment"
                  ? "Payment link copied"
                  : "Copy payment link"}
              </button>
            )}
            {latestStatusUrl && paymentPending && (
              <button
                type="button"
                onClick={() => copy("status", latestStatusUrl)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <Copy size={14} />{" "}
                {copied === "status"
                  ? "Private link copied"
                  : "Copy new private status link"}
              </button>
            )}
            {latestInviteUrl && (
              <button
                type="button"
                onClick={() => copy("invite", latestInviteUrl)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <Copy size={14} />{" "}
                {copied === "invite"
                  ? "Setup link copied"
                  : "Copy one-time account setup link"}
              </button>
            )}
            {paymentPending && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={resend}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <Mail size={14} />{" "}
                {busy === "resend" ? "Sending…" : "Resend acceptance email"}
              </button>
            )}
            {paymentPending && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmRotate(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  color: "var(--warning)",
                }}
              >
                <RefreshCw size={14} /> Replace payment and status links
              </button>
            )}
            {enrolled && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={resendStudentInvite}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
              >
                <Mail size={14} />{" "}
                {busy === "student-invite"
                  ? "Sending…"
                  : "Resend account setup"}
              </button>
            )}
            {enrolled && onboarding.studentId && (
              <Link
                href={`/admin/students/${onboarding.studentId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "9px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Open student record <ExternalLink size={14} />
              </Link>
            )}
            {canCancel && paymentPending && paid <= 0 && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setCancelOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  color: "var(--danger)",
                }}
              >
                <X size={14} /> Cancel onboarding
              </button>
            )}
            {canCancel && paymentPending && paid > 0 && (
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 10.5, lineHeight: 1.45 }}>
                Cancellation is unavailable after verified cash. Contact Finance
                for a reviewed correction.
              </p>
            )}
          </div>
        </div>
      </div>

      {confirmRotate && (
        <ConfirmDialog
          title="Replace enrollment links?"
          message="The current payment and private status links will stop working immediately. A replacement acceptance email will be sent to the applicant."
          confirmLabel="Replace and send"
          danger={false}
          onClose={() => setConfirmRotate(false)}
          onConfirm={rotate}
        />
      )}
      {cancelOpen && (
        <CancelOnboardingDialog
          applicantId={applicantId}
          studentNo={onboarding.studentNo}
          onClose={() => setCancelOpen(false)}
          onCancelled={(next) => {
            setCancelOpen(false);
            setLatestStatusUrl(null);
            setLatestInviteUrl(null);
            onCancelled(next);
          }}
        />
      )}
    </section>
  );
}

function CancelOnboardingDialog({
  applicantId,
  studentNo,
  onClose,
  onCancelled,
}: {
  applicantId: string;
  studentNo: string | null;
  onClose: () => void;
  onCancelled: (next: ApplicantDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedReason = reason.trim();
  const valid = trimmedReason.length >= 10 && trimmedReason.length <= 500;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await cancelApplicantOnboarding(applicantId, trimmedReason);
      onCancelled(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel onboarding.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Cancel payment-pending enrollment?"
      width={500}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>Keep onboarding</button>
          <button
            type="submit"
            form="cancel-onboarding-form"
            disabled={!valid || busy}
            style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }}
          >
            {busy ? "Cancelling…" : "Cancel onboarding"}
          </button>
        </>
      }
    >
      <form id="cancel-onboarding-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger) 35%, var(--border))", background: "color-mix(in srgb, var(--danger) 7%, var(--surface))", fontSize: 12.5, lineHeight: 1.55 }}>
          <strong>Student ID {studentNo ?? "—"} is permanent and will remain reserved.</strong>{" "}
          Enrollment billing and open payment attempts will be voided, and no
          student access will be issued. This action is allowed only before any
          verified cash is received.
        </div>
        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ fontSize: 12.5, fontWeight: 650 }}>Cancellation reason</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={10}
            maxLength={500}
            required
            rows={4}
            aria-describedby="cancel-onboarding-reason-help"
            placeholder="Explain why this accepted applicant should not continue to payment."
          />
          <span id="cancel-onboarding-reason-help" className="muted" style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 10.5 }}>
            <span>Enter 10–500 characters. The reason is kept in the audit history.</span>
            <span>{reason.length}/500</span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

function PaymentFigure({
  label,
  value,
  color = "var(--fg1)",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <span className="muted" style={{ fontSize: 10.5 }}>
        {label}
      </span>
      <div
        style={{
          marginTop: 5,
          color,
          fontFamily: "var(--font-display)",
          fontWeight: 750,
          fontSize: 18,
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
        }}
      >
        {formatXof(value)}
      </div>
    </div>
  );
}

function HeroPill({ icon: Icon, children }: { icon: typeof Target; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, color: "#fff" }}>
      <Icon size={13} color="#a9c4ec" />{children}
    </span>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof Target; label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--fg3)" }}>
        <Icon size={14} color="var(--daust-navy)" /> {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginTop: 8, color }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <h4 style={{ margin: "0 0 12px", fontFamily: "var(--font-display)", fontSize: 14.5, fontWeight: 700 }}>{title}</h4>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--divider)", fontSize: 13 }}>
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GraduationCap,
  Info,
  LockKeyhole,
  Moon,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRoundCheck,
} from "lucide-react";
import {
  ApiError,
  type ApplicantProofStatus,
  type PublicApplicationStatus,
  getPublicApplicationStatus,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import styles from "./status.module.css";

const PROOF_COPY: Record<
  ApplicantProofStatus,
  {
    label: string;
    detail: string;
    tone: "neutral" | "warning" | "success" | "error";
  }
> = {
  none: {
    label: "No payment submitted",
    detail: "Choose a payment option when you are ready.",
    tone: "neutral",
  },
  awaiting_proof: {
    label: "Proof needed",
    detail:
      "Your payment was started. Upload the transaction receipt to send it to Finance.",
    tone: "warning",
  },
  submitted: {
    label: "Proof under review",
    detail:
      "Finance has received your receipt. Enrollment waits for verification.",
    tone: "warning",
  },
  approved: {
    label: "Payment verified",
    detail: "Verified cash has been applied to your first installment.",
    tone: "success",
  },
  rejected: {
    label: "Proof not approved",
    detail:
      "Finance could not verify the receipt. Open payment to review the reason and try again.",
    tone: "error",
  },
  cancelled: {
    label: "Payment attempt cancelled",
    detail: "Start a new payment when you are ready.",
    tone: "neutral",
  },
};

export default function ApplicationStatusPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicApplicationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"missing" | "network" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPublicApplicationStatus(token));
    } catch (cause) {
      setError(
        cause instanceof ApiError && [404, 410].includes(cause.status)
          ? "missing"
          : "network",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const stored = localStorage.getItem("daust-theme");
    const preferredDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const initial =
      stored === "dark" || (!stored && preferredDark) ? "dark" : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  useEffect(() => void load(), [load]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("daust-theme", next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <img src="/logo-daust.png" alt="DAUST" />
            <span className={styles.brandDivider} aria-hidden="true" />
            <span>Application status</span>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.secure}>
              <LockKeyhole size={14} /> Private link
            </span>
            <button
              className={styles.themeButton}
              type="button"
              onClick={toggleTheme}
              aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <div className={styles.canvas}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState kind={error} onRetry={load} />
        ) : data ? (
          <StatusView data={data} />
        ) : null}
      </div>
    </main>
  );
}

function StatusView({ data }: { data: PublicApplicationStatus }) {
  const installment = data.firstInstallment;
  const enrolled = data.onboardingStatus === "enrolled";
  const cancelled = data.onboardingStatus === "cancelled";
  const paymentPending = data.onboardingStatus === "payment_pending";
  const paidPct = useMemo(
    () =>
      installment.amountDue > 0
        ? Math.min(
            100,
            Math.round((installment.amountPaid / installment.amountDue) * 100),
          )
        : 0,
    [installment.amountDue, installment.amountPaid],
  );
  const proof = PROOF_COPY[data.proofStatus];
  const statusLabel = enrolled
    ? "Enrollment complete"
    : cancelled
      ? "Enrollment cancelled"
      : installment.amountPaid > 0
        ? "Payment pending · partially paid"
        : "Accepted · payment pending";

  return (
    <article className={styles.statusShell}>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            {enrolled
              ? "Welcome to DAUST"
              : cancelled
                ? "Enrollment closed"
                : "Admission confirmed"}
          </p>
          <h1>{data.applicant.name}</h1>
          <p className={styles.heroLead}>
            {enrolled
              ? "Your first installment is complete and your student record is active."
              : cancelled
                ? "This enrollment was cancelled. Contact DAUST Admissions if you need help."
                : "Your place is reserved. Complete the first installment to activate your student record."}
          </p>
          <span
            className={`${styles.statePill} ${enrolled ? styles.stateComplete : cancelled ? styles.stateCancelled : styles.statePending}`}
          >
            {enrolled ? (
              <CheckCircle2 size={15} />
            ) : cancelled ? (
              <Info size={15} />
            ) : (
              <Clock3 size={15} />
            )}
            {statusLabel}
          </span>
        </div>
        <div className={styles.identityBlock}>
          <p>Student ID</p>
          <strong>{data.studentNo ?? "Pending"}</strong>
          <span>Use this ID with your date of birth on payment.daust.net.</span>
        </div>
      </div>

      <ol className={styles.timeline} aria-label="Enrollment progress">
        <TimelineStep done label="Accepted" detail="Admission decision" />
        <TimelineStep
          done={enrolled}
          current={paymentPending}
          label="First payment"
          detail={
            enrolled
              ? "Verified"
              : cancelled
                ? "Enrollment closed"
                : "Awaiting full amount"
          }
        />
        <TimelineStep
          done={enrolled}
          label="Student access"
          detail={
            enrolled
              ? "Active"
              : cancelled
                ? "Not activated"
                : "Starts after payment"
          }
        />
      </ol>

      <div className={styles.detailsGrid}>
        <section
          className={styles.paymentSection}
          aria-labelledby="payment-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Enrollment payment</p>
              <h2 id="payment-heading">First installment</h2>
            </div>
            <span
              className={`${styles.proofBadge} ${styles[`proof_${proof.tone}`]}`}
            >
              {enrolled ? "Complete" : proof.label}
            </span>
          </div>

          <div className={styles.amountGrid}>
            <Amount label="Required" value={installment.amountDue} />
            <Amount
              label="Verified cash"
              value={installment.amountPaid}
              tone="success"
            />
            <Amount
              label="Remaining"
              value={installment.remainingAmount}
              tone={installment.remainingAmount > 0 ? "orange" : "success"}
            />
          </div>

          <div className={styles.progressCopy}>
            <span>{paidPct}% verified</span>
            <span>
              {installment.dueDate
                ? `Due ${formatDate(installment.dueDate)}`
                : "No due date"}
            </span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Verified first installment"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={paidPct}
          >
            <span style={{ width: `${paidPct}%` }} />
          </div>

          {paymentPending && (
            <div
              className={`${styles.notice} ${styles[`notice_${proof.tone}`]}`}
              role="status"
              aria-live="polite"
            >
              <ReceiptText size={18} />
              <div>
                <strong>{proof.label}</strong>
                <span>{proof.detail}</span>
              </div>
            </div>
          )}

          {!data.readOnly && data.payment.canPay && data.payment.paymentUrl && (
            <div className={styles.payActions}>
              <Link
                className={styles.primaryAction}
                href={data.payment.paymentUrl}
                prefetch={false}
              >
                Continue to payment <ArrowRight size={17} />
              </Link>
              <p>
                <Smartphone size={14} /> Wave or Orange Money proof, bank
                transfer proof, and PI-SPI are available on the secure payment
                page.
              </p>
            </div>
          )}

          {paymentPending && data.payment.publicBillUrl && (
            <div className={styles.alternateRoute}>
              <div>
                <strong>Pay another way</strong>
                <span>
                  Use your Student ID and date of birth on DAUST’s public
                  payment portal.
                </span>
              </div>
              <Link href={data.payment.publicBillUrl} prefetch={false}>
                Open payment.daust.net <ExternalLink size={14} />
              </Link>
            </div>
          )}

          {enrolled && (
            <div
              className={`${styles.notice} ${styles.notice_success}`}
              role="status"
            >
              <UserRoundCheck size={20} />
              <div>
                <strong>Your student record is active</strong>
                <span>
                  Check your email for the secure account-setup invitation. This
                  page is now read-only.
                </span>
              </div>
            </div>
          )}
          {cancelled && (
            <div
              className={`${styles.notice} ${styles.notice_error}`}
              role="status"
            >
              <Info size={20} />
              <div>
                <strong>Enrollment cancelled</strong>
                <span>
                  Your Student ID remains reserved, but student access was not
                  activated. Contact Admissions for any correction or next step.
                </span>
              </div>
            </div>
          )}
        </section>

        <aside
          className={styles.summarySection}
          aria-labelledby="summary-heading"
        >
          <p className={styles.eyebrow}>Application</p>
          <h2 id="summary-heading">Your admission</h2>
          <dl className={styles.summaryList}>
            <SummaryRow
              icon={GraduationCap}
              label="Program"
              value={
                data.applicant.program ??
                data.applicant.programCode ??
                "To be confirmed"
              }
            />
            <SummaryRow
              icon={CalendarDays}
              label="Academic year"
              value={data.applicant.academicYear?.label ?? "To be confirmed"}
            />
            <SummaryRow icon={ShieldCheck} label="Admission" value="Accepted" />
            <SummaryRow
              icon={Banknote}
              label="Payment status"
              value={
                enrolled
                  ? "First installment paid"
                  : cancelled
                    ? "Enrollment cancelled"
                    : installment.status === "partial"
                      ? "Partially paid"
                      : installment.status === "overdue"
                        ? "Payment overdue"
                        : "Payment pending"
              }
            />
          </dl>
          <div className={styles.securityNote}>
            <LockKeyhole size={15} />
            <span>
              This private link contains access to your application status. Do
              not forward it.
            </span>
          </div>
        </aside>
      </div>
    </article>
  );
}

function TimelineStep({
  done = false,
  current = false,
  label,
  detail,
}: {
  done?: boolean;
  current?: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li
      className={`${styles.timelineStep} ${done ? styles.timelineDone : ""} ${current ? styles.timelineCurrent : ""}`}
      aria-current={current ? "step" : undefined}
    >
      <span className={styles.timelineMarker}>
        {done ? <Check size={15} /> : current ? <Clock3 size={14} /> : null}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </li>
  );
}

function Amount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "orange";
}) {
  return (
    <div className={styles.amount}>
      <span>{label}</span>
      <strong className={tone ? styles[`amount_${tone}`] : undefined}>
        {formatXof(value)}
      </strong>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GraduationCap;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.summaryRow}>
      <dt>
        <Icon size={16} />
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.centerState} role="status" aria-live="polite">
      <span className={styles.spinner} />
      <h1>Loading your application</h1>
      <p>Checking the latest admission and payment status…</p>
    </div>
  );
}

function ErrorState({
  kind,
  onRetry,
}: {
  kind: "missing" | "network";
  onRetry: () => void;
}) {
  const missing = kind === "missing";
  return (
    <div className={styles.centerState}>
      <span className={styles.errorIcon}>
        {missing ? <LockKeyhole size={26} /> : <Info size={26} />}
      </span>
      <h1>
        {missing
          ? "This private link is no longer available"
          : "We could not load your status"}
      </h1>
      <p>
        {missing
          ? "It may have expired or been replaced. Contact DAUST Admissions for a new link."
          : "Check your connection and try again. Your application information has not changed."}
      </p>
      {!missing && (
        <button className={styles.retryButton} type="button" onClick={onRetry}>
          <RefreshCw size={15} /> Try again
        </button>
      )}
      <a className={styles.contactLink} href="mailto:admissions@daust.org">
        Contact Admissions
      </a>
    </div>
  );
}

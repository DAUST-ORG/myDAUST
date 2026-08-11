"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CalendarCheck2,
  CircleDollarSign,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { Badge, Stat, type BadgeTone } from "@/components/ui";
import type {
  AccountBalanceSummary,
  AccountStanding,
  InstallmentDueState,
  InstallmentPaymentProgress,
} from "@/lib/api";
import {
  formatDate,
  formatXof,
  formatXofAbbrev,
  formatXofCompact,
} from "@/lib/format";

export interface InstallmentPositionLike {
  dueDate: string | null;
  amountDue: number;
  /** Cash posted directly to this installment. */
  amountPaid: number;
  /** Authenticated invoice payload names. */
  outstanding?: number;
  creditApplied?: number;
  /** Canonical/public XOF aliases. */
  outstandingXof?: number;
  creditAppliedXof?: number;
  effectiveSettledXof?: number;
  paymentProgress?: InstallmentPaymentProgress;
  dueState?: InstallmentDueState;
  daysPastDue?: number;
}

export function installmentCreditApplied(
  installment: InstallmentPositionLike,
): number {
  return Math.max(
    0,
    installment.creditAppliedXof ?? installment.creditApplied ?? 0,
  );
}

export function installmentOutstanding(
  installment: InstallmentPositionLike,
): number {
  const derived = installment.outstandingXof ?? installment.outstanding;
  if (derived !== undefined) return Math.max(0, derived);
  if (installment.effectiveSettledXof !== undefined) {
    return Math.max(0, installment.amountDue - installment.effectiveSettledXof);
  }
  return Math.max(
    0,
    installment.amountDue -
      installment.amountPaid -
      installmentCreditApplied(installment),
  );
}

export function installmentEffectiveSettled(
  installment: InstallmentPositionLike,
): number {
  if (installment.effectiveSettledXof !== undefined) {
    return Math.max(0, installment.effectiveSettledXof);
  }
  if (
    installment.outstandingXof !== undefined ||
    installment.outstanding !== undefined
  ) {
    return Math.max(
      0,
      installment.amountDue - installmentOutstanding(installment),
    );
  }
  return Math.max(
    0,
    installment.amountPaid + installmentCreditApplied(installment),
  );
}

/**
 * Compatibility balance for an invoice response that predates its derived summary.
 * A complete plan uses credit-adjusted line positions; any genuine schedule gap remains
 * unscheduled instead of disappearing.
 */
export function invoiceEffectiveOutstanding(input: {
  balance: number;
  total: number;
  effectiveOutstandingXof?: number;
  installments: InstallmentPositionLike[];
}): number {
  if (input.effectiveOutstandingXof !== undefined) {
    return Math.max(0, input.effectiveOutstandingXof);
  }
  if (input.installments.length === 0) return Math.max(0, input.balance);
  const scheduledOutstanding = input.installments.reduce(
    (sum, line) => sum + installmentOutstanding(line),
    0,
  );
  const rawScheduledOutstanding = input.installments.reduce(
    (sum, line) => sum + Math.max(0, line.amountDue - line.amountPaid),
    0,
  );
  const scheduleGap = Math.max(
    0,
    Math.max(0, input.balance) - rawScheduledOutstanding,
  );
  return scheduledOutstanding + scheduleGap;
}

const DAKAR_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Dakar",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return DAKAR_DATE.format(date);
}

function calendarDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * Conservative compatibility summary for pages loading against an older API task.
 * A raw positive balance is never called overdue without payment-plan dates.
 */
export function fallbackAccountSummary(input: {
  balanceXof: number;
  billedXof?: number;
  installments?: InstallmentPositionLike[];
  now?: Date;
}): AccountBalanceSummary {
  const now = input.now ?? new Date();
  const today = dateKey(now);
  const balanceXof = input.balanceXof;
  const outstandingXof = Math.max(0, balanceXof);
  const creditXof = Math.max(0, -balanceXof);

  const open = (input.installments ?? [])
    .map((line) => ({
      dueDate: line.dueDate ? dateKey(line.dueDate) : null,
      outstanding: installmentOutstanding(line),
    }))
    .filter((line) => line.outstanding > 0)
    .sort((a, b) =>
      a.dueDate && b.dueDate
        ? a.dueDate.localeCompare(b.dueDate)
        : a.dueDate
          ? -1
          : b.dueDate
            ? 1
            : 0,
    );

  // Account credits reduce the oldest scheduled obligation first, matching settlement order.
  let creditOffset = Math.max(
    0,
    open.reduce((sum, line) => sum + line.outstanding, 0) - outstandingXof,
  );
  const remaining = open
    .map((line) => {
      const applied = Math.min(creditOffset, line.outstanding);
      creditOffset -= applied;
      return { ...line, outstanding: line.outstanding - applied };
    })
    .filter((line) => line.outstanding > 0);

  const overdue = remaining.filter(
    (line): line is typeof line & { dueDate: string } =>
      line.dueDate !== null && line.dueDate < today,
  );
  const todayLines = remaining.filter((line) => line.dueDate === today);
  const future = remaining.filter(
    (line): line is typeof line & { dueDate: string } =>
      line.dueDate !== null && line.dueDate > today,
  );
  const overdueXof = overdue.reduce((sum, line) => sum + line.outstanding, 0);
  const dueTodayXof = todayLines.reduce(
    (sum, line) => sum + line.outstanding,
    0,
  );
  const futureScheduledXof = future.reduce(
    (sum, line) => sum + line.outstanding,
    0,
  );
  const notYetDueXof = dueTodayXof + futureScheduledXof;
  const unscheduledXof = Math.max(
    0,
    outstandingXof - overdueXof - notYetDueXof,
  );
  const oldestOverdueDate = overdue[0]?.dueDate ?? null;
  const nextDueDate = [...todayLines, ...future][0]?.dueDate ?? null;

  let standing: AccountStanding;
  if (creditXof > 0) standing = "credit";
  else if (outstandingXof === 0)
    standing = (input.billedXof ?? 0) <= 0 ? "no_billing" : "cleared";
  else if (overdueXof > 0) standing = "overdue";
  else if (unscheduledXof > 0) standing = "unscheduled";
  else standing = "on_time";

  return {
    balanceXof,
    outstandingXof,
    creditXof,
    overdueXof,
    dueTodayXof,
    futureScheduledXof,
    notYetDueXof,
    unscheduledXof,
    nextDueDate,
    oldestOverdueDate,
    daysPastDue: oldestOverdueDate
      ? calendarDaysBetween(oldestOverdueDate, today)
      : 0,
    standing,
  };
}

export function resolveAccountSummary(
  summary: AccountBalanceSummary | null | undefined,
  fallback: Parameters<typeof fallbackAccountSummary>[0],
): AccountBalanceSummary {
  return summary ?? fallbackAccountSummary(fallback);
}

export interface AccountPresentation {
  label: string;
  tone: BadgeTone;
  color: string;
  description: string;
}

export function accountPresentation(
  summary: AccountBalanceSummary,
): AccountPresentation {
  if (summary.standing === "overdue") {
    return {
      label: "Overdue",
      tone: "error",
      color: "var(--danger)",
      description: `${formatXof(summary.overdueXof)} past due${summary.daysPastDue ? ` · ${summary.daysPastDue} days` : ""}`,
    };
  }
  if (summary.standing === "unscheduled") {
    return {
      label: "Schedule needed",
      tone: "warning",
      color: "var(--warning)",
      description: `${formatXof(summary.unscheduledXof)} has no payment date`,
    };
  }
  if (summary.standing === "credit") {
    return {
      label: "Credit",
      tone: "success",
      color: "var(--success)",
      description: `${formatXof(summary.creditXof)} available`,
    };
  }
  if (summary.standing === "cleared") {
    return {
      label: "Cleared",
      tone: "success",
      color: "var(--success)",
      description: "Paid in full",
    };
  }
  if (summary.standing === "no_billing") {
    return {
      label: "Not billed",
      tone: "neutral",
      color: "var(--fg3)",
      description: "No charges on account",
    };
  }
  if (summary.dueTodayXof > 0) {
    return {
      label: "Due today",
      tone: "warning",
      color: "var(--daust-navy)",
      description: `${formatXof(summary.dueTodayXof)} due today`,
    };
  }
  return {
    label: "On time",
    tone: "navy",
    color: "var(--daust-navy)",
    description: summary.nextDueDate
      ? `Next due ${formatDate(summary.nextDueDate)}`
      : "Payment plan is current",
  };
}

export function accountBalanceLabel(summary: AccountBalanceSummary): string {
  if (summary.standing === "credit")
    return `Credit ${formatXof(summary.creditXof)}`;
  if (summary.standing === "cleared") return "Cleared";
  if (summary.standing === "no_billing") return "Not billed";
  return formatXof(summary.outstandingXof);
}

export function AccountBalanceText({
  summary,
  className,
  style,
}: {
  summary: AccountBalanceSummary;
  className?: string;
  style?: React.CSSProperties;
}) {
  const meta = accountPresentation(summary);
  return (
    <span
      className={className}
      style={{
        color: meta.color,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
      aria-label={`${accountBalanceLabel(summary)}; ${meta.label}`}
    >
      {accountBalanceLabel(summary)}
    </span>
  );
}

export function AccountStandingBadge({
  summary,
}: {
  summary: AccountBalanceSummary;
}) {
  const meta = accountPresentation(summary);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function AccountStatusLine({
  summary,
  className,
}: {
  summary: AccountBalanceSummary;
  className?: string;
}) {
  const meta = accountPresentation(summary);
  const statusColor =
    summary.standing === "on_time" && summary.dueTodayXof > 0
      ? "var(--warning)"
      : meta.color;
  return (
    <span
      className={className}
      style={{
        color: statusColor,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.25,
      }}
    >
      {meta.description}
    </span>
  );
}

export function InstallmentStandingBadge({
  installment,
}: {
  installment: InstallmentPositionLike;
}) {
  const outstanding = installmentOutstanding(installment);
  if (outstanding === 0) {
    return (
      <Badge tone="success">
        {installmentCreditApplied(installment) > 0 ? "Settled" : "Paid"}
      </Badge>
    );
  }
  if (installment.dueState === "overdue") {
    return <Badge tone="error">Overdue</Badge>;
  }
  if (installment.dueState === "due_today") {
    return <Badge tone="warning">Due today</Badge>;
  }
  if (installment.dueState === "unscheduled") {
    return <Badge tone="warning">Schedule needed</Badge>;
  }
  const summary = fallbackAccountSummary({
    balanceXof: outstanding,
    billedXof: installment.amountDue,
    installments: [installment],
  });
  if (summary.standing === "overdue")
    return <Badge tone="error">Overdue</Badge>;
  if (summary.dueTodayXof > 0) return <Badge tone="warning">Due today</Badge>;
  if (
    installment.paymentProgress === "partial" ||
    installmentEffectiveSettled(installment) > 0
  ) {
    return <Badge tone="navy">Partly settled</Badge>;
  }
  return <Badge tone="navy">Scheduled</Badge>;
}

export interface ReceivablesMetrics {
  grossOutstandingXof: number;
  overdueXof: number;
  onTimeCount: number;
  overdueCount: number;
  clearedCount: number;
  activeHoldCount: number;
}

export function ReceivablesKpis({ metrics }: { metrics: ReceivablesMetrics }) {
  return (
    <div className="receivables-kpi-grid">
      <Stat
        label="Gross outstanding"
        value={formatXofAbbrev(metrics.grossOutstandingXof)}
        sub="FCFA scheduled or open"
        tone="var(--daust-navy)"
        icon={<WalletCards size={16} />}
      />
      <Stat
        label="Overdue amount"
        value={formatXofAbbrev(metrics.overdueXof)}
        sub="FCFA past plan dates"
        tone={metrics.overdueXof > 0 ? "var(--danger)" : "var(--success)"}
        icon={<AlertTriangle size={16} />}
      />
      <Stat
        label="On time"
        value={metrics.onTimeCount}
        sub="accounts with current balances"
        tone="var(--daust-navy)"
        icon={<CalendarCheck2 size={16} />}
      />
      <Stat
        label="Overdue"
        value={metrics.overdueCount}
        sub="accounts past due"
        tone={metrics.overdueCount > 0 ? "var(--danger)" : "var(--success)"}
        icon={<CircleDollarSign size={16} />}
      />
      <Stat
        label="Cleared"
        value={metrics.clearedCount}
        sub="paid accounts"
        tone="var(--success)"
        icon={<BadgeCheck size={16} />}
      />
      <Stat
        label="Active holds"
        value={metrics.activeHoldCount}
        sub="actual registration holds"
        tone={metrics.activeHoldCount > 0 ? "var(--warning)" : "var(--success)"}
        icon={<ShieldAlert size={16} />}
      />
    </div>
  );
}

export interface AgingBucketDisplay {
  key: string;
  label: string;
  amount: number;
  /** Unique student accounts represented in the bucket. */
  accountCount?: number;
  /** Real payment-plan installments; unscheduled obligations may have zero. */
  installmentCount?: number;
  /** Legacy open-item count during an additive API rollout. */
  count?: number;
}

function agingTone(key: string): { color: string; marker: string } {
  if (key === "due_today")
    return { color: "var(--warning)", marker: "#d6731a" };
  if (key === "unscheduled")
    return { color: "var(--warning)", marker: "#d6731a" };
  if (["current", "not_yet_due", "not-yet-due"].includes(key))
    return { color: "var(--daust-navy)", marker: "var(--daust-navy)" };
  return { color: "var(--danger)", marker: "var(--danger)" };
}

export function AgingBuckets({
  buckets,
  title = "Outstanding by payment-plan age",
}: {
  buckets: AgingBucketDisplay[];
  title?: string;
}) {
  return (
    <section className="aging-panel" aria-labelledby="aging-heading">
      <div className="aging-panel-head">
        <div>
          <h2 id="aging-heading">{title}</h2>
          <p>Only unpaid portions are aged; today remains on time.</p>
        </div>
        <span className="aging-asof">Africa/Dakar business date</span>
      </div>
      <div className="aging-grid" role="list">
        {buckets.map((bucket) => {
          const tone = agingTone(bucket.key);
          const accountCount = bucket.accountCount ?? bucket.count ?? 0;
          const installmentCount = bucket.installmentCount ?? bucket.count ?? 0;
          return (
            <div className="aging-bucket" role="listitem" key={bucket.key}>
              <span
                className="aging-marker"
                style={{ background: tone.marker }}
              />
              <span className="aging-label">{bucket.label}</span>
              <strong
                style={{ color: tone.color }}
                title={formatXof(bucket.amount)}
              >
                {formatXofCompact(bucket.amount)}
              </strong>
              <span className="aging-count">
                {accountCount.toLocaleString()}{" "}
                {accountCount === 1 ? "account" : "accounts"}
                {" · "}
                {installmentCount.toLocaleString()}{" "}
                {installmentCount === 1 ? "installment" : "installments"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

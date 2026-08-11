"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ArAging,
  type FeePlan,
  type StudentAccountRow,
  getArAging,
  getCurrentTerm,
  getFeePlan,
  listStudentAccounts,
} from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Avatar, Card, PageHeader } from "@/components/ui";
import {
  AccountBalanceText,
  AccountStandingBadge,
  AgingBuckets,
  ReceivablesKpis,
  resolveAccountSummary,
  type AgingBucketDisplay,
} from "@/components/AccountBalance";

function fallbackAging(rows: StudentAccountRow[]): AgingBucketDisplay[] {
  const buckets: AgingBucketDisplay[] = [
    {
      key: "current",
      label: "Not yet overdue",
      amount: 0,
      accountCount: 0,
      installmentCount: 0,
    },
    {
      key: "1-30",
      label: "1–30 days",
      amount: 0,
      accountCount: 0,
      installmentCount: 0,
    },
    {
      key: "31-60",
      label: "31–60 days",
      amount: 0,
      accountCount: 0,
      installmentCount: 0,
    },
    {
      key: "61-90",
      label: "61–90 days",
      amount: 0,
      accountCount: 0,
      installmentCount: 0,
    },
    {
      key: "90+",
      label: "Over 90 days",
      amount: 0,
      accountCount: 0,
      installmentCount: 0,
    },
    {
      key: "unscheduled",
      label: "No schedule",
      amount: 0,
      accountCount: 0,
      installmentCount: 0,
    },
  ];
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const row of rows) {
    const summary = resolveAccountSummary(row.summary, {
      balanceXof: row.balance,
      billedXof: row.billed,
    });
    if (summary.notYetDueXof > 0) {
      const bucket = byKey.get("current")!;
      bucket.amount += summary.notYetDueXof;
      bucket.accountCount = (bucket.accountCount ?? 0) + 1;
      bucket.installmentCount = (bucket.installmentCount ?? 0) + 1;
    }
    if (summary.overdueXof > 0) {
      const key =
        summary.daysPastDue <= 30
          ? "1-30"
          : summary.daysPastDue <= 60
            ? "31-60"
            : summary.daysPastDue <= 90
              ? "61-90"
              : "90+";
      const bucket = byKey.get(key)!;
      bucket.amount += summary.overdueXof;
      bucket.accountCount = (bucket.accountCount ?? 0) + 1;
      bucket.installmentCount = (bucket.installmentCount ?? 0) + 1;
    }
    if (summary.unscheduledXof > 0) {
      const bucket = byKey.get("unscheduled")!;
      bucket.amount += summary.unscheduledXof;
      bucket.accountCount = (bucket.accountCount ?? 0) + 1;
    }
  }
  return buckets;
}

export default function FinanceDashboard() {
  const [accounts, setAccounts] = useState<StudentAccountRow[] | null>(null);
  const [aging, setAging] = useState<ArAging | null>(null);
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStudentAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
    getArAging()
      .then(setAging)
      .catch(() => setAging(null));
    getFeePlan()
      .then(setPlan)
      .catch(() => setPlan(null));
    getCurrentTerm()
      .then((t) => setTerm(t.name))
      .catch(() => setTerm(null));
  }, []);

  const positioned = useMemo(
    () =>
      (accounts ?? []).map((row) => ({
        row,
        summary: resolveAccountSummary(row.summary, {
          balanceXof: row.balance,
          billedXof: row.billed,
        }),
      })),
    [accounts],
  );
  const attention = useMemo(
    () =>
      positioned
        .filter(({ summary }) => summary.standing === "overdue")
        .sort((a, b) => b.summary.overdueXof - a.summary.overdueXof),
    [positioned],
  );
  const metrics = useMemo(
    () => ({
      grossOutstandingXof: positioned.reduce(
        (sum, account) => sum + account.summary.outstandingXof,
        0,
      ),
      overdueXof: positioned.reduce(
        (sum, account) => sum + account.summary.overdueXof,
        0,
      ),
      onTimeCount: positioned.filter(
        (account) => account.summary.standing === "on_time",
      ).length,
      overdueCount: attention.length,
      clearedCount: positioned.filter(
        (account) => account.summary.standing === "cleared",
      ).length,
      activeHoldCount: positioned.filter(({ row }) => row.hasActiveHold).length,
    }),
    [attention.length, positioned],
  );
  const agingBuckets = aging?.buckets?.length
    ? aging.buckets
    : fallbackAging(accounts ?? []);

  if (error)
    return (
      <p className="card" style={{ color: "var(--danger)" }}>
        {error}
      </p>
    );

  const period = term ?? plan?.academicYearLabel;
  const eyebrow = period ? `Finance · ${period}` : "Finance";

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title="Bursar Dashboard"
        subtitle="Receivables follow each student's payment-plan dates—not their total balance alone."
      />

      {!accounts && <p className="muted">Loading account positions…</p>}

      {accounts && (
        <>
          <ReceivablesKpis metrics={metrics} />
          <AgingBuckets buckets={agingBuckets} />

          <Card
            title="Accounts needing attention"
            action={
              <span className="muted" style={{ fontSize: 12.5 }}>
                Overdue portions only
              </span>
            }
          >
            {attention.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                No account is past its payment-plan date.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {attention.map(({ row, summary }) => (
                  <div
                    key={row.id}
                    className="sis-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <Avatar name={row.name} size={40} src={row.photoUrl} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: "var(--fg3)" }}>
                        {[
                          row.program,
                          `${formatXof(summary.overdueXof)} past due`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        display: "grid",
                        gap: 4,
                        justifyItems: "end",
                      }}
                    >
                      <AccountBalanceText
                        summary={summary}
                        style={{ fontWeight: 700 }}
                      />
                      <AccountStandingBadge summary={summary} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

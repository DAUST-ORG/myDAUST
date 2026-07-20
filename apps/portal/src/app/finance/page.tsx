"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Coins, Receipt, TrendingUp, Users } from "lucide-react";
import {
  type CollectionSummary,
  type OverdueRow,
  getAdminSummary,
  getOverdue,
} from "@/lib/api";
import { formatXof, formatXofCompact } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Progress, Stat } from "@/components/ui";

export default function FinanceDashboard() {
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [overdue, setOverdue] = useState<OverdueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSummary().then(setSummary).catch((e: Error) => setError(e.message));
    getOverdue().then(setOverdue).catch(() => setOverdue([]));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  // The API already derives the rate; fall back to computing it if billed is zero.
  const collectedPct = summary
    ? summary.collectionRate || (summary.billed > 0 ? (summary.collected / summary.billed) * 100 : 0)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="Finance office"
        title="Collections overview"
        subtitle="Tuition billed, collected and outstanding across the institution."
      />

      {!summary && <p className="muted">Loading…</p>}

      {summary && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <Stat
              label="Billed"
              value={formatXofCompact(summary.billed)}
              sub="total charges raised"
              icon={<Receipt size={16} />}
            />
            <Stat
              label="Collected"
              value={formatXofCompact(summary.collected)}
              sub={`${collectedPct.toFixed(1)}% of billed`}
              tone="var(--success-500)"
              icon={<TrendingUp size={16} />}
            />
            <Stat
              label="Outstanding"
              value={formatXofCompact(summary.outstanding)}
              sub="still owed"
              tone={summary.outstanding > 0 ? "var(--danger)" : undefined}
              icon={<Coins size={16} />}
            />
            <Stat
              label="Invoices"
              value={summary.invoicesByStatus.reduce((s, i) => s + i.count, 0)}
              sub={
                summary.invoicesByStatus
                  .map((i) => `${i.count} ${i.status}`)
                  .join(" · ") || "none raised"
              }
              icon={<Users size={16} />}
            />
          </div>

          <Card title="Collection rate">
            <Progress pct={collectedPct} tone="var(--success-500)" height={12} />
            <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
              {formatXof(summary.collected)} collected of {formatXof(summary.billed)} billed.
            </p>
          </Card>
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <Card
          title="Overdue installments"
          action={
            overdue && overdue.length > 0 ? (
              <Badge tone="error">{overdue.length} overdue</Badge>
            ) : undefined
          }
        >
          {!overdue && <p className="muted" style={{ margin: 0 }}>Loading…</p>}
          {overdue && overdue.length === 0 && (
            <EmptyState
              icon={<AlertTriangle size={22} />}
              title="Nothing overdue"
              note="Every installment is either paid or not yet due."
            />
          )}
          {overdue && overdue.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Student</th><th>ID</th><th>Term</th><th>#</th>
                  <th style={{ textAlign: "right" }}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {overdue.slice(0, 12).map((o) => (
                  <tr key={o.installmentId}>
                    <td>{o.student}</td>
                    <td className="muted">{o.studentNo}</td>
                    <td>{o.term}</td>
                    <td>{o.sequence}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                      {formatXof(o.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {overdue && overdue.length > 12 && (
            <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
              Showing 12 of {overdue.length}. <Link href="/finance/accounts">See all accounts →</Link>
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

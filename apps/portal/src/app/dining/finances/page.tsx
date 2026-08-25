"use client";

import { useEffect, useState } from "react";
import { Banknote, PiggyBank, ReceiptText, Utensils } from "lucide-react";
import {
  type DiningFinances,
  type DiningTransaction,
  getDiningFinances,
  getDiningTransactions,
} from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import {
  Badge,
  type BadgeTone,
  BarChart,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  Stat,
} from "@/components/ui";

const KIND_TONE: Record<DiningTransaction["kind"], BadgeTone> = {
  plan: "navy",
  weekend: "warning",
  refund: "error",
};
const KIND_LABEL: Record<DiningTransaction["kind"], string> = {
  plan: "Meal plan",
  weekend: "Weekend order",
  refund: "Refund",
};

export default function DiningFinancesPage() {
  const [fin, setFin] = useState<DiningFinances | null>(null);
  const [txns, setTxns] = useState<DiningTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiningFinances()
      .then(setFin)
      .catch((e: Error) => setError(e.message));
    getDiningTransactions()
      .then(setTxns)
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Finances" subtitle="Cost center 3600" />
        <EmptyState title="Could not load dining finances" note={error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Finances"
        subtitle={
          fin?.settledTo ?? "Cost center 3600 — Dining / Auxiliary Services"
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat
          label="Total revenue"
          value={formatXof(fin?.revenue ?? 0)}
          sub="meal plans + weekend orders"
          icon={<Banknote size={17} />}
        />
        <Stat
          label="Meal-plan revenue"
          value={formatXof(fin?.planRevenue ?? 0)}
          sub="net allocations on 3600"
          icon={<ReceiptText size={17} />}
        />
        <Stat
          label="Weekend orders"
          value={formatXof(fin?.weekendRevenue ?? 0)}
          sub="paid and beyond"
          icon={<Utensils size={17} />}
        />
        <Stat
          label="Outstanding"
          value={formatXof(fin?.outstanding ?? 0)}
          sub="cafeteria component unpaid"
          tone={fin && fin.outstanding > 0 ? "var(--warning)" : undefined}
          icon={<PiggyBank size={17} />}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Card title="Revenue by month">
          {!fin?.byMonth.length ? (
            <EmptyState title="No revenue recorded yet" />
          ) : fin.byMonth.length < 2 ? (
            // A single bar is a rectangle, not a trend. Show the figure instead and say
            // plainly that there is nothing to compare it against yet.
            <div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>
                {formatXof(
                  (fin.byMonth[0]?.plan ?? 0) + (fin.byMonth[0]?.weekend ?? 0),
                )}
              </div>
              <p style={{ color: "var(--fg3)", fontSize: 12, marginTop: 4 }}>
                in {fin.byMonth[0]?.month} · a trend appears from the second
                month of trading
              </p>
              <table style={{ marginTop: 14 }}>
                <tbody>
                  <tr>
                    <td>Meal plans</td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(fin.byMonth[0]?.plan ?? 0)}
                    </td>
                  </tr>
                  <tr>
                    <td>Weekend orders</td>
                    <td style={{ textAlign: "right" }}>
                      {formatXof(fin.byMonth[0]?.weekend ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <BarChart
              data={fin.byMonth.map((m) => ({
                label: m.month.slice(5),
                value: m.plan + m.weekend,
              }))}
            />
          )}
        </Card>

        <Card title="Gross margin">
          <div style={{ fontSize: 30, fontWeight: 800 }}>
            {fin?.marginPct ?? 0}%
          </div>
          <p style={{ color: "var(--fg3)", fontSize: 12, marginTop: 2 }}>
            net of food &amp; operating cost
          </p>
          <div style={{ marginTop: 14 }}>
            <Progress pct={Math.max(0, Math.min(100, fin?.marginPct ?? 0))} />
          </div>
          <table style={{ marginTop: 14 }}>
            <tbody>
              <tr>
                <td>Revenue</td>
                <td style={{ textAlign: "right" }}>
                  {formatXof(fin?.revenue ?? 0)}
                </td>
              </tr>
              <tr>
                <td>
                  Food cost · {fin?.servedMeals ?? 0} meals ×{" "}
                  {formatXof(fin?.costPerMealXof ?? 0)}
                </td>
                <td style={{ textAlign: "right", color: "var(--danger)" }}>
                  −{formatXof(fin?.foodCost ?? 0)}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Gross margin</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  {formatXof(fin?.margin ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
          {/* No settlement or payout panel: proof-based payments land in the university's
              account before Finance verifies them, and there is no payout capability here. */}
          <p style={{ color: "var(--fg3)", fontSize: 11.5, marginTop: 12 }}>
            Collected through the Finance proof-verification queue. This console
            does not move money.
          </p>
        </Card>
      </div>

      <Card title="Recent transactions" pad={false}>
        {!txns.length ? (
          <EmptyState title="No dining transactions yet" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Student</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>When</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={`${t.kind}-${t.id}`}>
                  <td>
                    <Badge tone={KIND_TONE[t.kind]}>{KIND_LABEL[t.kind]}</Badge>
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.student}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatXof(t.amountXof)}
                  </td>
                  <td style={{ color: "var(--fg3)" }}>{t.status}</td>
                  <td style={{ textAlign: "right", color: "var(--fg3)" }}>
                    {formatDate(t.when)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CookingPot, ShoppingBag, UserCheck, Utensils } from "lucide-react";
import { type DiningOverview, getDiningOverview } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";

const PERIOD_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};
const PLAN_LABELS: Record<string, string> = {
  full: "Full pension",
  half: "Half pension",
  none: "No plan",
};

export default function DiningOverviewPage() {
  const [data, setData] = useState<DiningOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiningOverview()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Overview" subtitle="Cafeteria service" />
        <EmptyState title="Could not load service data" note={error} />
      </>
    );
  }

  const servedToday = data?.periods.reduce((s, p) => s + p.served, 0) ?? 0;
  const turnedToday = data?.periods.reduce((s, p) => s + p.turnedAway, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Overview"
        subtitle="One pass. Three meals. Every day."
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
          label="Served today"
          value={servedToday}
          sub="across all periods"
          icon={<Utensils size={17} />}
        />
        <Stat
          label="Turned away today"
          value={turnedToday}
          sub={turnedToday > 0 ? "see Live Service" : "none"}
          tone={turnedToday > 0 ? "var(--danger)" : undefined}
          icon={<UserCheck size={17} />}
        />
        <Stat
          label="Active meal plans"
          value={data?.activePlans ?? "—"}
          sub="students on full or half"
          icon={<CookingPot size={17} />}
        />
        <Stat
          label="Open weekend orders"
          value={data?.openOrders ?? "—"}
          sub={`${formatXof(data?.weekendRevenue ?? 0)} paid`}
          icon={<ShoppingBag size={17} />}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <Card title="Today by service">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th style={{ textAlign: "right" }}>Served</th>
                <th style={{ textAlign: "right" }}>Turned away</th>
              </tr>
            </thead>
            <tbody>
              {(data?.periods ?? []).map((p) => (
                <tr key={p.period}>
                  <td>{PERIOD_LABELS[p.period] ?? p.period}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {p.served}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {p.turnedAway > 0 ? (
                      <Badge tone="error">{p.turnedAway}</Badge>
                    ) : (
                      <span style={{ color: "var(--fg3)" }}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Plan mix">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th style={{ textAlign: "right" }}>Students</th>
              </tr>
            </thead>
            <tbody>
              {(data?.planMix ?? []).map((p) => (
                <tr key={p.type}>
                  <td>{PLAN_LABELS[p.type] ?? p.type}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {p.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

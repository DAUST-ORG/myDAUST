"use client";

import { useEffect, useState } from "react";
import { type DiningReports, getDiningReports } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { BarChart, Card, EmptyState, PageHeader, Stat } from "@/components/ui";

const PLAN_LABELS: Record<string, string> = {
  full: "Full pension",
  half: "Half pension",
  none: "No plan",
};

export default function DiningReportsPage() {
  const [data, setData] = useState<DiningReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiningReports()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <>
        <PageHeader title="Reports" subtitle="Service trends" />
        <EmptyState title="Could not load reports" note={error} />
      </>
    );
  }

  const servedWeek = data?.last7days.reduce((s, d) => s + d.served, 0) ?? 0;
  const turnedWeek = data?.last7days.reduce((s, d) => s + d.turnedAway, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Reports"
        subtitle="Last seven days of service"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat label="Meals served (7d)" value={servedWeek} />
        <Stat
          label="Turned away (7d)"
          value={turnedWeek}
          tone={turnedWeek > 0 ? "var(--danger)" : undefined}
        />
        <Stat
          label="Weekend revenue"
          value={formatXof(data?.weekendRevenue ?? 0)}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <Card title="Meals served per day">
          {!data?.last7days.length ? (
            <EmptyState title="No scans in the last seven days" />
          ) : (
            <BarChart
              data={data.last7days.map((d) => ({
                label: d.date.slice(5),
                value: d.served,
              }))}
            />
          )}
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
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

        <Card title="Top dishes">
          {!data?.topItems.length ? (
            <EmptyState title="No weekend orders yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Dish</th>
                  <th style={{ textAlign: "right" }}>Ordered</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map((i) => (
                  <tr key={i.name}>
                    <td>{i.name}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {i.qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

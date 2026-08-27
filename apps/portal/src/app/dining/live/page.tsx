"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { type LiveScans, getLiveScans } from "@/lib/api";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Stat,
} from "@/components/ui";

const PERIODS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

/** Ten seconds: `liveScans` runs a two-level join plus a groupBy on every call. */
const POLL_MS = 10_000;

function currentPeriod() {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 17) return "lunch";
  return "dinner";
}

export default function LiveServicePage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<LiveScans | null>(null);
  const [online, setOnline] = useState(true);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async (p: string) => {
    abort.current?.abort();
    try {
      const next = await getLiveScans(p);
      setData(next);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    load(period);
    // Suspend while the tab is hidden — a console left open overnight should not poll.
    const tick = () => {
      if (document.visibilityState === "visible") load(period);
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      abort.current?.abort();
    };
  }, [period, load]);

  return (
    <>
      <PageHeader
        eyebrow="Dining"
        title="Live Service"
        subtitle="Refreshes every 10 seconds"
        actions={
          <Badge tone={online ? "success" : "error"}>
            {online ? "Online" : "Reconnecting"}
          </Badge>
        }
      />

      <div style={{ marginBottom: 16, maxWidth: 380 }}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <Stat
          label={`Served · ${period}`}
          value={data?.served ?? 0}
          tone="var(--success)"
          icon={<CheckCircle2 size={17} />}
        />
        <Stat
          label="Turned away"
          value={data?.turnedAway ?? 0}
          tone={data && data.turnedAway > 0 ? "var(--danger)" : undefined}
          icon={<XCircle size={17} />}
        />
      </div>

      <Card title="Recent scans">
        {!data?.recent.length ? (
          <EmptyState
            title="No scans yet this service"
            note="Rows appear here as students are scanned at the entrance."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>ID</th>
                <th>Result</th>
                <th style={{ textAlign: "right" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((s, i) => (
                <tr key={`${s.studentNo}-${i}`}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: "var(--fg3)" }}>{s.studentNo}</td>
                  <td>
                    {s.result === "served" ? (
                      <Badge tone="success">Served</Badge>
                    ) : (
                      <Badge tone="error">{s.reason ?? "Turned away"}</Badge>
                    )}
                  </td>
                  <td style={{ textAlign: "right", color: "var(--fg3)" }}>
                    {new Date(s.time).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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

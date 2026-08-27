"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Clock, Hourglass, X } from "lucide-react";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  type MyOverrideRequest,
  cancelOverrideRequest,
  myOverrideRequests,
} from "@/lib/api";

type StatusMeta = {
  label: string;
  tone: BadgeTone;
  Icon: React.ComponentType<{ size?: number }>;
};

const STATUS_META: Record<string, StatusMeta> = {
  pending: { label: "Pending", tone: "warning", Icon: Hourglass },
  approved: { label: "Approved", tone: "success", Icon: Check },
  rejected: { label: "Rejected", tone: "error", Icon: X },
  cancelled: { label: "Cancelled", tone: "neutral", Icon: X },
  stale: { label: "Stale", tone: "error", Icon: Clock },
};

function gateLabel(gate: string): string {
  switch (gate) {
    case "prerequisite":
      return "Prerequisite";
    case "corequisite":
      return "Corequisite";
    case "capacity":
      return "Capacity";
    case "holds":
      return "Hold";
    case "credit_cap":
      return "Credit cap";
    case "standing":
      return "Standing";
    case "major_restriction":
      return "Major restriction";
    case "record_status":
      return "Record status";
    case "add_deadline":
      return "Add deadline";
    default:
      return gate;
  }
}

export default function StudentOverrides() {
  const [rows, setRows] = useState<MyOverrideRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    myOverrideRequests()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function cancel(id: string) {
    setBusy(id);
    try {
      await cancelOverrideRequest(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Enrollment overrides"
        subtitle="Requests you submitted when a section blocked your enrollment."
      />
      {error && (
        <div className="card" style={{ color: "var(--error-500)", marginBottom: 14 }}>
          {error}
        </div>
      )}
      {rows === null && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState
          title="No override requests"
          note="You have not requested any enrollment overrides yet."
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows?.map((r) => {
          const meta: StatusMeta = STATUS_META[r.status] ?? STATUS_META.pending!;
          const failures = r.afterJson?.failures ?? [];
          return (
            <Card
              key={r.id}
              title={
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <meta.Icon size={15} />
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 14.5 }}>
                    Override request
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              }
              action={
                r.status === "pending" ? (
                  <Button
                    variant="secondary"
                    onClick={() => cancel(r.id)}
                    disabled={busy === r.id}
                  >
                    {busy === r.id ? "Cancelling…" : "Cancel"}
                  </Button>
                ) : undefined
              }
            >
              <p
                className="muted"
                style={{
                  fontSize: 12.5,
                  margin: "0 0 8px",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Submitted {new Date(r.createdAt).toLocaleString()}
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>{r.reason}</p>
              {failures.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div
                    className="muted"
                    style={{
                      fontSize: 11.5,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      marginBottom: 4,
                    }}
                  >
                    Gates that blocked you
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {failures.map((f) => (
                      <Badge key={f.gate} tone="neutral">
                        {gateLabel(f.gate)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {r.decisionNote && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "var(--bg-subtle)",
                    borderLeft: "3px solid var(--daust-orange)",
                    fontSize: 13,
                  }}
                >
                  <strong>Decision note:</strong> {r.decisionNote}
                </div>
              )}
              {r.status === "approved" && (
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: "#1f6b42",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={13} />
                  Enrolled via override
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

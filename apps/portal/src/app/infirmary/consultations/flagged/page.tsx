"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Flag, Stethoscope } from "lucide-react";
import { type FlaggedConsultationRow, getInfirmaryFlaggedToday } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function FlaggedTodayPage() {
  const [rows, setRows] = useState<FlaggedConsultationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInfirmaryFlaggedToday()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <>
        <PageHeader
          eyebrow="Infirmary"
          title="Flagged today"
          subtitle="Consultations marked as sick today."
          actions={
            <Link href="/infirmary/consultations" className="btn-secondary">
              <ArrowLeft size={15} />
              Back to consultations
            </Link>
          }
        />
        <EmptyState title="Could not load flagged consultations" note={error} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Infirmary"
        title="Flagged today"
        subtitle="Consultations marked as sick today. Faculty-of-today and the admin role have been notified for each."
        actions={
          <Link href="/infirmary/consultations" className="btn-secondary">
            <ArrowLeft size={15} />
            Back to consultations
          </Link>
        }
      />

      {rows === null ? (
        <Card>
          <p className="muted">Loading…</p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No flagged consultations today"
          note="When a clinician flags a visit as sick, it will appear here."
          icon={<Flag size={28} />}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <Card key={r.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 6,
                }}
              >
                <Stethoscope
                  size={18}
                  color="var(--daust-orange)"
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{r.student.name}</strong>
                    <Badge tone="warning">Sick flag</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }}>
                    Consultation {r.id.slice(0, 8)} · visited{" "}
                    {formatDateTime(r.visitedAt)}
                    {r.sickFlaggedAt
                      ? ` · flagged ${formatDateTime(r.sickFlaggedAt)}`
                      : ""}
                    {r.flaggedBy ? ` · by ${r.flaggedBy}` : ""}
                  </div>
                  {r.reason && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg2)",
                        marginTop: 6,
                      }}
                    >
                      {r.reason}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

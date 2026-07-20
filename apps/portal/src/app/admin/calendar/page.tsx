"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { type CalendarEventRow, getAcademicCalendar } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function AcademicCalendarPage() {
  const [rows, setRows] = useState<CalendarEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAcademicCalendar().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="card" style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <>
      <PageHeader
        eyebrow="Academic structure"
        title="Academic calendar"
        subtitle="Key dates for the active catalogue year."
      />

      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No calendar entries for the active year"
          note="Registration windows, holidays, exam periods and deadlines appear here once added."
        />
      )}

      {rows && rows.length > 0 && (
        <Card pad={false}>
          <table>
            <thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Note</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="sis-row">
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatDate(e.startsOn)}
                    {e.endsOn && <span className="muted"> – {formatDate(e.endsOn)}</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{e.title}</td>
                  <td><Badge tone="neutral">{e.type}</Badge></td>
                  <td className="muted">{e.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

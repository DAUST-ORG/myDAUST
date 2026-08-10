"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { WeeklySchedule } from "@/components/WeeklySchedule";
import { Button, Card, PageHeader } from "@/components/ui";
import { type FacultyScheduleItem, getFacultySchedule } from "@/lib/api";
import {
  downloadWeeklySchedule,
  type WeeklyScheduleEntry,
} from "@/lib/weekly-schedule";

export default function FacultySchedulePage() {
  const [items, setItems] = useState<FacultyScheduleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFacultySchedule()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const activeTerm = items[0]
    ? {
        name: items[0].term,
        startDate: items[0].termStartDate,
        endDate: items[0].termEndDate,
      }
    : null;
  const visibleItems = activeTerm
    ? items.filter((item) => item.term === activeTerm.name)
    : items;
  const schedule = useMemo<WeeklyScheduleEntry[]>(
    () =>
      visibleItems.map((item) => ({
        id: item.sectionId,
        code: item.code,
        title: item.title,
        days: item.days,
        startTime: item.startTime,
        endTime: item.endTime,
        room: item.room,
        color: item.color,
      })),
    [visibleItems],
  );

  return (
    <>
      <PageHeader
        title="Weekly Schedule"
        subtitle={[
          activeTerm?.name ?? null,
          `${visibleItems.length} course${visibleItems.length === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          activeTerm && schedule.length > 0 ? (
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              onClick={() => downloadWeeklySchedule(schedule, activeTerm)}
            >
              Export .ics
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <Card>
          <div role="status" aria-live="polite" className="muted">
            Loading schedule…
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div role="alert" style={{ color: "var(--error-500)" }}>
            {error}
          </div>
        </Card>
      ) : (
        <WeeklySchedule
          entries={schedule}
          emptyTitle="No teaching schedule"
          emptyNote="Your classes appear here after the registrar assigns you to a section."
        />
      )}
    </>
  );
}

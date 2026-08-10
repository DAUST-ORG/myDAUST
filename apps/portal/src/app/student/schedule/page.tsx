"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  type MyEnrollment,
  type Term,
  getCurrentTerm,
  getMyEnrollments,
} from "@/lib/api";
import { Button, PageHeader } from "@/components/ui";
import { WeeklySchedule } from "@/components/WeeklySchedule";
import { COURSE_COLORS } from "@/lib/student-schedule";
import {
  downloadWeeklySchedule,
  type WeeklyScheduleEntry,
} from "@/lib/weekly-schedule";

export default function SchedulePage() {
  const [items, setItems] = useState<MyEnrollment[]>([]);
  const [term, setTerm] = useState<Term | null>(null);

  useEffect(() => {
    getMyEnrollments()
      .then(setItems)
      .catch(() => {});
    getCurrentTerm()
      .then(setTerm)
      .catch(() => {});
  }, []);

  const credits = items.reduce((s, e) => s + e.credits, 0);
  const schedule: WeeklyScheduleEntry[] = items.map((entry, index) => ({
    id: entry.enrollmentId,
    code: entry.courseCode,
    title: entry.title,
    days: entry.days,
    startTime: entry.startTime,
    endTime: entry.endTime,
    room: entry.room,
    href: `/student/courses/${entry.sectionId}`,
    color: COURSE_COLORS[index % COURSE_COLORS.length],
  }));

  return (
    <>
      <PageHeader
        title="Weekly Schedule"
        subtitle={[
          term?.name ?? null,
          `${credits} credits`,
          `${items.length} courses`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          term && items.length > 0 ? (
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              onClick={() => downloadWeeklySchedule(schedule, term)}
            >
              Export .ics
            </Button>
          ) : undefined
        }
      />
      <WeeklySchedule
        entries={schedule}
        emptyTitle="No enrolled courses"
        emptyNote="Add sections from Registration to build your week."
      />
    </>
  );
}

"use client";

import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import {
  COURSE_COLORS,
  hourFloat,
  parseDayIndexes,
} from "@/lib/student-schedule";
import type { WeeklyScheduleEntry } from "@/lib/weekly-schedule";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ROW_HEIGHT = 58;

function CourseBlock({
  entry,
  color,
}: {
  entry: WeeklyScheduleEntry;
  color: string;
}) {
  const content = (
    <>
      <div style={{ fontWeight: 750, fontSize: 12 }}>{entry.code}</div>
      <div style={{ fontSize: 10.5, opacity: 0.92, lineHeight: 1.25 }}>
        {entry.title}
      </div>
      <div style={{ fontSize: 10, opacity: 0.84, marginTop: 3 }}>
        {entry.room ?? "Room TBA"}
      </div>
    </>
  );
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    color: "#fff",
    background: color,
    borderRadius: 9,
    padding: "7px 9px",
    boxShadow: "var(--shadow-sm)",
    overflow: "hidden",
    textDecoration: "none",
    display: "block",
    border: "1px solid rgba(255,255,255,.16)",
  };
  return entry.href ? (
    <Link href={entry.href} style={style}>
      {content}
    </Link>
  ) : (
    <div style={style}>{content}</div>
  );
}

export function WeeklySchedule({
  entries,
  emptyTitle,
  emptyNote,
}: {
  entries: WeeklyScheduleEntry[];
  emptyTitle: string;
  emptyNote: string;
}) {
  if (entries.length === 0)
    return <EmptyState title={emptyTitle} note={emptyNote} />;

  const parsedTimes = entries
    .flatMap((entry) => [hourFloat(entry.startTime), hourFloat(entry.endTime)])
    .filter(Number.isFinite);
  const startHour = Math.min(8, Math.floor(Math.min(...parsedTimes)));
  const endHour = Math.max(18, Math.ceil(Math.max(...parsedTimes)));
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index,
  );
  const todayIndex = (() => {
    const day = new Date().getDay();
    return day >= 1 && day <= 5 ? day - 1 : -1;
  })();

  return (
    <Card pad={false}>
      <div style={{ overflowX: "auto", padding: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "62px repeat(5, minmax(152px, 1fr))",
            minWidth: 840,
          }}
        >
          <div aria-hidden />
          {DAYS.map((day, index) => (
            <div
              key={day}
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: 12.5,
                padding: "8px 0 10px",
                color:
                  index === todayIndex ? "var(--daust-orange)" : "var(--fg1)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {day}
            </div>
          ))}
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                style={{
                  height: ROW_HEIGHT,
                  fontSize: 11,
                  color: "var(--fg3)",
                  textAlign: "right",
                  paddingRight: 10,
                  transform: "translateY(-6px)",
                }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {DAYS.map((day, dayIndex) => (
            <div
              key={day}
              style={{
                position: "relative",
                height: hours.length * ROW_HEIGHT,
                borderLeft: "1px solid var(--divider)",
                background:
                  dayIndex === todayIndex ? "rgba(237,132,37,.035)" : undefined,
              }}
            >
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{
                    height: ROW_HEIGHT,
                    borderBottom: "1px solid var(--divider)",
                  }}
                />
              ))}
              {entries.map((entry, entryIndex) => {
                if (!parseDayIndexes(entry.days).includes(dayIndex))
                  return null;
                const start = hourFloat(entry.startTime);
                const end = hourFloat(entry.endTime);
                if (
                  !Number.isFinite(start) ||
                  !Number.isFinite(end) ||
                  end <= start
                )
                  return null;
                return (
                  <div
                    key={`${entry.id}-${dayIndex}`}
                    style={{
                      position: "absolute",
                      top: (start - startHour) * ROW_HEIGHT + 3,
                      left: 4,
                      right: 4,
                      height: Math.max(38, (end - start) * ROW_HEIGHT - 6),
                    }}
                  >
                    <CourseBlock
                      entry={entry}
                      color={
                        entry.color ??
                        COURSE_COLORS[entryIndex % COURSE_COLORS.length]!
                      }
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

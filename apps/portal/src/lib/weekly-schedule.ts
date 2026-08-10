import { parseDayIndexes } from "@/lib/student-schedule";

export interface WeeklyScheduleEntry {
  id: string;
  code: string;
  title: string;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
  color?: string;
  href?: string;
}

function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function compactDate(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compactTime(time: string): string {
  const [hour = "0", minute = "0"] = time.split(":");
  return `${hour.padStart(2, "0")}${minute.padStart(2, "0")}00`;
}

function firstWeekdayOnOrAfter(start: Date, mondayIndex: number): Date {
  const date = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const currentMondayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(
    date.getUTCDate() + ((mondayIndex - currentMondayIndex + 7) % 7),
  );
  return date;
}

/** Build one recurring calendar event per meeting day for the active term. */
export function buildWeeklyScheduleIcs(
  entries: WeeklyScheduleEntry[],
  term: { name: string; startDate: string; endDate: string },
): string {
  const start = new Date(term.startDate);
  const end = new Date(term.endDate);
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const dayCodes = ["MO", "TU", "WE", "TH", "FR"];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DAUST//Weekly Schedule//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(`DAUST ${term.name}`)}`,
  ];

  for (const entry of entries) {
    for (const dayIndex of parseDayIndexes(entry.days)) {
      const first = firstWeekdayOnOrAfter(start, dayIndex);
      if (first > end) continue;
      const ymd = compactDate(first);
      const startTime = compactTime(entry.startTime);
      const endTime = compactTime(entry.endTime);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${entry.id}-${dayIndex}@daust.net`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Africa/Dakar:${ymd}T${startTime}`,
        `DTEND;TZID=Africa/Dakar:${ymd}T${endTime}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${dayCodes[dayIndex]};UNTIL=${compactDate(end)}T235959Z`,
        `SUMMARY:${icsText(`${entry.code} · ${entry.title}`)}`,
        `LOCATION:${icsText(entry.room ?? "Room TBA")}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadWeeklySchedule(
  entries: WeeklyScheduleEntry[],
  term: { name: string; startDate: string; endDate: string },
): void {
  const blob = new Blob([buildWeeklyScheduleIcs(entries, term)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `DAUST-${term.name.replace(/[^a-z0-9]+/gi, "-")}-schedule.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

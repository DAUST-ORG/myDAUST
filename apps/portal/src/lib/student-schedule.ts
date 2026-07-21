/** Fixed palette cycled across a student's course list so a course keeps one colour per screen. */
export const COURSE_COLORS: readonly string[] = [
  "#153b6a",
  "#ed8425",
  "#2e7d52",
  "#1d4a82",
  "#6c7884",
  "#a3291b",
];

/** "MWF" / "TTh" -> weekday indexes with Mon=0, mirroring the API's day encoding. */
export function parseDayIndexes(days: string): number[] {
  const map: Record<string, number> = { M: 0, T: 1, W: 2, R: 3, F: 4 };
  const src = days.replace(/[\s,]/g, "");
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    if (src.slice(i, i + 2) === "Th") {
      out.push(3);
      i += 2;
      continue;
    }
    const d = map[src[i]!.toUpperCase()];
    if (d !== undefined) out.push(d);
    i += 1;
  }
  return out;
}

/** "09:30" -> 9.5; NaN for anything that is not HH:MM. */
export function hourFloat(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) + Number(m[2]) / 60;
}

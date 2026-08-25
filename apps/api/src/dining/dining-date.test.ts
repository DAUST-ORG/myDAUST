import { describe, expect, it } from "vitest";
import { toDakarDateKey } from "@mydaust/shared";

/**
 * `DiningService.dayOnly()` is private, so this mirrors it exactly. It is the third
 * component of `DiningScan @@unique([studentId, period, date])` — get it wrong and a
 * student either gets a free second lunch or is refused one they are owed.
 */
function dayOnly(d: Date) {
  return new Date(`${toDakarDateKey(d)}T00:00:00.000Z`);
}

describe("dining scan day key", () => {
  it("anchors on midnight UTC so the stored value is a clean calendar date", () => {
    const key = dayOnly(new Date("2026-08-24T13:47:09.412Z"));
    expect(key.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });

  it("keeps a whole Dakar day on one key", () => {
    const open = dayOnly(new Date("2026-08-24T00:00:01Z"));
    const close = dayOnly(new Date("2026-08-24T23:59:59Z"));
    expect(open.getTime()).toBe(close.getTime());
  });

  it("rolls over at Dakar midnight, not at any other hour", () => {
    const lateNight = dayOnly(new Date("2026-08-24T23:59:59Z"));
    const justAfter = dayOnly(new Date("2026-08-25T00:00:01Z"));
    expect(justAfter.getTime()).toBeGreaterThan(lateNight.getTime());
    expect(justAfter.toISOString().slice(0, 10)).toBe("2026-08-25");
  });

  // Dakar is UTC+0 with no DST. That is what makes this change safe to deploy against
  // existing rows: the new key is byte-identical to the old UTC-derived one. If the
  // campus ever observed an offset, this assertion is where it would surface.
  it("agrees with the previous UTC-derived key across a DST-shifting date", () => {
    for (const iso of [
      "2026-01-15T12:00:00Z",
      "2026-03-29T02:30:00Z",
      "2026-06-21T18:00:00Z",
      "2026-10-25T02:30:00Z",
      "2026-12-31T23:30:00Z",
    ]) {
      const d = new Date(iso);
      const legacy = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      );
      expect(dayOnly(d).getTime()).toBe(legacy.getTime());
    }
  });

  it("advances by whole days without drifting off the calendar", () => {
    const today = dayOnly(new Date("2026-08-24T13:00:00Z"));
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    expect(week).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
  });
});

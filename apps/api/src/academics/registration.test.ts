import { describe, expect, it } from "vitest";
import { meetingsOverlap, parseDays, toMinutes } from "./academics.service.js";

describe("parseDays", () => {
  it("splits single-letter days", () => {
    expect(parseDays("MWF")).toEqual(["M", "W", "F"]);
  });

  it("keeps Th together so TTh is Tuesday and Thursday, not T/T/H", () => {
    expect(parseDays("TTh")).toEqual(["T", "Th"]);
  });

  it("handles Su without swallowing the following day", () => {
    expect(parseDays("SuM")).toEqual(["Su", "M"]);
  });

  it("is case-insensitive and ignores separators", () => {
    expect(parseDays("m, w , f")).toEqual(["M", "W", "F"]);
    expect(parseDays("tth")).toEqual(["T", "Th"]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseDays("")).toEqual([]);
  });
});

describe("toMinutes", () => {
  it("converts HH:MM to minutes past midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("18:00")).toBe(1080);
  });

  it("accepts a single-digit hour", () => {
    expect(toMinutes("9:05")).toBe(545);
  });

  it("returns NaN for unparseable input so callers can skip the check", () => {
    expect(toMinutes("morning")).toBeNaN();
    expect(toMinutes("0930")).toBeNaN();
  });
});

describe("meetingsOverlap", () => {
  const mwf9 = { days: "MWF", startTime: "09:00", endTime: "10:30" };

  it("detects an overlap on a shared day", () => {
    expect(meetingsOverlap(mwf9, { days: "MWF", startTime: "10:00", endTime: "11:30" })).toBe(true);
  });

  it("does not conflict when the days never intersect", () => {
    expect(meetingsOverlap(mwf9, { days: "TTh", startTime: "09:00", endTime: "10:30" })).toBe(false);
  });

  it("does not conflict when blocks merely touch", () => {
    expect(meetingsOverlap(mwf9, { days: "M", startTime: "10:30", endTime: "12:00" })).toBe(false);
    expect(meetingsOverlap(mwf9, { days: "M", startTime: "07:30", endTime: "09:00" })).toBe(false);
  });

  it("detects a fully contained block", () => {
    expect(meetingsOverlap(mwf9, { days: "W", startTime: "09:15", endTime: "09:45" })).toBe(true);
  });

  it("detects an enclosing block", () => {
    expect(meetingsOverlap(mwf9, { days: "F", startTime: "08:00", endTime: "12:00" })).toBe(true);
  });

  it("overlaps on the Th of a TTh pair without being confused by the leading T", () => {
    const tth = { days: "TTh", startTime: "11:00", endTime: "12:30" };
    expect(meetingsOverlap(tth, { days: "Th", startTime: "12:00", endTime: "13:00" })).toBe(true);
    // Wednesday shares no day with TTh.
    expect(meetingsOverlap(tth, { days: "W", startTime: "11:00", endTime: "12:30" })).toBe(false);
  });

  it("treats unparseable times as non-conflicting rather than blocking enrolment", () => {
    expect(meetingsOverlap(mwf9, { days: "M", startTime: "TBA", endTime: "TBA" })).toBe(false);
  });
});

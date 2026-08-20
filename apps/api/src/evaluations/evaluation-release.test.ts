import { describe, expect, it } from "vitest";
import {
  canFacultySeeResults,
  effectiveWindow,
  isOpen,
} from "./evaluation-release.js";

const base = {
  releasedToFaculty: true,
  responseCount: 10,
  minResponses: 5,
  gradeSubmissionStatus: "approved",
  kind: "final" as const,
};

describe("canFacultySeeResults", () => {
  it("shows a released final round once grades are approved", () => {
    expect(canFacultySeeResults(base)).toEqual({ visible: true });
  });

  it("hides anything the director has not released", () => {
    expect(canFacultySeeResults({ ...base, releasedToFaculty: false })).toEqual({
      visible: false,
      reason: "not_released",
    });
  });

  it("hides a section with too few responses to be anonymous", () => {
    expect(canFacultySeeResults({ ...base, responseCount: 4 })).toEqual({
      visible: false,
      reason: "too_few_responses",
    });
  });

  it("holds the final round until the registrar has approved grades", () => {
    for (const status of ["submitted", "draft", "returned", null]) {
      expect(
        canFacultySeeResults({ ...base, gradeSubmissionStatus: status }),
      ).toEqual({ visible: false, reason: "grades_not_approved" });
    }
  });

  it("does NOT gate the midterm round on grades — that is the point of a midterm", () => {
    expect(
      canFacultySeeResults({ ...base, kind: "midterm", gradeSubmissionStatus: null }),
    ).toEqual({ visible: true });
  });

  it("still applies the anonymity floor to the midterm round", () => {
    expect(
      canFacultySeeResults({
        ...base,
        kind: "midterm",
        gradeSubmissionStatus: null,
        responseCount: 2,
      }),
    ).toEqual({ visible: false, reason: "too_few_responses" });
  });
});

describe("effectiveWindow", () => {
  const bounds = {
    boundsOpenAt: new Date("2026-10-10T00:00:00Z"),
    boundsCloseAt: new Date("2026-10-24T00:00:00Z"),
  };

  it("runs the director's full bounds when the instructor set nothing", () => {
    expect(effectiveWindow(bounds, null)).toEqual({
      opensAt: bounds.boundsOpenAt,
      closesAt: bounds.boundsCloseAt,
    });
  });

  it("honours an instructor window inside the bounds", () => {
    const w = effectiveWindow(bounds, {
      opensAt: new Date("2026-10-14T00:00:00Z"),
      closesAt: new Date("2026-10-18T00:00:00Z"),
    });
    expect(w.opensAt.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(w.closesAt.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });

  it("clamps a stale schedule that would widen the round", () => {
    const w = effectiveWindow(bounds, {
      opensAt: new Date("2026-09-01T00:00:00Z"),
      closesAt: new Date("2026-12-01T00:00:00Z"),
    });
    expect(w.opensAt).toEqual(bounds.boundsOpenAt);
    expect(w.closesAt).toEqual(bounds.boundsCloseAt);
  });
});

describe("isOpen", () => {
  const w = {
    opensAt: new Date("2026-10-10T00:00:00Z"),
    closesAt: new Date("2026-10-24T00:00:00Z"),
  };

  it("is open inside the window when the round is open", () => {
    expect(isOpen("open", w, new Date("2026-10-15T00:00:00Z"))).toBe(true);
  });

  it("closes itself past the end date with no scheduled job", () => {
    expect(isOpen("open", w, new Date("2026-10-25T00:00:00Z"))).toBe(false);
  });

  it("is shut while the round is still a draft", () => {
    expect(isOpen("draft", w, new Date("2026-10-15T00:00:00Z"))).toBe(false);
  });
});

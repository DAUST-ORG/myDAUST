import { describe, expect, it } from "vitest";
import { computeGpa } from "./academics.service.js";

describe("computeGpa", () => {
  it("weights by credits", () => {
    const { gpa, completedCredits } = computeGpa([
      { grade: "A", credits: 3 }, // 12.0
      { grade: "C", credits: 1 }, // 2.0
    ]);
    expect(completedCredits).toBe(4);
    expect(gpa).toBe(3.5);
  });

  it("rounds to two decimals", () => {
    const { gpa } = computeGpa([
      { grade: "A-", credits: 3 }, // 11.1
      { grade: "B+", credits: 3 }, // 9.9
    ]);
    expect(gpa).toBe(3.5);
  });

  it("ignores unknown grades instead of corrupting the average", () => {
    const { gpa, completedCredits } = computeGpa([
      { grade: "A", credits: 3 },
      { grade: "W", credits: 3 }, // withdrawal-like marks don't count
    ]);
    expect(completedCredits).toBe(3);
    expect(gpa).toBe(4.0);
  });

  it("returns 0 with no completed work (never NaN)", () => {
    expect(computeGpa([])).toEqual({ gpa: 0, completedCredits: 0 });
  });
});

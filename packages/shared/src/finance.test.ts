import { describe, expect, it } from "vitest";
import { PLAN_TEMPLATES, splitEvenXof } from "./finance.js";

describe("splitEvenXof", () => {
  it("always sums back to the exact total (zero-decimal XOF)", () => {
    for (const total of [2_975_000, 1_487_500, 1_000_001, 7, 30_000]) {
      for (const parts of [1, 2, 3, 4, 8]) {
        const split = splitEvenXof(total, parts);
        expect(split).toHaveLength(parts);
        expect(split.reduce((s, v) => s + v, 0)).toBe(total);
      }
    }
  });

  it("gives earlier installments the remainder, never differing by more than 1", () => {
    const split = splitEvenXof(1_000_001, 3);
    expect(split).toEqual([333_334, 333_334, 333_333]);
    expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
  });

  it("covers every plan template", () => {
    for (const t of PLAN_TEMPLATES) {
      const split = splitEvenXof(2_975_000, t.installments);
      expect(split.reduce((s, v) => s + v, 0)).toBe(2_975_000);
    }
  });
});

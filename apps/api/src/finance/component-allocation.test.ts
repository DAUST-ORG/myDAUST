import { describe, expect, it } from "vitest";
import { allocateProportionallyXof } from "./component-allocation.js";

describe("allocateProportionallyXof", () => {
  it("reconciles the annual DAUST package to an exact whole-XOF payment", () => {
    const split = allocateProportionallyXof(1_000_001, [
      { id: "tuition", availableXof: 2_975_000 },
      { id: "housing", availableXof: 680_000 },
      { id: "cafeteria", availableXof: 630_000 },
    ]);
    expect(split.reduce((sum, row) => sum + row.amountXof, 0)).toBe(1_000_001);
    expect(split).toEqual([
      { id: "cafeteria", amountXof: 147_025 },
      { id: "housing", amountXof: 158_693 },
      { id: "tuition", amountXof: 694_283 },
    ]);
  });

  it("uses component id as the stable tie breaker", () => {
    expect(
      allocateProportionallyXof(2, [
        { id: "b", availableXof: 1 },
        { id: "a", availableXof: 1 },
        { id: "c", availableXof: 1 },
      ]),
    ).toEqual([
      { id: "a", amountXof: 1 },
      { id: "b", amountXof: 1 },
    ]);
  });

  it("rejects over-allocation", () => {
    expect(() =>
      allocateProportionallyXof(11, [{ id: "tuition", availableXof: 10 }]),
    ).toThrow("exceeds component capacity");
  });
});

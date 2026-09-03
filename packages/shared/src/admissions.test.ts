import { describe, expect, it } from "vitest";
import { FEE_STRUCTURE } from "./admissions.js";

describe("FEE_STRUCTURE", () => {
  it("keeps tuition per-semester as exactly half the annual figure", () => {
    expect(FEE_STRUCTURE.tuitionPerSemester * 2).toBe(FEE_STRUCTURE.tuitionPerYear);
  });
});

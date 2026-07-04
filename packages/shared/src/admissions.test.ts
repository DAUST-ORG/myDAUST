import { describe, expect, it } from "vitest";
import { FEE_STRUCTURE, SCHOLARSHIP_TIERS, scholarshipForBac } from "./admissions.js";

describe("scholarshipForBac", () => {
  it("awards 20% at BAC 15 and above", () => {
    expect(scholarshipForBac(15).pct).toBe(20);
    expect(scholarshipForBac(18.9).pct).toBe(20);
    expect(scholarshipForBac(20).pct).toBe(20);
  });

  it("awards 15% in the 13.5–14.9 band", () => {
    expect(scholarshipForBac(13.5).pct).toBe(15);
    expect(scholarshipForBac(14.99).pct).toBe(15);
  });

  it("awards 10% in the 12–13.4 band", () => {
    expect(scholarshipForBac(12).pct).toBe(10);
    expect(scholarshipForBac(13.49).pct).toBe(10);
  });

  it("awards nothing below 12 or when unreported", () => {
    expect(scholarshipForBac(11.99).pct).toBe(0);
    expect(scholarshipForBac(0).pct).toBe(0);
    expect(scholarshipForBac(null).pct).toBe(0);
    expect(scholarshipForBac(undefined).band).toBe("Not provided");
  });

  it("derives its bands from SCHOLARSHIP_TIERS (no drift)", () => {
    for (const tier of SCHOLARSHIP_TIERS) {
      const award = scholarshipForBac(tier.minScore);
      expect(award.pct).toBe(tier.pct);
      expect(award.band).toBe(tier.band);
    }
  });
});

describe("FEE_STRUCTURE", () => {
  it("keeps tuition per-semester as exactly half the annual figure", () => {
    expect(FEE_STRUCTURE.tuitionPerSemester * 2).toBe(FEE_STRUCTURE.tuitionPerYear);
  });
});

import { describe, expect, it } from "vitest";
import {
  feePackageTotalXof,
  MAX_FEE_PACKAGE_TOTAL_XOF,
  splitEvenlyXof,
  validateFeeComponents,
} from "./fee-components.js";

describe("fee components", () => {
  it("splits annual totals deterministically without losing a franc", () => {
    expect(splitEvenlyXof(101, 4)).toEqual([26, 25, 25, 25]);
    expect(splitEvenlyXof(4_285_000, 4)).toEqual([
      1_071_250, 1_071_250, 1_071_250, 1_071_250,
    ]);
  });

  it("accepts extensible stable keys and rejects duplicates", () => {
    expect(
      validateFeeComponents([
        {
          key: "technology_lab",
          label: "Technology lab",
          costCenterCode: "9100",
          annualAmountXof: 75_000,
          defaultSelected: true,
          sortOrder: 3,
        },
      ]),
    ).toMatchObject([{ key: "technology_lab", annualAmountXof: 75_000 }]);
    expect(() =>
      validateFeeComponents([
        {
          key: "housing",
          label: "Housing",
          costCenterCode: "3700",
          annualAmountXof: 1,
          defaultSelected: true,
          sortOrder: 1,
        },
        {
          key: "housing",
          label: "Duplicate",
          costCenterCode: "3700",
          annualAmountXof: 1,
          defaultSelected: true,
          sortOrder: 2,
        },
      ]),
    ).toThrow("Duplicate fee component");
  });

  it("caps the aggregate selected package before PostgreSQL integer amounts", () => {
    const atLimit = Array.from({ length: 20 }, () => ({
      annualAmountXof: 100_000_000,
    }));
    expect(feePackageTotalXof(atLimit)).toBe(MAX_FEE_PACKAGE_TOTAL_XOF);
    expect(() =>
      feePackageTotalXof([...atLimit, { annualAmountXof: 1 }]),
    ).toThrow("cannot exceed 2,000,000,000 XOF");
  });
});

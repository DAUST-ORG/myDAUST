import { describe, expect, it } from "vitest";
import {
  INITIAL_BILLING_ADJUSTMENT_DEFINITIONS,
  INITIAL_BILLING_SERVICE_OPTIONS,
  assertBillingProfileReconciliation,
  billingProfileReconciliationWarnings,
  calculateBillingAdjustmentAmountXof,
  deriveBillingBalance,
  deriveBillingProfileTotals,
  deriveBillingServiceAmountXof,
} from "./billing-profile.js";

describe("initial billing service catalog", () => {
  it("contains the approved housing, cafeteria, insurance, and caution prices", () => {
    const amount = (kind: string, code: string) =>
      INITIAL_BILLING_SERVICE_OPTIONS.find(
        (row) => row.kind === kind && row.code === code,
      )?.amountXof;

    expect(amount("housing", "double")).toBe(680_000);
    expect(amount("housing", "individual")).toBe(1_360_000);
    expect(amount("housing", "double_ac")).toBe(800_000);
    expect(amount("housing", "individual_ac")).toBe(1_600_000);
    expect(amount("cafeteria", "full")).toBe(630_000);
    expect(amount("insurance", "annual")).toBe(10_000);
  });

  it("does not expose the unpriced cafeteria half plan", () => {
    expect(
      INITIAL_BILLING_SERVICE_OPTIONS.some(
        (row) => row.kind === "cafeteria" && row.code === "half",
      ),
    ).toBe(false);
  });

  it("derives the refundable caution as exactly 10% of selected housing", () => {
    const caution = INITIAL_BILLING_SERVICE_OPTIONS.find(
      (row) =>
        row.kind === "housing_caution" && row.code === "housing_10_percent",
    );
    expect(caution).toBeDefined();
    expect(deriveBillingServiceAmountXof(caution!, { housing: 680_000 })).toBe(
      68_000,
    );
    expect(
      deriveBillingServiceAmountXof(caution!, { housing: 1_600_000 }),
    ).toBe(160_000);
  });
});

describe("billing adjustments", () => {
  it("calculates BAC merit discounts from tuition in integer XOF", () => {
    const merit = INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.find(
      (row) => row.key === "merit_15",
    );
    expect(merit).toBeDefined();
    expect(
      calculateBillingAdjustmentAmountXof(merit!, {
        tuition: 2_975_000,
      }),
    ).toBe(446_250);
  });

  it("requires reviewed manual definitions to supply an explicit amount", () => {
    const family = INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.find(
      (row) => row.key === "family",
    );
    expect(() =>
      calculateBillingAdjustmentAmountXof(family!, { tuition: 2_975_000 }),
    ).toThrow(/requires an amount/i);
    expect(
      calculateBillingAdjustmentAmountXof(
        family!,
        { tuition: 2_975_000 },
        125_000,
      ),
    ).toBe(125_000);
  });

  it("uses an approval-workflow-safe stable key for 3FPT", () => {
    const threeFpt = INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.find(
      (row) => row.key === "three_fpt",
    );
    expect(threeFpt).toMatchObject({
      calculation: "manual",
      stacking: "exclusive",
      requiresApproval: true,
    });
  });
});

describe("billing profile reconciliation", () => {
  it("reconciles gross services, explicit discounts, and net invoice components", () => {
    const totals = deriveBillingProfileTotals(
      [
        { kind: "housing", amountXof: 680_000 },
        { kind: "cafeteria", amountXof: 630_000 },
        { kind: "insurance", amountXof: 10_000 },
        { kind: "housing_caution", amountXof: 68_000 },
      ],
      [{ effect: "discount", amountXof: 188_000 }],
    );

    expect(totals).toEqual({
      grossChargesXof: 1_388_000,
      discountXof: 188_000,
      additionalChargesXof: 0,
      netBilledXof: 1_200_000,
    });
    expect(() =>
      assertBillingProfileReconciliation({
        profileGrossChargesXof: 1_388_000,
        profileNetBilledXof: 1_200_000,
        invoiceTotalXof: 1_200_000,
        componentGrossAmountsXof: [680_000, 630_000, 10_000, 68_000],
        componentNetAmountsXof: [600_000, 530_000, 10_000, 60_000],
        adjustments: [{ effect: "discount", amountXof: 188_000 }],
      }),
    ).not.toThrow();
  });

  it("returns stable operational warning codes for a non-reconciling view", () => {
    expect(
      billingProfileReconciliationWarnings({
        profileGrossChargesXof: 1_000,
        profileNetBilledXof: 900,
        invoiceTotalXof: 800,
        componentGrossAmountsXof: [1_000],
        componentNetAmountsXof: [900],
        adjustments: [],
      }),
    ).toEqual([
      "profile_net_does_not_match_invoice",
      "gross_plus_adjustments_does_not_match_net",
    ]);
  });

  it("retains a paid-over-bill difference as account credit", () => {
    expect(deriveBillingBalance(4_000_000, 4_001_433)).toEqual({
      outstandingXof: 0,
      accountCreditXof: 1_433,
    });
  });
});

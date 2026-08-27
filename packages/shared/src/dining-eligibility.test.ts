import { describe, expect, it } from "vitest";
import {
  DINING_VERDICT_CODES,
  diningEligibility,
  type DiningEligibilityInput,
} from "./dining-eligibility.js";
import type { MealPeriod, MealPlanType } from "./dining.js";

const PERIODS: MealPeriod[] = ["breakfast", "lunch", "dinner"];
const PLANS: MealPlanType[] = ["none", "half", "full"];

function scan(patch: Partial<DiningEligibilityInput> = {}) {
  return diningEligibility({
    planType: "full",
    planActive: true,
    period: "lunch",
    overdueXof: 0,
    alreadyServed: false,
    enforcePayment: true,
    ...patch,
  });
}

describe("diningEligibility", () => {
  it("serves a paid-up full-plan student in every period", () => {
    for (const period of PERIODS) {
      const verdict = scan({ period });
      expect(verdict.code).toBe("OK");
      expect(verdict.serve).toBe(true);
      expect(verdict.reason).toBe("Meal plan active · Full pension");
    }
  });

  it("serves a half-plan student at breakfast and lunch only", () => {
    expect(scan({ planType: "half", period: "breakfast" }).serve).toBe(true);
    expect(scan({ planType: "half", period: "lunch" }).serve).toBe(true);

    const dinner = scan({ planType: "half", period: "dinner" });
    expect(dinner.code).toBe("NOT_COVERED");
    expect(dinner.serve).toBe(false);
    expect(dinner.reason).toBe("Half plan — dinner not covered");
    expect(dinner.overridable).toBe(true);
  });

  it("refuses a student with no plan, and staff cannot wave them through", () => {
    for (const patch of [
      { planType: "none" as MealPlanType },
      { planActive: false },
      { planType: null },
    ]) {
      const verdict = scan(patch);
      expect(verdict.code).toBe("NO_PLAN");
      expect(verdict.serve).toBe(false);
      expect(verdict.overridable).toBe(false);
    }
  });

  it("refuses an overdue account only while enforcement is on", () => {
    const enforced = scan({ overdueXof: 1, enforcePayment: true });
    expect(enforced.code).toBe("UNPAID");
    expect(enforced.reason).toBe("Payment not confirmed for this term");
    expect(enforced.overridable).toBe(true);

    expect(scan({ overdueXof: 500_000, enforcePayment: false }).code).toBe(
      "OK",
    );
  });

  it("refuses a second scan in the same period unless the guard is off", () => {
    const second = scan({ alreadyServed: true, period: "dinner" });
    expect(second.code).toBe("SERVED");
    expect(second.reason).toBe("Already served dinner today");
    expect(second.overridable).toBe(true);

    expect(scan({ alreadyServed: true, blockSecondScan: false }).code).toBe(
      "OK",
    );
  });

  it("names the period it already served", () => {
    for (const period of PERIODS) {
      expect(scan({ alreadyServed: true, period }).reason).toBe(
        `Already served ${period} today`,
      );
    }
  });

  // Order matters: a student is told the thing they can act on. No plan outranks
  // arrears, arrears outrank coverage, coverage outranks a repeat scan.
  it("reports the highest-priority refusal when several apply", () => {
    expect(
      scan({
        planType: "none",
        overdueXof: 1,
        alreadyServed: true,
        period: "dinner",
      }).code,
    ).toBe("NO_PLAN");

    expect(
      scan({
        planType: "half",
        overdueXof: 1,
        alreadyServed: true,
        period: "dinner",
      }).code,
    ).toBe("UNPAID");

    expect(
      scan({ planType: "half", alreadyServed: true, period: "dinner" }).code,
    ).toBe("NOT_COVERED");
  });

  it("never marks an allowed scan overridable", () => {
    for (const planType of PLANS) {
      for (const period of PERIODS) {
        for (const overdueXof of [0, 1]) {
          for (const alreadyServed of [false, true]) {
            const verdict = scan({
              planType,
              period,
              overdueXof,
              alreadyServed,
            });
            expect(DINING_VERDICT_CODES).toContain(verdict.code);
            expect(verdict.serve).toBe(verdict.code === "OK");
            if (verdict.serve) expect(verdict.overridable).toBe(false);
          }
        }
      }
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { ApprovalsController } from "./approvals.controller.js";

describe("operating-budget authorization metadata", () => {
  it("allows only Finance staff and administrators into management budgeting", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminFinanceController)).toEqual([
      "bursar",
      "admin",
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ApprovalsController)).toEqual([
      "bursar",
      "admin",
    ]);
  });

  it("reserves approval decisions for administrators", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ApprovalsController.prototype.approve),
    ).toEqual(["admin"]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ApprovalsController.prototype.reject),
    ).toEqual(["admin"]);
  });

  it("accepts both legacy forecasts and validated cashflow simulations", () => {
    const forecast = vi.fn((input: unknown) => input);
    const controller = new AdminFinanceController(
      {} as never,
      {} as never,
      { forecast } as never,
    );
    expect(
      controller.operatingBudgetForecast({
        academicYear: "2026–2027",
        scenario: "base",
        collectionRatePercent: 80,
        expenseGrowthPercent: 5,
      }),
    ).toMatchObject({ scenario: "base", collectionRatePercent: 80 });
    expect(
      controller.operatingBudgetForecast({
        academicYear: "2026–2027",
        case: "custom",
        customAssumptions: {
          eventualRealizationPercent: 85,
          collectionTimingPercent: {
            due: 60,
            plus30: 20,
            plus60: 15,
            plus90OrLater: 5,
          },
          remainingExpenseVariancePercent: 7,
        },
        minimumReserveXof: 1_000_000,
      }),
    ).toMatchObject({
      case: "custom",
      minimumReserveXof: 1_000_000,
    });
    expect(() =>
      controller.operatingBudgetForecast({
        academicYear: "2026–2027",
        case: "custom",
      }),
    ).toThrow(/Custom assumptions are required/);
    expect(() =>
      controller.operatingBudgetForecast({
        academicYear: "2026–2027",
        case: "custom",
        customAssumptions: {
          eventualRealizationPercent: 85,
          collectionTimingPercent: {
            due: 60,
            plus30: 20,
            plus60: 15,
            plus90OrLater: 6,
          },
          remainingExpenseVariancePercent: 7,
        },
      }),
    ).toThrow(/must total exactly 100/);
  });
});

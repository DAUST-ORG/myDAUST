import { type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { ApprovalsController } from "./approvals.controller.js";

describe("operating-budget authorization", () => {
  const directorOnlyMethods: (keyof AdminFinanceController)[] = [
    "operatingBudgetView",
    "updateOperatingBudget",
    "operatingBudgetForecast",
    "operatingBudgetActuals",
    "createOperatingBudgetIncome",
    "createOperatingBudgetExpense",
    "updateOperatingBudgetExpense",
    "voidOperatingBudgetExpense",
    "createOperatingBudgetActual",
    "updateOperatingBudgetActual",
    "voidOperatingBudgetActual",
    "createOperatingBudgetAdjustment",
    "directorOverview",
    "expenses",
    "createExpense",
    "updateExpense",
    "deleteExpense",
    "setBudget",
  ];

  const effectiveRoles = (
    method: keyof AdminFinanceController,
  ): string[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, AdminFinanceController.prototype[method]) ??
    Reflect.getMetadata(ROLES_KEY, AdminFinanceController);

  it("reserves budgeting, cashflow and management actuals for administrators", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminFinanceController)).toEqual([
      "bursar",
      "admin",
    ]);

    for (const method of directorOnlyMethods) {
      expect(effectiveRoles(method), method).toEqual(["admin"]);
    }
  });

  it("allows Directors and returns a real 403 guard failure for bursars", () => {
    const guard = new RolesGuard(new Reflector());
    const context = (method: keyof AdminFinanceController, roles: string[]) =>
      ({
        getHandler: () => AdminFinanceController.prototype[method],
        getClass: () => AdminFinanceController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles } }),
        }),
      }) as unknown as ExecutionContext;

    for (const method of directorOnlyMethods) {
      expect(guard.canActivate(context(method, ["admin"])), method).toBe(true);
      expect(
        () => guard.canActivate(context(method, ["bursar"])),
        method,
      ).toThrowError(ForbiddenException);
    }
  });

  it("withholds the Director figures from a bursar reading /reports", () => {
    // /reports stays bursar-readable, but it re-emits three directorOverview()
    // legs — so without this the endpoint hands a bursar the budget-vs-actual
    // and cash position that every operating-budget route is admin-locked to
    // withhold. Observed on staging before the fix: reports.totals was byte
    // -identical to director-overview's.
    const calls: boolean[] = [];
    const finance = {
      reports: (includeDirectorFigures: boolean) => {
        calls.push(includeDirectorFigures);
        return Promise.resolve({});
      },
    };
    const controller = new AdminFinanceController(
      finance as never,
      {} as never,
      {} as never,
    );

    void controller.reports({ roles: ["bursar"] } as never);
    void controller.reports({ roles: ["admin", "bursar"] } as never);

    expect(calls).toEqual([false, true]);
  });

  it("keeps ordinary Finance reads available to bursars", () => {
    for (const method of [
      "summary",
      "payments",
      "accounts",
      "reports",
      "costCenters",
      "collectionsTimeline",
    ] as const) {
      expect(effectiveRoles(method), method).toEqual(["bursar", "admin"]);
    }

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
});

import { describe, expect, it } from "vitest";
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
});

import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { AdminFinanceController } from "./admin-finance.controller.js";
import { ApprovalsController } from "./approvals.controller.js";
import { PaymentsController } from "./payments.controller.js";

/**
 * The registrar reaches a student's housing, cafeteria, insurance and caution
 * from the student profile, and that access rests entirely on three
 * method-level @Roles decorators. RolesGuard resolves them with
 * getAllAndOverride, so a method list REPLACES the controller's rather than
 * intersecting it — dropping one silently returns the route to bursar/admin and
 * the registrar's tab starts 403ing with nothing else to notice it.
 */
describe("billing profile authorization metadata", () => {
  it("keeps the finance controller bursar/admin by default", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminFinanceController)).toEqual([
      "bursar",
      "admin",
    ]);
  });

  it("lets a registrar read a student's annual profile", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminFinanceController.prototype.billingProfile,
      ),
    ).toEqual(["bursar", "admin", "registrar"]);
  });

  it("lets a registrar propose an annual profile change", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminFinanceController.prototype.requestBillingProfileChange,
      ),
    ).toEqual(["bursar", "admin", "registrar"]);
  });

  it("lets a registrar read the service option catalog", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        PaymentsController.prototype.billingProfileOptions,
      ),
    ).toEqual(["bursar", "admin", "registrar", "admissions"]);
  });

  it("still reserves the decision for a Director", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ApprovalsController.prototype.approve),
    ).toEqual(["admin"]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ApprovalsController.prototype.reject),
    ).toEqual(["admin"]);
  });

  it("keeps the catalog itself out of registrar hands", () => {
    // Choosing a student's tier is registrar work; repricing the tiers for the
    // whole institution is not.
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminFinanceController.prototype.requestBillingCatalogChange,
      ),
    ).toBeUndefined();
  });
});

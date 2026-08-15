import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { AdminAdmissionsController } from "./admin-admissions.controller.js";

describe("AdminAdmissionsController onboarding cancellation", () => {
  it("requires an admin and a meaningful audited reason", async () => {
    const admissions = {
      adminSetStage: vi.fn(),
      adminCancelOnboarding: vi.fn().mockResolvedValue({
        onboarding: { status: "cancelled" },
      }),
    };
    const controller = new AdminAdmissionsController(admissions as never);
    const actor = {
      personId: "admin-person",
      email: "admin@test.local",
      roles: ["admin"],
    } as never;
    const registrar = {
      personId: "registrar-person",
      email: "registrar@test.local",
      roles: ["registrar"],
    } as never;

    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminAdmissionsController.prototype.cancelOnboarding,
      ),
    ).toEqual(["admin"]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminAdmissionsController.prototype.accept,
      ),
    ).toEqual(["admin"]);
    expect(() =>
      controller.cancelOnboarding(actor, "applicant-1", { reason: "short" }),
    ).toThrow();
    expect(() =>
      controller.setStage(registrar, "applicant-1", { stage: "accepted" }),
    ).toThrow();
    expect(admissions.adminSetStage).not.toHaveBeenCalled();
    await expect(
      controller.cancelOnboarding(actor, "applicant-1", {
        reason: "  Applicant withdrew before paying  ",
      }),
    ).resolves.toEqual({ onboarding: { status: "cancelled" } });
    expect(admissions.adminCancelOnboarding).toHaveBeenCalledWith(
      "admin-person",
      "applicant-1",
      "Applicant withdrew before paying",
    );
  });
});

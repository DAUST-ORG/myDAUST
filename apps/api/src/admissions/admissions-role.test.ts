import { describe, expect, it } from "vitest";
import { APP_ROLES, ROLE_LABELS } from "@mydaust/shared";
import { ROLES_KEY } from "../auth/decorators.js";
import { AdminAdmissionsController } from "./admin-admissions.controller.js";
import { AcademicsController } from "../academics/academics.controller.js";

/**
 * The admissions officer holds the applicant pipeline and nothing else.
 *
 * @Roles resolves with getAllAndOverride([handler, class]), so a method-level list REPLACES
 * the class-level one. Every assertion below reads the decorator the guard will actually read,
 * because the difference between "inherits the class list" and "declares its own" is invisible
 * at the call site and is the whole boundary.
 */
function rolesOn(target: object, method?: string): string[] | undefined {
  return method
    ? Reflect.getMetadata(ROLES_KEY, (target as Record<string, never>)[method])
    : Reflect.getMetadata(ROLES_KEY, target);
}

const CLASS_ROLES = rolesOn(AdminAdmissionsController);

describe("admissions is a real role", () => {
  it("is in APP_ROLES, so the session filter keeps it", () => {
    // jwt.strategy filters roles through isAppRole; an unlisted role is silently dropped.
    expect(APP_ROLES).toContain("admissions");
  });

  it("has a display label, which the typed record forces", () => {
    expect(ROLE_LABELS.admissions).toBe("Admissions");
  });

  it("labels every role, so none can ship invisible to the admin screens", () => {
    for (const role of APP_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});

describe("what the admissions officer can reach", () => {
  it("holds the applicant pipeline at the class level", () => {
    expect(CLASS_ROLES).toEqual(["admin", "registrar", "admissions"]);
  });

  for (const route of ["create", "detail", "update", "setStage"]) {
    it(`inherits the class list for ${route}`, () => {
      const handler = (AdminAdmissionsController.prototype as Record<string, unknown>)[route];
      expect(handler, `${route} is not a method on the controller`).toBeTypeOf("function");
      // No method-level list means the class list applies, which includes admissions.
      expect(rolesOn(AdminAdmissionsController.prototype, route)).toBeUndefined();
    });
  }

  it("can read the applicant list", () => {
    expect(rolesOn(AcademicsController.prototype, "adminApplicants")).toContain(
      "admissions",
    );
  });
});

describe("what it must not reach", () => {
  const forbidden: [string, string][] = [
    ["accept", "creates a Person, a Student, an invoice and a payment link"],
    ["cancelOnboarding", "the undo for accept, and it fails closed once cash is verified"],
    ["rotateOnboardingLinks", "mints a bearer payment link against real receivables"],
    ["resendStudentInvite", "returns a working set-password link to the caller"],
  ];

  for (const [method, why] of forbidden) {
    it(`excludes admissions from ${method} — ${why}`, () => {
      const roles = rolesOn(AdminAdmissionsController.prototype, method);
      expect(roles, `${method} must declare its own narrower list`).toBeDefined();
      expect(roles).not.toContain("admissions");
    });
  }

  it("keeps accept and cancel with admin alone", () => {
    expect(rolesOn(AdminAdmissionsController.prototype, "accept")).toEqual(["admin"]);
    expect(rolesOn(AdminAdmissionsController.prototype, "cancelOnboarding")).toEqual([
      "admin",
    ]);
  });

  it("cannot reach student records", () => {
    expect(
      rolesOn(AcademicsController.prototype, "adminStudentDetail"),
    ).not.toContain("admissions");
  });

  it("cannot write programmes, only read them", () => {
    expect(rolesOn(AcademicsController.prototype, "adminPrograms")).toContain(
      "admissions",
    );
    expect(
      rolesOn(AcademicsController.prototype, "createProgram"),
    ).not.toContain("admissions");
  });
});

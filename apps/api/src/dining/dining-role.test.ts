import { describe, expect, it } from "vitest";
import { APP_ROLES, ROLE_LABELS } from "@mydaust/shared";
import { ROLES_KEY } from "../auth/decorators.js";
import { DiningController } from "./dining.controller.js";
import { AcademicsController } from "../academics/academics.controller.js";
import { AdminFinanceController } from "../finance/admin-finance.controller.js";
import { RegistrarController } from "../registrar/registrar.controller.js";

/**
 * The dining role runs the cafeteria and nothing else.
 *
 * `RolesGuard` is fail-open — a handler with no `@Roles` is reachable by every authenticated
 * session, students included — and `getAllAndOverride([handler, class])` means a method list
 * REPLACES the class list rather than narrowing it. Both facts make the decorators the whole
 * boundary, so every assertion here reads the metadata the guard will actually read.
 */
function rolesOn(target: object, method?: string): string[] | undefined {
  return method
    ? Reflect.getMetadata(ROLES_KEY, (target as Record<string, never>)[method])
    : Reflect.getMetadata(ROLES_KEY, target);
}

const proto = DiningController.prototype as unknown as Record<string, never>;
const HANDLERS = Object.getOwnPropertyNames(DiningController.prototype).filter(
  (name) => name !== "constructor" && typeof proto[name] === "function",
);

const STUDENT_ROUTES = [
  "myPass",
  "choosePlan",
  "myPlanOptions",
  "myToday",
  "myEligibility",
  "myOrders",
  "createOrder",
  "payOrder",
];
const STAFF_ROUTES = [
  "scan",
  "scanOverride",
  "liveScans",
  "overview",
  "adminStudents",
  "orders",
  "advance",
  "adminMenu",
  "createMenuItem",
  "setMenuItemImage",
  "toggleMenuItem",
  "adminReports",
  "settlement",
  "finances",
  "transactions",
  "settings",
  "updateSettings",
];

describe("dining is a real role", () => {
  it("is in APP_ROLES, so the session filter keeps it", () => {
    // jwt.strategy filters roles through isAppRole; an unlisted role is silently dropped.
    expect(APP_ROLES).toContain("dining");
  });

  it("has a display label, which the typed record forces", () => {
    expect(ROLE_LABELS.dining).toBe("Dining");
  });

  it("labels every role, so none can ship invisible to the admin screens", () => {
    for (const role of APP_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});

describe("DiningController authorization", () => {
  it("declares no class-level roles, so no method silently inherits a wider list", () => {
    expect(rolesOn(DiningController)).toBeUndefined();
  });

  it("covers every handler this test knows about", () => {
    expect([...HANDLERS].sort()).toEqual(
      [...STUDENT_ROUTES, ...STAFF_ROUTES, "menu"].sort(),
    );
  });

  for (const handler of HANDLERS) {
    it(`decorates ${handler} — an undecorated route is public to every session`, () => {
      expect(rolesOn(proto, handler)?.length).toBeGreaterThan(0);
    });
  }

  for (const route of STAFF_ROUTES) {
    it(`keeps students out of ${route}`, () => {
      expect(rolesOn(proto, route)).not.toContain("student");
    });
  }

  for (const route of STUDENT_ROUTES) {
    it(`keeps dining staff out of the student-scoped ${route}`, () => {
      // These read user.studentId off the session; dining staff have none.
      expect(rolesOn(proto, route)).toEqual(["student"]);
    });
  }

  it("lets finance read cost center 3600, and nothing else here", () => {
    const bursarRoutes = STAFF_ROUTES.filter((r) =>
      rolesOn(proto, r)?.includes("bursar"),
    );
    expect(bursarRoutes.sort()).toEqual([
      "finances",
      "settlement",
      "transactions",
    ]);
  });

  it("shares the read-only menu with faculty, as it did before the retirement", () => {
    expect(rolesOn(proto, "menu")).toEqual([
      "student",
      "faculty",
      "dining",
      "admin",
    ]);
  });
});

describe("dining reaches nothing outside the cafeteria", () => {
  for (const controller of [
    AcademicsController,
    AdminFinanceController,
    RegistrarController,
  ]) {
    it(`grants dining no route on ${controller.name}`, () => {
      const names = Object.getOwnPropertyNames(controller.prototype).filter(
        (n) => n !== "constructor",
      );
      const leaked = names.filter((n) =>
        rolesOn(controller.prototype as object, n)?.includes("dining"),
      );
      expect(leaked).toEqual([]);
      expect(rolesOn(controller) ?? []).not.toContain("dining");
    });
  }
});

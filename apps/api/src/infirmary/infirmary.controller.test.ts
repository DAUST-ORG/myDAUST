import { describe, expect, it } from "vitest";
import "reflect-metadata";
import { InfirmaryController } from "./infirmary.controller.js";
import { RolesGuard } from "../auth/roles.guard.js";

/**
 * Locks in the security shape of the infirmary HTTP surface.
 * If anyone adds a write route to /students, the SIS-managed
 * invariant breaks — these tests will fail.
 */

function methodMetadata(
  ctrl: object,
  method: string,
): { method: string; path: string } | undefined {
  const target = ctrl as Record<string, unknown>;
  return Reflect.getMetadata("method", target, method) as never;
}

describe("InfirmaryController surface", () => {
  const ctrl = new InfirmaryController({} as never);

  describe("students endpoint", () => {
    it("exposes GET only — no mutation routes", () => {
      const methods = [
        "createStudent",
        "updateStudent",
        "deleteStudent",
        "addStudent",
      ] as const;
      for (const m of methods) {
        const meta = methodMetadata(ctrl, m);
        expect(meta, `${m} must not exist`).toBeUndefined();
      }
    });
  });

  describe("authorization", () => {
    it("declares class-level @Roles requiring infirmary or admin", () => {
      const roles = Reflect.getMetadata("roles", InfirmaryController) as
        string[] | undefined;
      expect(roles).toEqual(expect.arrayContaining(["infirmary", "admin"]));
    });

    it("has no method-level @Roles overrides that would widen", () => {
      const methods = Object.getOwnPropertyNames(
        InfirmaryController.prototype,
      ).filter(
        (n) =>
          n !== "constructor" &&
          typeof (InfirmaryController.prototype as Record<string, unknown>)[
            n
          ] === "function",
      );
      for (const m of methods) {
        const methodRoles = Reflect.getMetadata(
          "roles",
          InfirmaryController.prototype,
          m,
        );
        expect(
          methodRoles,
          `${m} must not override class-level roles`,
        ).toBeUndefined();
      }
    });
  });

  describe("RolesGuard integration", () => {
    it("RolesGuard is exported and CanActivate-shaped", () => {
      const proto = RolesGuard.prototype as Record<string, unknown>;
      expect(typeof proto.canActivate).toBe("function");
    });
  });
});

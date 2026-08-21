import { describe, expect, it } from "vitest";
import {
  canAdminister,
  canGrantRole,
  normalizeRoles,
  roleDelta,
} from "./user-authority.js";

describe("canGrantRole", () => {
  it("lets only an admin hand out admin", () => {
    expect(canGrantRole(["admin"], "admin")).toBe(true);
    expect(canGrantRole(["it_admin"], "admin")).toBe(false);
    expect(canGrantRole(["it_admin", "registrar"], "admin")).toBe(false);
  });

  it("lets an it_admin hand out everything else", () => {
    for (const role of ["faculty", "registrar", "bursar", "hr", "communications", "it_admin"]) {
      expect(canGrantRole(["it_admin"], role)).toBe(true);
    }
  });

  it("grants nothing to a caller holding neither", () => {
    expect(canGrantRole(["registrar"], "faculty")).toBe(false);
    expect(canGrantRole([], "faculty")).toBe(false);
  });
});

describe("canAdminister", () => {
  it("stops an it_admin touching an admin account", () => {
    // The takeover this exists to prevent: reset the admin's password, read the temp
    // password off the screen, sign in as them.
    expect(canAdminister(["it_admin"], ["admin"])).toBe(false);
    expect(canAdminister(["it_admin"], ["bursar", "admin"])).toBe(false);
  });

  it("lets an it_admin administer ordinary staff", () => {
    expect(canAdminister(["it_admin"], ["bursar"])).toBe(true);
    expect(canAdminister(["it_admin"], ["faculty", "registrar"])).toBe(true);
  });

  it("lets an admin administer anyone", () => {
    expect(canAdminister(["admin"], ["admin"])).toBe(true);
    expect(canAdminister(["admin"], ["bursar", "hr"])).toBe(true);
  });

  it("treats a roleless account as administrable", () => {
    expect(canAdminister(["it_admin"], [])).toBe(true);
  });
});

describe("roleDelta", () => {
  it("reports only what actually changed", () => {
    expect(roleDelta(["faculty"], ["faculty", "registrar"])).toEqual({
      added: ["registrar"],
      removed: [],
    });
    expect(roleDelta(["faculty", "admin"], ["faculty"])).toEqual({
      added: [],
      removed: ["admin"],
    });
    expect(roleDelta(["faculty"], ["faculty"])).toEqual({ added: [], removed: [] });
  });

  it("catches an admin revocation, which needs admin to perform", () => {
    const { removed } = roleDelta(["admin", "bursar"], ["bursar"]);
    expect(removed).toContain("admin");
    expect(canGrantRole(["it_admin"], removed[0]!)).toBe(false);
  });
});

describe("normalizeRoles", () => {
  it("drops duplicates, which z.enum does not", () => {
    expect(normalizeRoles(["admin", "admin", "bursar"] as never)).toEqual([
      "admin",
      "bursar",
    ]);
  });
});

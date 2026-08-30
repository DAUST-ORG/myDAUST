import { GUARDS_METADATA } from "@nestjs/common/constants";
import { IS_PUBLIC_KEY } from "../auth/decorators.js";
import { ROLES_KEY } from "../auth/decorators.js";
import { describe, expect, it } from "vitest";
import { FormsController } from "./forms.controller.js";
import { FormThrottleGuard } from "./form-throttle.guard.js";

function getRoles(methodName: string): string[] | undefined {
  const method = (FormsController.prototype as Record<string, unknown>)[methodName];
  if (!method) throw new Error(`Method ${methodName} not found`);
  return Reflect.getMetadata(ROLES_KEY, method) as string[] | undefined;
}

function isPublic(methodName: string): boolean {
  const method = (FormsController.prototype as Record<string, unknown>)[methodName];
  if (!method) throw new Error(`Method ${methodName} not found`);
  return Reflect.getMetadata(IS_PUBLIC_KEY, method) === true;
}

function getGuards(methodName: string): unknown[] {
  const method = (FormsController.prototype as Record<string, unknown>)[methodName];
  if (!method) throw new Error(`Method ${methodName} not found`);
  return (Reflect.getMetadata(GUARDS_METADATA, method) as unknown[]) ?? [];
}

describe("FormsController security decorators", () => {
  // ─── Admin endpoints must be registrar/admin only ─────────────────────────
  const adminMethods = [
    "create",
    "list",
    "getDetail",
    "update",
    "publish",
    "close",
    "deleteForm",
    "listResponses",
    "getResponse",
    "exportCsv",
  ];

  for (const method of adminMethods) {
    it(`${method} is @Roles registrar,admin and not @Public`, () => {
      const roles = getRoles(method);
      expect(roles).toEqual(expect.arrayContaining(["registrar", "admin"]));
      expect(isPublic(method)).toBe(false);
    });
  }

  // ─── Public endpoints must be @Public and throttled ──────────────────────
  it("getPublicForm is @Public and not @Roles", () => {
    expect(isPublic("getPublicForm")).toBe(true);
    expect(getRoles("getPublicForm")).toBeUndefined();
  });

  it("respondPublic is @Public, throttled, and not @Roles", () => {
    expect(isPublic("respondPublic")).toBe(true);
    expect(getRoles("respondPublic")).toBeUndefined();
    expect(getGuards("respondPublic")).toContain(FormThrottleGuard);
  });

  it("editPublicResponse is @Public, throttled, and not @Roles", () => {
    expect(isPublic("editPublicResponse")).toBe(true);
    expect(getRoles("editPublicResponse")).toBeUndefined();
    expect(getGuards("editPublicResponse")).toContain(FormThrottleGuard);
  });

  // ─── Auth respondent endpoints require any authenticated session ──────────
  it("getFormForRespondent is not @Public and not @Roles (any auth)", () => {
    expect(isPublic("getFormForRespondent")).toBe(false);
    expect(getRoles("getFormForRespondent")).toBeUndefined();
  });

  it("respondAuth is not @Public and not @Roles (any auth)", () => {
    expect(isPublic("respondAuth")).toBe(false);
    expect(getRoles("respondAuth")).toBeUndefined();
  });

  it("editAuthResponse is not @Public and not @Roles (any auth)", () => {
    expect(isPublic("editAuthResponse")).toBe(false);
    expect(getRoles("editAuthResponse")).toBeUndefined();
  });
});

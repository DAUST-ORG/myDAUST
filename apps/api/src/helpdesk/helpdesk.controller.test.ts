// Smoke tests for the helpdesk controller metadata. The full handler tests
// run through the integration harness; here we verify the decorator wiring
// stays correct so the route table is what the portal calls.

import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { HelpdeskController } from "./helpdesk.controller.js";

const proto = HelpdeskController.prototype as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;

function rolesFor(method: string): string[] {
  return Reflect.getMetadata(ROLES_KEY, proto[method]) ?? [];
}

describe("HelpdeskController route decoration", () => {
  it("requires a staff role for the staff queue", () => {
    expect(rolesFor("queue")).toEqual(
      expect.arrayContaining(["registrar", "it_admin", "admin"]),
    );
  });

  it("requires a staff role for ticket edits", () => {
    expect(rolesFor("update")).toEqual(
      expect.arrayContaining(["registrar", "admin"]),
    );
  });

  it("requires a staff role for the GitHub retry", () => {
    expect(rolesFor("sync")).toEqual(
      expect.arrayContaining(["registrar", "it_admin", "admin"]),
    );
  });

  it("does not require any role for the requester-facing endpoints", () => {
    expect(rolesFor("listMine")).toEqual([]);
    expect(rolesFor("get")).toEqual([]);
    expect(rolesFor("comment")).toEqual([]);
    expect(rolesFor("create")).toEqual([]);
    expect(rolesFor("upload")).toEqual([]);
    expect(rolesFor("attachment")).toEqual([]);
  });
});

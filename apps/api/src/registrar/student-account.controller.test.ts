import { HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/current-user.js";
import { ROLES_KEY } from "../auth/decorators.js";
import { StudentAccountController } from "./student-account.controller.js";

const ACTOR: AuthUser = {
  personId: "registrar-1",
  roles: ["registrar"],
  email: "registrar@daust.org",
  name: "Test Registrar",
};

describe("StudentAccountController", () => {
  it("is restricted to registrar and admin and marks every response no-store", () => {
    expect(Reflect.getMetadata(ROLES_KEY, StudentAccountController)).toEqual([
      "admin",
      "registrar",
    ]);
    for (const name of [
      "get",
      "updateContactEmail",
      "issueCredentials",
      "signOutAll",
    ] as const) {
      const headers = Object.fromEntries(
        (
          Reflect.getMetadata(
            HEADERS_METADATA,
            StudentAccountController.prototype[name],
          ) as Array<{ name: string; value: string }>
        ).map((header) => [header.name, header.value]),
      );
      expect(headers).toMatchObject({
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        Expires: "0",
        "Referrer-Policy": "no-referrer",
      });
    }
  });

  it("accepts only contact email and the two credential methods", async () => {
    const service = {
      updateContactEmail: vi.fn().mockResolvedValue({}),
      issueCredentials: vi.fn().mockResolvedValue({}),
    };
    const controller = new StudentAccountController(service as never);

    await controller.updateContactEmail(ACTOR, "student-1", {
      contactEmail: "contact@example.test",
    });
    expect(service.updateContactEmail).toHaveBeenCalledWith(
      ACTOR.personId,
      "student-1",
      "contact@example.test",
    );
    expect(() =>
      controller.updateContactEmail(ACTOR, "student-1", {
        contactEmail: "contact@example.test",
        loginEmail: "changed@mydaust.com",
      }),
    ).toThrow();

    await controller.issueCredentials(ACTOR, "student-1", {
      method: "temporary_password",
    });
    await controller.issueCredentials(ACTOR, "student-1", {
      method: "setup_link",
    });
    expect(() =>
      controller.issueCredentials(ACTOR, "student-1", {
        method: "emailed_password",
      }),
    ).toThrow();
  });
});

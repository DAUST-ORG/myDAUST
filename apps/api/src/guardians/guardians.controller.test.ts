import { describe, expect, it, vi } from "vitest";
import { GuardiansController } from "./guardians.controller.js";

describe("GuardiansController login management", () => {
  it("passes the authenticated actor to single and bulk provisioning", async () => {
    const guardians = {
      provisionLogin: vi.fn().mockResolvedValue({ guardianId: "parent-1" }),
      provisionAllMissing: vi.fn().mockResolvedValue({
        count: 0,
        credentials: [],
      }),
    };
    const controller = new GuardiansController(guardians as never);
    const user = { personId: "registrar-1" } as never;

    await controller.provisionLogin(user, "parent-1");
    await controller.provisionLogins(user);

    expect(guardians.provisionLogin).toHaveBeenCalledWith(
      "registrar-1",
      "parent-1",
    );
    expect(guardians.provisionAllMissing).toHaveBeenCalledWith("registrar-1");
  });
});

import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { FacultyController } from "./faculty.controller.js";

describe("FacultyController login management", () => {
  it("restricts single and bulk provisioning to registrar and admin roles", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        FacultyController.prototype.provisionLogin,
      ),
    ).toEqual(["registrar", "admin"]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        FacultyController.prototype.provisionLogins,
      ),
    ).toEqual(["registrar", "admin"]);
  });

  it("passes the authenticated actor to single and bulk provisioning", async () => {
    const faculty = {
      provisionLogin: vi.fn().mockResolvedValue({ facultyId: "faculty-1" }),
      provisionAllMissing: vi.fn().mockResolvedValue({
        count: 0,
        credentials: [],
      }),
    };
    const controller = new FacultyController(faculty as never);
    const user = { personId: "registrar-1" } as never;

    await controller.provisionLogin(user, "faculty-1");
    await controller.provisionLogins(user);

    expect(faculty.provisionLogin).toHaveBeenCalledWith(
      "registrar-1",
      "faculty-1",
    );
    expect(faculty.provisionAllMissing).toHaveBeenCalledWith("registrar-1");
  });
});

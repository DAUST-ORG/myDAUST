import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

describe("AuthService student activation guard", () => {
  it("rejects valid credentials while the student is pending payment", async () => {
    const passwordHash = await AuthService.hash("CorrectHorse9!");
    const prisma = {
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: "person-1",
          email: "applicant@example.test",
          firstName: "Awa",
          lastName: "Ndiaye",
          roles: [],
          passwordHash,
          student: { id: "student-1", recordStatus: "pending_payment" },
        }),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("applicant@example.test", "CorrectHorse9!"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("allows the same identity only after the student record is active", async () => {
    const passwordHash = await AuthService.hash("CorrectHorse9!");
    const prisma = {
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: "person-1",
          email: "student@example.test",
          firstName: "Awa",
          lastName: "Ndiaye",
          roles: ["student"],
          passwordHash,
          student: { id: "student-1", recordStatus: "active" },
        }),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("student@example.test", "CorrectHorse9!"),
    ).resolves.toMatchObject({
      personId: "person-1",
      studentId: "student-1",
      roles: ["student"],
    });
  });
});

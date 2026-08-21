import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

describe("AuthService student activation guard", () => {
  it("never authenticates a contact-only parent without an email principal", async () => {
    const passwordHash = await AuthService.hash("CorrectHorse9!");
    const prisma = {
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: "parent-contact",
          email: null,
          firstName: "Awa",
          lastName: "Ndiaye",
          roles: ["parent"],
          passwordHash,
          student: null,
        }),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("parent@example.test", "CorrectHorse9!"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

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
          status: "active",
          sessionVersion: 0,
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

describe("AuthService suspension guard", () => {
  const activePerson = async () => ({
    id: "person-1",
    email: "bursar@daust.edu",
    firstName: "Awa",
    lastName: "Ndiaye",
    roles: ["bursar"],
    passwordHash: await AuthService.hash("CorrectHorse9!"),
    status: "active",
    sessionVersion: 0,
    student: null,
  });

  it("refuses a suspended account holding the correct password", async () => {
    const prisma = {
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ ...(await activePerson()), status: "suspended" }),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("bursar@daust.edu", "CorrectHorse9!"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("admits the same account once restored, and carries its session version", async () => {
    const prisma = {
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ ...(await activePerson()), sessionVersion: 4 }),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("bursar@daust.edu", "CorrectHorse9!"),
    ).resolves.toMatchObject({ personId: "person-1", sessionVersion: 4 });
  });
});

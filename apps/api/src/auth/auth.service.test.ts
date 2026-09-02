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
        update: vi.fn(),
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
        update: vi.fn(),
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
        update: vi.fn().mockResolvedValue({}),
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
    expect(prisma.person.update).toHaveBeenCalledWith({
      where: { id: "person-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it("does not record a last login for a failed password", async () => {
    const prisma = {
      person: {
        findUnique: vi.fn().mockResolvedValue({
          id: "person-1",
          email: "student@example.test",
          firstName: "Awa",
          lastName: "Ndiaye",
          roles: ["student"],
          passwordHash: await AuthService.hash("CorrectHorse9!"),
          status: "active",
          sessionVersion: 0,
          student: { id: "student-1", recordStatus: "active" },
        }),
        update: vi.fn(),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("student@example.test", "WrongPassword9!"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.person.update).not.toHaveBeenCalled();
  });
});

describe("AuthService password-change concurrency", () => {
  async function fixture(updateCount: number) {
    const currentHash = await AuthService.hash("CurrentPassword9!");
    const person = {
      id: "student-person",
      email: "student@example.test",
      passwordHash: currentHash,
      sessionVersion: 7,
      status: "active",
      student: { id: "student-1" },
    };
    const prisma = {
      person: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(person)
          .mockResolvedValueOnce({ sessionVersion: 8 }),
        updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
      },
      studentInvite: {
        findMany: vi.fn().mockResolvedValue([{ id: "invite-1" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      studentActivationRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );
    return { auth: new AuthService(prisma as never), prisma, currentHash };
  }

  it("does not overwrite a credential changed by a concurrent registrar action", async () => {
    const { auth, prisma, currentHash } = await fixture(0);

    await expect(
      auth.changePassword(
        "student-person",
        "CurrentPassword9!",
        "ReplacementPassword9!",
      ),
    ).rejects.toThrow(/account changed/i);
    expect(prisma.person.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          passwordHash: currentHash,
          sessionVersion: 7,
        }),
      }),
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.studentInvite.updateMany).not.toHaveBeenCalled();
  });

  it("atomically invalidates pending student links after a password change", async () => {
    const { auth, prisma } = await fixture(1);

    await expect(
      auth.changePassword(
        "student-person",
        "CurrentPassword9!",
        "ReplacementPassword9!",
      ),
    ).resolves.toEqual({ sessionVersion: 8 });
    expect(prisma.person.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordChangedAt: expect.any(Date),
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(prisma.studentInvite.updateMany).toHaveBeenCalledOnce();
    expect(prisma.studentActivationRequest.updateMany).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
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
          .mockResolvedValue({
            ...(await activePerson()),
            status: "suspended",
          }),
        update: vi.fn(),
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
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const auth = new AuthService(prisma as never);

    await expect(
      auth.validateUser("bursar@daust.edu", "CorrectHorse9!"),
    ).resolves.toMatchObject({ personId: "person-1", sessionVersion: 4 });
  });
});

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/current-user.js";
import { UsersService } from "./users.service.js";

const ADMIN: AuthUser = {
  personId: "actor-admin",
  roles: ["admin"],
  email: "admin@daust.edu",
  name: "DAUST Administration",
};
const IT: AuthUser = {
  personId: "actor-it",
  roles: ["it_admin"],
  email: "it@daust.edu",
  name: "DAUST IT",
};

function serviceWith(person: Record<string, unknown> | null) {
  const prisma = {
    person: {
      findUnique: vi.fn().mockResolvedValue(person),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    student: { count: vi.fn().mockResolvedValue(0) },
    guardianStudent: { count: vi.fn().mockResolvedValue(0) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    users: new UsersService(prisma as never, {} as never, {} as never),
  };
}

const TARGET = {
  id: "target-1",
  email: "bursar@daust.edu",
  firstName: "DAUST",
  lastName: "Bursar",
  kind: "staff",
  roles: ["bursar"],
  status: "active",
  passwordHash: "hash",
};

describe("the identity ceiling", () => {
  it("refuses an it_admin resetting an admin's password", async () => {
    const { users, prisma } = serviceWith({ ...TARGET, roles: ["admin"] });

    await expect(users.resetPassword(IT, "target-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an it_admin suspending an admin", async () => {
    const { users, prisma } = serviceWith({ ...TARGET, roles: ["admin"] });

    await expect(
      users.suspend(IT, "target-1", {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an it_admin renaming an admin's login address", async () => {
    const { users } = serviceWith({ ...TARGET, roles: ["admin"] });

    await expect(
      users.update(IT, "target-1", {
        emailLocal: "taken",
        emailDomain: "daust.org",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows an it_admin to reset ordinary staff", async () => {
    const { users, prisma } = serviceWith(TARGET);
    prisma.$transaction.mockResolvedValue(undefined);

    await expect(users.resetPassword(IT, "target-1")).resolves.toMatchObject({
      email: "bursar@daust.edu",
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("refuses an it_admin granting admin to anyone", async () => {
    const { users } = serviceWith(TARGET);

    await expect(
      users.setRoles(IT, "target-1", ["bursar", "admin"] as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses an it_admin creating an account that holds admin", async () => {
    const { users } = serviceWith(null);

    await expect(
      users.create(IT, {
        firstName: "New",
        lastName: "Person",
        emailLocal: "new.person",
        emailDomain: "daust.org",
        kind: "staff",
        roles: ["admin"],
        provisionLogin: true,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("self-protection", () => {
  it("refuses changing your own roles", async () => {
    const { users } = serviceWith(TARGET);

    await expect(
      users.setRoles(ADMIN, "actor-admin", ["admin"] as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses suspending yourself", async () => {
    const { users } = serviceWith(TARGET);

    await expect(
      users.suspend(ADMIN, "actor-admin", {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("roles that need a backing record", () => {
  it("refuses student without an active Student row", async () => {
    const { users } = serviceWith(TARGET);

    await expect(
      users.setRoles(ADMIN, "target-1", ["bursar", "student"] as never),
    ).rejects.toThrow(/active student record/);
  });

  it("refuses parent without a linked student", async () => {
    const { users } = serviceWith(TARGET);

    await expect(
      users.setRoles(ADMIN, "target-1", ["bursar", "parent"] as never),
    ).rejects.toThrow(/linked student/);
  });

  it("allows student once the record exists", async () => {
    const { users, prisma } = serviceWith({ ...TARGET, roles: [] });
    prisma.student.count.mockResolvedValue(1);
    prisma.$transaction.mockResolvedValue({ id: "target-1" });

    await expect(
      users.setRoles(ADMIN, "target-1", ["student"] as never),
    ).resolves.toBeDefined();
  });
});

describe("login domains", () => {
  it("keeps students on mydaust.com", async () => {
    const { users } = serviceWith(null);

    await expect(
      users.create(ADMIN, {
        firstName: "New",
        lastName: "Student",
        emailLocal: "new.student",
        emailDomain: "daust.org",
        kind: "student",
        roles: ["student"],
        provisionLogin: true,
        student: { studentNo: "DS1" },
      } as never),
    ).rejects.toThrow(/must use mydaust\.com/);
  });
});

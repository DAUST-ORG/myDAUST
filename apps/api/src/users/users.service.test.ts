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
  const currentPerson = person ? { student: null, ...person } : null;
  const prisma = {
    person: {
      findUnique: vi.fn().mockResolvedValue(currentPerson),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
    },
    student: { count: vi.fn().mockResolvedValue(0) },
    guardianStudent: { count: vi.fn().mockResolvedValue(0) },
    guardianInvite: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    studentInvite: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
  );
  return {
    prisma,
    users: new UsersService(prisma as never, {} as never),
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

    await expect(users.suspend(IT, "target-1", {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

    await expect(users.resetPassword(IT, "target-1")).resolves.toMatchObject({
      email: "bursar@daust.edu",
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.person.updateMany).toHaveBeenCalledOnce();
  });

  it("refuses to mint a temporary password for a student account", async () => {
    const { users, prisma } = serviceWith({
      ...TARGET,
      kind: "student",
      roles: ["student"],
    });

    await expect(users.resetPassword(ADMIN, "target-1")).rejects.toMatchObject({
      message:
        "Student passwords can only be set through the student activation page",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("re-checks the locked current row and refuses a student-state drift", async () => {
    const { users, prisma } = serviceWith(TARGET);
    prisma.person.findUnique
      .mockResolvedValueOnce({ student: null, ...TARGET })
      .mockResolvedValueOnce({
        student: { id: "student-1" },
        ...TARGET,
        kind: "student",
        roles: ["student"],
      });

    await expect(users.resetPassword(ADMIN, "target-1")).rejects.toMatchObject({
      message:
        "Student passwords can only be set through the student activation page",
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.person.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses changing the login email of any Student-backed identity", async () => {
    const { users, prisma } = serviceWith(TARGET);
    prisma.student.count.mockResolvedValue(1);

    await expect(
      users.update(ADMIN, "target-1", {
        emailLocal: "renamed",
        emailDomain: "daust.org",
      }),
    ).rejects.toMatchObject({
      message: "A student's DAUST login email cannot be changed",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("re-checks the locked row before changing a login email", async () => {
    const { users, prisma } = serviceWith(TARGET);
    prisma.person.findUnique
      .mockResolvedValueOnce({ student: null, ...TARGET })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ student: { id: "student-1" }, ...TARGET });

    await expect(
      users.update(ADMIN, "target-1", {
        emailLocal: "renamed",
        emailDomain: "daust.org",
      }),
    ).rejects.toMatchObject({
      message: "A student's DAUST login email cannot be changed",
    });
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("fails closed when the conditional reset write sees later identity drift", async () => {
    const { users, prisma } = serviceWith(TARGET);
    prisma.person.updateMany.mockResolvedValue({ count: 0 });

    await expect(users.resetPassword(IT, "target-1")).rejects.toMatchObject({
      message:
        "This account changed while the password reset was being prepared",
    });
    expect(prisma.studentInvite.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
    const { users } = serviceWith({
      ...TARGET,
      kind: "student",
      roles: [],
    });

    await expect(
      users.setRoles(ADMIN, "target-1", ["student"] as never),
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

describe("role-change credential revocation", () => {
  it("burns all outstanding setup links in the role transaction", async () => {
    const { users, prisma } = serviceWith(TARGET);
    prisma.person.update.mockResolvedValue({
      ...TARGET,
      roles: ["registrar"],
    });
    prisma.$transaction.mockImplementation(
      async (work: (client: typeof prisma) => Promise<unknown>) => work(prisma),
    );

    await expect(
      users.setRoles(ADMIN, TARGET.id, ["registrar"] as never),
    ).resolves.toMatchObject({ id: TARGET.id, roles: ["registrar"] });

    expect(prisma.guardianInvite.updateMany).toHaveBeenCalledWith({
      where: { guardianId: TARGET.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.studentInvite.updateMany).toHaveBeenCalledWith({
      where: { studentPersonId: TARGET.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
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

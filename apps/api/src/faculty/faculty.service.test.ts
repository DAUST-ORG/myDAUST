import { ConflictException, NotFoundException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { FacultyService } from "./faculty.service.js";

const emptyCounts = {
  taughtSections: 0,
  threadParticipations: 0,
  messagesSent: 0,
  projectMemberships: 0,
  guardianOf: 0,
  guardianInvites: 0,
  studentInvites: 0,
  broadcasts: 0,
  paymentSubmissionsStarted: 0,
  paymentSubmissionsVerified: 0,
};

describe("FacultyService login management", () => {
  it("reports missing, forced-change, and active login states", async () => {
    const prisma = {
      person: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "missing",
            email: "missing@daust.org",
            firstName: "No",
            lastName: "Login",
            passwordHash: null,
            mustChangePassword: false,
            facultyProfile: null,
            _count: { taughtSections: 0 },
          },
          {
            id: "temporary",
            email: "temporary@daust.org",
            firstName: "Temp",
            lastName: "Password",
            passwordHash: "hash",
            mustChangePassword: true,
            facultyProfile: null,
            _count: { taughtSections: 1 },
          },
          {
            id: "active",
            email: "active@daust.org",
            firstName: "Active",
            lastName: "Login",
            passwordHash: "hash",
            mustChangePassword: false,
            facultyProfile: null,
            _count: { taughtSections: 2 },
          },
        ]),
      },
    };
    const service = new FacultyService(prisma as never);

    const rows = await service.adminList();

    expect(
      rows.map(({ id, hasLogin, mustChangePassword }) => ({
        id,
        hasLogin,
        mustChangePassword,
      })),
    ).toEqual([
      { id: "missing", hasLogin: false, mustChangePassword: false },
      { id: "temporary", hasLogin: true, mustChangePassword: true },
      { id: "active", hasLogin: true, mustChangePassword: false },
    ]);
  });

  it("generates or resets a login without changing the faculty email", async () => {
    const person = {
      id: "faculty-1",
      email: "teacher@daust.org",
      firstName: "Awa",
      lastName: "Ndiaye",
      passwordHash: "existing-hash",
      mustChangePassword: false,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      person: {
        findFirst: vi.fn().mockResolvedValue(person),
        updateMany,
      },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue(person),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new FacultyService(prisma as never);

    const credential = await service.provisionLogin("registrar-1", person.id);

    expect(credential).toMatchObject({
      facultyId: person.id,
      name: "Awa Ndiaye",
      email: person.email,
    });
    expect(credential.tempPassword).toHaveLength(14);
    const updateData = updateMany.mock.calls[0]![0].data;
    expect(updateData.mustChangePassword).toBe(true);
    expect(
      await bcrypt.compare(credential.tempPassword, updateData.passwordHash),
    ).toBe(true);
    expect(updateData).not.toHaveProperty("email");
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(
      credential.tempPassword,
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        entity: "Person",
        entityId: person.id,
        action: "login-provisioned",
        actorId: "registrar-1",
      },
    });
  });

  it("rejects a non-faculty person id", async () => {
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new FacultyService(prisma as never);

    await expect(
      service.provisionLogin("registrar-1", "staff-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.person.findFirst).toHaveBeenCalledWith({
      where: {
        id: "staff-1",
        kind: "faculty",
        roles: { has: "faculty" },
        student: { is: null },
      },
    });
  });

  it("fails closed if the target gains a Student record before the password write", async () => {
    const person = {
      id: "faculty-1",
      email: "teacher@daust.org",
      firstName: "Awa",
      lastName: "Ndiaye",
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      person: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      person: { findFirst: vi.fn().mockResolvedValue(person) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await expect(
      new FacultyService(prisma as never).provisionLogin(
        "registrar-1",
        person.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.person.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("bulk provisions only the faculty selected as missing a password", async () => {
    const people = new Map([
      [
        "faculty-1",
        {
          id: "faculty-1",
          email: "one@daust.org",
          firstName: "One",
          lastName: "Teacher",
        },
      ],
      [
        "faculty-2",
        {
          id: "faculty-2",
          email: "two@daust.org",
          firstName: "Two",
          lastName: "Teacher",
        },
      ],
    ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      person: {
        findFirst: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve(people.get(where.id) ?? null),
          ),
        updateMany,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      person: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "faculty-1" }, { id: "faculty-2" }]),
        findFirst: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve(people.get(where.id) ?? null),
          ),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new FacultyService(prisma as never);

    const result = await service.provisionAllMissing("registrar-1");

    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: "faculty",
          roles: { has: "faculty" },
          student: { is: null },
          passwordHash: null,
        },
      }),
    );
    expect(result.count).toBe(2);
    expect(
      result.credentials.map((credential) => credential.facultyId),
    ).toEqual(["faculty-1", "faculty-2"]);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});

describe("FacultyService.remove", () => {
  it("deletes an unused mistaken record and writes an audit event", async () => {
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      person: { delete: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue({
          id: "faculty-1",
          email: "wrong@daust.org",
          _count: emptyCounts,
        }),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new FacultyService(prisma as never);

    await expect(service.remove("faculty-1", "registrar-1")).resolves.toEqual({
      ok: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "faculty-deleted",
          entityId: "faculty-1",
        }),
      }),
    );
    expect(tx.person.delete).toHaveBeenCalledWith({
      where: { id: "faculty-1" },
    });
  });

  it("refuses to delete an instructor who still owns sections", async () => {
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue({
          id: "faculty-1",
          email: "teacher@daust.org",
          _count: { ...emptyCounts, taughtSections: 2 },
        }),
      },
    };
    const service = new FacultyService(prisma as never);

    await expect(
      service.remove("faculty-1", "registrar-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

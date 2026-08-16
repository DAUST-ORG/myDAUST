import bcrypt from "bcryptjs";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GuardiansService } from "./guardians.service.js";

function serviceWith(
  prisma: object,
  mail: object = { send: vi.fn().mockResolvedValue({ sent: true }) },
) {
  return new GuardiansService(
    prisma as never,
    mail as never,
    {} as never,
    {} as never,
  );
}

describe("GuardiansService login management", () => {
  it("reports contact details and a distinct not-provisioned state", async () => {
    const prisma = {
      person: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "parent-1",
            firstName: "Awa",
            lastName: "Ndiaye",
            email: "awa@example.com",
            passwordHash: null,
            mustChangePassword: false,
            guardianProfile: { phone: "+221770000000", address: "Dakar" },
            guardianInvites: [],
            guardianOf: [],
          },
        ]),
      },
    };

    const rows = await serviceWith(prisma).list();

    expect(rows).toEqual([
      expect.objectContaining({
        id: "parent-1",
        phone: "+221770000000",
        address: "Dakar",
        hasLogin: false,
        mustChangePassword: false,
        status: "not-provisioned",
      }),
    ]);
  });

  it("generates or resets a login and invalidates outstanding setup links", async () => {
    const guardian = {
      id: "parent-1",
      firstName: "Awa",
      lastName: "Ndiaye",
      email: "awa@example.com",
    };
    const tx = {
      person: { update: vi.fn().mockResolvedValue({}) },
      guardianInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      person: { findFirst: vi.fn().mockResolvedValue(guardian) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    const credential = await serviceWith(prisma).provisionLogin(
      "registrar-1",
      guardian.id,
    );

    expect(credential).toMatchObject({
      guardianId: guardian.id,
      name: "Awa Ndiaye",
      email: guardian.email,
    });
    expect(credential.tempPassword).toHaveLength(14);
    const updateData = tx.person.update.mock.calls[0]![0].data;
    expect(updateData.mustChangePassword).toBe(true);
    expect(
      await bcrypt.compare(credential.tempPassword, updateData.passwordHash),
    ).toBe(true);
    expect(tx.guardianInvite.updateMany).toHaveBeenCalledWith({
      where: { guardianId: guardian.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      credential.tempPassword,
    );
  });

  it("bulk provisions only guardians missing a password", async () => {
    const guardians = new Map([
      [
        "parent-1",
        {
          id: "parent-1",
          firstName: "Awa",
          lastName: "Ndiaye",
          email: "awa@example.com",
        },
      ],
      [
        "parent-2",
        {
          id: "parent-2",
          firstName: "Moussa",
          lastName: "Ba",
          email: "moussa@example.com",
        },
      ],
    ]);
    const tx = {
      person: { update: vi.fn().mockResolvedValue({}) },
      guardianInvite: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      person: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "parent-1" }, { id: "parent-2" }]),
        findFirst: vi
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve(guardians.get(where.id) ?? null),
          ),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    const result = await serviceWith(prisma).provisionAllMissing("registrar-1");

    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: "parent", passwordHash: null },
      }),
    );
    expect(result.count).toBe(2);
    expect(result.credentials.map((item) => item.guardianId)).toEqual([
      "parent-1",
      "parent-2",
    ]);
  });

  it("rejects a non-guardian id", async () => {
    const prisma = {
      person: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      serviceWith(prisma).provisionLogin("registrar-1", "staff-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("GuardiansService student relationships", () => {
  it("lists parent profiles and login state for a student profile", async () => {
    const prisma = {
      student: { findUnique: vi.fn().mockResolvedValue({ id: "student-1" }) },
      guardianStudent: {
        findMany: vi.fn().mockResolvedValue([
          {
            relation: "Mother",
            guardian: {
              id: "parent-1",
              firstName: "Awa",
              lastName: "Ndiaye",
              email: "awa@example.com",
              passwordHash: null,
              mustChangePassword: false,
              guardianProfile: { phone: "+221770000000", address: null },
              guardianInvites: [],
            },
          },
        ]),
      },
    };

    const rows = await serviceWith(prisma).listForStudent("student-1");

    expect(prisma.guardianStudent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-1",
          guardian: { kind: "parent" },
        },
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: "parent-1",
        relation: "Mother",
        status: "not-provisioned",
        hasLogin: false,
      }),
    ]);
  });

  it("links an existing parent to a payment-pending student without replacing other links", async () => {
    const tx = {
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      person: { findFirst: vi.fn().mockResolvedValue({ id: "parent-1" }) },
      guardianStudent: { upsert: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await serviceWith(prisma).linkToStudent("registrar-1", "student-1", {
      guardianId: "parent-1",
      relation: "Sponsor",
    });

    expect(tx.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "student-1",
          recordStatus: { in: ["active", "pending_payment"] },
        },
      }),
    );
    expect(tx.guardianStudent.upsert).toHaveBeenCalledWith({
      where: {
        guardianId_studentId: {
          guardianId: "parent-1",
          studentId: "student-1",
        },
      },
      create: {
        guardianId: "parent-1",
        studentId: "student-1",
        relation: "Sponsor",
      },
      update: { relation: "Sponsor" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "guardian-linked-to-student" }),
      }),
    );
  });

  it("creates and links a parent without sending an invite by default", async () => {
    const guardian = {
      id: "parent-1",
      firstName: "Awa",
      lastName: "Ndiaye",
      email: "awa@example.com",
    };
    const tx = {
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      person: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(guardian),
      },
      guardianProfile: { create: vi.fn().mockResolvedValue({}) },
      guardianStudent: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const mail = { send: vi.fn().mockResolvedValue({ sent: true }) };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
      guardianInvite: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await serviceWith(prisma, mail).createForStudent(
      "registrar-1",
      "student-1",
      {
        fullName: "Awa Ndiaye",
        email: "AWA@EXAMPLE.COM",
        relation: "Mother",
        sendInvite: false,
      },
    );

    expect(tx.person.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "awa@example.com" }),
      }),
    );
    expect(tx.guardianStudent.create).toHaveBeenCalledWith({
      data: {
        guardianId: "parent-1",
        studentId: "student-1",
        relation: "Mother",
      },
    });
    expect(prisma.guardianInvite.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(result.inviteDelivery).toBe("not_requested");
  });

  it("sends a setup invitation only when staff explicitly requests it", async () => {
    const guardian = {
      id: "parent-1",
      firstName: "Awa",
      lastName: "Ndiaye",
      email: "awa@example.com",
    };
    const tx = {
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      person: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(guardian),
      },
      guardianProfile: { create: vi.fn().mockResolvedValue({}) },
      guardianStudent: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const mail = { send: vi.fn().mockResolvedValue({ sent: true }) };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
      guardianInvite: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await serviceWith(prisma, mail).createForStudent(
      "registrar-1",
      "student-1",
      {
        fullName: "Awa Ndiaye",
        email: "awa@example.com",
        sendInvite: true,
      },
    );

    expect(prisma.guardianInvite.create).toHaveBeenCalledOnce();
    expect(mail.send).toHaveBeenCalledOnce();
    expect(result.inviteDelivery).toBe("sent");
  });

  it("rejects email collisions instead of mutating an existing account", async () => {
    const tx = {
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      person: {
        findFirst: vi.fn().mockResolvedValue({
          id: "staff-1",
          kind: "staff",
        }),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await expect(
      serviceWith(prisma).createForStudent("registrar-1", "student-1", {
        fullName: "Awa Ndiaye",
        email: "staff@example.com",
        sendInvite: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.person.create).not.toHaveBeenCalled();
  });

  it("unlinks only the relationship and records the revocation", async () => {
    const tx = {
      guardianStudent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      person: { delete: vi.fn() },
    };
    const prisma = {
      student: { findUnique: vi.fn().mockResolvedValue({ id: "student-1" }) },
      person: { findFirst: vi.fn().mockResolvedValue({ id: "parent-1" }) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await serviceWith(prisma).unlinkFromStudent(
      "registrar-1",
      "student-1",
      "parent-1",
    );

    expect(tx.guardianStudent.deleteMany).toHaveBeenCalledWith({
      where: { guardianId: "parent-1", studentId: "student-1" },
    });
    expect(tx.person.delete).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "guardian-unlinked-from-student",
        }),
      }),
    );
  });
});

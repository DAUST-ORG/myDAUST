import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("reports a null-email parent as contact-only", async () => {
    const prisma = {
      person: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "parent-contact",
            firstName: "Awa",
            lastName: "Ndiaye",
            email: null,
            passwordHash: null,
            mustChangePassword: false,
            guardianProfile: { phone: "+221770000000", address: null },
            guardianInvites: [],
            guardianOf: [],
          },
        ]),
      },
    };

    const rows = await serviceWith(prisma).list();

    expect(rows[0]).toMatchObject({
      id: "parent-contact",
      email: null,
      hasLogin: false,
      status: "contact-only",
    });
  });

  it("generates or resets a login and invalidates outstanding setup links", async () => {
    const guardian = {
      id: "parent-1",
      firstName: "Awa",
      lastName: "Ndiaye",
      email: "awa@example.com",
    };
    const tx = {
      person: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
    const updateData = tx.person.updateMany.mock.calls[0]![0].data;
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
      person: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
        where: {
          kind: "parent",
          student: { is: null },
          email: { not: null },
          passwordHash: null,
        },
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

  it("refuses to provision a login without a real email", async () => {
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue({
          id: "parent-contact",
          kind: "parent",
          email: null,
        }),
      },
    };

    await expect(
      serviceWith(prisma).provisionLogin("registrar-1", "parent-contact"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to resend an invitation without a real email", async () => {
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue({
          id: "parent-contact",
          kind: "parent",
          email: null,
          passwordHash: null,
        }),
      },
      guardianInvite: { create: vi.fn() },
    };

    await expect(
      serviceWith(prisma).resendInvite("registrar-1", "parent-contact"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.guardianInvite.create).not.toHaveBeenCalled();
  });
});

describe("GuardiansService student invite redemption", () => {
  const token = "student-setup-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const studentEmail = "student@example.test";
  const emailHash = createHash("sha256").update(studentEmail).digest("hex");

  function redemptionFixture(options?: {
    boundEmailSha256?: string | null;
    currentEmail?: string | null;
    passwordSetCount?: number;
  }) {
    const studentInvite = {
      id: "student-invite-1",
      studentPersonId: "student-person-1",
      purpose: "first_time",
      boundEmailSha256:
        options?.boundEmailSha256 === undefined
          ? emailHash
          : options.boundEmailSha256,
      person: {
        id: "student-person-1",
        email:
          options?.currentEmail === undefined
            ? studentEmail
            : options.currentEmail,
        student: { id: "student-1", recordStatus: "active" },
      },
    };
    const tx = {
      studentInvite: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValue({ count: 0 }),
      },
      person: {
        updateMany: vi
          .fn()
          .mockResolvedValue({ count: options?.passwordSetCount ?? 1 }),
      },
      studentActivationRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      guardianInvite: { findUnique: vi.fn().mockResolvedValue(null) },
      studentInvite: { findUnique: vi.fn().mockResolvedValue(studentInvite) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    return { prisma, tx };
  }

  it("sets a password only through the exact active passwordless student guard", async () => {
    const { prisma, tx } = redemptionFixture();

    await expect(
      serviceWith(prisma).redeemInvite(token, "a-secure-password"),
    ).resolves.toEqual({ ok: true, email: studentEmail });

    expect(tx.studentInvite.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "student-invite-1",
        studentPersonId: "student-person-1",
        boundEmailSha256: emailHash,
        usedAt: null,
        expiresAt: { gte: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.person.updateMany).toHaveBeenCalledWith({
      where: {
        id: "student-person-1",
        email: studentEmail,
        kind: "student",
        roles: { equals: ["student"] },
        status: "active",
        passwordHash: null,
        mustChangePassword: false,
        student: { is: { recordStatus: "active" } },
      },
      data: {
        passwordHash: expect.any(String),
        mustChangePassword: false,
        passwordChangedAt: expect.any(Date),
        sessionVersion: { increment: 1 },
      },
    });
    const installedHash =
      tx.person.updateMany.mock.calls[0]![0].data.passwordHash;
    expect(await bcrypt.compare("a-secure-password", installedHash)).toBe(true);
    expect(tx.studentActivationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        requestTokenHash: tokenHash,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("burns a claimed invite and returns the generic error when identity state drifts", async () => {
    const { prisma, tx } = redemptionFixture({ passwordSetCount: 0 });

    await expect(
      serviceWith(prisma).redeemInvite(token, "a-secure-password"),
    ).rejects.toThrow("That invitation link is invalid or has expired");

    expect(tx.person.updateMany).toHaveBeenCalledOnce();
    expect(tx.studentActivationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        requestTokenHash: tokenHash,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(tx.studentInvite.updateMany).toHaveBeenCalledOnce();
  });

  it.each([
    { label: "a legacy invite without a binding", boundEmailSha256: null },
    {
      label: "an invite bound to a prior email",
      boundEmailSha256: createHash("sha256")
        .update("prior@example.test")
        .digest("hex"),
    },
  ])("rejects $label before attempting a password write", async (options) => {
    const { prisma, tx } = redemptionFixture(options);

    await expect(
      serviceWith(prisma).redeemInvite(token, "a-secure-password"),
    ).rejects.toThrow("That invitation link is invalid or has expired");

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.person.updateMany).not.toHaveBeenCalled();
    expect(tx.studentActivationRequest.updateMany).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
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
      person: {
        findFirst: vi.fn().mockResolvedValue({ id: guardian.id }),
      },
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

  it("creates and links a contact-only parent when email is unavailable", async () => {
    const guardian = {
      id: "parent-contact",
      firstName: "Awa",
      lastName: "Ndiaye",
      email: null,
    };
    const tx = {
      student: { findFirst: vi.fn().mockResolvedValue({ id: "student-1" }) },
      person: {
        findFirst: vi.fn(),
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
      person: {
        findFirst: vi.fn().mockResolvedValue({ id: guardian.id }),
      },
      guardianInvite: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await serviceWith(prisma, mail).createForStudent(
      "registrar-1",
      "student-1",
      { fullName: "Awa Ndiaye", sendInvite: false },
    );

    expect(tx.person.findFirst).not.toHaveBeenCalled();
    expect(tx.person.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: null,
          passwordHash: null,
          mustChangePassword: false,
        }),
      }),
    );
    expect(tx.guardianStudent.create).toHaveBeenCalledOnce();
    expect(prisma.guardianInvite.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      email: null,
      inviteDelivery: "not_requested",
    });
  });

  it("refuses an invitation request when the new parent has no email", async () => {
    const prisma = { $transaction: vi.fn() };

    await expect(
      serviceWith(prisma).createForStudent("registrar-1", "student-1", {
        fullName: "Awa Ndiaye",
        sendInvite: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a provided blank email instead of converting it to null", async () => {
    const prisma = { $transaction: vi.fn() };

    await expect(
      serviceWith(prisma).createForStudent("registrar-1", "student-1", {
        fullName: "Awa Ndiaye",
        email: "   ",
        sendInvite: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sends a setup invitation only when staff explicitly requests it", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/mydaust");
    vi.stubEnv("PORTAL_ORIGIN", "https://my.example.test");
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
      person: {
        findFirst: vi.fn().mockResolvedValue({ id: guardian.id }),
      },
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

  it("adds a real email to a contact-only parent without auto-sending an invite", async () => {
    const guardian = {
      id: "parent-contact",
      firstName: "Awa",
      lastName: "Ndiaye",
      email: null,
      passwordHash: null,
      guardianInvites: [],
    };
    const updated = { ...guardian, email: "awa@example.com" };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      person: {
        findFirst: vi.fn().mockResolvedValue(guardian),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updated),
      },
      guardianInvite: { updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const mail = { send: vi.fn().mockResolvedValue({ sent: true }) };
    const prisma = {
      person: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(guardian)
          .mockResolvedValueOnce(null),
      },
      guardianInvite: { create: vi.fn() },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    const result = await serviceWith(prisma, mail).update(
      "registrar-1",
      guardian.id,
      { email: "AWA@EXAMPLE.COM" },
    );

    expect(tx.person.updateMany).toHaveBeenCalledWith({
      where: {
        id: guardian.id,
        kind: "parent",
        student: { is: null },
      },
      data: { email: "awa@example.com" },
    });
    expect(prisma.person.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        email: { equals: "awa@example.com", mode: "insensitive" },
      },
    });
    expect(tx.guardianInvite.updateMany).not.toHaveBeenCalled();
    expect(prisma.guardianInvite.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      email: "awa@example.com",
      inviteDelivery: null,
    });
  });

  it("refuses to rename a malformed Student-backed parent identity", async () => {
    const prisma = {
      person: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };

    await expect(
      serviceWith(prisma).update("registrar-1", "student-person", {
        email: "renamed@example.com",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student: { is: null } }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

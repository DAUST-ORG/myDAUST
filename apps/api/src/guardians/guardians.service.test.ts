import bcrypt from "bcryptjs";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GuardiansService } from "./guardians.service.js";

function serviceWith(prisma: object) {
  return new GuardiansService(
    prisma as never,
    {} as never,
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

import { describe, expect, it, vi } from "vitest";
import { RegistrarService } from "./registrar.service.js";

function prismaFor(student: Record<string, unknown>) {
  const tx = {
    student: {
      findUnique: vi.fn().mockResolvedValue(student),
      update: vi.fn().mockResolvedValue({}),
    },
    studentInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    person: {
      update: vi.fn().mockResolvedValue({ status: "suspended" }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
    },
  };
}

describe("Registrar student archive", () => {
  it("archives the SIS row, revokes sessions, and suspends a student-only person", async () => {
    const { prisma, tx } = prismaFor({
      id: "student-1",
      personId: "person-1",
      recordStatus: "active",
      person: {
        status: "active",
        roles: ["student"],
      },
    });
    const service = new RegistrarService(prisma as never, {} as never);

    await expect(
      service.archiveStudent(
        "admin-1",
        "student-1",
        "Workbook roster exclusion reviewed by Registrar",
      ),
    ).resolves.toMatchObject({
      recordStatus: "archived",
      personStatus: "suspended",
      remainingRoles: [],
      alreadyArchived: false,
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { recordStatus: "archived" },
    });
    expect(tx.person.update).toHaveBeenCalledWith({
      where: { id: "person-1" },
      data: expect.objectContaining({
        roles: [],
        status: "suspended",
        suspendedById: "admin-1",
        sessionVersion: { increment: 1 },
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("preserves non-student roles and leaves the person active", async () => {
    const { prisma, tx } = prismaFor({
      id: "student-2",
      personId: "person-2",
      recordStatus: "active",
      person: {
        status: "active",
        roles: ["student", "faculty"],
      },
    });
    tx.person.update.mockResolvedValue({ status: "active" });
    const service = new RegistrarService(prisma as never, {} as never);

    await service.archiveStudent(
      "admin-1",
      "student-2",
      "Reviewed production-only exception is archived",
    );
    expect(tx.person.update).toHaveBeenCalledWith({
      where: { id: "person-2" },
      data: {
        roles: ["faculty"],
        sessionVersion: { increment: 1 },
      },
    });
  });

  it("is audit-free and mutation-free when replayed", async () => {
    const { prisma, tx } = prismaFor({
      id: "student-3",
      personId: "person-3",
      recordStatus: "archived",
      person: { status: "suspended", roles: [] },
    });
    const service = new RegistrarService(prisma as never, {} as never);

    await expect(
      service.archiveStudent(
        "admin-1",
        "student-3",
        "Reviewed production-only exception is archived",
      ),
    ).resolves.toMatchObject({ alreadyArchived: true });
    expect(tx.student.update).not.toHaveBeenCalled();
    expect(tx.person.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

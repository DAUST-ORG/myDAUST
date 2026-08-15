import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RegistrarService } from "./registrar.service.js";

describe("Registrar student login activation boundary", () => {
  it("cannot provision a login for a payment-pending student", async () => {
    const prisma = {
      student: {
        findUnique: vi.fn().mockResolvedValue({
          id: "student-1",
          studentNo: "S20261AN",
          recordStatus: "pending_payment",
          personalEmail: null,
          person: {
            id: "person-1",
            email: "applicant@example.test",
            firstName: "Awa",
            lastName: "Ndiaye",
          },
        }),
        update: vi.fn(),
      },
      person: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const registrar = new RegistrarService(prisma as never, {} as never);

    await expect(
      registrar.provisionLogin("registrar-1", "student-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("bulk provisioning selects only active student records", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const registrar = new RegistrarService(
      { student: { findMany } } as never,
      {} as never,
    );

    await expect(registrar.provisionAllMissing("registrar-1")).resolves.toEqual(
      {
        count: 0,
        credentials: [],
      },
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { recordStatus: "active", person: { passwordHash: null } },
      select: { id: true },
      orderBy: { studentNo: "asc" },
    });
  });
});

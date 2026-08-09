import { ConflictException } from "@nestjs/common";
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
  wireTransfersSubmitted: 0,
  wireTransfersReviewed: 0,
};

describe("FacultyService.remove", () => {
  it("deletes an unused mistaken record and writes an audit event", async () => {
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      person: { delete: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      person: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
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

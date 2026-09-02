import { describe, expect, it, vi } from "vitest";
import { RegistrarService } from "./registrar.service.js";

describe("RegistrarService.saveCurriculum", () => {
  it("rejects direct writes once the academic year has an approved catalog revision", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: "year-1" }]),
      academicCatalogRevision: {
        findFirst: vi.fn(async () => ({ id: "approved-revision" })),
      },
      program: { findUnique: vi.fn() },
      course: { findMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const service = new RegistrarService(prisma as never);

    await expect(
      service.saveCurriculum("registrar-1", "BSCS", "year-1", [
        { yearIndex: 1, semester: "Fall", courseCode: "CSC 101" },
      ]),
    ).rejects.toThrow(/approved catalog.*Academic Years.*new revision/i);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[0]?.[0].join(" ")).toContain("FOR UPDATE");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.academicCatalogRevision.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(tx.program.findUnique).not.toHaveBeenCalled();
  });

  it("keeps draft-year writes on the existing relational path", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: "year-1" }]),
      academicCatalogRevision: { findFirst: vi.fn(async () => null) },
      program: { findUnique: vi.fn(async () => ({ id: "program-1" })) },
      course: {
        findMany: vi.fn(async () => [{ id: "course-1", code: "CSC 101" }]),
      },
      curriculum: {
        upsert: vi.fn(async () => ({ id: "curriculum-1" })),
      },
      curriculumEntry: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const service = new RegistrarService(prisma as never);

    await expect(
      service.saveCurriculum("registrar-1", "BSCS", "year-1", [
        { yearIndex: 1, semester: "Fall", courseCode: "CSC 101" },
      ]),
    ).resolves.toEqual({ ok: true });
    expect(tx.curriculumEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          curriculumId: "curriculum-1",
          yearIndex: 1,
          semester: "Fall",
          courseId: "course-1",
          position: 0,
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        entity: "Curriculum",
        entityId: "BSCS:year-1",
        action: "saved",
        actorId: "registrar-1",
        data: { entries: 1 },
      },
    });
  });
});

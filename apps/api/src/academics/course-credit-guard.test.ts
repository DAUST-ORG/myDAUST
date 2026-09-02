import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("AcademicsService.updateCourse approved-credit guard", () => {
  it("locks the course and rejects credit drift referenced by an approved catalog", async () => {
    const order: string[] = [];
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn(async () => {
        order.push("lock-course");
        return [{ id: "course-1" }];
      }),
      course: {
        findUnique: vi.fn(async () => {
          order.push("read-course");
          return { id: "course-1", code: "CSC 101", credits: 3 };
        }),
        update,
      },
      academicCatalogRevision: {
        findMany: vi.fn(async () => {
          order.push("read-approved-snapshots");
          return [
            {
              programConfigurations: [
                { curriculum: [{ courseId: "course-1" }] },
              ],
            },
          ];
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await expect(
      new AcademicsService(prisma as never).updateCourse(
        "registrar-1",
        "CSC 101",
        { credits: 4 },
      ),
    ).rejects.toThrow(/credits are frozen/i);
    expect(order).toEqual([
      "lock-course",
      "read-course",
      "read-approved-snapshots",
    ]);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps metadata, prerequisite, corequisite, and audit writes in the lock transaction", async () => {
    const courseUpdate = vi.fn(async () => ({
      id: "course-1",
      code: "CSC 101",
      title: "Revised title",
      credits: 3,
    }));
    const auditCreate = vi.fn(async () => ({}));
    const corequisiteDelete = vi.fn(async () => ({ count: 0 }));
    const corequisiteCreate = vi.fn(async () => ({}));
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: "course-1" }]),
      course: {
        findUnique: vi.fn(async () => ({
          id: "course-1",
          code: "CSC 101",
          credits: 3,
        })),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "prerequisite-1" }])
          .mockResolvedValueOnce([{ id: "corequisite-1" }]),
        update: courseUpdate,
      },
      department: { findUnique: vi.fn(async () => ({ id: "department-1" })) },
      courseCorequisite: {
        deleteMany: corequisiteDelete,
        create: corequisiteCreate,
      },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await expect(
      new AcademicsService(prisma as never).updateCourse(
        "registrar-1",
        "CSC 101",
        {
          title: "Revised title",
          departmentId: "department-1",
          prerequisiteCodes: ["CSC 100"],
          corequisiteCodes: ["CSC 101L"],
        },
      ),
    ).resolves.toMatchObject({ title: "Revised title" });
    expect(courseUpdate).toHaveBeenCalledWith({
      where: { code: "CSC 101" },
      data: expect.objectContaining({
        title: "Revised title",
        departmentId: "department-1",
        prerequisites: { set: [{ id: "prerequisite-1" }] },
      }),
    });
    expect(corequisiteDelete).toHaveBeenCalledWith({
      where: { courseId: "course-1" },
    });
    expect(corequisiteCreate).toHaveBeenCalledWith({
      data: {
        courseId: "course-1",
        coreqCourseId: "corequisite-1",
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "Course",
        entityId: "course-1",
        action: "course-updated",
      }),
    });
  });
});

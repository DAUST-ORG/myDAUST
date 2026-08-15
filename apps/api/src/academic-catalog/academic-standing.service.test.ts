import { describe, expect, it, vi } from "vitest";
import { AcademicStandingService } from "./academic-standing.service.js";

const policy = {
  rules: [
    {
      code: "academic_probation",
      label: "Academic Probation",
      minimumGpa: 0,
      order: 0,
      tone: "warning",
    },
    {
      code: "good_standing",
      label: "Good Standing",
      minimumGpa: 2,
      order: 1,
      tone: "success",
    },
    {
      code: "deans_list",
      label: "Dean's List",
      minimumGpa: 3.7,
      order: 2,
      tone: "honor",
    },
  ],
  notYetGraded: {
    code: "not_yet_graded",
    label: "Not yet graded",
    tone: "neutral",
  },
  catalog: {
    academicYearId: "year-1",
    label: "2026–2027",
    revision: 3,
    fallback: false,
  },
} as const;

const context = {
  studentId: "student-1",
  programId: "program-1",
  catalogYearId: "year-1",
  catalogYearLabel: "2026–2027",
  cumulativeGpa: 0,
  hasGpaBearingCoursework: true,
};

describe("AcademicStandingService", () => {
  it("distinguishes no graded work from a graded 0.00 GPA", async () => {
    const service = new AcademicStandingService(
      {} as never,
      { standingPolicy: vi.fn(async () => policy) } as never,
    );

    await expect(
      service.resolve({
        ...context,
        cumulativeGpa: null,
        hasGpaBearingCoursework: false,
      }),
    ).resolves.toMatchObject({ code: "not_yet_graded", source: "computed" });
    await expect(service.resolve(context)).resolves.toMatchObject({
      code: "academic_probation",
      source: "computed",
    });
  });

  it("applies a valid active override with actor and reason provenance", async () => {
    const prisma = {
      studentStandingOverride: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => ({
          id: "override-1",
          standingCode: "good_standing",
          reason: "Approved academic appeal",
          expiresAt: null,
          createdAt: new Date("2026-08-15T10:00:00.000Z"),
          createdBy: {
            firstName: "Registrar",
            lastName: "One",
            email: "registrar@daust.edu",
          },
        })),
      },
      auditLog: { create: vi.fn() },
    };
    const service = new AcademicStandingService(
      prisma as never,
      { standingPolicy: vi.fn(async () => policy) } as never,
    );

    await expect(service.resolve(context)).resolves.toMatchObject({
      code: "good_standing",
      source: "override",
      override: {
        reason: "Approved academic appeal",
        createdBy: { email: "registrar@daust.edu" },
      },
    });
  });

  it("updates an existing exception and records the updater action", async () => {
    const update = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "override-1",
        ...data,
      }),
    );
    const auditCreate = vi.fn(async () => ({}));
    const tx = {
      student: {
        findUnique: vi.fn(async () => ({
          id: "student-1",
          programId: "program-1",
          catalogYearId: "year-1",
          catalogYear: "2026–2027",
          transcriptEntries: [],
        })),
      },
      studentStandingOverride: {
        findFirst: vi.fn(async () => ({
          id: "override-1",
          standingCode: "academic_probation",
          reason: "Original reason",
        })),
        update,
      },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AcademicStandingService(
      prisma as never,
      { standingPolicy: vi.fn(async () => policy) } as never,
    );

    await service.setOverride("registrar-1", "student-1", {
      standingCode: "good_standing",
      reason: "Appeal upheld",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "override-1" },
      data: expect.objectContaining({
        standingCode: "good_standing",
        reason: "Appeal upheld",
        updatedById: "registrar-1",
      }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "standing-override-updated" }),
    });
  });
});

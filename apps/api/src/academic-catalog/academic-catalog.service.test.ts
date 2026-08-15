import { describe, expect, it, vi } from "vitest";
import { AcademicCatalogService } from "./academic-catalog.service.js";

const PROGRAM_ID = "00000000-0000-4000-8000-000000000001";

const levels = [
  { code: "S1", name: "Level one", creditCeiling: 30 },
  { code: "S2", name: "Level two", creditCeiling: 60 },
  { code: "S3", name: "Level three", creditCeiling: 90 },
  { code: "S4", name: "Level four", creditCeiling: 120 },
  { code: "S5", name: "Level five", creditCeiling: 150 },
];

const program = {
  programId: PROGRAM_ID,
  programCode: "BSCS",
  programName: "Computer Science",
  progressionMode: "default" as const,
  customLevels: [],
  requirements: [{ category: "Degree", requiredCredits: 132 }],
};

describe("AcademicCatalogService.progress", () => {
  it("uses earned credits only, honors the assigned catalog, and caps the programme level", async () => {
    const prisma = {
      academicCatalogRevision: {
        findMany: vi.fn(async () => [
          {
            academicYearId: "new-year",
            yearLabel: "Future label",
            revision: 4,
            defaultLevels: levels,
            programConfigurations: [program],
            academicYear: { label: "Future label" },
          },
          {
            academicYearId: "assigned-year",
            yearLabel: "Corrected 2026 catalog",
            revision: 2,
            defaultLevels: levels,
            programConfigurations: [program],
            academicYear: { label: "Corrected 2026 catalog" },
          },
        ]),
      },
    };
    const service = new AcademicCatalogService(prisma as never);

    const progress = await service.progress({
      programId: PROGRAM_ID,
      catalogYearId: "assigned-year",
      catalogYearLabel: "Old mutable label",
      earnedCredits: 31,
      inProgressCredits: 40,
    });

    expect(progress).toMatchObject({
      earnedCredits: 31,
      requiredCredits: 132,
      inProgressCredits: 40,
      level: { code: "S2", minimumCredits: 31, creditCeiling: 60 },
      maximumLevel: { code: "S5", creditCeiling: 150 },
      catalog: {
        academicYearId: "assigned-year",
        label: "Corrected 2026 catalog",
        revision: 2,
        fallback: false,
      },
    });
  });

  it("visibly marks a latest-approved-program fallback", async () => {
    const prisma = {
      academicCatalogRevision: {
        findMany: vi.fn(async () => [
          {
            academicYearId: "latest-year",
            yearLabel: "Latest approved",
            revision: 3,
            defaultLevels: levels,
            programConfigurations: [program],
            academicYear: { label: "Latest approved" },
          },
        ]),
      },
    };
    const service = new AcademicCatalogService(prisma as never);

    const progress = await service.progress({
      programId: PROGRAM_ID,
      catalogYearId: null,
      catalogYearLabel: null,
      earnedCredits: 0,
      inProgressCredits: 6,
    });

    expect(progress.catalog).toEqual({
      academicYearId: "latest-year",
      label: "Latest approved",
      revision: 3,
      fallback: true,
    });
    expect(progress.level?.code).toBe("S1");
  });

  it("resolves a roster batch with one catalog read", async () => {
    const findMany = vi.fn(async () => [
      {
        academicYearId: "assigned-year",
        yearLabel: "2026–2027",
        revision: 2,
        defaultLevels: [
          ...levels,
          { code: "S6", name: "Level six", creditCeiling: 180 },
          { code: "S7", name: "Level seven", creditCeiling: 210 },
          { code: "S8", name: "Level eight", creditCeiling: 240 },
          { code: "S9", name: "Level nine", creditCeiling: 270 },
          { code: "S10", name: "Level ten", creditCeiling: 300 },
        ],
        programConfigurations: [
          {
            ...program,
            requirements: [{ category: "Degree", requiredCredits: 300 }],
          },
        ],
        academicYear: { label: "2026–2027" },
      },
    ]);
    const service = new AcademicCatalogService({
      academicCatalogRevision: { findMany },
    } as never);

    const progress = await service.progressMany([
      {
        programId: PROGRAM_ID,
        catalogYearId: "assigned-year",
        catalogYearLabel: "2026–2027",
        earnedCredits: 30,
        inProgressCredits: 0,
      },
      {
        programId: PROGRAM_ID,
        catalogYearId: "assigned-year",
        catalogYearLabel: "2026–2027",
        earnedCredits: 31,
        inProgressCredits: 6,
      },
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(progress.map((row) => row.level?.code)).toEqual(["S1", "S2"]);
    expect(progress[1]?.requiredCredits).toBe(300);
  });

  it("resolves inherited and custom standing policies from one approved snapshot", async () => {
    const findMany = vi.fn(async () => [
      {
        academicYearId: "assigned-year",
        yearLabel: "2026–2027",
        revision: 7,
        defaultLevels: levels,
        defaultStandingRules: [
          { code: "probation", label: "Probation", minimumGpa: 0, order: 0, tone: "warning" },
          { code: "clear", label: "Clear", minimumGpa: 2, order: 1, tone: "success" },
        ],
        notYetGradedStanding: {
          code: "not_yet_graded",
          label: "Awaiting first grade",
          tone: "neutral",
        },
        programConfigurations: [
          {
            ...program,
            standingMode: "custom",
            customStandingRules: [
              { code: "review", label: "Review", minimumGpa: 0, order: 0, tone: "warning" },
              { code: "clear", label: "Clear", minimumGpa: 2.25, order: 1, tone: "success" },
            ],
          },
        ],
        academicYear: { label: "2026–2027" },
      },
    ]);
    const service = new AcademicCatalogService({
      academicCatalogRevision: { findMany },
    } as never);

    const [policy] = await service.standingPoliciesMany([
      {
        programId: PROGRAM_ID,
        catalogYearId: "assigned-year",
        catalogYearLabel: "2026–2027",
      },
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(policy?.rules.map((rule) => rule.minimumGpa)).toEqual([0, 2.25]);
    expect(policy?.notYetGraded.label).toBe("Awaiting first grade");
    expect(policy?.catalog?.revision).toBe(7);
  });
});

describe("AcademicCatalogService draft and approval submission", () => {
  it("requires every current programme and snapshots canonical programme identity", async () => {
    const create = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "revision-2",
        academicYearId: "year-1",
        status: "draft",
        approvedById: null,
        approvalRequestId: null,
        approvedAt: null,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        ...data,
      }),
    );
    const prisma = {
      academicYear: { findUnique: vi.fn(async () => ({ id: "year-1" })) },
      program: {
        findMany: vi.fn(async () => [
          { id: PROGRAM_ID, code: "BSCS", name: "Computer Science" },
        ]),
      },
      academicCatalogRevision: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ revision: 1 }),
        create,
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const service = new AcademicCatalogService(prisma as never);

    await service.saveDraft("year-1", "registrar-1", {
      yearLabel: "2026–2027 corrected",
      startsOn: "2026-08-20",
      endsOn: "2027-06-30",
      defaultLevels: levels,
      programs: [
        {
          ...program,
          programCode: "FORGED",
          programName: "Forged programme name",
        },
      ],
      reason: "Correct the catalog label",
      activateYear: true,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        academicYearId: "year-1",
        revision: 2,
        status: "draft",
        programConfigurations: [
          expect.objectContaining({
            programId: PROGRAM_ID,
            programCode: "BSCS",
            programName: "Computer Science",
          }),
        ],
      }),
    });
  });

  it("turns a draft into a durable director approval request", async () => {
    const draft = {
      id: "revision-2",
      academicYearId: "year-1",
      revision: 2,
      status: "draft",
      yearLabel: "2026–2027",
      startsOn: new Date("2026-08-20T00:00:00.000Z"),
      endsOn: new Date("2027-06-30T00:00:00.000Z"),
      defaultLevels: levels,
      programConfigurations: [program],
      reason: "Update progression labels",
      activateYear: false,
    };
    const approvalCreate = vi.fn(async () => ({ id: "approval-1" }));
    const revisionUpdate = vi.fn(async () => ({}));
    const tx = {
      academicCatalogRevision: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(draft)
          .mockResolvedValueOnce(null),
        update: revisionUpdate,
      },
      approvalRequest: { create: approvalCreate },
      approvalEvent: { create: vi.fn(async () => ({})) },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AcademicCatalogService(prisma as never);

    await expect(
      service.submit("year-1", {
        personId: "registrar-1",
        roles: ["registrar"],
        email: "registrar@daust.edu",
        name: "Registrar",
      } as never),
    ).resolves.toEqual({
      requestId: "approval-1",
      revision: 2,
      status: "pending",
    });
    expect(approvalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "academic_catalog",
        targetId: "revision-2",
        baseRevision: 0,
        requestedById: "registrar-1",
      }),
    });
    expect(revisionUpdate).toHaveBeenCalledWith({
      where: { id: "revision-2" },
      data: { status: "pending", approvalRequestId: "approval-1" },
    });
  });
});

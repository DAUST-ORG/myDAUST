import { describe, expect, it, vi } from "vitest";
import {
  academicCatalogApprovalPayloadMatches,
  FinanceApprovalsService,
} from "./finance-approvals.service.js";

const pendingRevision = {
  id: "revision-2",
  academicYearId: "year-1",
  revision: 2,
  yearLabel: "2029-2030",
  startsOn: new Date("2029-08-01T00:00:00.000Z"),
  endsOn: new Date("2030-06-30T00:00:00.000Z"),
  defaultLevels: [{ code: "S1", name: "Semester 1", creditCeiling: 30 }],
  defaultStandingRules: [
    {
      code: "good_standing",
      label: "Good Standing",
      minimumGpa: 0,
      order: 0,
      tone: "success",
    },
  ],
  notYetGradedStanding: {
    code: "not_yet_graded",
    label: "Not yet graded",
    tone: "neutral",
  },
  programConfigurations: [
    {
      programId: "22222222-2222-4222-8222-222222222222",
      programCode: "BSCS",
      programName: "Computer Science",
      progressionMode: "default",
      customLevels: [],
      requirements: [{ category: "Degree", requiredCredits: 3 }],
      curriculum: [
        {
          courseId: "33333333-3333-4333-8333-333333333333",
          courseCode: "CSC 101",
          yearIndex: 1,
          semester: "Fall",
          position: 0,
        },
      ],
      standingMode: "default",
      customStandingRules: [],
    },
  ],
  reason: "Publish plan",
  activateYear: false,
};

function pendingSnapshot() {
  return {
    id: pendingRevision.id,
    academicYearId: pendingRevision.academicYearId,
    revision: pendingRevision.revision,
    yearLabel: pendingRevision.yearLabel,
    startsOn: "2029-08-01",
    endsOn: "2030-06-30",
    defaultLevels: pendingRevision.defaultLevels,
    defaultStandingRules: pendingRevision.defaultStandingRules,
    notYetGradedStanding: pendingRevision.notYetGradedStanding,
    programs: pendingRevision.programConfigurations,
    reason: pendingRevision.reason,
    activateYear: pendingRevision.activateYear,
  };
}

describe("academic catalog approval locking", () => {
  it("locks the academic year before checking whether an approval is stale", async () => {
    const order: string[] = [];
    const request = {
      id: "approval-1",
      kind: "academic_catalog",
      status: "pending",
      targetId: "revision-2",
      baseRevision: 1,
      requestedById: "registrar-1",
      afterJson: pendingSnapshot(),
    };
    const tx = {
      approvalRequest: {
        findUnique: vi.fn(async () => request),
        update: vi.fn(async () => ({ status: "stale" })),
      },
      academicCatalogRevision: {
        findUnique: vi
          .fn()
          .mockImplementationOnce(async () => {
            order.push("resolve-year");
            return { academicYearId: "year-1" };
          })
          .mockImplementationOnce(async () => {
            order.push("stale-revision");
            return { ...pendingRevision, status: "pending" };
          }),
        findFirst: vi.fn(async () => {
          order.push("approved-read");
          return { revision: 2 };
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      $queryRaw: vi.fn(async () => {
        order.push("lock-year");
        return [{ id: "year-1" }];
      }),
      approvalEvent: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      approvalRequest: tx.approvalRequest,
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const operatingBudget = { markDecision: vi.fn(async () => undefined) };
    const service = new FinanceApprovalsService(
      prisma as never,
      operatingBudget as never,
    );

    await expect(
      service.approve("approval-1", {
        personId: "director-1",
        roles: ["admin"],
      } as never),
    ).resolves.toMatchObject({ status: "stale" });
    expect(order).toEqual([
      "resolve-year",
      "lock-year",
      "stale-revision",
      "approved-read",
    ]);
  });

  it("detects any mutation of the director-reviewed pending payload", () => {
    expect(
      academicCatalogApprovalPayloadMatches(pendingSnapshot(), pendingRevision),
    ).toBe(true);
    expect(
      academicCatalogApprovalPayloadMatches(
        { ...pendingSnapshot(), reason: "Changed after submit" },
        pendingRevision,
      ),
    ).toBe(false);
  });

  it("takes stable course share locks before canonical approval validation", async () => {
    const order: string[] = [];
    const tx = {
      academicCatalogRevision: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ academicYearId: "year-1" })
          .mockResolvedValueOnce({ ...pendingRevision, status: "pending" }),
      },
      $queryRaw: vi.fn(
        async (strings: TemplateStringsArray, ..._values: unknown[]) => {
          const sql = strings.join(" ");
          if (sql.includes('FROM "AcademicYear"')) {
            order.push("lock-year");
            return [{ id: "year-1" }];
          }
          order.push("lock-course");
          return [{ id: "33333333-3333-4333-8333-333333333333" }];
        },
      ),
      program: {
        findMany: vi.fn(async () => {
          order.push("validate-programs");
          return [];
        }),
      },
      course: {
        findMany: vi.fn(async () => {
          order.push("validate-courses");
          return [
            {
              id: "33333333-3333-4333-8333-333333333333",
              code: "CSC 101",
              credits: 3,
            },
          ];
        }),
      },
    };
    const service = new FinanceApprovalsService({} as never);
    const applyAcademicCatalog = (
      service as unknown as {
        applyAcademicCatalog: (
          client: typeof tx,
          request: unknown,
          actorId: string,
        ) => Promise<unknown>;
      }
    ).applyAcademicCatalog.bind(service);

    await expect(
      applyAcademicCatalog(
        tx,
        { targetId: "revision-2", afterJson: pendingSnapshot() },
        "director-1",
      ),
    ).rejects.toThrow(/include every current programme/i);
    expect(order).toEqual([
      "lock-year",
      "lock-course",
      "validate-programs",
      "validate-courses",
    ]);
  });

  it("re-reads the revision after taking the academic-year row lock", async () => {
    const order: string[] = [];
    const tx = {
      academicCatalogRevision: {
        findUnique: vi
          .fn()
          .mockImplementationOnce(async () => {
            order.push("resolve-year");
            return { academicYearId: "year-1" };
          })
          .mockImplementationOnce(async () => {
            order.push("recheck-revision");
            return { academicYearId: "year-1", status: "approved" };
          }),
      },
      $queryRaw: vi.fn(async () => {
        order.push("lock-year");
        return [{ id: "year-1" }];
      }),
    };
    const service = new FinanceApprovalsService({} as never);
    const applyAcademicCatalog = (
      service as unknown as {
        applyAcademicCatalog: (
          client: typeof tx,
          request: unknown,
          actorId: string,
        ) => Promise<unknown>;
      }
    ).applyAcademicCatalog.bind(service);

    await expect(
      applyAcademicCatalog(tx, { targetId: "revision-2" }, "director-1"),
    ).rejects.toThrow(/no longer awaiting approval/i);
    expect(order).toEqual(["resolve-year", "lock-year", "recheck-revision"]);
  });
});

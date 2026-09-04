import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@mydaust/db";
import {
  type EnrollmentGateFailure,
  type EnrollmentOverrideApproveInput,
} from "@mydaust/shared";
import { EnrollmentOverrideService } from "./enrollment-approvals.service.js";
import {
  evaluateEnrollmentGates,
  unwavedFailures,
} from "./enrollment-gates.js";

type TxLike = Prisma.TransactionClient;
type FnMock = ReturnType<typeof vi.fn>;

describe("unwavedFailures", () => {
  const failures: EnrollmentGateFailure[] = [
    { gate: "capacity", taken: 30, capacity: 30 },
    { gate: "prerequisite", courses: [{ code: "CSC 101", minGrade: "C" }] },
  ];

  it("drops every failure inside the waiver set", () => {
    expect(unwavedFailures(failures, ["capacity", "prerequisite"])).toEqual([]);
  });

  it("keeps failures outside the waiver set", () => {
    expect(unwavedFailures(failures, ["capacity"])).toEqual([
      {
        gate: "prerequisite",
        courses: [{ code: "CSC 101", minGrade: "C" }],
      },
    ]);
  });

  it("ignores waivers that don't match any actual failure", () => {
    expect(unwavedFailures(failures, ["holds", "credit_cap"])).toEqual(
      failures,
    );
  });
});

interface ApprovalRow {
  id: string;
  kind: "student_enrollment_override";
  status: "pending" | "approved" | "rejected" | "cancelled" | "stale";
  targetType: string;
  targetId: string;
  afterJson: Prisma.JsonValue;
  requestedById: string;
  baseRevision: number;
}

function makeSectionRow() {
  return {
    id: "section-1",
    status: "open" as const,
    capacity: 30,
    courseId: "course-1",
    termId: "term-1",
    days: "MWF",
    startTime: "09:00",
    endTime: "09:50",
  };
}

function makeApprovalTransaction(opts: {
  request: ApprovalRow | null;
  freshFailures: EnrollmentGateFailure[];
  freshHolds?: { type: string }[];
  termEnrollments?: Record<string, unknown>[];
}) {
  const section = makeSectionRow();
  const tx: Record<string, unknown> = {
    $queryRaw: vi.fn(async () => [
      {
        id: section.id,
        capacity: section.capacity,
        courseId: section.courseId,
        termId: section.termId,
      },
    ]),
    term: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: section.termId,
        endDate: new Date(Date.now() + 60_000),
        addDeadline: null,
      })),
    },
    section: {
      findUniqueOrThrow: vi.fn(async () => section),
      update: vi.fn(async () => ({})),
    },
    enrollment: {
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => {
        const cap = opts.freshFailures.find((f) => f.gate === "capacity") as
          { taken: number } | undefined;
        return cap ? cap.taken : 0;
      }),
      findMany: vi.fn(async () => opts.termEnrollments ?? []),
      create: vi.fn(async () => ({ id: "new-enrollment", status: "enrolled" })),
      update: vi.fn(async () => ({ id: "new-enrollment", status: "enrolled" })),
    },
    studentHold: { findMany: vi.fn(async () => opts.freshHolds ?? []) },
    course: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "course-1",
        code: "CSC 101",
        credits: 3,
        prereqRules: [],
        coreqRules: [],
        rule: null,
      })),
    },
    transcriptEntry: { findMany: vi.fn(async () => []) },
    student: {
      findUnique: vi.fn(async () => ({
        id: "student-1",
        recordStatus: "active",
      })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "student-1",
        recordStatus: "active",
        yearLevel: 2,
        major: null,
        program: null,
      })),
    },
    approvalRequest: {
      findUnique: vi.fn(async () => opts.request),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "approval-new", status: "pending" })),
      update: vi.fn(async () => ({
        ...(opts.request ?? { id: "x" }),
        status: "approved",
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    approvalEvent: { create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return tx as unknown as TxLike;
}

describe("EnrollmentOverrideService.approve", () => {
  const adminPersonId = "admin-person-1";
  const studentPersonId = "student-person-1";
  const adminUser = {
    personId: adminPersonId,
    studentId: null,
    roles: ["admin"],
  };
  const studentUser = {
    personId: studentPersonId,
    studentId: "student-1",
    roles: ["student"],
  };
  const baseRequestInput: EnrollmentOverrideApproveInput = {
    waivedGates: ["capacity"],
    note: "Approved per registrar policy",
  };

  let requestRow: ApprovalRow;

  beforeEach(() => {
    requestRow = {
      id: "approval-1",
      kind: "student_enrollment_override",
      status: "pending",
      targetType: "Section",
      targetId: "section-1",
      afterJson: {
        studentId: "student-1",
        sectionId: "section-1",
        requestedWaivers: ["capacity"],
        failures: [{ gate: "capacity", taken: 30, capacity: 30 }],
      },
      requestedById: studentPersonId,
      baseRevision: 0,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildServiceWithPending(
    opts: {
      freshFailures?: EnrollmentGateFailure[];
      freshHolds?: { type: string }[];
      termEnrollments?: Record<string, unknown>[];
      notFound?: boolean;
    } = {},
  ) {
    const prisma = {
      $transaction: vi.fn(),
    };
    const tx = makeApprovalTransaction({
      request: opts.notFound ? null : requestRow,
      freshFailures: opts.freshFailures ?? [],
      freshHolds: opts.freshHolds,
      termEnrollments: opts.termEnrollments,
    });
    prisma.$transaction.mockImplementation(
      async (work: (tx: TxLike) => Promise<unknown>) => work(tx),
    );
    const notifications = { emit: vi.fn(async () => ({ created: 0 })) };
    const service = new EnrollmentOverrideService(
      prisma as never,
      notifications as never,
    );
    return { service, prisma, tx };
  }

  it("rejects a non-admin caller", async () => {
    const { service } = buildServiceWithPending();
    await expect(
      service.approve("approval-1", studentUser as never, baseRequestInput),
    ).rejects.toThrow(/administrator/);
  });

  it("rejects when no gates are waived", async () => {
    const { service } = buildServiceWithPending();
    await expect(
      service.approve("approval-1", adminUser as never, { waivedGates: [] }),
    ).rejects.toThrow(/at least one gate/);
  });

  it("rejects when the registrar ticks a gate that isn't actually failing", async () => {
    const { service } = buildServiceWithPending();
    await expect(
      service.approve("approval-1", adminUser as never, {
        waivedGates: ["prerequisite"],
      }),
    ).rejects.toThrow(/did not block/);
  });

  it("rejects when the request is missing", async () => {
    const { service } = buildServiceWithPending({ notFound: true });
    await expect(
      service.approve("approval-missing", adminUser as never, baseRequestInput),
    ).rejects.toThrow(/not found/i);
  });

  it("hard-rejects a different section of a course already held that term", async () => {
    const { tx } = buildServiceWithPending({
      termEnrollments: [
        {
          section: {
            id: "other-section",
            courseId: "course-1",
            course: { id: "course-1", code: "CSC 101", credits: 3 },
          },
        },
      ],
    });

    await expect(
      evaluateEnrollmentGates(tx, "student-1", "section-1"),
    ).rejects.toThrow(/Already enrolled in CSC 101/);
  });

  it("bumps section capacity by 1 when capacity is waived and creates the enrollment", async () => {
    const { service, tx } = buildServiceWithPending({
      freshFailures: [{ gate: "capacity", taken: 30, capacity: 30 }],
    });
    const result = await service.approve(
      "approval-1",
      adminUser as never,
      baseRequestInput,
    );
    expect(result).toMatchObject({ id: "approval-1", status: "approved" });
    const txSection = tx as unknown as { section: { update: FnMock } };
    expect(txSection.section.update).toHaveBeenCalledWith({
      where: { id: "section-1" },
      data: { capacity: { increment: 1 } },
    });
  });

  it("still approves when the same gate reports different live counts", async () => {
    // A queued override must not be invalidated because a sibling override on
    // the same section was approved first: that bumps taken/capacity, so the
    // seat blocker reads {31,31} instead of the {30,30} captured at submission.
    // Same blocker, new numbers. Comparing raw payloads staled every other
    // student in the queue and forced them to resubmit one at a time.
    const { service, tx } = buildServiceWithPending({
      freshFailures: [{ gate: "capacity", taken: 31, capacity: 31 }],
    });
    const result = await service.approve(
      "approval-1",
      adminUser as never,
      baseRequestInput,
    );
    expect(result).toMatchObject({ id: "approval-1", status: "approved" });
    const txSection = tx as unknown as { section: { update: FnMock } };
    expect(txSection.section.update).toHaveBeenCalledWith({
      where: { id: "section-1" },
      data: { capacity: { increment: 1 } },
    });
  });

  it("still marks stale when a real blocker is added alongside the waived one", async () => {
    // The identity comparison must keep catching a genuine change of blocker.
    const { service, tx } = buildServiceWithPending({
      freshFailures: [
        { gate: "capacity", taken: 30, capacity: 30 },
        { gate: "holds", kinds: ["financial"] },
      ],
      freshHolds: [{ type: "financial" }],
    });
    await expect(
      service.approve("approval-1", adminUser as never, baseRequestInput),
    ).resolves.toMatchObject({ status: "stale" });
    const txSection = tx as unknown as { section: { update: FnMock } };
    expect(txSection.section.update).not.toHaveBeenCalled();
  });

  it("marks the request stale when a new gate blocks enrollment", async () => {
    const { service, tx } = buildServiceWithPending({
      freshFailures: [{ gate: "holds", kinds: ["financial"] }],
      freshHolds: [{ type: "financial" }],
    });
    await expect(
      service.approve("approval-1", adminUser as never, baseRequestInput),
    ).resolves.toMatchObject({ status: "stale" });
    const txSection = tx as unknown as { section: { update: FnMock } };
    expect(txSection.section.update).not.toHaveBeenCalled();
  });

  it("marks a capacity waiver stale without increasing capacity when a seat opens", async () => {
    const { service, tx } = buildServiceWithPending({ freshFailures: [] });
    await expect(
      service.approve("approval-1", adminUser as never, baseRequestInput),
    ).resolves.toMatchObject({ status: "stale" });
    const transaction = tx as unknown as {
      section: { update: FnMock };
      enrollment: { create: FnMock };
      approvalRequest: { updateMany: FnMock };
    };
    expect(transaction.section.update).not.toHaveBeenCalled();
    expect(transaction.enrollment.create).not.toHaveBeenCalled();
    expect(transaction.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "stale" }),
      }),
    );
  });

  it("marks the request stale when a hard enrollment state change now throws", async () => {
    const { service, tx } = buildServiceWithPending({
      termEnrollments: [
        {
          section: {
            id: "other-section",
            courseId: "course-1",
            course: { id: "course-1", code: "CSC 101", credits: 3 },
          },
        },
      ],
    });
    await expect(
      service.approve("approval-1", adminUser as never, baseRequestInput),
    ).resolves.toMatchObject({
      status: "stale",
      reason: expect.stringContaining("enrollment state changed"),
    });
    const transaction = tx as unknown as {
      section: { update: FnMock };
      enrollment: { create: FnMock };
    };
    expect(transaction.section.update).not.toHaveBeenCalled();
    expect(transaction.enrollment.create).not.toHaveBeenCalled();
  });

  it("marks the request stale when the section was deleted", async () => {
    const { service, tx } = buildServiceWithPending();
    (tx.$queryRaw as unknown as FnMock).mockResolvedValue([]);
    await expect(
      service.approve("approval-1", adminUser as never, baseRequestInput),
    ).resolves.toMatchObject({
      status: "stale",
      reason: expect.stringContaining("section no longer exists"),
    });
    const transaction = tx as unknown as {
      section: { update: FnMock };
      enrollment: { create: FnMock };
    };
    expect(transaction.section.update).not.toHaveBeenCalled();
    expect(transaction.enrollment.create).not.toHaveBeenCalled();
  });

  it("does NOT bump capacity when only prerequisite is waived", async () => {
    requestRow.afterJson = {
      studentId: "student-1",
      sectionId: "section-1",
      requestedWaivers: ["holds"],
      failures: [{ gate: "holds", kinds: ["financial"] }],
    };
    const { service, tx } = buildServiceWithPending({
      freshFailures: [{ gate: "holds", kinds: ["financial"] }],
      freshHolds: [{ type: "financial" }],
    });
    await service.approve("approval-1", adminUser as never, {
      waivedGates: ["holds"],
    });
    const txSection = tx as unknown as { section: { update: FnMock } };
    expect(txSection.section.update).not.toHaveBeenCalled();
    const txAr = tx as unknown as {
      approvalRequest: { update: FnMock; updateMany: FnMock };
    };
    expect(txAr.approvalRequest.updateMany).toHaveBeenCalled();
  });
});

describe("EnrollmentOverrideService.request", () => {
  it("rejects a no-op request when enrollment has no current blockers", async () => {
    const tx = makeApprovalTransaction({ request: null, freshFailures: [] });
    const prisma = {
      $transaction: vi.fn(async (work: (client: TxLike) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const service = new EnrollmentOverrideService(
      prisma as never,
      { emit: vi.fn() } as never,
    );
    await expect(
      service.request(
        {
          personId: "student-person-1",
          studentId: "student-1",
          roles: ["student"],
        } as never,
        {
          sectionId: "section-1",
          reason: "Please review",
          requestedWaivers: ["capacity"],
        },
      ),
    ).rejects.toThrow(/no current rule blockers/i);
    const approvalRequest = tx.approvalRequest as unknown as {
      create: FnMock;
    };
    expect(approvalRequest.create).not.toHaveBeenCalled();
  });
});

describe("EnrollmentOverrideService.reject", () => {
  it("requires admin role", () => {
    const prisma = { approvalRequest: { findUnique: vi.fn() } };
    const notifications = { emit: vi.fn() };
    const service = new EnrollmentOverrideService(
      prisma as never,
      notifications as never,
    );
    return expect(
      service.reject(
        "approval-1",
        { personId: "p-1", studentId: "s-1", roles: ["student"] } as never,
        "no",
      ),
    ).rejects.toThrow(/administrator/);
  });

  it("requires a non-empty rejection reason", () => {
    const prisma = { approvalRequest: { findUnique: vi.fn() } };
    const notifications = { emit: vi.fn() };
    const service = new EnrollmentOverrideService(
      prisma as never,
      notifications as never,
    );
    return expect(
      service.reject(
        "approval-1",
        { personId: "p-1", studentId: null, roles: ["admin"] } as never,
        "   ",
      ),
    ).rejects.toThrow(/rejection reason/);
  });
});

describe("EnrollmentOverrideService.cancel", () => {
  it("rejects a caller who is not the requester and not admin", async () => {
    const request = { id: "approval-1", requestedById: "other-person" };
    const prisma = {
      approvalRequest: { findUnique: vi.fn(async () => request) },
    };
    const notifications = { emit: vi.fn() };
    const service = new EnrollmentOverrideService(
      prisma as never,
      notifications as never,
    );
    await expect(
      service.cancel("approval-1", {
        personId: "p-1",
        studentId: "s-1",
        roles: ["student"],
      } as never),
    ).rejects.toThrow(/own request/);
  });

  it("lets the original requester cancel", async () => {
    const innerTx: Record<string, unknown> = {
      approvalRequest: {
        findUnique: vi.fn(async () => ({
          id: "approval-1",
          kind: "student_enrollment_override",
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      approvalEvent: { create: vi.fn(async () => ({})) },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (tx: TxLike) => Promise<unknown>) =>
        work(innerTx as unknown as TxLike),
      ),
      approvalRequest: {
        findUnique: vi.fn(async () => ({
          id: "approval-1",
          requestedById: "p-1",
        })),
      },
    };
    const notifications = { emit: vi.fn() };
    const service = new EnrollmentOverrideService(
      prisma as never,
      notifications as never,
    );
    const result = await service.cancel(
      "approval-1",
      { personId: "p-1", studentId: "s-1", roles: ["student"] } as never,
      "withdrew",
    );
    expect(result).toEqual({ id: "approval-1", status: "cancelled" });
  });
});

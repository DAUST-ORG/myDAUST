import { beforeEach, describe, expect, it, vi } from "vitest";
import { gradedWorkBlockingDrop } from "./enrollment-drop-guard.js";

const evaluateEnrollmentGates = vi.hoisted(() => vi.fn());
vi.mock("./enrollment-gates.js", () => ({ evaluateEnrollmentGates }));

const { RegistrarEnrollmentService, describeGateFailure } =
  await import("./registrar-enrollment.service.js");

const clean = {
  grade: null,
  transcriptEntry: null,
  _count: { submissions: 0 },
};

describe("gradedWorkBlockingDrop", () => {
  it("allows a drop when nothing has been graded", () => {
    expect(gradedWorkBlockingDrop(clean)).toBeNull();
  });

  it("refuses once a grade is recorded", () => {
    expect(gradedWorkBlockingDrop({ ...clean, grade: "B+" })).toContain("B+");
  });

  it("refuses once the course is on the transcript", () => {
    expect(
      gradedWorkBlockingDrop({ ...clean, transcriptEntry: { id: "t1" } }),
    ).toContain("transcript");
  });

  it("refuses while graded submissions exist, and counts them", () => {
    expect(
      gradedWorkBlockingDrop({ ...clean, _count: { submissions: 1 } }),
    ).toContain("1 graded submission ");
    expect(
      gradedWorkBlockingDrop({ ...clean, _count: { submissions: 3 } }),
    ).toContain("3 graded submissions");
  });
});

describe("RegistrarEnrollmentService.enrollStudent", () => {
  const enrollment = { id: "enr-1", status: "enrolled" };
  let tx: Record<string, any>;
  let service: InstanceType<typeof RegistrarEnrollmentService>;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = {
      enrollment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(enrollment),
        update: vi.fn().mockResolvedValue(enrollment),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: (work: (t: unknown) => unknown) => work(tx),
    };
    service = new RegistrarEnrollmentService(prisma as never);
  });

  it("waives the academic gates and records which ones", async () => {
    evaluateEnrollmentGates.mockResolvedValue([
      { gate: "prerequisite", courses: [{ code: "CSC 101", minGrade: "C" }] },
      { gate: "credit_cap", currentCredits: 28, afterAdd: 34, ceiling: 30 },
      { gate: "add_deadline", closedOn: "2026-09-15" },
    ]);

    const result = await service.enrollStudent(
      "sec-1",
      "stu-1",
      "actor-1",
      "Dean approved",
    );

    expect(result).toMatchObject({ enrollmentId: "enr-1", status: "enrolled" });
    expect(result.waivedGates).toEqual([
      "prerequisite",
      "credit_cap",
      "add_deadline",
    ]);
    expect(tx.enrollment.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "admin-enrolled",
          actorId: "actor-1",
          data: expect.objectContaining({
            reason: "Dean approved",
            waivedGates: ["prerequisite", "credit_cap", "add_deadline"],
          }),
        }),
      }),
    );
  });

  it.each([
    [
      "a full section",
      { gate: "capacity", taken: 30, capacity: 30 },
      "the section is full",
    ],
    ["an active hold", { gate: "holds", kinds: ["financial"] }, "active hold"],
    [
      "an inactive student record",
      { gate: "record_status", status: "archived" },
      "not active",
    ],
  ])("refuses on %s and writes nothing", async (_label, failure, expected) => {
    evaluateEnrollmentGates.mockResolvedValue([failure]);

    await expect(
      service.enrollStudent("sec-1", "stu-1", "actor-1", "why"),
    ).rejects.toThrow(expected);
    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("reports every blocking gate at once, not just the first", async () => {
    evaluateEnrollmentGates.mockResolvedValue([
      { gate: "capacity", taken: 30, capacity: 30 },
      { gate: "holds", kinds: ["financial"] },
      { gate: "prerequisite", courses: [{ code: "CSC 101", minGrade: null }] },
    ]);

    await expect(
      service.enrollStudent("sec-1", "stu-1", "actor-1", "why"),
    ).rejects.toThrow(/section is full.*active hold/s);
  });

  it("revives a dropped enrollment instead of creating a duplicate", async () => {
    evaluateEnrollmentGates.mockResolvedValue([]);
    tx.enrollment.findUnique.mockResolvedValue({
      id: "enr-old",
      status: "dropped",
    });

    await service.enrollStudent("sec-1", "stu-1", "actor-1", "Re-added");

    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "enr-old" },
        data: expect.objectContaining({ status: "enrolled" }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({ revivedFromDropped: true }),
        }),
      }),
    );
  });
});

describe("describeGateFailure", () => {
  it("names the specific blocker rather than a generic failure", () => {
    expect(
      describeGateFailure({ gate: "capacity", taken: 30, capacity: 30 }),
    ).toBe("the section is full (30 of 30 seats)");
    expect(
      describeGateFailure({
        gate: "prerequisite",
        courses: [
          { code: "CSC 101", minGrade: "C" },
          { code: "MTH 210", minGrade: null },
        ],
      }),
    ).toBe("missing prerequisite CSC 101, MTH 210");
  });
});

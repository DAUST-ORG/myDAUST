import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("AcademicsService.createAssignment", () => {
  it("creates assigned grade rows for every active roster member in the same transaction", async () => {
    const assignment = { id: "assignment-1", sectionId: "section-1" };
    const tx = {
      assignment: { create: vi.fn().mockResolvedValue(assignment) },
      enrollment: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "enrollment-1" }, { id: "enrollment-2" }]),
      },
      submission: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AcademicsService(prisma as never);
    vi.spyOn(
      service as unknown as { assertSectionOwner: () => Promise<void> },
      "assertSectionOwner",
    ).mockResolvedValue();

    await service.createAssignment(
      "section-1",
      {
        title: "Quiz 1",
        type: "quiz",
        maxPoints: 20,
        weight: 10,
        dueDate: "2026-09-10",
      },
      "faculty-1",
      false,
    );

    expect(tx.submission.createMany).toHaveBeenCalledWith({
      data: [
        {
          assignmentId: "assignment-1",
          enrollmentId: "enrollment-1",
          status: "assigned",
        },
        {
          assignmentId: "assignment-1",
          enrollmentId: "enrollment-2",
          status: "assigned",
        },
      ],
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });
});

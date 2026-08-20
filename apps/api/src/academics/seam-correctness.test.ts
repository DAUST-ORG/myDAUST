import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

/**
 * The student<->faculty seam: reads that must not leak a working value, and writes
 * that must not destroy one. Each case here corresponds to a defect that shipped.
 */

function ownedService(prisma: unknown) {
  const service = new AcademicsService(prisma as never);
  vi.spyOn(
    service as unknown as { assertSectionOwner: () => Promise<void> },
    "assertSectionOwner",
  ).mockResolvedValue();
  return service;
}

describe("AcademicsService.courseDetail", () => {
  function sectionFixture(status: string, grade: string | null) {
    return {
      id: "enrollment-1",
      status,
      grade,
      submissions: [],
      section: {
        days: "MW",
        startTime: "08:00",
        endTime: "09:30",
        room: "A1",
        assignments: [],
        term: { name: "Fall 2026" },
        instructor: { firstName: "Ada", lastName: "Ba" },
        course: {
          code: "CSC 301",
          title: "Algorithms",
          credits: 3,
          description: "Sorting and complexity.",
          prerequisites: [],
        },
      },
    };
  }

  it("withholds a faculty draft grade until the registrar has approved it", async () => {
    const prisma = {
      enrollment: {
        findUnique: vi.fn().mockResolvedValue(sectionFixture("enrolled", "F")),
      },
    };
    const detail = await ownedService(prisma).courseDetail("student-1", "section-1");
    expect(detail.overview.grade).toBeNull();
  });

  it("returns the grade once approval has completed the enrollment", async () => {
    const prisma = {
      enrollment: {
        findUnique: vi.fn().mockResolvedValue(sectionFixture("completed", "B+")),
      },
    };
    const detail = await ownedService(prisma).courseDetail("student-1", "section-1");
    expect(detail.overview.grade).toBe("B+");
  });

  it("returns the course description the registrar maintains", async () => {
    const prisma = {
      enrollment: {
        findUnique: vi.fn().mockResolvedValue(sectionFixture("enrolled", null)),
      },
    };
    const detail = await ownedService(prisma).courseDetail("student-1", "section-1");
    expect(detail.overview.description).toBe("Sorting and complexity.");
  });
});

describe("AcademicsService.submitAssignment", () => {
  function prismaFor(input: Record<string, unknown>) {
    const upsert = vi.fn().mockResolvedValue({});
    return {
      upsert,
      prisma: {
        assignment: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: "assignment-1", sectionId: "section-1" }),
        },
        enrollment: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: "enrollment-1", status: "enrolled" }),
        },
        submission: { upsert },
      },
      input,
    };
  }

  it("leaves an existing attachment alone when the student edits only their text", async () => {
    const { prisma, upsert } = prismaFor({});
    const service = new AcademicsService(prisma as never);

    await service.submitAssignment("student-1", "assignment-1", {
      text: "Revised answer",
    });

    const update = upsert.mock.calls[0]![0].update;
    expect(update).not.toHaveProperty("fileUrl");
    expect(update).not.toHaveProperty("fileName");
    expect(update.text).toBe("Revised answer");
  });

  it("replaces the attachment when a new file is supplied", async () => {
    const { prisma, upsert } = prismaFor({});
    const service = new AcademicsService(prisma as never);

    await service.submitAssignment("student-1", "assignment-1", {
      fileUrl: "/api/uploads/new.pdf",
      fileName: "new.pdf",
    });

    const update = upsert.mock.calls[0]![0].update;
    expect(update.fileUrl).toBe("/api/uploads/new.pdf");
    expect(update.fileName).toBe("new.pdf");
  });

  it("records no attachment on a first text-only submission", async () => {
    const { prisma, upsert } = prismaFor({});
    const service = new AcademicsService(prisma as never);

    await service.submitAssignment("student-1", "assignment-1", {
      text: "First attempt",
    });

    expect(upsert.mock.calls[0]![0].create.fileUrl).toBeNull();
  });
});

describe("AcademicsService.markAttendance", () => {
  function prismaWithRoster(rosterIds: string[]) {
    return {
      enrollment: {
        findMany: vi.fn().mockResolvedValue(rosterIds.map((id) => ({ id }))),
      },
      attendanceRecord: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
  }

  it("rejects an enrollment id that belongs to another section", async () => {
    const prisma = prismaWithRoster(["enrollment-1"]);
    const service = ownedService(prisma);

    await expect(
      service.markAttendance(
        "section-1",
        {
          date: "2026-09-10",
          records: [{ enrollmentId: "enrollment-from-elsewhere", status: "absent" }],
        },
        "faculty-1",
        false,
      ),
    ).rejects.toThrow(/roster/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("writes the roll call and an audit row together when every id checks out", async () => {
    const prisma = prismaWithRoster(["enrollment-1", "enrollment-2"]);
    const service = ownedService(prisma);

    await service.markAttendance(
      "section-1",
      {
        date: "2026-09-10",
        records: [
          { enrollmentId: "enrollment-1", status: "present" },
          { enrollmentId: "enrollment-2", status: "late" },
        ],
      },
      "faculty-1",
      false,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    // Two upserts plus the audit row, in one transaction.
    expect(prisma.$transaction.mock.calls[0]![0]).toHaveLength(3);
  });
});

describe("AcademicsService.gradeSubmission", () => {
  function prismaFor(existing: { score: number | null; feedback: string | null }) {
    const update = vi.fn().mockResolvedValue({});
    return {
      update,
      prisma: {
        submission: {
          findUnique: vi.fn().mockResolvedValue({
            id: "sub-1",
            assignmentId: "assignment-1",
            ...existing,
            assignment: { maxPoints: 20 },
          }),
          update,
        },
        auditLog: { create: vi.fn() },
      },
    };
  }

  function service(prisma: unknown) {
    const s = new AcademicsService(prisma as never);
    vi.spyOn(
      s as unknown as { assertAssignmentOwner: () => Promise<void> },
      "assertAssignmentOwner",
    ).mockResolvedValue();
    return s;
  }

  it("keeps existing feedback when a score is corrected without resending it", async () => {
    const { prisma, update } = prismaFor({ score: 12, feedback: "Good structure." });

    await service(prisma).gradeSubmission("sub-1", { score: 15 }, "faculty-1", false);

    expect(update.mock.calls[0]![0].data).not.toHaveProperty("feedback");
  });

  it("writes feedback when the instructor supplies it", async () => {
    const { prisma, update } = prismaFor({ score: null, feedback: null });

    await service(prisma).gradeSubmission(
      "sub-1",
      { score: 15, feedback: "Check your carry logic." },
      "faculty-1",
      false,
    );

    expect(update.mock.calls[0]![0].data.feedback).toBe("Check your carry logic.");
  });

  it("returns the row to submitted when the score is cleared", async () => {
    const { prisma, update } = prismaFor({ score: 15, feedback: "Good." });

    await service(prisma).gradeSubmission("sub-1", { score: null }, "faculty-1", false);

    const data = update.mock.calls[0]![0].data;
    expect(data.score).toBeNull();
    expect(data.status).toBe("submitted");
    expect(data.gradedAt).toBeNull();
  });

  it("still rejects a score above the assignment maximum", async () => {
    const { prisma } = prismaFor({ score: null, feedback: null });

    await expect(
      service(prisma).gradeSubmission("sub-1", { score: 99 }, "faculty-1", false),
    ).rejects.toThrow(/exceeds max points/i);
  });
});

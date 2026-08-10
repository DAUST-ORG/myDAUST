import { describe, expect, it, vi } from "vitest";
import { RegistrarService } from "./registrar.service.js";

const items = [
  {
    id: "item-i",
    gradeSubmissionId: "submission-1",
    version: 1,
    enrollmentId: "enrollment-i",
    studentId: "student-i",
    courseId: "course-1",
    termId: "term-1",
    courseCode: "CS 4100",
    courseTitle: "Systems Seminar",
    termLabel: "Fall 2026",
    credits: 6,
    grade: "I",
    gradePoints: null,
    countsTowardGpa: false,
    countsTowardCredits: false,
  },
  {
    id: "item-p",
    gradeSubmissionId: "submission-1",
    version: 1,
    enrollmentId: "enrollment-p",
    studentId: "student-p",
    courseId: "course-1",
    termId: "term-1",
    courseCode: "CS 4100",
    courseTitle: "Systems Seminar",
    termLabel: "Fall 2026",
    credits: 6,
    grade: "P",
    gradePoints: null,
    countsTowardGpa: false,
    countsTowardCredits: true,
  },
  {
    id: "item-f",
    gradeSubmissionId: "submission-1",
    version: 1,
    enrollmentId: "enrollment-f",
    studentId: "student-f",
    courseId: "course-1",
    termId: "term-1",
    courseCode: "CS 4100",
    courseTitle: "Systems Seminar",
    termLabel: "Fall 2026",
    credits: 6,
    grade: "F",
    gradePoints: 0,
    countsTowardGpa: true,
    countsTowardCredits: false,
  },
];

const section = {
  id: "section-1",
  course: { requirementCategory: "Computer Science" },
  term: { startDate: new Date("2026-08-24T00:00:00.000Z") },
};

const enrollments = items.map((item) => ({
  id: item.enrollmentId,
  sectionId: "section-1",
  studentId: item.studentId,
  status: "enrolled",
}));

describe("RegistrarService.decideGradeSubmission", () => {
  it("publishes the reviewed snapshot once and treats repeated approval as idempotent", async () => {
    let status = "submitted";
    const publishedByEnrollment = new Map<
      string,
      { id: string; gradeSubmissionItemId: string }
    >();
    const tx = {
      gradeSubmission: {
        updateMany: vi.fn().mockImplementation(async () => {
          if (status !== "submitted") return { count: 0 };
          status = "approved";
          return { count: 1 };
        }),
        findUnique: vi.fn().mockImplementation(async () => ({
          id: "submission-1",
          sectionId: "section-1",
          version: 1,
          status,
          items,
          section,
        })),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => ({
          id: "submission-1",
          sectionId: "section-1",
          version: 1,
          status,
        })),
      },
      enrollment: {
        findMany: vi.fn().mockResolvedValue(enrollments),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      transcriptEntry: {
        findUnique: vi
          .fn()
          .mockImplementation(async ({ where }) =>
            publishedByEnrollment.get(where.enrollmentId),
          ),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const entry = {
            id: `transcript-${data.enrollmentId}`,
            gradeSubmissionItemId: data.gradeSubmissionItemId,
          };
          publishedByEnrollment.set(data.enrollmentId, entry);
          return entry;
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      gradeSubmission: {
        findUnique: vi.fn().mockImplementation(async () => ({
          id: "submission-1",
          sectionId: "section-1",
          version: 1,
          status,
        })),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new RegistrarService(
      prisma as never,
      { send: vi.fn() } as never,
    );

    await expect(
      service.decideGradeSubmission(
        "registrar-1",
        "submission-1",
        "approved",
        "Verified",
      ),
    ).resolves.toEqual(
      expect.objectContaining({ id: "submission-1", status: "approved" }),
    );
    await expect(
      service.decideGradeSubmission(
        "registrar-1",
        "submission-1",
        "approved",
        "Repeated request",
      ),
    ).resolves.toEqual(
      expect.objectContaining({ id: "submission-1", status: "approved" }),
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.enrollment.findMany).toHaveBeenCalledWith({
      where: { sectionId: "section-1", status: "enrolled" },
      select: { id: true },
    });
    expect(tx.transcriptEntry.create).toHaveBeenCalledTimes(3);
    expect(tx.transcriptEntry.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        enrollmentId: "enrollment-i",
        grade: "I",
        earnedCredits: 0,
        gradePoints: null,
        countsTowardGpa: false,
        countsTowardCredits: false,
      }),
    });
    expect(tx.transcriptEntry.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        enrollmentId: "enrollment-p",
        grade: "P",
        earnedCredits: 6,
        gradePoints: null,
        countsTowardGpa: false,
        countsTowardCredits: true,
      }),
    });
    expect(tx.transcriptEntry.create).toHaveBeenNthCalledWith(3, {
      data: expect.objectContaining({
        enrollmentId: "enrollment-f",
        grade: "F",
        earnedCredits: 0,
        gradePoints: 0,
        countsTowardGpa: true,
        countsTowardCredits: false,
      }),
    });
    expect(tx.enrollment.updateMany).toHaveBeenCalledTimes(3);
    for (const [args] of tx.enrollment.updateMany.mock.calls) {
      expect(args.data).toEqual({
        grade: expect.any(String),
        status: "completed",
      });
      expect(args.where).toEqual({
        id: expect.any(String),
        sectionId: "section-1",
        status: "enrolled",
      });
    }
    expect(tx.enrollment.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "grades-approved",
        actorId: "registrar-1",
      }),
    });
  });

  it.each([
    [
      "added",
      [
        ...enrollments,
        {
          id: "enrollment-added",
          sectionId: "section-1",
          studentId: "student-added",
          status: "enrolled",
        },
      ],
    ],
    ["removed or dropped", enrollments.slice(0, -1)],
  ])(
    "rejects approval when an enrollment was %s after submission",
    async (_change, activeRoster) => {
      const tx = {
        gradeSubmission: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            id: "submission-1",
            sectionId: "section-1",
            version: 1,
            status: "approved",
            items,
            section,
          }),
          findUniqueOrThrow: vi.fn(),
        },
        enrollment: {
          findMany: vi.fn().mockResolvedValue(activeRoster),
          updateMany: vi.fn(),
        },
        transcriptEntry: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
        auditLog: { create: vi.fn() },
      };
      const prisma = {
        gradeSubmission: {
          findUnique: vi.fn().mockResolvedValue({
            id: "submission-1",
            sectionId: "section-1",
            version: 1,
            status: "submitted",
          }),
        },
        $transaction: vi.fn(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
      };
      const service = new RegistrarService(
        prisma as never,
        { send: vi.fn() } as never,
      );

      await expect(
        service.decideGradeSubmission(
          "registrar-1",
          "submission-1",
          "approved",
        ),
      ).rejects.toThrow(
        "The section roster changed after submission; return it for correction",
      );

      expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
      expect(tx.transcriptEntry.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it("returns a drifted snapshot for correction without creating transcript entries", async () => {
    const tx = {
      gradeSubmission: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: "submission-1",
          sectionId: "section-1",
          version: 1,
          status: "returned",
          items,
          section,
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "submission-1",
          sectionId: "section-1",
          version: 1,
          status: "returned",
        }),
      },
      enrollment: {
        findMany: vi.fn().mockResolvedValue(enrollments),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
      },
      transcriptEntry: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      gradeSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "submission-1",
          sectionId: "section-1",
          version: 1,
          status: "submitted",
        }),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new RegistrarService(
      prisma as never,
      { send: vi.fn() } as never,
    );

    await expect(
      service.decideGradeSubmission(
        "registrar-1",
        "submission-1",
        "returned",
        "Correct student P grade",
      ),
    ).resolves.toEqual(
      expect.objectContaining({ id: "submission-1", status: "returned" }),
    );

    expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: items.map((item) => item.enrollmentId) },
        status: "completed",
      },
      data: { status: "enrolled" },
    });
    expect(tx.enrollment.update).not.toHaveBeenCalled();
    expect(tx.enrollment.findMany).not.toHaveBeenCalled();
    expect(tx.transcriptEntry.findUnique).not.toHaveBeenCalled();
    expect(tx.transcriptEntry.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "grades-returned",
        actorId: "registrar-1",
      }),
    });
  });
});

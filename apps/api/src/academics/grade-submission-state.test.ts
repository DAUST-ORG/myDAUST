import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

const section = {
  id: "section-1",
  courseId: "course-1",
  termId: "term-1",
  course: {
    id: "course-1",
    code: "CS 4100",
    title: "Systems Seminar",
    credits: 6,
  },
  term: { id: "term-1", name: "Fall 2026" },
  gradingScheme: {
    id: "scheme-1",
    name: "Standard Letter Scale · 4.00",
    rows: [
      {
        grade: "I",
        points: null,
        countsTowardGpa: false,
        countsTowardCredits: false,
      },
      {
        grade: "P",
        points: null,
        countsTowardGpa: false,
        countsTowardCredits: true,
      },
      {
        grade: "F",
        points: 0,
        countsTowardGpa: true,
        countsTowardCredits: false,
      },
    ],
  },
};

const roster = [
  { id: "enrollment-i", studentId: "student-i", status: "enrolled" },
  { id: "enrollment-p", studentId: "student-p", status: "enrolled" },
  { id: "enrollment-f", studentId: "student-f", status: "enrolled" },
];

function mockOwnership(service: AcademicsService) {
  vi.spyOn(
    service as unknown as { assertSectionOwner: () => Promise<void> },
    "assertSectionOwner",
  ).mockResolvedValue();
}

describe("AcademicsService.submitGrades state machine", () => {
  it("finalizes an immutable I/P/F snapshot without publishing or completing enrollments", async () => {
    const tx = {
      section: { findUnique: vi.fn().mockResolvedValue(section) },
      enrollment: {
        findMany: vi.fn().mockResolvedValue(roster),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      gradeSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "grade-submission-1",
          status: "returned",
          version: 1,
        }),
        upsert: vi.fn().mockResolvedValue({ id: "grade-submission-1" }),
      },
      gradeSubmissionItem: {
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      transcriptEntry: { create: vi.fn() },
      gradingScheme: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AcademicsService(prisma as never);
    mockOwnership(service);

    await expect(
      service.submitGrades(
        "section-1",
        {
          grades: [
            { enrollmentId: "enrollment-i", grade: " i " },
            { enrollmentId: "enrollment-p", grade: "p" },
            { enrollmentId: "enrollment-f", grade: "F" },
          ],
          finalize: true,
        },
        "faculty-1",
        false,
      ),
    ).resolves.toEqual({ ok: true, finalized: true });

    expect(tx.gradeSubmission.upsert).toHaveBeenCalledWith({
      where: { sectionId: "section-1" },
      create: expect.objectContaining({
        sectionId: "section-1",
        status: "submitted",
        submittedById: "faculty-1",
        version: 2,
      }),
      update: expect.objectContaining({
        status: "submitted",
        submittedById: "faculty-1",
        version: 2,
      }),
    });
    expect(tx.gradeSubmissionItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          enrollmentId: "enrollment-i",
          grade: "I",
          gradePoints: null,
          countsTowardGpa: false,
          countsTowardCredits: false,
        }),
        expect.objectContaining({
          enrollmentId: "enrollment-p",
          grade: "P",
          gradePoints: null,
          countsTowardGpa: false,
          countsTowardCredits: true,
        }),
        expect.objectContaining({
          enrollmentId: "enrollment-f",
          grade: "F",
          gradePoints: 0,
          countsTowardGpa: true,
          countsTowardCredits: false,
        }),
      ],
    });
    expect(tx.enrollment.updateMany).toHaveBeenCalledTimes(3);
    for (const [args] of tx.enrollment.updateMany.mock.calls) {
      expect(args.data).not.toHaveProperty("status");
    }
    expect(tx.enrollment.update).not.toHaveBeenCalled();
    expect(tx.transcriptEntry.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "grades-finalized" }),
    });
  });

  it.each([
    ["submitted", false],
    ["submitted", true],
    ["approved", false],
    ["approved", true],
  ] as const)(
    "locks both save and finalize while a submission is %s (finalize=%s)",
    async (status, finalize) => {
      const tx = {
        section: { findUnique: vi.fn().mockResolvedValue(section) },
        enrollment: {
          findMany: vi.fn().mockResolvedValue(roster),
          updateMany: vi.fn(),
        },
        gradeSubmission: {
          findUnique: vi.fn().mockResolvedValue({
            id: "grade-submission-1",
            status,
            version: 1,
          }),
          upsert: vi.fn(),
        },
        gradeSubmissionItem: { createMany: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      const prisma = {
        $transaction: vi.fn(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
      };
      const service = new AcademicsService(prisma as never);
      mockOwnership(service);

      await expect(
        service.submitGrades(
          "section-1",
          {
            grades: roster.map((enrollment) => ({
              enrollmentId: enrollment.id,
              grade: "P",
            })),
            finalize,
          },
          "faculty-1",
          false,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          "Grades are locked while submitted or after approval",
        ),
      );

      expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
      expect(tx.gradeSubmission.upsert).not.toHaveBeenCalled();
      expect(tx.gradeSubmissionItem.createMany).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );
});

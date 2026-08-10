import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("AcademicsService schedule queries", () => {
  it("returns only a student's active-term enrolled sections", async () => {
    const term = {
      id: "term-fall",
      name: "Fall 2026",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-20T00:00:00.000Z"),
    };
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "enrollment-1",
        sectionId: "section-1",
        section: {
          sectionCode: "A",
          days: "MWF",
          startTime: "09:00",
          endTime: "10:00",
          room: "R203",
          course: { code: "CSC 201", title: "Algorithms", credits: 3 },
          term,
        },
      },
    ]);
    const prisma = {
      term: { findFirst: vi.fn().mockResolvedValue(term) },
      enrollment: { findMany },
    };

    const result = await new AcademicsService(prisma as never).studentSchedule(
      "student-1",
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-1",
          status: "enrolled",
          section: { termId: "term-fall" },
        },
      }),
    );
    expect(result.term).toEqual(term);
    expect(result.entries).toEqual([
      expect.objectContaining({
        enrollmentId: "enrollment-1",
        courseCode: "CSC 201",
        term: "Fall 2026",
      }),
    ]);
  });

  it("does not query enrollments when no term exists", async () => {
    const findMany = vi.fn();
    const prisma = {
      term: { findFirst: vi.fn().mockResolvedValue(null) },
      enrollment: { findMany },
    };

    const result = await new AcademicsService(prisma as never).studentSchedule(
      "student-1",
    );

    expect(result).toEqual({ term: null, entries: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("scopes a faculty schedule to the active term", async () => {
    const term = {
      id: "term-fall",
      name: "Fall 2026",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-12-20T00:00:00.000Z"),
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      term: { findFirst: vi.fn().mockResolvedValue(term) },
      section: { findMany },
    };

    await new AcademicsService(prisma as never).mySchedule("faculty-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instructorId: "faculty-1", termId: "term-fall" },
      }),
    );
  });
});

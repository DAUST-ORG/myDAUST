import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

const termId = "11111111-1111-4111-8111-111111111111";
const otherTermId = "22222222-2222-4222-8222-222222222222";
const academicYearId = "33333333-3333-4333-8333-333333333333";
const programId = "44444444-4444-4444-8444-444444444444";
const courseId = "55555555-5555-4555-8555-555555555555";

function student() {
  return {
    id: "student-1",
    recordStatus: "active",
    programId,
    program: { id: programId, code: "BSCS", name: "Computer Science" },
    yearLevel: 1,
    admitTerm: "Fall 2029",
    major: null,
    catalogYearId: academicYearId,
    catalogYear: "2029-2030",
    catalogAcademicYear: {
      id: academicYearId,
      label: "2029-2030",
      startsOn: new Date("2029-08-01T00:00:00.000Z"),
    },
  };
}

function term(overrides: Record<string, unknown> = {}) {
  return {
    id: termId,
    name: "Fall 2029",
    status: "planning",
    semester: "Fall",
    academicYearId,
    academicYear: {
      id: academicYearId,
      label: "2029-2030",
      startsOn: new Date("2029-08-01T00:00:00.000Z"),
    },
    startDate: new Date("2029-09-01T00:00:00.000Z"),
    endDate: new Date("2029-12-20T00:00:00.000Z"),
    addDeadline: new Date("2029-09-15T00:00:00.000Z"),
    dropDeadline: new Date("2029-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function section(id = "section-1", overrides: Record<string, unknown> = {}) {
  return {
    id,
    courseId,
    termId,
    sectionCode: "01",
    status: "open",
    capacity: 30,
    days: "MWF",
    startTime: "09:00",
    endTime: "09:50",
    room: "A101",
    instructorId: null,
    instructor: null,
    _count: { enrollments: 0 },
    course: {
      id: courseId,
      code: "CSC 101",
      title: "Introduction to Computing",
      credits: 3,
      prereqRules: [],
      coreqRules: [],
      rule: null,
    },
    ...overrides,
  };
}

function approvedRevision(
  curriculum: unknown[] = [
    {
      courseId,
      courseCode: "CSC 101",
      yearIndex: 1,
      semester: "Fall",
      position: 0,
    },
  ],
) {
  return {
    id: "revision-1",
    academicYearId,
    revision: 2,
    status: "approved",
    yearLabel: "2029-2030",
    defaultLevels: Array.from({ length: 8 }, (_, index) => ({
      code: `S${index + 1}`,
      name: `Semester ${index + 1}`,
      creditCeiling: (index + 1) * 30,
    })),
    defaultStandingRules: [],
    notYetGradedStanding: {
      code: "not_yet_graded",
      label: "Not yet graded",
      tone: "neutral",
    },
    programConfigurations: [
      {
        programId,
        programCode: "BSCS",
        programName: "Computer Science",
        curriculum,
      },
    ],
    academicYear: {
      id: academicYearId,
      label: "2029-2030",
    },
    approvedAt: new Date("2029-05-01T00:00:00.000Z"),
  };
}

function configuredPrisma(options?: {
  student?: ReturnType<typeof student>;
  term?: ReturnType<typeof term>;
  sections?: ReturnType<typeof section>[];
  holds?: { type: string; reason: string | null }[];
  revisions?: ReturnType<typeof approvedRevision>[];
  transcript?: Record<string, unknown>[];
  courses?: Record<string, unknown>[];
}) {
  const sections = options?.sections ?? [section()];
  return {
    appSetting: {
      findUnique: vi.fn(async () => ({
        valueJson: { termId, recommendationsEnabled: true },
      })),
    },
    student: { findUnique: vi.fn(async () => options?.student ?? student()) },
    studentHold: { findMany: vi.fn(async () => options?.holds ?? []) },
    term: { findUnique: vi.fn(async () => options?.term ?? term()) },
    section: { findMany: vi.fn(async () => sections) },
    enrollment: { findMany: vi.fn(async () => []) },
    transcriptEntry: {
      findMany: vi.fn(async () => options?.transcript ?? []),
    },
    academicCatalogRevision: {
      findMany: vi.fn(async () =>
        options?.revisions === undefined
          ? [approvedRevision()]
          : options.revisions,
      ),
    },
    course: {
      findMany: vi.fn(
        async () =>
          options?.courses ??
          sections.map((value) => value.course as Record<string, unknown>),
      ),
    },
  };
}

describe("AcademicsService.registrationCatalog", () => {
  it("rejects a requested term that differs from the designated term", async () => {
    const prisma = {
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: { termId, recommendationsEnabled: true },
        })),
      },
      student: { findUnique: vi.fn(async () => student()) },
      studentHold: { findMany: vi.fn(async () => []) },
      term: { findUnique: vi.fn() },
    };
    const service = new AcademicsService(prisma as never);

    await expect(
      service.registrationCatalog("student-1", otherTermId),
    ).rejects.toThrow(/does not match the designated/i);
    expect(prisma.term.findUnique).not.toHaveBeenCalled();
  });

  it("returns ordered snapshot recommendations and section course ids for the server-selected term", async () => {
    const transcriptFindMany = vi.fn(async () => []);
    const prisma = configuredPrisma({
      sections: [section("section-1"), section("section-2")],
    });
    prisma.transcriptEntry.findMany = transcriptFindMany;
    const service = new AcademicsService(prisma as never);

    const result = await service.registrationCatalog("student-1");

    expect(result).toMatchObject({
      term: {
        id: termId,
        status: "planning",
        semester: "Fall",
        academicYearId,
      },
      registration: {
        mode: "configured",
        open: true,
        closedReason: null,
        recommendationsEnabled: true,
      },
      recommendationContext: {
        status: "ready",
        basis: "student_year_level",
        targetYearIndex: 1,
        catalogAcademicYearId: academicYearId,
        catalogRevision: 2,
      },
      recommendations: [
        {
          courseId,
          courseCode: "CSC 101",
          kind: "scheduled",
          readiness: "ready",
          sectionIds: ["section-1", "section-2"],
          availableSectionIds: ["section-1", "section-2"],
          availability: "available",
        },
      ],
      sections: expect.arrayContaining([
        expect.objectContaining({
          sectionId: "section-1",
          courseId,
          status: "open",
          blockedReason: null,
        }),
        expect.objectContaining({
          sectionId: "section-2",
          courseId,
          status: "open",
          blockedReason: null,
        }),
      ]),
    });
    expect(transcriptFindMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        voidedAt: null,
        courseId: { not: null },
      },
      select: expect.any(Object),
    });
  });

  it("keeps a recommendation visible under a hold while blocking every section", async () => {
    const prisma = configuredPrisma({
      holds: [{ type: "financial", reason: "Past due balance" }],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.holds).toEqual([
      { type: "financial", reason: "Past due balance" },
    ]);
    expect(result.recommendations).toEqual([
      expect.objectContaining({
        courseId,
        kind: "scheduled",
        availability: "blocked",
        availableSectionIds: [],
      }),
    ]);
    expect(result.sections[0]).toMatchObject({
      courseId,
      blockedReason: "Registration is blocked by an active hold",
    });
  });

  it("maps a configured Summer term to the Summer plan slot", async () => {
    const prisma = configuredPrisma({
      term: term({ semester: "Summer", name: "Summer 2029" }),
      revisions: [
        approvedRevision([
          {
            courseId,
            courseCode: "CSC 101",
            yearIndex: 1,
            semester: "Summer",
            position: 0,
          },
        ]),
      ],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "ready",
      semester: "Summer",
      targetYearIndex: 1,
    });
    expect(result.recommendations[0]).toMatchObject({
      courseId,
      kind: "scheduled",
      plannedSemester: "Summer",
    });
  });

  it("reports a missing plan position for Summer when the approved year has no Summer slot", async () => {
    const prisma = configuredPrisma({
      term: term({ semester: "Summer", name: "Summer 2029" }),
      revisions: [
        approvedRevision([
          {
            courseId,
            courseCode: "CSC 101",
            yearIndex: 1,
            semester: "Fall",
            position: 0,
          },
        ]),
      ],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "missing_plan_position",
      semester: "Summer",
      basis: null,
      targetYearIndex: null,
    });
    expect(result.recommendations).toEqual([]);
  });

  it("does not fall back to an earlier Summer slot when the student's known year has no Summer slot", async () => {
    const prisma = configuredPrisma({
      student: { ...student(), yearLevel: 3 },
      term: term({ semester: "Summer", name: "Summer 2029" }),
      revisions: [
        approvedRevision([
          {
            courseId,
            courseCode: "CSC 101",
            yearIndex: 1,
            semester: "Summer",
            position: 0,
          },
        ]),
      ],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "missing_plan_position",
      semester: "Summer",
      basis: null,
      targetYearIndex: null,
    });
    expect(result.recommendations).toEqual([]);
  });

  it("reports an unmapped configured term before catalog evaluation", async () => {
    const prisma = configuredPrisma({ term: term({ semester: "Winter" }) });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "unmapped_term",
      semester: null,
      targetYearIndex: null,
    });
    expect(prisma.academicCatalogRevision.findMany).not.toHaveBeenCalled();
  });

  it("reports a missing plan position when no year source maps the configured season", async () => {
    const withoutYear = {
      ...student(),
      yearLevel: null,
      catalogYear: "catalog-without-year",
      catalogAcademicYear: {
        id: academicYearId,
        label: "catalog-without-year",
        startsOn: null,
      },
    };
    const prisma = configuredPrisma({
      student: withoutYear,
      term: term({
        semester: "Summer",
        academicYear: {
          id: academicYearId,
          label: "target-without-year",
          startsOn: null,
        },
      }),
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "missing_plan_position",
      basis: null,
      targetYearIndex: null,
      semester: "Summer",
    });
    expect(result.recommendations).toEqual([]);
  });

  it("uses the admission term when catalog-year chronology is unavailable", async () => {
    const withoutCatalogChronology = {
      ...student(),
      yearLevel: null,
      admitTerm: "Spring 2029",
      catalogYear: "catalog-without-year",
      catalogAcademicYear: {
        id: academicYearId,
        label: "catalog-without-year",
        startsOn: null,
      },
    };
    const prisma = configuredPrisma({
      student: withoutCatalogChronology,
      term: term({
        academicYear: {
          id: academicYearId,
          label: "2029-2030",
          startsOn: new Date("2029-08-01T00:00:00.000Z"),
        },
      }),
      revisions: [
        approvedRevision([
          {
            courseId,
            courseCode: "CSC 101",
            yearIndex: 2,
            semester: "Fall",
            position: 0,
          },
        ]),
      ],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "ready",
      basis: "catalog_chronology",
      targetYearIndex: 2,
    });
    expect(result.recommendations[0]).toMatchObject({
      courseId,
      kind: "scheduled",
      plannedYearIndex: 2,
    });
  });

  it("falls through an out-of-range recorded year level to valid catalog chronology", async () => {
    const prisma = configuredPrisma({
      student: { ...student(), yearLevel: 8 },
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "ready",
      basis: "catalog_chronology",
      targetYearIndex: 1,
    });
    expect(result.recommendations).toEqual([
      expect.objectContaining({ courseId, kind: "scheduled" }),
    ]);
  });

  it("falls through out-of-range chronology to the earliest unfinished matching season", async () => {
    const prisma = configuredPrisma({
      student: {
        ...student(),
        yearLevel: null,
        catalogAcademicYear: {
          id: academicYearId,
          label: "2020-2021",
          startsOn: new Date("2020-08-01T00:00:00.000Z"),
        },
      },
      revisions: [
        approvedRevision([
          {
            courseId,
            courseCode: "CSC 101",
            yearIndex: 2,
            semester: "Fall",
            position: 0,
          },
        ]),
      ],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "ready",
      basis: "earliest_incomplete_same_semester",
      targetYearIndex: 2,
    });
  });

  it("reports a missing plan position when every year source is outside the approved plan", async () => {
    const prisma = configuredPrisma({
      student: {
        ...student(),
        yearLevel: 8,
        catalogAcademicYear: {
          id: academicYearId,
          label: "2020-2021",
          startsOn: new Date("2020-08-01T00:00:00.000Z"),
        },
      },
      revisions: [
        approvedRevision([
          {
            courseId,
            courseCode: "CSC 101",
            yearIndex: 2,
            semester: "Spring",
            position: 0,
          },
        ]),
      ],
    });
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext).toMatchObject({
      status: "missing_plan_position",
      basis: null,
      targetYearIndex: null,
    });
    expect(result.recommendations).toEqual([]);
  });

  it.each([
    {
      label: "program",
      expected: "missing_program",
      student: { ...student(), programId: null, program: null },
      revisions: undefined,
    },
    {
      label: "catalog assignment",
      expected: "missing_catalog_year",
      student: {
        ...student(),
        catalogYearId: null,
        catalogYear: null,
        catalogAcademicYear: null,
      },
      revisions: undefined,
    },
    {
      label: "approved catalog",
      expected: "missing_approved_catalog",
      student: student(),
      revisions: [],
    },
    {
      label: "approved curriculum",
      expected: "missing_curriculum",
      student: student(),
      revisions: [approvedRevision([])],
    },
  ])("reports the missing $label status", async ({ expected, ...options }) => {
    const prisma = configuredPrisma(options as never);
    const result = await new AcademicsService(
      prisma as never,
    ).registrationCatalog("student-1");

    expect(result.recommendationContext.status).toBe(expected);
    expect(result.recommendations).toEqual([]);
  });

  it("distinguishes an explicit registrar closure from a missing setting", async () => {
    const prisma = {
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: { termId: null, recommendationsEnabled: false },
        })),
      },
      student: { findUnique: vi.fn(async () => student()) },
      studentHold: { findMany: vi.fn(async () => []) },
    };
    const service = new AcademicsService(prisma as never);

    await expect(
      service.registrationCatalog("student-1"),
    ).resolves.toMatchObject({
      term: null,
      registration: {
        mode: "configured",
        open: false,
        closedReason: "closed_by_registrar",
        recommendationsEnabled: false,
      },
      recommendationContext: { status: "disabled" },
      recommendations: [],
      sections: [],
    });
  });

  it("does not let a legacy term query bypass an explicit registrar closure", async () => {
    const prisma = {
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: { termId: null, recommendationsEnabled: false },
        })),
      },
      student: { findUnique: vi.fn(async () => student()) },
      studentHold: { findMany: vi.fn(async () => []) },
    };

    await expect(
      new AcademicsService(prisma as never).registrationCatalog(
        "student-1",
        otherTermId,
      ),
    ).rejects.toThrow(/does not match the designated/i);
  });
});

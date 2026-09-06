import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";
import {
  curatedBypassCourseIds,
  type CuratedRecommendationData,
} from "./curated-recommendations.js";

// The enroll tests below run against a pinned artifact, never the production
// roster: the bypass must not depend on which 265 students prod happens to hold.
vi.mock("./curated-recommendations.data.js", () => ({
  CURATED_RECOMMENDATIONS: {
    termName: "Fall 2029",
    students: {
      S00001AA: { level: "S1", courses: ["CS 101", "MATH 101"] },
    },
  },
}));

const termId = "11111111-1111-4111-8111-111111111111";

function section(id: string, courseId: string) {
  return {
    id,
    courseId,
    termId,
    capacity: 1,
    status: "open",
    days: "M",
    startTime: "09:00",
    endTime: "09:50",
  };
}

function course(
  id: string,
  code: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    code,
    title: code,
    credits: 3,
    prereqRules: [
      {
        prereqCourseId: "course-pre",
        minGrade: "C",
        prereqCourse: { code: "PRE 100" },
      },
    ],
    coreqRules: [
      {
        coreqCourseId: "course-co",
        coreqCourse: { code: "CO 100" },
      },
    ],
    rule: { standingRequired: "junior standing" },
    ...overrides,
  };
}

function harness(options: {
  studentNo: string;
  addDeadline: Date;
  taken?: number;
  holds?: unknown[];
  yearLevel?: number;
  heldCredits?: number;
}) {
  const sections = new Map([["section-a", section("section-a", "course-a")]]);
  const audits: { entityId: string; data?: unknown }[] = [];
  const held = (options.heldCredits ?? 0) / 3;
  const tx = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join(" ");
        if (sql.includes("pg_advisory_xact_lock_shared")) return [];
        if (sql.includes('FROM "Section"'))
          return [sections.get(String(values[0]))];
        if (sql.includes('FROM "Student"')) return [{ id: "student-1" }];
        return [];
      },
    ),
    appSetting: {
      findUnique: vi.fn(async () => ({
        valueJson: { termId, recommendationsEnabled: true },
      })),
    },
    term: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: termId,
        name: "Fall 2029",
        endDate: new Date("2099-12-20T00:00:00.000Z"),
        addDeadline: options.addDeadline,
      })),
    },
    enrollment: {
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => options.taken ?? 0),
      findMany: vi.fn(async () =>
        Array.from({ length: held }, (_, i) => ({
          section: {
            courseId: `held-${i}`,
            course: { credits: 3, code: `HELD ${i}` },
            days: "T",
            startTime: "14:00",
            endTime: "14:50",
          },
        })),
      ),
      create: vi.fn(async ({ data }: { data: { sectionId: string } }) => ({
        id: `enrollment-${data.sectionId}`,
        ...data,
      })),
      update: vi.fn(),
    },
    section: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) =>
        sections.get(where.id),
      ),
    },
    studentHold: { findMany: vi.fn(async () => options.holds ?? []) },
    course: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) =>
        course(where.id, where.id === "course-a" ? "CS 101" : where.id),
      ),
    },
    transcriptEntry: { findMany: vi.fn(async () => []) },
    student: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "student-1",
        recordStatus: "active",
        yearLevel: options.yearLevel ?? 1,
        major: null,
        program: { name: "Computer Science" },
        studentNo: options.studentNo,
      })),
    },
    auditLog: {
      create: vi.fn(
        async ({ data }: { data: { entityId: string; data?: unknown } }) => {
          audits.push({
            entityId: data.entityId,
            data: (data as { data?: unknown }).data,
          });
          return {};
        },
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  return { service: new AcademicsService(prisma as never), audits };
}

describe("curatedBypassCourseIds", () => {
  const data: CuratedRecommendationData = {
    termName: "Fall 2029",
    students: { S1: { level: "S1", courses: ["CS 101", "GONE 999"] } },
  };
  const byCode = new Map([["CS 101", "course-a"]]);

  it("maps curated codes to course ids", () => {
    expect(
      curatedBypassCourseIds({
        studentNo: "S1",
        termName: "Fall 2029",
        data,
        courseIdByCode: byCode,
      }),
    ).toEqual(new Set(["course-a"]));
  });

  it("is empty for another term, an unknown student, or no student", () => {
    const base = { termName: "Fall 2029", data, courseIdByCode: byCode };
    expect(
      curatedBypassCourseIds({
        ...base,
        termName: "Spring 2030",
        studentNo: "S1",
      }).size,
    ).toBe(0);
    expect(curatedBypassCourseIds({ ...base, studentNo: "NOBODY" }).size).toBe(
      0,
    );
    expect(curatedBypassCourseIds({ ...base, studentNo: null }).size).toBe(0);
  });
});

describe("curated enrollment bypass", () => {
  const future = new Date("2099-09-15T00:00:00.000Z");
  const past = new Date("2001-09-15T00:00:00.000Z");

  it("lets a curated student through prereq, coreq, standing, capacity and deadline", async () => {
    // capacity 1, already taken by someone else; unmet prereq + coreq;
    // sophomore-level standing rule vs yearLevel 1; deadline long past.
    const { service, audits } = harness({
      studentNo: "S00001AA",
      addDeadline: past,
      taken: 1,
    });
    const enrollment = await service.enroll("student-1", "section-a");
    expect(enrollment.id).toBe("enrollment-section-a");
    expect(audits).toEqual([
      {
        entityId: "enrollment-section-a",
        data: {
          curatedBypass: [
            "add_deadline",
            "capacity",
            "prerequisite",
            "corequisite",
            "standing",
          ],
        },
      },
    ]);
  });

  it("still blocks a student with no curated plan at the prerequisite", async () => {
    const { service } = harness({ studentNo: "S99999ZZ", addDeadline: future });
    await expect(service.enroll("student-1", "section-a")).rejects.toThrow(
      "Missing prerequisite(s) for CS 101: PRE 100 (min C)",
    );
  });

  it("still blocks a full section for a non-curated student", async () => {
    const { service } = harness({
      studentNo: "S99999ZZ",
      addDeadline: future,
      taken: 1,
    });
    await expect(service.enroll("student-1", "section-a")).rejects.toThrow(
      "Section is full",
    );
  });

  it("still enforces holds against a curated student", async () => {
    const { service } = harness({
      studentNo: "S00001AA",
      addDeadline: future,
      holds: [{ type: "bursar" }],
    });
    await expect(service.enroll("student-1", "section-a")).rejects.toThrow(
      "blocked by an active hold",
    );
  });

  it("still enforces the credit cap against a curated student", async () => {
    const { service } = harness({
      studentNo: "S00001AA",
      addDeadline: future,
      heldCredits: 30,
    });
    await expect(service.enroll("student-1", "section-a")).rejects.toThrow(
      "Over the 30-credit limit",
    );
  });
});

describe("curated catalog mirror", () => {
  const programId = "44444444-4444-4444-8444-444444444444";
  const academicYearId = "33333333-3333-4333-8333-333333333333";

  function catalogPrisma(studentNo: string) {
    const past = new Date("2001-09-15T00:00:00.000Z");
    return {
      appSetting: {
        findUnique: vi.fn(async () => ({
          valueJson: { termId, recommendationsEnabled: true },
        })),
      },
      student: {
        findUnique: vi.fn(async () => ({
          id: "student-1",
          recordStatus: "active",
          programId,
          program: { id: programId, code: "BSCS", name: "Computer Science" },
          yearLevel: 1,
          major: null,
          studentNo,
          catalogYearId: academicYearId,
          catalogYear: "2029-2030",
          catalogAcademicYear: {
            id: academicYearId,
            label: "2029-2030",
            startsOn: new Date("2029-08-01T00:00:00.000Z"),
          },
        })),
      },
      studentHold: { findMany: vi.fn(async () => []) },
      term: {
        findUnique: vi.fn(async () => ({
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
          endDate: new Date("2099-12-20T00:00:00.000Z"),
          addDeadline: past,
          dropDeadline: new Date("2029-10-01T00:00:00.000Z"),
        })),
      },
      section: {
        findMany: vi.fn(async () => [
          {
            id: "section-a",
            courseId: "course-a",
            termId,
            sectionCode: "01",
            status: "open",
            capacity: 1,
            days: "M",
            startTime: "09:00",
            endTime: "09:50",
            room: "A101",
            instructorId: null,
            instructor: null,
            _count: { enrollments: 1 },
            course: {
              id: "course-a",
              code: "CS 101",
              title: "CS 101",
              credits: 3,
              prereqRules: [
                {
                  prereqCourseId: "course-pre",
                  minGrade: "C",
                  prereqCourse: { code: "PRE 100" },
                },
              ],
              coreqRules: [
                {
                  coreqCourseId: "course-co",
                  coreqCourse: { code: "CO 100" },
                },
              ],
              rule: { standingRequired: "junior standing" },
            },
          },
        ]),
      },
      enrollment: { findMany: vi.fn(async () => []) },
      transcriptEntry: { findMany: vi.fn(async () => []) },
      academicCatalogRevision: { findMany: vi.fn(async () => []) },
      course: { findMany: vi.fn(async () => []) },
    };
  }

  it("reads every bypassed gate as enrollable for a curated student", async () => {
    const result = await new AcademicsService(
      catalogPrisma("S00001AA") as never,
    ).registrationCatalog("student-1");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      courseCode: "CS 101",
      blockedReason: null,
    });
  });

  it("keeps the same section blocked for a student with no curated plan", async () => {
    const result = await new AcademicsService(
      catalogPrisma("S99999ZZ") as never,
    ).registrationCatalog("student-1");
    expect(result.sections[0]?.blockedReason).toMatch(/add period closed/);
  });
});

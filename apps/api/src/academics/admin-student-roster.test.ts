import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    studentNo: "DAUST-2026-001",
    photoUrl: null,
    yearLevel: 1,
    programId: "program-1",
    catalogYearId: "year-1",
    catalogYear: "2026–2027",
    cohort: "2026",
    recordStatus: "active",
    person: {
      firstName: "Aïssatou",
      lastName: "Diallo",
      email: "aissatou@daust.edu",
      passwordHash: "hash",
      mustChangePassword: false,
    },
    program: { code: "BSCS", name: "Computer Science" },
    _count: { holds: 1 },
    invoices: [],
    transcriptEntries: [],
    ...overrides,
  };
}

function service(records = [student()]) {
  const findMany = vi.fn().mockResolvedValue(records);
  const count = vi
    .fn()
    .mockResolvedValueOnce(records.length)
    .mockResolvedValueOnce(298)
    .mockResolvedValueOnce(17);
  const prisma = {
    student: { findMany, count },
    program: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ code: "BSCS", name: "Computer Science" }]),
    },
    academicCatalogRevision: {
      findMany: vi.fn().mockResolvedValue([
        {
          academicYearId: "year-1",
          yearLabel: "2026–2027",
          revision: 2,
          approvedAt: new Date("2026-08-15T00:00:00.000Z"),
          defaultLevels: Array.from({ length: 10 }, (_, index) => ({
            code: `S${index + 1}`,
            name: `Semester ${index + 1}`,
            creditCeiling: (index + 1) * 30,
          })),
          programConfigurations: [
            {
              programId: "program-1",
              programCode: "BSCS",
              programName: "Computer Science",
              progressionMode: "default",
              customLevels: [],
              requirements: [
                { category: "Degree curriculum", requiredCredits: 300 },
              ],
            },
          ],
          academicYear: { label: "2026–2027" },
        },
      ]),
    },
  };
  return { service: new AcademicsService(prisma as never), prisma };
}

describe("registrar student roster", () => {
  it("paginates in PostgreSQL and selects only roster fields", async () => {
    const { service: academics, prisma } = service();

    const result = await academics.adminStudentRoster({
      page: 3,
      pageSize: 50,
      program: "BSCS",
      sort: "name",
      direction: "asc",
    });

    expect(result).toMatchObject({
      page: 3,
      pageSize: 50,
      total: 1,
      allTotal: 298,
      missingLoginCount: 17,
    });
    expect(result.items[0]).toMatchObject({
      name: "Aïssatou Diallo",
      hasActiveHold: true,
      activeHoldCount: 1,
      program: "BSCS",
      academicLevel: { code: "S1", creditCeiling: 30 },
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 50,
        select: expect.objectContaining({
          person: { select: expect.any(Object) },
          invoices: { select: expect.any(Object) },
          transcriptEntries: expect.objectContaining({
            select: expect.any(Object),
          }),
        }),
      }),
    );
    const query = prisma.student.findMany.mock.calls[0]?.[0];
    expect(query.select.person.include).toBeUndefined();
    expect(query.select.holds).toBeUndefined();
    expect(prisma.student.count).toHaveBeenNthCalledWith(3, {
      where: {
        recordStatus: "active",
        person: { is: { passwordHash: null } },
      },
    });
  });

  it("sorts the list by the earned-credit catalog level", async () => {
    const { service: academics, prisma } = service([
      student({
        id: "student-s2",
        studentNo: "DAUST-2026-002",
        transcriptEntries: [
          {
            courseId: "course-s2",
            courseCode: "CS 201",
            credits: 31,
            earnedCredits: 31,
            gradePoints: 4,
            countsTowardGpa: true,
            countsTowardCredits: true,
          },
        ],
      }),
      student({ id: "student-s1", studentNo: "DAUST-2026-001" }),
    ]);

    const result = await academics.adminStudentRoster({
      page: 1,
      pageSize: 50,
      sort: "level",
      direction: "asc",
    });

    expect(result.items.map((row) => row.academicLevel?.code)).toEqual([
      "S1",
      "S2",
    ]);
    expect(prisma.academicCatalogRevision.findMany).toHaveBeenCalledTimes(1);
  });

  it("matches a multi-token full name across first and last name", async () => {
    const { service: academics, prisma } = service();

    await academics.adminStudentRoster({
      page: 1,
      pageSize: 50,
      search: "Aïssatou Diallo",
      sort: "name",
      direction: "asc",
    });

    const where = prisma.student.findMany.mock.calls[0]?.[0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual(
      expect.objectContaining({ OR: expect.any(Array) }),
    );
    expect(where.AND[1]).toEqual(
      expect.objectContaining({ OR: expect.any(Array) }),
    );
  });

  it("uses a lightweight query for directory selectors", async () => {
    const { service: academics, prisma } = service();

    const rows = await academics.adminStudentDirectory();

    expect(rows[0]).toEqual({
      id: "student-1",
      studentNo: "DAUST-2026-001",
      name: "Aïssatou Diallo",
      program: "BSCS",
      yearLevel: 1,
      recordStatus: "active",
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        studentNo: true,
        yearLevel: true,
        recordStatus: true,
        person: { select: { firstName: true, lastName: true } },
        program: { select: { code: true } },
      },
      orderBy: { studentNo: "asc" },
    });
  });
});

describe("registrar student roster query validation", () => {
  it("applies safe pagination defaults", () => {
    const adminStudentRoster = vi.fn();
    const controller = new AcademicsController({ adminStudentRoster } as never);

    controller.adminStudentRoster({});

    expect(adminStudentRoster).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      search: undefined,
      program: undefined,
      sort: "name",
      direction: "asc",
    });
  });

  it("rejects unbounded page sizes", () => {
    const controller = new AcademicsController({
      adminStudentRoster: vi.fn(),
    } as never);

    expect(() => controller.adminStudentRoster({ pageSize: "5000" })).toThrow(
      ZodError,
    );
  });
});

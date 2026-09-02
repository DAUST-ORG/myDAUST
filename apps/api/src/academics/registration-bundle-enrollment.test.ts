import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

const termId = "11111111-1111-4111-8111-111111111111";

function section(id: string, courseId: string, startTime: string) {
  return {
    id,
    courseId,
    termId,
    capacity: 20,
    status: "open",
    days: "M",
    startTime,
    endTime: startTime === "09:00" ? "09:50" : "10:50",
  };
}

describe("AcademicsService.enrollBundle", () => {
  it("locks sections stably, serializes the student, and atomically enrolls reciprocal corequisites", async () => {
    const sections = new Map([
      ["section-a", section("section-a", "course-a", "09:00")],
      ["section-b", section("section-b", "course-b", "10:00")],
    ]);
    const lockOrder: string[] = [];
    const created: string[] = [];
    const enrollmentCreate = vi.fn(
      async ({ data }: { data: { sectionId: string } }) => {
        created.push(data.sectionId);
        return { id: `enrollment-${data.sectionId}`, ...data };
      },
    );
    const tx = {
      $queryRaw: vi.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.join(" ");
          if (sql.includes("pg_advisory_xact_lock_shared")) {
            lockOrder.push("configuration");
            return [];
          }
          if (sql.includes('FROM "Section"')) {
            const id = String(values[0]);
            lockOrder.push(id);
            return [sections.get(id)];
          }
          if (sql.includes('FROM "Student"')) {
            lockOrder.push("student");
            return [{ id: "student-1" }];
          }
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
          addDeadline: new Date("2099-09-15T00:00:00.000Z"),
        })),
      },
      enrollment: {
        findUnique: vi.fn(async () => null),
        count: vi.fn(async () => 0),
        findMany: vi.fn(async () => []),
        create: enrollmentCreate,
        update: vi.fn(),
      },
      section: {
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) =>
          sections.get(where.id),
        ),
      },
      studentHold: { findMany: vi.fn(async () => []) },
      course: {
        findUniqueOrThrow: vi.fn(
          async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            code: where.id === "course-a" ? "A" : "B",
            credits: 3,
            prereqRules: [],
            coreqRules: [
              where.id === "course-a"
                ? {
                    coreqCourseId: "course-b",
                    coreqCourse: { code: "B" },
                  }
                : {
                    coreqCourseId: "course-a",
                    coreqCourse: { code: "A" },
                  },
            ],
            rule: null,
          }),
        ),
      },
      transcriptEntry: { findMany: vi.fn(async () => []) },
      student: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: "student-1",
          recordStatus: "active",
          yearLevel: 1,
          major: null,
          program: { name: "Computer Science" },
        })),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };

    await expect(
      new AcademicsService(prisma as never).enrollBundle("student-1", [
        "section-b",
        "section-a",
      ]),
    ).resolves.toEqual({
      enrollmentIds: ["enrollment-section-b", "enrollment-section-a"],
      sectionIds: ["section-b", "section-a"],
    });
    expect(lockOrder).toEqual([
      "configuration",
      "section-a",
      "section-b",
      "student",
    ]);
    expect(created).toEqual(["section-b", "section-a"]);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate section ids before opening a transaction", async () => {
    const prisma = { $transaction: vi.fn() };
    await expect(
      new AcademicsService(prisma as never).enrollBundle("student-1", [
        "section-a",
        "section-a",
      ]),
    ).rejects.toThrow(/only once/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

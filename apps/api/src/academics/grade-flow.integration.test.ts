import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@mydaust/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RegistrarService } from "../registrar/registrar.service.js";
import { AcademicsService } from "./academics.service.js";

const SCHEMA = `grade_flow_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

function databaseUrl(): string | null {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("schema", SCHEMA);
  return url.toString();
}

const DB_URL = databaseUrl();
let prisma: PrismaClient;
let academics: AcademicsService;
let registrar: RegistrarService;
let fixture: {
  facultyId: string;
  outsiderId: string;
  registrarId: string;
  sectionId: string;
  enrollmentIds: string[];
};

describe.skipIf(!DB_URL)("faculty grading flow", () => {
  beforeAll(async () => {
    const url = DB_URL!;
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    academics = new AcademicsService(prisma as never);
    registrar = new RegistrarService(prisma as never, {} as never);

    const [faculty, outsider, reviewer] = await Promise.all([
      prisma.person.create({
        data: {
          email: `faculty-${randomUUID()}@test.local`,
          firstName: "Flow",
          lastName: "Faculty",
          kind: "staff",
          roles: ["faculty"],
        },
      }),
      prisma.person.create({
        data: {
          email: `outsider-${randomUUID()}@test.local`,
          firstName: "Other",
          lastName: "Faculty",
          kind: "staff",
          roles: ["faculty"],
        },
      }),
      prisma.person.create({
        data: {
          email: `registrar-${randomUUID()}@test.local`,
          firstName: "Flow",
          lastName: "Registrar",
          kind: "staff",
          roles: ["registrar"],
        },
      }),
    ]);
    const department = await prisma.department.create({
      data: {
        code: `T${randomUUID().slice(0, 6)}`,
        name: "Flow Test Engineering",
      },
    });
    const course = await prisma.course.create({
      data: {
        code: `TST ${randomUUID().slice(0, 4)}`,
        title: "End-to-end Grading",
        credits: 3,
        departmentId: department.id,
      },
    });
    const term = await prisma.term.create({
      data: {
        name: `Flow Term ${randomUUID().slice(0, 6)}`,
        startDate: new Date("2026-08-20T00:00:00.000Z"),
        endDate: new Date("2026-12-20T00:00:00.000Z"),
      },
    });
    const scheme = await prisma.gradingScheme.create({
      data: {
        key: `flow-${randomUUID()}`,
        name: "Flow Test Scale",
        isDefault: true,
        rows: {
          create: [
            {
              grade: "A",
              points: 4,
              position: 0,
              countsTowardGpa: true,
              countsTowardCredits: true,
            },
            {
              grade: "I",
              points: null,
              position: 1,
              countsTowardGpa: false,
              countsTowardCredits: false,
            },
          ],
        },
      },
    });
    const section = await prisma.section.create({
      data: {
        courseId: course.id,
        termId: term.id,
        instructorId: faculty.id,
        gradingSchemeId: scheme.id,
        sectionCode: "A",
        capacity: 20,
        days: "MW",
        startTime: "09:00",
        endTime: "10:30",
        room: "T101",
      },
    });

    const enrollmentIds: string[] = [];
    for (const [index, name] of ["Alpha", "Incomplete"].entries()) {
      const person = await prisma.person.create({
        data: {
          email: `student-${index}-${randomUUID()}@test.local`,
          firstName: "Student",
          lastName: name,
          kind: "student",
          roles: ["student"],
        },
      });
      const student = await prisma.student.create({
        data: {
          personId: person.id,
          studentNo: `FLOW-${index}-${randomUUID().slice(0, 6)}`,
        },
      });
      const enrollment = await prisma.enrollment.create({
        data: { studentId: student.id, sectionId: section.id },
      });
      enrollmentIds.push(enrollment.id);
    }

    fixture = {
      facultyId: faculty.id,
      outsiderId: outsider.id,
      registrarId: reviewer.id,
      sectionId: section.id,
      enrollmentIds,
    };
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("creates roster score rows, publishes only after registrar approval, and stays idempotent", async () => {
    await expect(
      academics.createAssignment(
        fixture.sectionId,
        {
          title: "Project",
          type: "project",
          maxPoints: 50,
          weight: 40,
          dueDate: "2026-11-20",
        },
        fixture.outsiderId,
        false,
      ),
    ).rejects.toThrow("You do not teach this section");

    const assignment = await academics.createAssignment(
      fixture.sectionId,
      {
        title: "Project",
        type: "project",
        maxPoints: 50,
        weight: 40,
        dueDate: "2026-11-20",
      },
      fixture.facultyId,
      false,
    );
    const sheet = await academics.getAssignmentSubmissions(
      assignment.id,
      fixture.facultyId,
      false,
    );
    expect(sheet.submissions).toHaveLength(2);
    expect(sheet.submissions.every((row) => row.submissionId)).toBe(true);

    await Promise.all(
      sheet.submissions.map((row, index) =>
        academics.gradeSubmission(
          row.submissionId!,
          { score: index === 0 ? 45 : 30 },
          fixture.facultyId,
          false,
        ),
      ),
    );
    const columns = await academics.listSectionAssignments(
      fixture.sectionId,
      fixture.facultyId,
      false,
    );
    expect(columns.assignments).toEqual([
      expect.objectContaining({ id: assignment.id, graded: 2, weight: 40 }),
    ]);

    await academics.submitGrades(
      fixture.sectionId,
      {
        grades: [
          { enrollmentId: fixture.enrollmentIds[0]!, grade: "A" },
          { enrollmentId: fixture.enrollmentIds[1]!, grade: "I" },
        ],
        finalize: true,
      },
      fixture.facultyId,
      false,
    );

    expect(
      await prisma.enrollment.count({ where: { status: "completed" } }),
    ).toBe(0);
    expect(await prisma.transcriptEntry.count()).toBe(0);
    const [pending] = await registrar.listGradeSubmissions();
    expect(pending).toMatchObject({
      status: "submitted",
      students: 2,
      graded: 2,
      grades: [{ grade: "A" }, { grade: "I" }],
    });

    await registrar.decideGradeSubmission(
      fixture.registrarId,
      pending!.id,
      "approved",
      "Integration test approval",
    );
    const published = await prisma.transcriptEntry.findMany({
      orderBy: { grade: "asc" },
    });
    expect(published).toEqual([
      expect.objectContaining({
        grade: "A",
        earnedCredits: 3,
        countsTowardGpa: true,
        countsTowardCredits: true,
      }),
      expect.objectContaining({
        grade: "I",
        earnedCredits: 0,
        countsTowardGpa: false,
        countsTowardCredits: false,
      }),
    ]);
    expect(
      await prisma.enrollment.count({ where: { status: "completed" } }),
    ).toBe(2);

    await registrar.decideGradeSubmission(
      fixture.registrarId,
      pending!.id,
      "approved",
    );
    expect(await prisma.transcriptEntry.count()).toBe(2);
    await expect(
      academics.submitGrades(
        fixture.sectionId,
        {
          grades: fixture.enrollmentIds.map((enrollmentId) => ({
            enrollmentId,
            grade: "A",
          })),
          finalize: false,
        },
        fixture.facultyId,
        false,
      ),
    ).rejects.toThrow("Grades are locked while submitted or after approval");
  });
});

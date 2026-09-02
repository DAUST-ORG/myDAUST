import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { AcademicsService } from "./academics.service.js";
import { EnrollmentOverrideService } from "./enrollment-approvals.service.js";
import { REGISTRATION_CONFIGURATION_KEY } from "./registration-configuration.js";

const SCHEMA = `registration_recommendations_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

let prisma: PrismaClient;
let academics: AcademicsService;
let overrides: EnrollmentOverrideService;
let studentId: string;
let studentPersonId: string;
let noSlotStudentId: string;
let termId: string;
let otherSectionId: string;
let recommendedSectionIds: string[];

describe.skipIf(!DB_URL)("registration recommendation integration", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    academics = new AcademicsService(prisma as never);
    overrides = new EnrollmentOverrideService(
      prisma as never,
      {
        emit: async () => undefined,
      } as never,
    );

    const department = await prisma.department.create({
      data: { code: "CSE", name: "Computer Science" },
    });
    const [summerProgram, noSlotProgram] = await Promise.all([
      prisma.program.create({
        data: {
          code: "BSCSS",
          name: "Computer Science Summer",
          departmentId: department.id,
        },
      }),
      prisma.program.create({
        data: {
          code: "BSCNF",
          name: "Computer Science Fall Only",
          departmentId: department.id,
        },
      }),
    ]);
    const [summerCourse, fallCourse] = await Promise.all([
      prisma.course.create({
        data: {
          code: "CSC 101S",
          title: "Summer Computing",
          credits: 3,
          departmentId: department.id,
        },
      }),
      prisma.course.create({
        data: {
          code: "CSC 101F",
          title: "Fall Computing",
          credits: 3,
          departmentId: department.id,
        },
      }),
    ]);
    const year = await prisma.academicYear.create({
      data: {
        label: "2099-2100",
        status: "active",
        startsOn: new Date("2099-08-01T00:00:00.000Z"),
        endsOn: new Date("2100-07-31T00:00:00.000Z"),
      },
    });
    const term = await prisma.term.create({
      data: {
        name: "Summer 2100",
        semester: "Summer",
        status: "planning",
        academicYearId: year.id,
        startDate: new Date("2100-05-01T00:00:00.000Z"),
        endDate: new Date("2100-07-20T00:00:00.000Z"),
        addDeadline: new Date("2100-05-15T00:00:00.000Z"),
      },
    });
    termId = term.id;
    const otherTerm = await prisma.term.create({
      data: {
        name: "Fall 2100",
        semester: "Fall",
        status: "planning",
        academicYearId: year.id,
        startDate: new Date("2100-09-01T00:00:00.000Z"),
        endDate: new Date("2100-12-20T00:00:00.000Z"),
        addDeadline: new Date("2100-09-15T00:00:00.000Z"),
      },
    });
    const summerSections = await Promise.all(
      ["01", "02"].map((sectionCode) =>
        prisma.section.create({
          data: {
            courseId: summerCourse.id,
            termId: term.id,
            sectionCode,
            capacity: 30,
            days: sectionCode === "01" ? "MW" : "TR",
            startTime: "09:00",
            endTime: "10:00",
          },
        }),
      ),
    );
    recommendedSectionIds = summerSections.map((section) => section.id);
    otherSectionId = (
      await prisma.section.create({
        data: {
          courseId: summerCourse.id,
          termId: otherTerm.id,
          sectionCode: "01",
          capacity: 30,
          days: "MW",
          startTime: "09:00",
          endTime: "10:00",
        },
      })
    ).id;
    const [studentPerson, noSlotPerson] = await Promise.all([
      prisma.person.create({
        data: {
          email: `registration-${randomUUID()}@test.local`,
          firstName: "Awa",
          lastName: "Student",
          kind: "student",
          roles: ["student"],
        },
      }),
      prisma.person.create({
        data: {
          email: `registration-${randomUUID()}@test.local`,
          firstName: "Moussa",
          lastName: "Student",
          kind: "student",
          roles: ["student"],
        },
      }),
    ]);
    studentPersonId = studentPerson.id;
    const [student, noSlotStudent] = await Promise.all([
      prisma.student.create({
        data: {
          personId: studentPerson.id,
          studentNo: `T-${randomUUID()}`,
          programId: summerProgram.id,
          catalogYearId: year.id,
          catalogYear: year.label,
          yearLevel: 1,
          recordStatus: "active",
        },
      }),
      prisma.student.create({
        data: {
          personId: noSlotPerson.id,
          studentNo: `T-${randomUUID()}`,
          programId: noSlotProgram.id,
          catalogYearId: year.id,
          catalogYear: year.label,
          yearLevel: 1,
          recordStatus: "active",
        },
      }),
    ]);
    studentId = student.id;
    noSlotStudentId = noSlotStudent.id;
    const defaultLevels = Array.from({ length: 8 }, (_, index) => ({
      code: `S${index + 1}`,
      name: `Semester ${index + 1}`,
      creditCeiling: (index + 1) * 30,
    }));
    await prisma.academicCatalogRevision.create({
      data: {
        academicYearId: year.id,
        revision: 1,
        status: "approved",
        yearLabel: year.label,
        startsOn: year.startsOn,
        endsOn: year.endsOn,
        defaultLevels,
        programConfigurations: [
          {
            programId: summerProgram.id,
            programCode: summerProgram.code,
            programName: summerProgram.name,
            progressionMode: "default",
            customLevels: [],
            requirements: [{ category: "Degree", requiredCredits: 3 }],
            curriculum: [
              {
                courseId: summerCourse.id,
                courseCode: summerCourse.code,
                yearIndex: 1,
                semester: "Summer",
                position: 0,
              },
            ],
            standingMode: "default",
            customStandingRules: [],
          },
          {
            programId: noSlotProgram.id,
            programCode: noSlotProgram.code,
            programName: noSlotProgram.name,
            progressionMode: "default",
            customLevels: [],
            requirements: [{ category: "Degree", requiredCredits: 3 }],
            curriculum: [
              {
                courseId: fallCourse.id,
                courseCode: fallCourse.code,
                yearIndex: 1,
                semester: "Fall",
                position: 0,
              },
            ],
            standingMode: "default",
            customStandingRules: [],
          },
        ],
        approvedAt: new Date("2099-04-01T00:00:00.000Z"),
      },
    });
    await prisma.appSetting.create({
      data: {
        key: REGISTRATION_CONFIGURATION_KEY,
        valueJson: { termId: term.id, recommendationsEnabled: true },
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("folds multiple Summer sections into one approved-plan recommendation", async () => {
    const result = await academics.registrationCatalog(studentId);
    expect(result.recommendationContext).toMatchObject({
      status: "ready",
      semester: "Summer",
      targetYearIndex: 1,
    });
    expect(result.recommendations).toEqual([
      expect.objectContaining({
        courseCode: "CSC 101S",
        kind: "scheduled",
        sectionIds: recommendedSectionIds,
        availableSectionIds: recommendedSectionIds,
      }),
    ]);
  });

  it("returns missing_plan_position for a configured Summer term with no Summer plan slot", async () => {
    await expect(
      academics.registrationCatalog(noSlotStudentId),
    ).resolves.toMatchObject({
      recommendationContext: {
        status: "missing_plan_position",
        basis: null,
        targetYearIndex: null,
        semester: "Summer",
      },
      recommendations: [],
    });
  });

  it("enforces the configured term while an explicit close leaves override requests independent", async () => {
    await expect(academics.enroll(studentId, otherSectionId)).rejects.toThrow(
      /designated self-service registration term/i,
    );

    await prisma.appSetting.update({
      where: { key: REGISTRATION_CONFIGURATION_KEY },
      data: {
        valueJson: { termId: null, recommendationsEnabled: false },
      },
    });
    await prisma.studentHold.create({
      data: { studentId, type: "financial", reason: "Integration fixture" },
    });
    await expect(
      academics.enroll(studentId, recommendedSectionIds[0]!),
    ).rejects.toThrow(/registration is closed/i);
    const requested = await overrides.request(
      {
        personId: studentPersonId,
        studentId,
        roles: ["student"],
      } as AuthUser,
      {
        sectionId: recommendedSectionIds[0]!,
        reason: "Request reviewed exception",
        requestedWaivers: ["holds"],
      },
    );
    expect(requested.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ gate: "holds" })]),
    );
  });

  it("serializes concurrent disjoint-section requests for one student's credit cap", async () => {
    await prisma.studentHold.deleteMany({ where: { studentId } });
    await prisma.appSetting.update({
      where: { key: REGISTRATION_CONFIGURATION_KEY },
      data: {
        valueJson: { termId, recommendationsEnabled: true },
      },
    });
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: "CSE" },
    });
    const [existingCourse, highA, highB] = await Promise.all([
      prisma.course.create({
        data: {
          code: "LOAD 007",
          title: "Existing load",
          credits: 7,
          departmentId: department.id,
        },
      }),
      prisma.course.create({
        data: {
          code: "LOAD 012A",
          title: "Concurrent A",
          credits: 12,
          departmentId: department.id,
        },
      }),
      prisma.course.create({
        data: {
          code: "LOAD 012B",
          title: "Concurrent B",
          credits: 12,
          departmentId: department.id,
        },
      }),
    ]);
    const [existingSection, sectionA, sectionB] = await Promise.all([
      prisma.section.create({
        data: {
          courseId: existingCourse.id,
          termId,
          sectionCode: "01",
          capacity: 30,
          days: "T",
          startTime: "12:00",
          endTime: "13:00",
        },
      }),
      prisma.section.create({
        data: {
          courseId: highA.id,
          termId,
          sectionCode: "01",
          capacity: 30,
          days: "W",
          startTime: "12:00",
          endTime: "13:00",
        },
      }),
      prisma.section.create({
        data: {
          courseId: highB.id,
          termId,
          sectionCode: "01",
          capacity: 30,
          days: "R",
          startTime: "12:00",
          endTime: "13:00",
        },
      }),
    ]);
    await prisma.enrollment.create({
      data: { studentId, sectionId: existingSection.id },
    });

    const results = await Promise.allSettled([
      academics.enrollBundle(studentId, [sectionA.id]),
      academics.enrollBundle(studentId, [sectionB.id]),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await prisma.enrollment.count({
        where: {
          studentId,
          status: "enrolled",
          sectionId: { in: [sectionA.id, sectionB.id] },
        },
      }),
    ).toBe(1);
  });

  it("rolls back earlier enrollment and audit writes when a later bundle insert fails", async () => {
    await prisma.appSetting.update({
      where: { key: REGISTRATION_CONFIGURATION_KEY },
      data: {
        valueJson: { termId, recommendationsEnabled: true },
      },
    });
    const [department, program] = await Promise.all([
      prisma.department.findUniqueOrThrow({ where: { code: "CSE" } }),
      prisma.program.findUniqueOrThrow({ where: { code: "BSCSS" } }),
    ]);
    const person = await prisma.person.create({
      data: {
        email: `registration-${randomUUID()}@test.local`,
        firstName: "Atomic",
        lastName: "Rollback",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: `T-${randomUUID()}`,
        programId: program.id,
        yearLevel: 1,
        recordStatus: "active",
      },
    });
    const [validCourse, failingCourse] = await Promise.all([
      prisma.course.create({
        data: {
          code: "ROLL 101",
          title: "Valid bundle member",
          credits: 3,
          departmentId: department.id,
        },
      }),
      prisma.course.create({
        data: {
          code: "ROLL 102",
          title: "Database-rejected bundle member",
          credits: 3,
          departmentId: department.id,
        },
      }),
    ]);
    const [validSection, failingSection] = await Promise.all([
      prisma.section.create({
        data: {
          courseId: validCourse.id,
          termId,
          sectionCode: "01",
          capacity: 30,
          days: "M",
          startTime: "15:00",
          endTime: "16:00",
        },
      }),
      prisma.section.create({
        data: {
          courseId: failingCourse.id,
          termId,
          sectionCode: "01",
          capacity: 30,
          days: "T",
          startTime: "15:00",
          endTime: "16:00",
        },
      }),
    ]);

    // All authoritative gates pass. Force only the second database insert to
    // fail, after the service has inserted the first Enrollment and AuditLog,
    // so this exercises PostgreSQL rollback rather than only pre-write gate
    // ordering. The entire test runs in its own disposable schema.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "reject_later_bundle_member"() RETURNS trigger AS $$
      BEGIN
        IF NEW."sectionId" = '${failingSection.id}' THEN
          RAISE EXCEPTION 'forced bundle member failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "reject_later_bundle_member_trigger"
      BEFORE INSERT ON "Enrollment"
      FOR EACH ROW EXECUTE FUNCTION "reject_later_bundle_member"()
    `);

    await expect(
      academics.enrollBundle(student.id, [validSection.id, failingSection.id]),
    ).rejects.toThrow(/forced bundle member failure/i);
    expect(
      await prisma.enrollment.count({
        where: {
          studentId: student.id,
          sectionId: { in: [validSection.id, failingSection.id] },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { entity: "Enrollment", actorId: student.id },
      }),
    ).toBe(0);
  });

  it("keeps a different section of an already-held course non-waivable for overrides", async () => {
    const program = await prisma.program.findUniqueOrThrow({
      where: { code: "BSCSS" },
    });
    const person = await prisma.person.create({
      data: {
        email: `registration-${randomUUID()}@test.local`,
        firstName: "Duplicate",
        lastName: "Course",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: `T-${randomUUID()}`,
        programId: program.id,
        yearLevel: 1,
        recordStatus: "active",
      },
    });
    await prisma.enrollment.create({
      data: { studentId: student.id, sectionId: recommendedSectionIds[0]! },
    });

    await expect(
      overrides.request(
        {
          personId: person.id,
          studentId: student.id,
          roles: ["student"],
        } as AuthUser,
        {
          sectionId: recommendedSectionIds[1]!,
          reason: "Try a duplicate section override",
          requestedWaivers: ["capacity"],
        },
      ),
    ).rejects.toThrow(/Already enrolled in CSC 101S/);
    expect(
      await prisma.enrollment.count({
        where: {
          studentId: student.id,
          status: "enrolled",
          section: { course: { code: "CSC 101S" } },
        },
      }),
    ).toBe(1);
  });
});

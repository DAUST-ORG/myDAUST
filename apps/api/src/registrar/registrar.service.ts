import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { computeGpa } from "../academics/academics.service.js";

/** Defaults for the early-alert thresholds shown on Student Success. */
const DEFAULT_MIN_GPA = 2.5;
const DEFAULT_MIN_ATTENDANCE = 75;

@Injectable()
export class RegistrarService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Departments --------------------------------------------------------

  async listDepartments() {
    const departments = await this.prisma.department.findMany({
      orderBy: { code: "asc" },
      include: { _count: { select: { programs: true, courses: true } } },
    });
    return departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      head: d.head,
      programs: d._count.programs,
      courses: d._count.courses,
    }));
  }

  async upsertDepartment(
    actorId: string,
    input: { id?: string; code: string; name: string; head?: string | null },
  ) {
    const data = { code: input.code.trim(), name: input.name.trim(), head: input.head ?? null };
    const dept = input.id
      ? await this.prisma.department.update({ where: { id: input.id }, data })
      : await this.prisma.department.create({ data });
    await this.prisma.auditLog.create({
      data: {
        entity: "Department",
        entityId: dept.id,
        action: input.id ? "updated" : "created",
        actorId,
        data: { code: dept.code },
      },
    });
    return dept;
  }

  // --- Academic years -----------------------------------------------------

  async listAcademicYears() {
    return this.prisma.academicYear.findMany({
      orderBy: { label: "asc" },
      include: { _count: { select: { terms: true } } },
    });
  }

  async createAcademicYear(actorId: string, label: string) {
    const year = await this.prisma.academicYear.create({ data: { label: label.trim() } });
    await this.prisma.auditLog.create({
      data: { entity: "AcademicYear", entityId: year.id, action: "created", actorId, data: { label } },
    });
    return year;
  }

  /** Activating a year archives whichever year was active — only one at a time. */
  async activateAcademicYear(actorId: string, id: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException("Academic year not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { status: "active", id: { not: id } },
        data: { status: "archived" },
      });
      await tx.academicYear.update({ where: { id }, data: { status: "active" } });
      await tx.auditLog.create({
        data: {
          entity: "AcademicYear",
          entityId: id,
          action: "activated",
          actorId,
          data: { label: year.label },
        },
      });
    });
    return { ok: true };
  }

  // --- Grading schemes ----------------------------------------------------

  async listGradingSchemes() {
    return this.prisma.gradingScheme.findMany({
      orderBy: { key: "asc" },
      include: { rows: { orderBy: { position: "asc" } } },
    });
  }

  // --- Rule engine --------------------------------------------------------

  async listCourseRules() {
    const courses = await this.prisma.course.findMany({
      orderBy: { code: "asc" },
      include: {
        rule: true,
        prereqRules: { include: { prereqCourse: true } },
        coreqRules: { include: { coreqCourse: true } },
      },
    });
    return courses.map((c) => ({
      courseId: c.id,
      code: c.code,
      title: c.title,
      credits: c.credits,
      prerequisites: c.prereqRules.map((p) => ({
        code: p.prereqCourse.code,
        minGrade: p.minGrade,
      })),
      corequisites: c.coreqRules.map((p) => p.coreqCourse.code),
      standingRequired: c.rule?.standingRequired ?? null,
      majorRestriction: c.rule?.majorRestriction ?? null,
      capacity: c.rule?.capacity ?? null,
      waitlistEnabled: c.rule?.waitlistEnabled ?? false,
    }));
  }

  async setCourseRule(
    actorId: string,
    courseId: string,
    input: {
      standingRequired?: string | null;
      majorRestriction?: string | null;
      capacity?: number | null;
      waitlistEnabled?: boolean;
    },
  ) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException("Course not found");

    const rule = await this.prisma.courseRule.upsert({
      where: { courseId },
      update: input,
      create: { courseId, ...input },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "CourseRule",
        entityId: rule.id,
        action: "updated",
        actorId,
        data: { course: course.code, ...input },
      },
    });
    return rule;
  }

  // --- Grade approvals ----------------------------------------------------

  async listGradeSubmissions() {
    const submissions = await this.prisma.gradeSubmission.findMany({
      orderBy: { submittedAt: "desc" },
      include: {
        section: {
          include: {
            course: true,
            term: true,
            instructor: true,
            _count: { select: { enrollments: { where: { status: "enrolled" } } } },
          },
        },
      },
    });
    return submissions.map((s) => ({
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt,
      approvedAt: s.approvedAt,
      note: s.note,
      course: `${s.section.course.code} — ${s.section.course.title}`,
      sectionCode: s.section.sectionCode,
      term: s.section.term.name,
      instructor: s.section.instructor
        ? `${s.section.instructor.firstName} ${s.section.instructor.lastName}`
        : null,
      students: s.section._count.enrollments,
    }));
  }

  /**
   * Approve or return a section's submitted grades. Grades only count toward a
   * transcript once approved, so this is the registrar's gate on faculty entry.
   */
  async decideGradeSubmission(
    actorId: string,
    id: string,
    decision: "approved" | "returned",
    note?: string,
  ) {
    const submission = await this.prisma.gradeSubmission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException("Grade submission not found");
    if (submission.status !== "submitted") {
      throw new BadRequestException("Only submitted grades can be approved or returned");
    }

    const updated = await this.prisma.gradeSubmission.update({
      where: { id },
      data: {
        status: decision,
        approvedById: actorId,
        approvedAt: new Date(),
        note: note ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "GradeSubmission",
        entityId: id,
        action: `grades-${decision}`,
        actorId,
        data: { sectionId: submission.sectionId, note: note ?? null },
      },
    });
    return updated;
  }

  // --- Student success (early alert) --------------------------------------

  /**
   * Students below the GPA or attendance threshold. Computed live rather than
   * stored, so the list always reflects current grades and attendance.
   */
  async studentSuccess(minGpa = DEFAULT_MIN_GPA, minAttendance = DEFAULT_MIN_ATTENDANCE) {
    const students = await this.prisma.student.findMany({
      include: {
        person: true,
        program: true,
        enrollments: {
          include: { section: { include: { course: true } }, attendance: true },
        },
        alerts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const rows = students.map((s) => {
      const graded = s.enrollments
        .filter((e) => e.status === "completed" && e.grade)
        .map((e) => ({ grade: e.grade!, credits: e.section.course.credits }));
      const { gpa } = computeGpa(graded);

      const records = s.enrollments.flatMap((e) => e.attendance);
      const present = records.filter((a) => a.status === "present").length;
      const late = records.filter((a) => a.status === "late").length;
      const attendance =
        records.length === 0 ? null : Math.round(((present + late * 0.5) / records.length) * 100);

      const flags: string[] = [];
      // A student with no graded credits yet is not "below" the GPA bar.
      if (graded.length > 0 && gpa < minGpa) flags.push(`GPA ${gpa.toFixed(2)} below ${minGpa}`);
      if (attendance !== null && attendance < minAttendance) {
        flags.push(`Attendance ${attendance}% below ${minAttendance}%`);
      }

      return {
        studentId: s.id,
        studentNo: s.studentNo,
        name: `${s.person.firstName} ${s.person.lastName}`,
        program: s.program?.name ?? null,
        gpa,
        attendance,
        flags,
        lastWarnedAt: s.alerts[0]?.warnedAt ?? null,
      };
    });

    return {
      thresholds: { minGpa, minAttendance },
      flagged: rows.filter((r) => r.flags.length > 0),
      total: rows.length,
    };
  }

  /** Record that a flagged student has been warned, so the list shows follow-up. */
  async warnStudent(actorId: string, studentId: string, reason: string) {
    const alert = await this.prisma.studentAlert.create({
      data: { studentId, reason, level: "warning", warnedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "StudentAlert",
        entityId: alert.id,
        action: "student-warned",
        actorId,
        data: { studentId, reason },
      },
    });
    return alert;
  }

  // --- Academic calendar --------------------------------------------------

  async listCalendar(academicYearId?: string) {
    const yearId =
      academicYearId ??
      (await this.prisma.academicYear.findFirst({ where: { status: "active" } }))?.id;
    if (!yearId) return [];
    return this.prisma.calendarEvent.findMany({
      where: { academicYearId: yearId },
      orderBy: { startsOn: "asc" },
    });
  }

  async createCalendarEvent(
    actorId: string,
    input: { academicYearId: string; title: string; type: string; startsOn: string; endsOn?: string; note?: string },
  ) {
    const event = await this.prisma.calendarEvent.create({
      data: {
        academicYearId: input.academicYearId,
        title: input.title,
        type: input.type,
        startsOn: new Date(input.startsOn),
        endsOn: input.endsOn ? new Date(input.endsOn) : null,
        note: input.note ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "CalendarEvent", entityId: event.id, action: "created", actorId, data: { title: input.title } },
    });
    return event;
  }
}

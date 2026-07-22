import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@mydaust/db";
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

  /** Remove a department. Refused while it still owns programmes or courses. */
  async deleteDepartment(actorId: string, id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { programs: true, courses: true } } },
    });
    if (!dept) throw new NotFoundException("Department not found");
    if (dept._count.programs > 0 || dept._count.courses > 0) {
      throw new BadRequestException("Reassign this department's programmes and courses before deleting it");
    }
    await this.prisma.department.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { entity: "Department", entityId: id, action: "deleted", actorId, data: { code: dept.code } },
    });
    return { ok: true };
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

  /** Append a grade row to a scheme, placing it after the current last row. */
  async addGradeRow(
    actorId: string,
    schemeId: string,
    input: { grade: string; points: number | null; minScore: number | null; maxScore: number | null },
  ) {
    const scheme = await this.prisma.gradingScheme.findUnique({ where: { id: schemeId } });
    if (!scheme) throw new NotFoundException("Grading scheme not found");
    const last = await this.prisma.gradeScaleRow.findFirst({
      where: { schemeId },
      orderBy: { position: "desc" },
    });
    const row = await this.prisma.gradeScaleRow.create({
      data: { schemeId, ...input, position: (last?.position ?? -1) + 1 },
    });
    await this.audit("GradeScaleRow", row.id, "created", actorId, { scheme: scheme.key, grade: input.grade });
    return row;
  }

  async updateGradeRow(
    actorId: string,
    rowId: string,
    input: { grade?: string; points?: number | null; minScore?: number | null; maxScore?: number | null },
  ) {
    const existing = await this.prisma.gradeScaleRow.findUnique({ where: { id: rowId } });
    if (!existing) throw new NotFoundException("Grade row not found");
    const row = await this.prisma.gradeScaleRow.update({ where: { id: rowId }, data: input });
    await this.audit("GradeScaleRow", rowId, "updated", actorId, { grade: row.grade });
    return row;
  }

  async deleteGradeRow(actorId: string, rowId: string) {
    const existing = await this.prisma.gradeScaleRow.findUnique({ where: { id: rowId } });
    if (!existing) throw new NotFoundException("Grade row not found");
    await this.prisma.gradeScaleRow.delete({ where: { id: rowId } });
    await this.audit("GradeScaleRow", rowId, "deleted", actorId, { grade: existing.grade });
    return { ok: true };
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

  /**
   * Replace a course's prerequisites and corequisites, addressed by course code.
   * Prereqs carry an optional minimum grade; the pair is resolved to course ids
   * here so the client only ever deals in codes. `enroll()` reads these rows and
   * enforces them, so editing here changes the real gate, not just the display.
   */
  async setCourseRequisites(
    actorId: string,
    courseId: string,
    input: { prerequisites: { code: string; minGrade?: string | null }[]; corequisites: string[] },
  ) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException("Course not found");

    const codes = [...input.prerequisites.map((p) => p.code), ...input.corequisites];
    const referenced = await this.prisma.course.findMany({ where: { code: { in: codes } } });
    const idByCode = new Map(referenced.map((c) => [c.code, c.id]));
    const missing = codes.filter((c) => !idByCode.has(c));
    if (missing.length > 0) throw new BadRequestException(`Unknown course code(s): ${missing.join(", ")}`);
    if (input.prerequisites.some((p) => idByCode.get(p.code) === courseId) || input.corequisites.includes(course.code)) {
      throw new BadRequestException("A course cannot be its own prerequisite or corequisite");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.coursePrerequisite.deleteMany({ where: { courseId } });
      await tx.courseCorequisite.deleteMany({ where: { courseId } });
      for (const p of input.prerequisites) {
        await tx.coursePrerequisite.create({
          data: { courseId, prereqCourseId: idByCode.get(p.code)!, minGrade: p.minGrade ?? null },
        });
      }
      for (const code of input.corequisites) {
        await tx.courseCorequisite.create({ data: { courseId, coreqCourseId: idByCode.get(code)! } });
      }
    });
    await this.audit("Course", courseId, "requisites-updated", actorId, {
      course: course.code,
      prerequisites: input.prerequisites,
      corequisites: input.corequisites,
    });
    return { ok: true };
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
            enrollments: {
              where: { status: { in: ["enrolled", "completed"] } },
              include: { student: { include: { person: true } } },
            },
          },
        },
      },
    });
    return submissions.map((s) => {
      const roster = s.section.enrollments;
      const grades = roster.map((e) => ({
        name: `${e.student.person.firstName} ${e.student.person.lastName}`,
        grade: e.grade,
      }));
      return {
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
        students: roster.length,
        graded: grades.filter((g) => g.grade).length,
        grades,
      };
    });
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
  async studentSuccess(actorId: string, minGpa = DEFAULT_MIN_GPA, minAttendance = DEFAULT_MIN_ATTENDANCE) {
    const [students, watched, warningsSent] = await Promise.all([
      this.prisma.student.findMany({
        include: {
          person: true,
          program: true,
          enrollments: {
            include: { section: { include: { course: true } }, attendance: true },
          },
          alerts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      this.prisma.staffWatch.findMany({ where: { personId: actorId }, select: { studentId: true } }),
      this.prisma.studentAlert.count({ where: { warnedAt: { not: null } } }),
    ]);
    const watchedIds = new Set(watched.map((w) => w.studentId));

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
      const gpaFlagged = graded.length > 0 && gpa < minGpa;
      if (gpaFlagged) flags.push(`GPA ${gpa.toFixed(2)} below ${minGpa}`);
      if (attendance !== null && attendance < minAttendance) {
        flags.push(`Attendance ${attendance}% below ${minAttendance}%`);
      }

      // Critical ("At risk") once a student misses both bars, or sits well under
      // either; a single, milder breach is a "Watch".
      const severe = (gpaFlagged && gpa < 2.0) || (attendance !== null && attendance < 60);
      const level = flags.length >= 2 || severe ? "critical" : "warning";

      return {
        studentId: s.id,
        studentNo: s.studentNo,
        name: `${s.person.firstName} ${s.person.lastName}`,
        program: s.program?.name ?? null,
        gpa,
        attendance,
        flags,
        level,
        watching: watchedIds.has(s.id),
        lastWarnedAt: s.alerts[0]?.warnedAt ?? null,
      };
    });

    const flagged = rows.filter((r) => r.flags.length > 0);
    return {
      thresholds: { minGpa, minAttendance },
      flagged,
      total: rows.length,
      atRisk: flagged.filter((r) => r.level === "critical").length,
      watch: flagged.filter((r) => r.level === "warning").length,
      warningsSent,
    };
  }

  /** Record that a flagged student has been warned, so the list shows follow-up. */
  async warnStudent(actorId: string, studentId: string, reason: string, level = "warning") {
    const alert = await this.prisma.studentAlert.create({
      data: { studentId, reason, level, warnedAt: new Date() },
    });
    await this.audit("StudentAlert", alert.id, "student-warned", actorId, { studentId, reason, level });
    return alert;
  }

  /** The caller's early-alert watchlist — a personal follow list, not a shared flag. */
  async listWatching(personId: string) {
    const rows = await this.prisma.staffWatch.findMany({
      where: { personId },
      include: { student: { include: { person: true, program: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((w) => ({
      studentId: w.studentId,
      studentNo: w.student.studentNo,
      name: `${w.student.person.firstName} ${w.student.person.lastName}`,
      program: w.student.program?.name ?? null,
    }));
  }

  async watchStudent(personId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException("Student not found");
    await this.prisma.staffWatch.upsert({
      where: { personId_studentId: { personId, studentId } },
      update: {},
      create: { personId, studentId },
    });
    return { ok: true };
  }

  async unwatchStudent(personId: string, studentId: string) {
    await this.prisma.staffWatch.deleteMany({ where: { personId, studentId } });
    return { ok: true };
  }

  /** Recent warnings across all students, for the "Warnings sent" panel. */
  async listWarnings(limit = 25) {
    const alerts = await this.prisma.studentAlert.findMany({
      where: { warnedAt: { not: null } },
      orderBy: { warnedAt: "desc" },
      take: limit,
      include: { student: { include: { person: true } } },
    });
    return alerts.map((a) => ({
      id: a.id,
      name: `${a.student.person.firstName} ${a.student.person.lastName}`,
      studentNo: a.student.studentNo,
      reason: a.reason,
      level: a.level,
      warnedAt: a.warnedAt,
    }));
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
    await this.audit("CalendarEvent", event.id, "created", actorId, { title: input.title });
    return event;
  }

  async updateCalendarEvent(
    actorId: string,
    id: string,
    input: { title?: string; type?: string; startsOn?: string; endsOn?: string | null; note?: string | null },
  ) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Calendar event not found");
    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.startsOn !== undefined ? { startsOn: new Date(input.startsOn) } : {}),
        ...(input.endsOn !== undefined ? { endsOn: input.endsOn ? new Date(input.endsOn) : null } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
    await this.audit("CalendarEvent", id, "updated", actorId, { title: event.title });
    return event;
  }

  async deleteCalendarEvent(actorId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Calendar event not found");
    await this.prisma.calendarEvent.delete({ where: { id } });
    await this.audit("CalendarEvent", id, "deleted", actorId, { title: existing.title });
    return { ok: true };
  }

  // --- Terms --------------------------------------------------------------

  async listTerms() {
    const terms = await this.prisma.term.findMany({
      orderBy: { startDate: "asc" },
      include: { academicYear: true },
    });
    return terms.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      startDate: t.startDate,
      endDate: t.endDate,
      addDeadline: t.addDeadline,
      dropDeadline: t.dropDeadline,
      academicYear: t.academicYear?.label ?? null,
    }));
  }

  /** Only one term is "active" at a time — activating one demotes any other. */
  async updateTerm(
    actorId: string,
    id: string,
    input: { status?: string; startDate?: string; endDate?: string; addDeadline?: string | null; dropDeadline?: string | null },
  ) {
    const existing = await this.prisma.term.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Term not found");

    const term = await this.prisma.$transaction(async (tx) => {
      if (input.status === "active") {
        await tx.term.updateMany({ where: { status: "active", id: { not: id } }, data: { status: "planning" } });
      }
      return tx.term.update({
        where: { id },
        data: {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
          ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
          ...(input.addDeadline !== undefined ? { addDeadline: input.addDeadline ? new Date(input.addDeadline) : null } : {}),
          ...(input.dropDeadline !== undefined ? { dropDeadline: input.dropDeadline ? new Date(input.dropDeadline) : null } : {}),
        },
      });
    });
    await this.audit("Term", id, "updated", actorId, { name: term.name, status: term.status });
    return term;
  }

  // --- Curriculum (per programme × catalogue year course map) -------------

  async getCurriculum(programCode: string, academicYearId: string) {
    const [program, year, courses] = await Promise.all([
      this.prisma.program.findUnique({ where: { code: programCode } }),
      this.prisma.academicYear.findUnique({ where: { id: academicYearId } }),
      this.prisma.course.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, title: true, credits: true } }),
    ]);
    if (!program) throw new NotFoundException("Programme not found");
    if (!year) throw new NotFoundException("Academic year not found");
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { programId_academicYearId: { programId: program.id, academicYearId } },
      include: { entries: { include: { course: true }, orderBy: { position: "asc" } } },
    });
    return {
      programCode,
      academicYearId,
      entries: (curriculum?.entries ?? []).map((e) => ({
        yearIndex: e.yearIndex,
        semester: e.semester,
        courseCode: e.course.code,
        courseTitle: e.course.title,
        credits: e.course.credits,
      })),
      allCourses: courses,
    };
  }

  /** Replace the whole course map for a programme/year in one shot. */
  async saveCurriculum(
    actorId: string,
    programCode: string,
    academicYearId: string,
    entries: { yearIndex: number; semester: string; courseCode: string }[],
  ) {
    const program = await this.prisma.program.findUnique({ where: { code: programCode } });
    if (!program) throw new NotFoundException("Programme not found");
    const programId = program.id;
    const codes = [...new Set(entries.map((e) => e.courseCode))];
    const courses = await this.prisma.course.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const idByCode = new Map(courses.map((c) => [c.code, c.id]));
    const missing = codes.filter((c) => !idByCode.has(c));
    if (missing.length > 0) throw new BadRequestException(`Unknown course code(s): ${missing.join(", ")}`);

    await this.prisma.$transaction(async (tx) => {
      const curriculum = await tx.curriculum.upsert({
        where: { programId_academicYearId: { programId, academicYearId } },
        update: {},
        create: { programId, academicYearId },
      });
      await tx.curriculumEntry.deleteMany({ where: { curriculumId: curriculum.id } });
      await tx.curriculumEntry.createMany({
        data: entries.map((e, i) => ({
          curriculumId: curriculum.id,
          yearIndex: e.yearIndex,
          semester: e.semester,
          courseId: idByCode.get(e.courseCode)!,
          position: i,
        })),
      });
    });
    await this.audit("Curriculum", `${programCode}:${academicYearId}`, "saved", actorId, { entries: entries.length });
    return { ok: true };
  }

  private audit(entity: string, entityId: string, action: string, actorId: string, data: object) {
    return this.prisma.auditLog.create({
      data: { entity, entityId, action, actorId, data: data as Prisma.InputJsonValue },
    });
  }
}

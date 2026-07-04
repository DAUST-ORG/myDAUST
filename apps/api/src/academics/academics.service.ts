import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export const GRADE_POINTS: Record<string, number> = {
  A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7, D: 1.0, F: 0.0,
};

export function computeGpa(rows: { grade: string; credits: number }[]) {
  let points = 0;
  let completedCredits = 0;
  for (const r of rows) {
    const gp = GRADE_POINTS[r.grade];
    if (gp === undefined) continue;
    points += gp * r.credits;
    completedCredits += r.credits;
  }
  return {
    gpa: completedCredits === 0 ? 0 : Math.round((points / completedCredits) * 100) / 100,
    completedCredits,
  };
}

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active/upcoming term (the one registration targets). */
  async currentTerm() {
    const now = new Date();
    const upcoming = await this.prisma.term.findFirst({
      where: { endDate: { gte: now } },
      orderBy: { startDate: "asc" },
    });
    return upcoming ?? this.prisma.term.findFirst({ orderBy: { startDate: "desc" } });
  }

  /** Sections offered in a term, with live seat availability. */
  async listSections(termId: string) {
    const sections = await this.prisma.section.findMany({
      where: { termId },
      orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
      include: {
        course: { include: { prerequisites: true } },
        instructor: true,
        _count: { select: { enrollments: { where: { status: "enrolled" } } } },
      },
    });
    return sections.map((s) => ({
      id: s.id,
      courseCode: s.course.code,
      title: s.course.title,
      credits: s.course.credits,
      sectionCode: s.sectionCode,
      capacity: s.capacity,
      seatsTaken: s._count.enrollments,
      seatsLeft: s.capacity - s._count.enrollments,
      schedule: `${s.days} ${s.startTime}–${s.endTime}`,
      room: s.room,
      instructor: s.instructor ? `${s.instructor.firstName} ${s.instructor.lastName}` : null,
      prerequisites: s.course.prerequisites.map((p) => p.code),
    }));
  }

  /**
   * Enroll a student into a section. Seat-safe under concurrency: a row-level lock on the
   * Section (SELECT ... FOR UPDATE) inside an interactive transaction serializes racing
   * enrollments so the last seat can't be oversold. Also checks prerequisites + duplicates.
   */
  async enroll(studentId: string, sectionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string; capacity: number; courseId: string; termId: string }[]
      >`SELECT id, capacity, "courseId", "termId" FROM "Section" WHERE id = ${sectionId} FOR UPDATE`;
      const section = locked[0];
      if (!section) throw new NotFoundException("Section not found");

      const term = await tx.term.findUniqueOrThrow({ where: { id: section.termId } });
      if (term.endDate.getTime() < Date.now()) {
        throw new BadRequestException("Registration is closed for this term");
      }
      // Add window: explicit deadline when set, else open until term end.
      if (term.addDeadline && term.addDeadline.getTime() < Date.now()) {
        throw new BadRequestException(
          `The add period for ${term.name} closed on ${term.addDeadline.toISOString().slice(0, 10)}`,
        );
      }

      const existing = await tx.enrollment.findUnique({
        where: { studentId_sectionId: { studentId, sectionId } },
      });
      if (existing?.status === "enrolled") throw new ConflictException("Already enrolled");

      const taken = await tx.enrollment.count({ where: { sectionId, status: "enrolled" } });
      if (taken >= section.capacity) throw new ConflictException("Section is full");

      const course = await tx.course.findUniqueOrThrow({
        where: { id: section.courseId },
        include: { prerequisites: true },
      });
      if (course.prerequisites.length > 0) {
        const completed = await tx.enrollment.findMany({
          where: { studentId, status: "completed" },
          include: { section: true },
        });
        const done = new Set(completed.map((e) => e.section.courseId));
        const missing = course.prerequisites.filter((p) => !done.has(p.id));
        if (missing.length > 0) {
          throw new BadRequestException(
            `Missing prerequisite(s): ${missing.map((m) => m.code).join(", ")}`,
          );
        }
      }

      const enrollment = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status: "enrolled", enrolledAt: new Date() },
          })
        : await tx.enrollment.create({ data: { studentId, sectionId, status: "enrolled" } });

      await tx.auditLog.create({
        data: { entity: "Enrollment", entityId: enrollment.id, action: "enrolled", actorId: studentId },
      });
      return enrollment;
    });
  }

  async drop(studentId: string, enrollmentId: string) {
    const enr = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { section: { include: { term: true } } },
    });
    if (!enr) throw new NotFoundException("Enrollment not found");
    if (enr.studentId !== studentId) throw new ForbiddenException("Not your enrollment");
    if (enr.status !== "enrolled") throw new BadRequestException("Not an active enrollment");
    const { dropDeadline, name } = enr.section.term;
    if (dropDeadline && dropDeadline.getTime() < Date.now()) {
      throw new BadRequestException(
        `The drop period for ${name} closed on ${dropDeadline.toISOString().slice(0, 10)} — contact the registrar`,
      );
    }

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "dropped" },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Enrollment", entityId: enrollmentId, action: "dropped", actorId: studentId },
    });
    return updated;
  }

  /** A student's current (enrolled) schedule. */
  async myEnrollments(studentId: string) {
    const enr = await this.prisma.enrollment.findMany({
      where: { studentId, status: "enrolled" },
      include: { section: { include: { course: true, term: true } } },
      orderBy: { enrolledAt: "asc" },
    });
    return enr.map((e) => ({
      enrollmentId: e.id,
      sectionId: e.sectionId,
      courseCode: e.section.course.code,
      title: e.section.course.title,
      credits: e.section.course.credits,
      sectionCode: e.section.sectionCode,
      term: e.section.term.name,
      days: e.section.days,
      startTime: e.section.startTime,
      endTime: e.section.endTime,
      schedule: `${e.section.days} ${e.section.startTime}–${e.section.endTime}`,
      room: e.section.room,
    }));
  }

  private async assertSectionOwner(sectionId: string, personId: string, isAdmin: boolean) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true },
    });
    if (!section) throw new NotFoundException("Section not found");
    if (!isAdmin && section.instructorId !== personId) {
      throw new ForbiddenException("You do not teach this section");
    }
    return section;
  }

  /** Gradebook: enrolled students + their current (final) grade/status. Ownership-checked. */
  async getGradebook(sectionId: string, personId: string, isAdmin: boolean) {
    const section = await this.assertSectionOwner(sectionId, personId, isAdmin);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, status: { in: ["enrolled", "completed"] } },
      include: { student: { include: { person: true } } },
      orderBy: { student: { studentNo: "asc" } },
    });
    return {
      course: `${section.course.code} — ${section.course.title}`,
      sectionCode: section.sectionCode,
      students: enrollments.map((e) => ({
        enrollmentId: e.id,
        studentNo: e.student.studentNo,
        name: `${e.student.person.firstName} ${e.student.person.lastName}`,
        grade: e.grade,
        status: e.status,
      })),
    };
  }

  /** Submit/save grades for a section. finalize=true marks graded enrollments completed → GPA. */
  async submitGrades(
    sectionId: string,
    input: { grades: { enrollmentId: string; grade: string | null }[]; finalize: boolean },
    personId: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    await this.prisma.$transaction(async (tx) => {
      for (const g of input.grades) {
        await tx.enrollment.updateMany({
          where: { id: g.enrollmentId, sectionId },
          data: {
            grade: g.grade,
            ...(input.finalize ? { status: g.grade ? "completed" : "enrolled" } : {}),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "Section",
          entityId: sectionId,
          action: input.finalize ? "grades-finalized" : "grades-saved",
          actorId: personId,
          data: { count: input.grades.length },
        },
      });
    });
    return { ok: true, finalized: input.finalize };
  }

  /** Attendance for a section on a date: roster + recorded status. Ownership-checked. */
  async getAttendance(sectionId: string, date: string, personId: string, isAdmin: boolean) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const day = new Date(date);
    const [enrollments, records] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { sectionId, status: "enrolled" },
        include: { student: { include: { person: true } } },
        orderBy: { student: { studentNo: "asc" } },
      }),
      this.prisma.attendanceRecord.findMany({ where: { sectionId, date: day } }),
    ]);
    const byEnrollment = new Map(records.map((r) => [r.enrollmentId, r.status]));
    return {
      date,
      students: enrollments.map((e) => ({
        enrollmentId: e.id,
        studentNo: e.student.studentNo,
        name: `${e.student.person.firstName} ${e.student.person.lastName}`,
        status: byEnrollment.get(e.id) ?? "present",
      })),
    };
  }

  async markAttendance(
    sectionId: string,
    input: { date: string; records: { enrollmentId: string; status: string }[] },
    personId: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const day = new Date(input.date);
    await this.prisma.$transaction(
      input.records.map((r) =>
        this.prisma.attendanceRecord.upsert({
          where: { enrollmentId_date: { enrollmentId: r.enrollmentId, date: day } },
          update: { status: r.status as never },
          create: { enrollmentId: r.enrollmentId, sectionId, date: day, status: r.status as never },
        }),
      ),
    );
    return { ok: true };
  }

  // --- Coursework: assignments + submissions ---

  /** Faculty: assignments for a section, each with submission progress vs the enrolled roster. */
  async listSectionAssignments(sectionId: string, personId: string, isAdmin: boolean) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const [enrolled, assignments] = await Promise.all([
      // Roster that can submit = current + completed (matches the grading roster denominator).
      this.prisma.enrollment.count({ where: { sectionId, status: { in: ["enrolled", "completed"] } } }),
      this.prisma.assignment.findMany({
        where: { sectionId },
        orderBy: { dueDate: "asc" },
        include: { submissions: { select: { status: true } } },
      }),
    ]);
    return {
      enrolled,
      assignments: assignments.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        maxPoints: a.maxPoints,
        weight: a.weight,
        dueDate: a.dueDate,
        submitted: a.submissions.length,
        graded: a.submissions.filter((s) => s.status === "graded").length,
      })),
    };
  }

  async createAssignment(
    sectionId: string,
    input: { title: string; description?: string; type: string; maxPoints: number; weight: number; dueDate: string },
    personId: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const assignment = await this.prisma.assignment.create({
      data: {
        sectionId,
        title: input.title,
        description: input.description ?? null,
        type: input.type as never,
        maxPoints: input.maxPoints,
        weight: input.weight,
        dueDate: new Date(input.dueDate),
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Assignment", entityId: assignment.id, action: "created", actorId: personId },
    });
    return assignment;
  }

  /** Resolve an assignment + its section, enforcing instructor ownership. */
  private async assertAssignmentOwner(assignmentId: string, personId: string, isAdmin: boolean) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { section: { include: { course: true } } },
    });
    if (!assignment) throw new NotFoundException("Assignment not found");
    if (!isAdmin && assignment.section.instructorId !== personId) {
      throw new ForbiddenException("You do not teach this section");
    }
    return assignment;
  }

  /** Faculty: an assignment with the full roster joined to each student's submission (if any). */
  async getAssignmentSubmissions(assignmentId: string, personId: string, isAdmin: boolean) {
    const assignment = await this.assertAssignmentOwner(assignmentId, personId, isAdmin);
    const [enrollments, submissions] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { sectionId: assignment.sectionId, status: { in: ["enrolled", "completed"] } },
        include: { student: { include: { person: true } } },
        orderBy: { student: { studentNo: "asc" } },
      }),
      this.prisma.submission.findMany({ where: { assignmentId } }),
    ]);
    const byEnrollment = new Map(submissions.map((s) => [s.enrollmentId, s]));
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        type: assignment.type,
        maxPoints: assignment.maxPoints,
        weight: assignment.weight,
        dueDate: assignment.dueDate,
        course: `${assignment.section.course.code} — ${assignment.section.course.title}`,
        sectionId: assignment.sectionId,
      },
      submissions: enrollments.map((e) => {
        const s = byEnrollment.get(e.id);
        return {
          enrollmentId: e.id,
          studentNo: e.student.studentNo,
          name: `${e.student.person.firstName} ${e.student.person.lastName}`,
          submissionId: s?.id ?? null,
          status: s?.status ?? "assigned",
          text: s?.text ?? null,
          fileUrl: s?.fileUrl ?? null,
          fileName: s?.fileName ?? null,
          score: s?.score ?? null,
          feedback: s?.feedback ?? null,
          submittedAt: s?.submittedAt ?? null,
        };
      }),
    };
  }

  async gradeSubmission(
    submissionId: string,
    input: { score: number; feedback?: string },
    personId: string,
    isAdmin: boolean,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    await this.assertAssignmentOwner(submission.assignmentId, personId, isAdmin);
    if (input.score > submission.assignment.maxPoints) {
      throw new BadRequestException(`Score exceeds max points (${submission.assignment.maxPoints})`);
    }
    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        score: input.score,
        feedback: input.feedback ?? null,
        status: "graded",
        gradedAt: new Date(),
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Submission", entityId: submissionId, action: "graded", actorId: personId, data: { score: input.score } },
    });
    return updated;
  }

  /** Student: all assignments across enrolled sections, joined to my own submission. */
  async myAssignments(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: "enrolled" },
      include: {
        section: {
          include: {
            course: true,
            assignments: { orderBy: { dueDate: "asc" } },
          },
        },
        submissions: true,
      },
    });
    const byAssignment = new Map(
      enrollments.flatMap((e) => e.submissions.map((s) => [s.assignmentId, s])),
    );
    const rows = enrollments.flatMap((e) =>
      e.section.assignments.map((a) => {
        const s = byAssignment.get(a.id);
        return {
          assignmentId: a.id,
          title: a.title,
          type: a.type,
          courseCode: e.section.course.code,
          sectionId: e.sectionId,
          maxPoints: a.maxPoints,
          dueDate: a.dueDate,
          status: s?.status ?? "assigned",
          score: s?.score ?? null,
          feedback: s?.feedback ?? null,
          submittedAt: s?.submittedAt ?? null,
        };
      }),
    );
    rows.sort((x, y) => new Date(x.dueDate).getTime() - new Date(y.dueDate).getTime());
    return rows;
  }

  /** Student: submit (or resubmit) work for an assignment in a section I'm enrolled in. */
  async submitAssignment(
    studentId: string,
    assignmentId: string,
    input: { text?: string; fileUrl?: string; fileName?: string },
  ) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException("Assignment not found");
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_sectionId: { studentId, sectionId: assignment.sectionId } },
    });
    if (!enrollment || enrollment.status === "dropped") {
      throw new ForbiddenException("You are not enrolled in this section");
    }
    const data = {
      text: input.text?.trim() || null,
      fileUrl: input.fileUrl ?? null,
      fileName: input.fileName ?? null,
      status: "submitted" as const,
      submittedAt: new Date(),
    };
    return this.prisma.submission.upsert({
      where: { assignmentId_enrollmentId: { assignmentId, enrollmentId: enrollment.id } },
      update: data,
      create: { assignmentId, enrollmentId: enrollment.id, ...data },
    });
  }

  /** Student: course-detail tabs — section overview + my assignments + my grade for one section. */
  async courseDetail(studentId: string, sectionId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_sectionId: { studentId, sectionId } },
      include: {
        section: {
          include: {
            course: { include: { prerequisites: true } },
            term: true,
            instructor: true,
            assignments: { orderBy: { dueDate: "asc" } },
          },
        },
        submissions: true,
      },
    });
    if (!enrollment) throw new NotFoundException("You are not enrolled in this section");
    const s = enrollment.section;
    const byAssignment = new Map(enrollment.submissions.map((sub) => [sub.assignmentId, sub]));
    return {
      overview: {
        courseCode: s.course.code,
        title: s.course.title,
        credits: s.course.credits,
        description: null as string | null,
        term: s.term.name,
        instructor: s.instructor ? `${s.instructor.firstName} ${s.instructor.lastName}` : null,
        schedule: `${s.days} ${s.startTime}–${s.endTime}`,
        room: s.room,
        prerequisites: s.course.prerequisites.map((p) => p.code),
        status: enrollment.status,
        grade: enrollment.grade,
      },
      assignments: s.assignments.map((a) => {
        const sub = byAssignment.get(a.id);
        return {
          assignmentId: a.id,
          title: a.title,
          type: a.type,
          maxPoints: a.maxPoints,
          weight: a.weight,
          dueDate: a.dueDate,
          status: sub?.status ?? "assigned",
          score: sub?.score ?? null,
          feedback: sub?.feedback ?? null,
        };
      }),
    };
  }

  /** Roster for a section the requesting faculty actually teaches (ownership-checked). */
  async roster(sectionId: string, instructorPersonId: string, isAdmin: boolean) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true },
    });
    if (!section) throw new NotFoundException("Section not found");
    if (!isAdmin && section.instructorId !== instructorPersonId) {
      throw new ForbiddenException("You do not teach this section");
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, status: "enrolled" },
      include: { student: { include: { person: true } } },
    });
    return {
      course: `${section.course.code} — ${section.course.title}`,
      sectionCode: section.sectionCode,
      students: enrollments.map((e) => ({
        studentNo: e.student.studentNo,
        name: `${e.student.person.firstName} ${e.student.person.lastName}`,
        grade: e.grade,
      })),
    };
  }

  /** Student dashboard summary: course load + GPA. */
  async mySummary(studentId: string) {
    const [active, completed] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId, status: "enrolled" },
        include: { section: { include: { course: true } } },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId, status: "completed", grade: { not: null } },
        include: { section: { include: { course: true } } },
      }),
    ]);
    const credits = active.reduce((s, e) => s + e.section.course.credits, 0);
    const { gpa, completedCredits } = computeGpa(
      completed.map((e) => ({ grade: e.grade!, credits: e.section.course.credits })),
    );
    return { enrolledCourses: active.length, credits, gpa, completedCredits };
  }

  /** Completed courses with grades (transcript-lite). */
  async myGrades(studentId: string) {
    const completed = await this.prisma.enrollment.findMany({
      where: { studentId, status: "completed" },
      include: { section: { include: { course: true, term: true } } },
      orderBy: { enrolledAt: "desc" },
    });
    return completed.map((e) => ({
      courseCode: e.section.course.code,
      title: e.section.course.title,
      credits: e.section.course.credits,
      term: e.section.term.name,
      grade: e.grade,
      points: e.grade ? GRADE_POINTS[e.grade] ?? null : null,
    }));
  }

  /** Admin: enrollment stats + by-program breakdown. */
  async adminStats() {
    const [totalStudents, totalEnrolled, programs] = await Promise.all([
      this.prisma.student.count(),
      this.prisma.enrollment.count({ where: { status: "enrolled" } }),
      this.prisma.program.findMany({ include: { _count: { select: { students: true } } } }),
    ]);
    return {
      totalStudents,
      totalEnrolled,
      byProgram: programs.map((p) => ({ code: p.code, name: p.name, students: p._count.students })),
    };
  }

  /** Admin: student roster with program + outstanding balance. */
  async adminStudents() {
    const students = await this.prisma.student.findMany({
      include: { person: true, program: true, invoices: true },
      orderBy: { studentNo: "asc" },
    });
    return students.map((s) => ({
      id: s.id,
      studentNo: s.studentNo,
      name: `${s.person.firstName} ${s.person.lastName}`,
      program: s.program?.code ?? "—",
      balance: s.invoices.reduce((b, i) => b + (i.totalAmount - i.amountPaid), 0),
    }));
  }

  /** Admin: programs with course + student counts. */
  async adminPrograms() {
    const [programs, courses] = await Promise.all([
      this.prisma.program.findMany({
        include: { department: true, _count: { select: { students: true } } },
      }),
      this.prisma.course.findMany({ include: { _count: { select: { sections: true } } } }),
    ]);
    return {
      programs: programs.map((p) => ({
        code: p.code,
        name: p.name,
        department: p.department.name,
        students: p._count.students,
      })),
      courses: courses.map((c) => ({ code: c.code, title: c.title, credits: c.credits })),
    };
  }

  /** Admissions funnel + applicant list. */
  async adminApplicants() {
    const apps = await this.prisma.applicant.findMany({ orderBy: { score: "desc" } });
    const stages = ["submitted", "review", "interview", "offer", "accepted", "rejected"];
    return {
      funnel: stages.map((s) => ({ stage: s, count: apps.filter((a) => a.stage === s).length })),
      applicants: apps.map((a) => ({
        name: `${a.firstName} ${a.lastName}`,
        email: a.email,
        program: a.programCode ?? "—",
        stage: a.stage,
        score: a.score,
        country: a.country,
        feePaid: a.feePaid,
      })),
    };
  }

  /** Faculty & staff roster. */
  async adminStaff() {
    const people = await this.prisma.person.findMany({
      where: { kind: { not: "student" } },
      orderBy: { lastName: "asc" },
    });
    return people.map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      email: p.email,
      kind: p.kind,
      roles: p.roles,
    }));
  }

  /** All users + roles (settings). */
  async adminUsers() {
    const people = await this.prisma.person.findMany({ orderBy: { email: "asc" } });
    return people
      .filter((p) => p.roles.length > 0)
      .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email, roles: p.roles }));
  }

  /** Registrar/admin: one student's academic file (profile, enrollments, transcript, GPA, balance). */
  async adminStudentDetail(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        person: true,
        program: { include: { department: true } },
        invoices: true,
        enrollments: {
          include: { section: { include: { course: true, term: true } } },
          orderBy: { enrolledAt: "desc" },
        },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    const completed = student.enrollments.filter((e) => e.status === "completed" && e.grade);
    const { gpa, completedCredits } = computeGpa(
      completed.map((e) => ({ grade: e.grade!, credits: e.section.course.credits })),
    );
    return {
      studentNo: student.studentNo,
      name: `${student.person.firstName} ${student.person.lastName}`,
      email: student.person.email,
      program: student.program ? `${student.program.code} — ${student.program.name}` : null,
      department: student.program?.department.name ?? null,
      gpa,
      completedCredits,
      balance: student.invoices.reduce((b, i) => b + (i.totalAmount - i.amountPaid), 0),
      enrollments: student.enrollments.map((e) => ({
        enrollmentId: e.id,
        courseCode: e.section.course.code,
        title: e.section.course.title,
        credits: e.section.course.credits,
        term: e.section.term.name,
        sectionCode: e.section.sectionCode,
        status: e.status,
        grade: e.grade,
      })),
    };
  }

  /** Registrar/admin administrative drop — bypasses the student drop deadline, audited. */
  async adminDropEnrollment(enrollmentId: string, actorId: string) {
    const enr = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enr) throw new NotFoundException("Enrollment not found");
    if (enr.status !== "enrolled") throw new BadRequestException("Not an active enrollment");
    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "dropped" },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Enrollment", entityId: enrollmentId, action: "admin-dropped", actorId },
    });
    return updated;
  }

  // --- Faculty dashboard + insights (design: teacher portal) ---

  /** Deterministic course-card colors matching the teacher design palette. */
  private courseColor(index: number) {
    const palette = ["#153b6a", "#ed8425", "#1d4a82", "#2e7d52", "#9da6ae", "#c4660f"];
    return palette[index % palette.length]!;
  }

  private weekdayIndex(date = new Date()) {
    return (date.getDay() + 6) % 7; // Mon=0 … Sun=6
  }

  /** "MWF"/"TTh" -> weekday indices (Mon=0). */
  private parseDays(s: string): number[] {
    const out: number[] = [];
    const map: Record<string, number> = { M: 0, T: 1, W: 2, F: 4 };
    let i = 0;
    while (i < s.length) {
      if (s.slice(i, i + 2) === "Th") {
        out.push(3);
        i += 2;
      } else {
        const d = map[s[i]!];
        if (d !== undefined) out.push(d);
        i += 1;
      }
    }
    return out;
  }

  /** Per-section live attendance rate (present+late) / records; null when no records. */
  private async attendanceRate(sectionId: string): Promise<number | null> {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { sectionId },
      select: { status: true },
    });
    if (records.length === 0) return null;
    const ok = records.filter((r) => r.status === "present" || r.status === "late").length;
    return Math.round((ok / records.length) * 100);
  }

  /** Faculty dashboard: KPIs, class cards, today's timeline, needs-attention. */
  async facultyOverview(personId: string) {
    const sections = await this.prisma.section.findMany({
      where: { instructorId: personId },
      include: {
        course: true,
        term: true,
        _count: { select: { enrollments: { where: { status: "enrolled" } } } },
      },
      orderBy: [{ course: { code: "asc" } }],
    });

    const classes = await Promise.all(
      sections.map(async (s, i) => {
        const [ungraded, attendance] = await Promise.all([
          this.prisma.submission.count({ where: { assignment: { sectionId: s.id }, status: "submitted" } }),
          this.attendanceRate(s.id),
        ]);
        return {
          sectionId: s.id,
          code: s.course.code,
          title: s.course.title,
          color: this.courseColor(i),
          students: s._count.enrollments,
          attendance,
          ungraded,
          room: s.room,
          days: s.days,
          startTime: s.startTime,
          endTime: s.endTime,
          term: s.term.name,
        };
      }),
    );

    const studentsTaught = classes.reduce((a, c) => a + c.students, 0);
    const itemsToGrade = classes.reduce((a, c) => a + c.ungraded, 0);
    const rated = classes.filter((c) => c.attendance !== null);
    const avgAttendance =
      rated.length === 0 ? null : Math.round(rated.reduce((a, c) => a + (c.attendance ?? 0), 0) / rated.length);

    const todayIdx = this.weekdayIndex();
    const today = classes
      .filter((c) => this.parseDays(c.days).includes(todayIdx))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((c) => ({
        sectionId: c.sectionId,
        time: c.startTime,
        end: c.endTime,
        label: `${c.code} — ${c.title}`,
        sub: `${c.room ?? "TBA"} · ${c.students} students`,
      }));

    const needsAttention = classes
      .filter((c) => c.ungraded > 0)
      .map((c) => ({
        label: `Grade ${c.ungraded} item(s) in ${c.code}`,
        meta: c.title,
        sectionId: c.sectionId,
        tone: "urgent" as const,
      }));

    return {
      kpis: { activeCourses: classes.length, studentsTaught, itemsToGrade, avgAttendance },
      classes,
      today,
      needsAttention,
    };
  }

  /** Insights for one section: attendance, pass rate, grade distribution, trend, at-risk. */
  async sectionInsights(sectionId: string, personId: string, isAdmin: boolean) {
    const section = await this.assertSectionOwner(sectionId, personId, isAdmin);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, status: { in: ["enrolled", "completed"] } },
      include: {
        student: { include: { person: true } },
        submissions: { include: { assignment: { select: { maxPoints: true } } } },
        attendance: { select: { status: true } },
      },
    });

    // Each student's standing: final grade if set, else the letter implied by their graded-work
    // average (so the distribution is meaningful mid-term, as in the design). No work yet = excluded.
    const buckets = ["A", "B", "C", "D", "F"];
    const letterFromPct = (p: number) => (p >= 90 ? "A" : p >= 80 ? "B" : p >= 70 ? "C" : p >= 60 ? "D" : "F");
    const distribution = [0, 0, 0, 0, 0];
    for (const e of enrollments) {
      let letter: string | null = e.grade ? e.grade[0]!.toUpperCase() : null;
      if (!letter) {
        const scored = e.submissions.filter((s) => s.score !== null && s.assignment.maxPoints > 0);
        if (scored.length > 0) {
          const avgPct = (scored.reduce((a, s) => a + s.score! / s.assignment.maxPoints, 0) / scored.length) * 100;
          letter = letterFromPct(avgPct);
        }
      }
      const idx = letter ? buckets.indexOf(letter) : -1;
      if (idx >= 0) distribution[idx]!++;
    }
    const graded = distribution.reduce((a, b) => a + b, 0);
    const passRate = graded === 0 ? null : Math.round(((distribution[0]! + distribution[1]! + distribution[2]!) / graded) * 100);

    const itemsToGrade = await this.prisma.submission.count({
      where: { assignment: { sectionId }, status: "submitted" },
    });

    // Attendance trend: present% over the last 6 session dates.
    const records = await this.prisma.attendanceRecord.findMany({
      where: { sectionId },
      orderBy: { date: "asc" },
      select: { date: true, status: true },
    });
    const byDate = new Map<string, { ok: number; total: number }>();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      const cur = byDate.get(key) ?? { ok: 0, total: 0 };
      cur.total++;
      if (r.status === "present" || r.status === "late") cur.ok++;
      byDate.set(key, cur);
    }
    const trend = [...byDate.entries()]
      .slice(-6)
      .map(([date, v]) => ({ date, pct: Math.round((v.ok / v.total) * 100) }));

    const atRisk = enrollments
      .map((e) => {
        const scored = e.submissions.filter((s) => s.score !== null && s.assignment.maxPoints > 0);
        const avgPct =
          scored.length === 0
            ? null
            : Math.round(
                (scored.reduce((a, s) => a + s.score! / s.assignment.maxPoints, 0) / scored.length) * 100,
              );
        const absent = e.attendance.filter((a) => a.status === "absent").length;
        const reasons: string[] = [];
        if (avgPct !== null && avgPct < 60) reasons.push(`avg ${avgPct}% on graded work`);
        if (absent >= 2) reasons.push(`${absent} absences`);
        if (reasons.length === 0) return null;
        const severity = (avgPct !== null && avgPct < 50) || absent >= 3 ? "high" : "monitor";
        return {
          name: `${e.student.person.firstName} ${e.student.person.lastName}`,
          studentNo: e.student.studentNo,
          reason: reasons.join(" · "),
          severity,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const attendance = await this.attendanceRate(sectionId);
    return {
      course: `${section.course.code} — ${section.course.title}`,
      sectionCode: section.sectionCode,
      kpis: { attendance, passRate, itemsToGrade, atRiskCount: atRisk.length },
      distribution: buckets.map((label, i) => ({ label, count: distribution[i]! })),
      trend,
      atRisk,
    };
  }

  /** Advisees = distinct students across the faculty's sections, with cumulative GPA + risk flag. */
  async facultyAdvisees(personId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { section: { instructorId: personId }, status: { in: ["enrolled", "completed"] } },
      include: { student: { include: { person: true, program: true } } },
    });
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

    const advisees = await Promise.all(
      studentIds.map(async (sid) => {
        const completed = await this.prisma.enrollment.findMany({
          where: { studentId: sid, status: "completed", grade: { not: null } },
          include: { section: { include: { course: true } } },
        });
        const { gpa } = computeGpa(completed.map((e) => ({ grade: e.grade!, credits: e.section.course.credits })));
        const s = enrollments.find((e) => e.studentId === sid)!.student;
        return {
          studentNo: s.studentNo,
          name: `${s.person.firstName} ${s.person.lastName}`,
          program: s.program?.code ?? "—",
          gpa,
          atRisk: gpa > 0 && gpa < 2.5,
          deansList: gpa >= 3.7,
        };
      }),
    );
    advisees.sort((a, b) => a.name.localeCompare(b.name));
    return advisees;
  }

  /** Faculty teaching sections for the schedule grid (with day/time fields). */
  async mySchedule(instructorPersonId: string) {
    const sections = await this.prisma.section.findMany({
      where: { instructorId: instructorPersonId },
      include: { course: true },
      orderBy: [{ course: { code: "asc" } }],
    });
    return sections.map((s, i) => ({
      sectionId: s.id,
      code: s.course.code,
      title: s.course.title,
      color: this.courseColor(i),
      days: s.days,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
    }));
  }

  // --- Course materials + class posts (faculty, design: teacher MaterialsTab/PostsTab) ---

  async listSectionMaterials(sectionId: string, personId: string, isAdmin: boolean) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    return this.prisma.sectionMaterial.findMany({
      where: { sectionId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createSectionMaterial(
    sectionId: string,
    input: { title: string; kind: string; fileUrl?: string; fileName?: string },
    personId: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const material = await this.prisma.sectionMaterial.create({
      data: {
        sectionId,
        title: input.title,
        kind: input.kind,
        fileUrl: input.fileUrl ?? null,
        fileName: input.fileName ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "SectionMaterial", entityId: material.id, action: "created", actorId: personId },
    });
    return material;
  }

  async toggleSectionMaterial(materialId: string, personId: string, isAdmin: boolean) {
    const material = await this.prisma.sectionMaterial.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException("Material not found");
    await this.assertSectionOwner(material.sectionId, personId, isAdmin);
    return this.prisma.sectionMaterial.update({
      where: { id: materialId },
      data: { published: !material.published },
    });
  }

  async listSectionPosts(sectionId: string, personId: string, isAdmin: boolean) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    return this.prisma.sectionPost.findMany({
      where: { sectionId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    });
  }

  async createSectionPost(
    sectionId: string,
    input: { title: string; body: string },
    personId: string,
    authorName: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const post = await this.prisma.sectionPost.create({
      data: { sectionId, title: input.title, body: input.body, author: authorName },
    });
    await this.prisma.auditLog.create({
      data: { entity: "SectionPost", entityId: post.id, action: "created", actorId: personId },
    });
    return post;
  }

  /** Sections taught by a faculty member. */
  async mySections(instructorPersonId: string) {
    const sections = await this.prisma.section.findMany({
      where: { instructorId: instructorPersonId },
      include: {
        course: true,
        term: true,
        _count: { select: { enrollments: { where: { status: "enrolled" } } } },
      },
      orderBy: [{ term: { name: "asc" } }, { course: { code: "asc" } }],
    });
    return sections.map((s) => ({
      id: s.id,
      course: `${s.course.code} — ${s.course.title}`,
      sectionCode: s.sectionCode,
      term: s.term.name,
      schedule: `${s.days} ${s.startTime}–${s.endTime}`,
      room: s.room,
      enrolled: s._count.enrollments,
      capacity: s.capacity,
    }));
  }
}

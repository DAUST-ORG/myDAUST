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

/** Academic standing label derived from GPA (0 = no graded credits yet → treated as Good Standing). */
export function standingLabel(gpa: number): string {
  if (gpa >= 3.7) return "Dean's List";
  if (gpa > 0 && gpa < 2) return "Academic Probation";
  return "Good Standing";
}

/** Maximum credits a student may carry in one term (enrolled + newly added). */
export const MAX_CREDITS_PER_TERM = 30;

/** Applicant stages still awaiting a decision — what the dashboard counts as "in pipeline". */
const OPEN_APPLICANT_STAGES = ["submitted", "review", "interview", "offer"];

/** Class-standing ladder, used to evaluate a course rule's `standingRequired`. */
const STANDING_RANK: Record<string, number> = {
  freshman: 1, sophomore: 2, junior: 3, senior: 4,
};

/**
 * Expand a meeting-day string into day tokens. Two-letter days must be matched
 * before single letters, otherwise "TTh" reads as T,T,H.
 */
export function parseDays(days: string): string[] {
  const out: string[] = [];
  let i = 0;
  const src = days.replace(/[\s,]/g, "");
  while (i < src.length) {
    const two = src.slice(i, i + 2).toLowerCase();
    if (two === "th" || two === "su") {
      out.push(two.charAt(0).toUpperCase() + two.charAt(1));
      i += 2;
      continue;
    }
    out.push(src.charAt(i).toUpperCase());
    i += 1;
  }
  return out;
}

/** "09:30" → 570. Returns NaN for unparseable input so callers can skip the check. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface MeetingLike {
  days: string;
  startTime: string;
  endTime: string;
}

/**
 * True when two sections meet on a shared day with overlapping times.
 * Touching blocks (one ends exactly when the other starts) do not conflict.
 * Unparseable times are treated as non-conflicting rather than blocking
 * enrolment on bad catalog data.
 */
export function meetingsOverlap(a: MeetingLike, b: MeetingLike): boolean {
  const aDays = parseDays(a.days);
  const bDays = parseDays(b.days);
  if (!aDays.some((d) => bDays.includes(d))) return false;
  const aStart = toMinutes(a.startTime);
  const aEnd = toMinutes(a.endTime);
  const bStart = toMinutes(b.startTime);
  const bEnd = toMinutes(b.endTime);
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** Editable fields for updateStudent (all optional; null clears a nullable field). */
export interface UpdateStudentFields {
  fullName?: string;
  email?: string;
  programCode?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  nationality?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  guardianPhone?: string | null;
  advisor?: string | null;
  yearLevel?: number | null;
  cohort?: string | null;
  preferredName?: string | null;
  nationalId?: string | null;
  maritalStatus?: string | null;
  personalEmail?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  insurance?: string | null;
  physician?: string | null;
  emergencyName2?: string | null;
  emergencyPhone2?: string | null;
  major?: string | null;
  minor?: string | null;
  admitTerm?: string | null;
  expectedGrad?: string | null;
  enrollmentStatus?: string | null;
  catalogYear?: string | null;
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
      status: s.status,
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

      // A registrar-closed section is not offered, regardless of remaining seats.
      const full = await tx.section.findUniqueOrThrow({ where: { id: sectionId } });
      if (full.status === "closed") {
        throw new ConflictException("This section is closed for registration");
      }

      // An active financial or advising hold blocks all registration.
      const holds = await tx.studentHold.findMany({ where: { studentId, active: true } });
      if (holds.length > 0) {
        const kinds = [...new Set(holds.map((h) => h.type))].join(", ");
        throw new ForbiddenException(
          `Registration is blocked by an active hold (${kinds}). Contact the registrar to clear it.`,
        );
      }

      const course = await tx.course.findUniqueOrThrow({
        where: { id: section.courseId },
        include: {
          prereqRules: { include: { prereqCourse: true } },
          coreqRules: { include: { coreqCourse: true } },
          rule: true,
        },
      });

      // Everything the student has completed, with the grade earned, so a
      // prerequisite can require a minimum grade rather than a bare pass.
      const completed = await tx.enrollment.findMany({
        where: { studentId, status: "completed" },
        include: { section: { include: { course: true } } },
      });
      const bestGrade = new Map<string, number>();
      for (const e of completed) {
        const pts = e.grade ? GRADE_POINTS[e.grade] : undefined;
        const courseId = e.section.courseId;
        const prev = bestGrade.get(courseId);
        // A retake counts at its best grade.
        if (pts !== undefined && (prev === undefined || pts > prev)) bestGrade.set(courseId, pts);
        else if (!bestGrade.has(courseId)) bestGrade.set(courseId, pts ?? 0);
      }

      const unmet: string[] = [];
      for (const pr of course.prereqRules) {
        const earned = bestGrade.get(pr.prereqCourseId);
        if (earned === undefined) {
          unmet.push(pr.prereqCourse.code);
          continue;
        }
        const required = pr.minGrade ? GRADE_POINTS[pr.minGrade] : undefined;
        if (required !== undefined && earned < required) {
          unmet.push(`${pr.prereqCourse.code} (min ${pr.minGrade})`);
        }
      }
      if (unmet.length > 0) {
        throw new BadRequestException(`Missing prerequisite(s): ${unmet.join(", ")}`);
      }

      // Sections the student already holds this term — the basis for the
      // corequisite, timetable-clash and credit-load checks below.
      const termEnrollments = await tx.enrollment.findMany({
        where: { studentId, status: "enrolled", section: { termId: section.termId } },
        include: { section: { include: { course: true } } },
      });

      if (course.coreqRules.length > 0) {
        const heldCourseIds = new Set(termEnrollments.map((e) => e.section.courseId));
        const missingCoreq = course.coreqRules
          .filter((c) => !heldCourseIds.has(c.coreqCourseId) && !bestGrade.has(c.coreqCourseId))
          .map((c) => c.coreqCourse.code);
        if (missingCoreq.length > 0) {
          throw new BadRequestException(
            `Must be taken with (or after) ${missingCoreq.join(", ")}`,
          );
        }
      }

      const clash = termEnrollments.find((e) => meetingsOverlap(e.section, full));
      if (clash) {
        throw new ConflictException(
          `Time conflict with ${clash.section.course.code} (${clash.section.days} ${clash.section.startTime}-${clash.section.endTime})`,
        );
      }

      const currentCredits = termEnrollments.reduce((s, e) => s + e.section.course.credits, 0);
      if (currentCredits + course.credits > MAX_CREDITS_PER_TERM) {
        throw new BadRequestException(
          `Over the ${MAX_CREDITS_PER_TERM}-credit limit for this term (${currentCredits} enrolled + ${course.credits})`,
        );
      }

      const student = await tx.student.findUniqueOrThrow({
        where: { id: studentId },
        include: { program: true },
      });

      if (course.rule?.standingRequired) {
        const firstWord = course.rule.standingRequired.trim().split(/\s+/)[0] ?? "";
        const needed = STANDING_RANK[firstWord.toLowerCase()];
        const yr = student.yearLevel ?? 0;
        if (needed !== undefined && yr > 0 && yr < needed) {
          throw new ForbiddenException(
            `${course.code} requires ${course.rule.standingRequired}`,
          );
        }
      }

      if (course.rule?.majorRestriction) {
        const allowed = course.rule.majorRestriction.toLowerCase();
        const mine = (student.major ?? student.program?.name ?? "").toLowerCase();
        // Restriction strings are human-authored lists ("Computer / Electrical Eng."),
        // so match loosely on any token rather than demanding an exact equality.
        const tokens = allowed.split(/[/,]/).map((t) => t.trim()).filter(Boolean);
        const head = (t: string) => t.split(/\s+/)[0] ?? t;
        if (mine && tokens.length > 0 && !tokens.some((t) => mine.includes(head(t)))) {
          throw new ForbiddenException(`${course.code} is restricted to ${course.rule.majorRestriction}`);
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
  /**
   * Sections a student may register into this term, each annotated with why it
   * is or is not available. The same rules are re-checked in enroll() — this is
   * the UX-facing preview, never the gate.
   */
  async registrationCatalog(studentId: string, termId: string) {
    const [sections, enrollments, completed, holds, student] = await Promise.all([
      this.prisma.section.findMany({
        where: { termId, status: "open" },
        orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
        include: {
          course: {
            include: {
              prereqRules: { include: { prereqCourse: true } },
              rule: true,
            },
          },
          instructor: true,
          _count: { select: { enrollments: { where: { status: "enrolled" } } } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId, status: "enrolled", section: { termId } },
        include: { section: { include: { course: true } } },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId, status: "completed" },
        include: { section: true },
      }),
      this.prisma.studentHold.findMany({ where: { studentId, active: true } }),
      this.prisma.student.findUnique({ where: { id: studentId } }),
    ]);

    const bestGrade = new Map<string, number>();
    for (const e of completed) {
      const pts = e.grade ? GRADE_POINTS[e.grade] : undefined;
      const id = e.section.courseId;
      const prev = bestGrade.get(id);
      if (pts !== undefined && (prev === undefined || pts > prev)) bestGrade.set(id, pts);
      else if (!bestGrade.has(id)) bestGrade.set(id, pts ?? 0);
    }

    const enrolledCourseIds = new Set(enrollments.map((e) => e.section.courseId));
    const currentCredits = enrollments.reduce((s, e) => s + e.section.course.credits, 0);

    const rows = sections.map((s) => {
      const seatsLeft = s.capacity - s._count.enrollments;
      const unmetPrereqs = s.course.prereqRules
        .filter((pr) => {
          const earned = bestGrade.get(pr.prereqCourseId);
          if (earned === undefined) return true;
          const required = pr.minGrade ? GRADE_POINTS[pr.minGrade] : undefined;
          return required !== undefined && earned < required;
        })
        .map((pr) => (pr.minGrade ? `${pr.prereqCourse.code} (min ${pr.minGrade})` : pr.prereqCourse.code));

      const clash = enrollments.find((e) => meetingsOverlap(e.section, s));

      // First blocking reason wins, so the UI shows one clear explanation.
      const blockedReason = enrolledCourseIds.has(s.courseId)
        ? "Already enrolled"
        : seatsLeft <= 0
          ? "Section is full"
          : unmetPrereqs.length > 0
            ? `Needs ${unmetPrereqs.join(", ")}`
            : clash
              ? `Clashes with ${clash.section.course.code}`
              : null;

      return {
        sectionId: s.id,
        courseCode: s.course.code,
        title: s.course.title,
        credits: s.course.credits,
        sectionCode: s.sectionCode,
        instructor: s.instructor ? `${s.instructor.firstName} ${s.instructor.lastName}` : null,
        room: s.room,
        days: s.days,
        startTime: s.startTime,
        endTime: s.endTime,
        schedule: `${s.days} ${s.startTime}–${s.endTime}`,
        seatsTaken: s._count.enrollments,
        capacity: s.capacity,
        seatsLeft,
        blockedReason,
      };
    });

    return {
      maxCredits: MAX_CREDITS_PER_TERM,
      currentCredits,
      holds: holds.map((h) => ({ type: h.type, reason: h.reason })),
      catalogYear: student?.catalogYear ?? null,
      sections: rows,
    };
  }

  /**
   * Degree audit. Completion is derived from requirement-category fulfilment
   * rather than tracked separately, so the headline figure and the per-category
   * breakdown can never disagree.
   */
  async degreeAudit(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { program: true },
    });
    if (!student) throw new NotFoundException("Student not found");
    if (!student.programId) {
      return { program: null, categories: [], completed: 0, inProgress: 0, remaining: 0, total: 0, pctComplete: 0 };
    }

    const [requirements, enrollments] = await Promise.all([
      this.prisma.programRequirement.findMany({
        where: {
          programId: student.programId,
          ...(student.catalogYear ? { catalogYear: student.catalogYear } : {}),
        },
        orderBy: { position: "asc" },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId, status: { in: ["completed", "enrolled"] } },
        include: { section: { include: { course: { include: { department: true } } } } },
      }),
    ]);

    // A course declares which requirement it satisfies; the owning department is
    // only a fallback, because one department teaches courses counting toward
    // several requirements. Anything still unmatched lands in the elective bucket
    // so earned credit is never silently dropped.
    const fallback = requirements.find((r) => /elective/i.test(r.category))?.category ?? null;
    const doneBy = new Map<string, number>();
    const progressBy = new Map<string, number>();
    for (const e of enrollments) {
      const course = e.section.course;
      const declared = course.requirementCategory;
      const match =
        (declared && requirements.find((r) => r.category.toLowerCase() === declared.toLowerCase())) ||
        requirements.find((r) => r.category.toLowerCase() === course.department.name.toLowerCase());
      const category = match?.category ?? fallback;
      if (!category) continue;
      const bucket = e.status === "completed" ? doneBy : progressBy;
      bucket.set(category, (bucket.get(category) ?? 0) + e.section.course.credits);
    }

    const categories = requirements.map((r) => {
      // Credit applied to a category is capped at what the category requires.
      const done = Math.min(r.requiredCredits, doneBy.get(r.category) ?? 0);
      const inProgress = progressBy.get(r.category) ?? 0;
      const pct = r.requiredCredits === 0 ? 100 : Math.round((done / r.requiredCredits) * 100);
      return {
        category: r.category,
        required: r.requiredCredits,
        done,
        inProgress,
        remaining: Math.max(0, r.requiredCredits - done),
        pct,
        status: done >= r.requiredCredits ? "Complete" : pct >= 60 ? "On track" : "In progress",
      };
    });

    const total = categories.reduce((s, c) => s + c.required, 0);
    const completedCredits = categories.reduce((s, c) => s + c.done, 0);
    const inProgress = categories.reduce((s, c) => s + c.inProgress, 0);
    return {
      program: student.program?.name ?? null,
      catalogYear: student.catalogYear,
      categories,
      completed: completedCredits,
      inProgress,
      remaining: Math.max(0, total - completedCredits - inProgress),
      total,
      pctComplete: total === 0 ? 0 : Math.round((completedCredits / total) * 100),
    };
  }

  /** The signed-in student's own record, for the My Profile screen. */
  async myProfile(studentId: string) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { person: true, program: true },
    });
    if (!s) throw new NotFoundException("Student not found");

    const graded = await this.prisma.enrollment.findMany({
      where: { studentId, status: "completed" },
      include: { section: { include: { course: true } } },
    });
    const { gpa, completedCredits } = computeGpa(
      graded.filter((e) => e.grade).map((e) => ({ grade: e.grade!, credits: e.section.course.credits })),
    );

    return {
      name: `${s.person.firstName} ${s.person.lastName}`,
      studentNo: s.studentNo,
      email: s.person.email,
      program: s.program?.name ?? null,
      gpa,
      completedCredits,
      standing: s.standing ?? standingLabel(gpa),
      personal: {
        preferredName: s.preferredName,
        dateOfBirth: s.dateOfBirth,
        gender: s.gender,
        nationality: s.nationality,
        maritalStatus: s.maritalStatus,
        language: s.language,
        nationalId: s.nationalId,
      },
      contact: {
        phone: s.phone,
        personalEmail: s.personalEmail,
        address: s.address,
        city: s.city,
      },
      academic: {
        yearLevel: s.yearLevel,
        catalogYear: s.catalogYear,
        advisor: s.advisor,
        major: s.major,
        minor: s.minor,
        admitTerm: s.admitTerm,
        expectedGrad: s.expectedGrad,
        enrollmentStatus: s.enrollmentStatus,
        cohort: s.cohort,
      },
      emergency: {
        guardianName: s.guardianName,
        guardianRelation: s.guardianRelation,
        guardianPhone: s.guardianPhone,
        emergencyName2: s.emergencyName2,
        emergencyPhone2: s.emergencyPhone2,
        bloodType: s.bloodType,
        allergies: s.allergies,
        insurance: s.insurance,
        physician: s.physician,
      },
    };
  }

  /** The signed-in student's housing assignment, if any. */
  async myHousing(studentId: string) {
    const assignment = await this.prisma.housingAssignment.findUnique({
      where: { studentId },
      include: { hall: true },
    });
    if (!assignment) return { assigned: false as const };

    // Anyone else assigned to the same room is a roommate.
    const roommates = assignment.room
      ? await this.prisma.housingAssignment.findMany({
          where: { hallId: assignment.hallId, room: assignment.room, studentId: { not: studentId } },
          include: { student: { include: { person: true } } },
        })
      : [];

    return {
      assigned: true as const,
      building: assignment.hall?.name ?? null,
      kind: assignment.hall?.kind ?? null,
      room: assignment.room,
      status: assignment.status,
      note: assignment.note,
      roommates: roommates.map((r) => `${r.student.person.firstName} ${r.student.person.lastName}`),
    };
  }

  /** Per-course attendance for the signed-in student. Late counts as half a present. */
  async myAttendance(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: "enrolled" },
      include: { section: { include: { course: true } }, attendance: true },
    });
    const rows = enrollments.map((e) => {
      const present = e.attendance.filter((a) => a.status === "present").length;
      const late = e.attendance.filter((a) => a.status === "late").length;
      const absent = e.attendance.filter((a) => a.status === "absent").length;
      const total = present + late + absent;
      return {
        code: e.section.course.code,
        title: e.section.course.title,
        present,
        late,
        absent,
        pct: total === 0 ? null : Math.round(((present + late * 0.5) / total) * 100),
      };
    });
    const rated = rows.filter((r) => r.pct !== null);
    return {
      overall:
        rated.length === 0 ? null : Math.round(rated.reduce((s, r) => s + (r.pct ?? 0), 0) / rated.length),
      rows,
    };
  }

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
    const [enrollments, submission] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { sectionId, status: { in: ["enrolled", "completed"] } },
        include: { student: { include: { person: true } } },
        orderBy: { student: { studentNo: "asc" } },
      }),
      this.prisma.gradeSubmission.findUnique({ where: { sectionId } }),
    ]);
    return {
      course: `${section.course.code} — ${section.course.title}`,
      sectionCode: section.sectionCode,
      status: submission?.status ?? "draft",
      statusNote: submission?.note ?? null,
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
      if (input.finalize) {
        await tx.gradeSubmission.upsert({
          where: { sectionId },
          create: { sectionId, status: "submitted", submittedById: personId, submittedAt: new Date() },
          update: { status: "submitted", submittedById: personId, submittedAt: new Date(), note: null },
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
    const [totalStudents, totalEnrolled, programs, openApplications, balances] = await Promise.all([
      this.prisma.student.count(),
      this.prisma.enrollment.count({ where: { status: "enrolled" } }),
      this.prisma.program.findMany({ include: { _count: { select: { students: true } } } }),
      this.prisma.applicant.count({ where: { stage: { in: OPEN_APPLICANT_STAGES } } }),
      // "Accounts with holds" on the registrar dashboard is a headcount, not money:
      // it is the number of students carrying any unpaid balance. Grouping in the
      // database keeps this off the finance endpoints a registrar cannot read.
      this.prisma.invoice.groupBy({
        by: ["studentId"],
        _sum: { totalAmount: true, amountPaid: true },
      }),
    ]);
    const holdsCount = balances.filter(
      (b) => (b._sum.totalAmount ?? 0) - (b._sum.amountPaid ?? 0) > 0,
    ).length;
    return {
      totalStudents,
      totalEnrolled,
      holdsCount,
      openApplications,
      byProgram: programs.map((p) => ({ code: p.code, name: p.name, students: p._count.students })),
    };
  }

  /** Admin: student roster with program, derived GPA/credits/standing + outstanding balance. */
  async adminStudents() {
    const students = await this.prisma.student.findMany({
      include: {
        person: true,
        program: true,
        invoices: true,
        enrollments: { include: { section: { include: { course: true } } } },
      },
      orderBy: { studentNo: "asc" },
    });
    return students.map((s) => {
      const completed = s.enrollments.filter((e) => e.status === "completed" && e.grade);
      const { gpa, completedCredits } = computeGpa(
        completed.map((e) => ({ grade: e.grade!, credits: e.section.course.credits })),
      );
      return {
        id: s.id,
        studentNo: s.studentNo,
        name: `${s.person.firstName} ${s.person.lastName}`,
        email: s.person.email,
        photoUrl: s.photoUrl,
        program: s.program?.code ?? "—",
        programName: s.program?.name ?? null,
        yearLevel: s.yearLevel,
        cohort: s.cohort,
        gpa,
        completedCredits,
        balance: s.invoices.reduce((b, i) => b + (i.totalAmount - i.amountPaid), 0),
        status: gpa > 0 && gpa < 2 ? "probation" : "active",
      };
    });
  }

  /** Admin: programs, course catalog + department list (for create forms). */
  async adminPrograms() {
    const [programs, courses, departments] = await Promise.all([
      this.prisma.program.findMany({
        include: { department: true, _count: { select: { students: true } } },
        orderBy: { code: "asc" },
      }),
      this.prisma.course.findMany({ include: { department: true }, orderBy: { code: "asc" } }),
      this.prisma.department.findMany({ orderBy: { name: "asc" } }),
    ]);
    return {
      programs: programs.map((p) => ({
        code: p.code,
        name: p.name,
        department: p.department.name,
        students: p._count.students,
        degree: p.degree,
        school: p.school,
        tuition: p.tuition,
        color: p.color,
      })),
      courses: courses.map((c) => ({ code: c.code, title: c.title, credits: c.credits, department: c.department.name })),
      departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name })),
    };
  }

  /** Admin: one program's detail — students in it, department courses, and stats. */
  async programDetail(code: string) {
    const program = await this.prisma.program.findUnique({
      where: { code },
      include: {
        department: true,
        students: {
          include: { person: true, invoices: true, enrollments: { include: { section: { include: { course: true } } } } },
          orderBy: { studentNo: "asc" },
        },
      },
    });
    if (!program) throw new NotFoundException("Program not found");
    const courses = await this.prisma.course.findMany({
      where: { departmentId: program.departmentId },
      orderBy: { code: "asc" },
    });
    const students = program.students.map((s) => {
      const completed = s.enrollments.filter((e) => e.status === "completed" && e.grade);
      const { gpa, completedCredits } = computeGpa(
        completed.map((e) => ({ grade: e.grade!, credits: e.section.course.credits })),
      );
      return {
        id: s.id,
        studentNo: s.studentNo,
        name: `${s.person.firstName} ${s.person.lastName}`,
        photoUrl: s.photoUrl,
        yearLevel: s.yearLevel,
        gpa,
        completedCredits,
        balance: s.invoices.reduce((b, i) => b + (i.totalAmount - i.amountPaid), 0),
        status: gpa > 0 && gpa < 2 ? "probation" : "active",
      };
    });
    const billed = program.students.reduce((sum, s) => sum + s.invoices.reduce((b, i) => b + i.totalAmount, 0), 0);
    const paid = program.students.reduce((sum, s) => sum + s.invoices.reduce((b, i) => b + i.amountPaid, 0), 0);
    const yearDist = [1, 2, 3, 4].map((y) => program.students.filter((s) => s.yearLevel === y).length);
    return {
      code: program.code,
      name: program.name,
      department: program.department.name,
      degree: program.degree,
      school: program.school,
      tuition: program.tuition,
      color: program.color,
      stats: { studentCount: program.students.length, billed, paid, revenue: billed, yearDist },
      students,
      courses: courses.map((c) => ({ code: c.code, title: c.title, credits: c.credits })),
    };
  }

  /** Registrar/admin: update a program's editable fields. Audited. */
  async updateProgram(
    actorId: string,
    code: string,
    input: { name?: string; departmentId?: string; degree?: string | null; school?: string | null; tuition?: number | null; color?: string | null },
  ) {
    const program = await this.prisma.program.findUnique({ where: { code } });
    if (!program) throw new NotFoundException("Program not found");
    if (input.departmentId !== undefined) {
      const dept = await this.prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw new BadRequestException("Unknown department");
    }
    const updated = await this.prisma.program.update({
      where: { code },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.degree !== undefined ? { degree: input.degree } : {}),
        ...(input.school !== undefined ? { school: input.school } : {}),
        ...(input.tuition !== undefined ? { tuition: input.tuition } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });
    await this.prisma.auditLog.create({ data: { entity: "Program", entityId: program.id, action: "program-updated", actorId } });
    return updated;
  }

  /** Registrar/admin: create a degree program. Audited. */
  async adminCreateProgram(
    actorId: string,
    input: { code: string; name: string; departmentId: string; degree?: string | null; school?: string | null; tuition?: number | null; color?: string | null },
  ) {
    const dept = await this.prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new BadRequestException("Unknown department");
    const dup = await this.prisma.program.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictException(`Program code "${input.code}" already exists`);
    const program = await this.prisma.program.create({
      data: {
        code: input.code,
        name: input.name,
        departmentId: input.departmentId,
        degree: input.degree ?? null,
        school: input.school ?? null,
        tuition: input.tuition ?? null,
        color: input.color ?? null,
      },
    });
    await this.prisma.auditLog.create({ data: { entity: "Program", entityId: program.id, action: "program-created", actorId } });
    return program;
  }

  /** Registrar/admin: create a catalog course. Audited. */
  async adminCreateCourse(actorId: string, input: { code: string; title: string; credits: number; departmentId: string }) {
    const dept = await this.prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new BadRequestException("Unknown department");
    const dup = await this.prisma.course.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictException(`Course code "${input.code}" already exists`);
    const course = await this.prisma.course.create({
      data: { code: input.code, title: input.title, credits: input.credits, departmentId: input.departmentId },
    });
    await this.prisma.auditLog.create({ data: { entity: "Course", entityId: course.id, action: "course-created", actorId } });
    return course;
  }

  /** Admin: one course's detail — catalog fields, prerequisites, and its sections across terms. */
  async adminCourseDetail(code: string) {
    const course = await this.prisma.course.findUnique({
      where: { code },
      include: {
        department: true,
        prerequisites: true,
        sections: {
          include: { term: true, instructor: true, _count: { select: { enrollments: true } } },
          orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }],
        },
      },
    });
    if (!course) throw new NotFoundException("Course not found");
    const [allCourses, departments, terms] = await Promise.all([
      this.prisma.course.findMany({ where: { code: { not: code } }, orderBy: { code: "asc" }, select: { code: true, title: true } }),
      this.prisma.department.findMany({ orderBy: { name: "asc" } }),
      this.prisma.term.findMany({ orderBy: { startDate: "desc" } }),
    ]);
    return {
      id: course.id,
      code: course.code,
      title: course.title,
      credits: course.credits,
      department: course.department.name,
      departmentId: course.departmentId,
      prerequisites: course.prerequisites.map((p) => ({ code: p.code, title: p.title })),
      sections: course.sections.map((s) => ({
        id: s.id,
        sectionCode: s.sectionCode,
        term: s.term.name,
        termId: s.termId,
        instructor: s.instructor ? `${s.instructor.firstName} ${s.instructor.lastName}` : null,
        instructorId: s.instructorId,
        days: s.days,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        capacity: s.capacity,
        seatsTaken: s._count.enrollments,
      })),
      allCourses,
      departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name })),
      terms: terms.map((t) => ({ id: t.id, name: t.name })),
    };
  }

  /** Registrar/admin: update a course's catalog fields + prerequisites. Audited. (`code` is immutable.) */
  async updateCourse(
    actorId: string,
    code: string,
    input: { title?: string; credits?: number; departmentId?: string; prerequisiteCodes?: string[] },
  ) {
    const course = await this.prisma.course.findUnique({ where: { code } });
    if (!course) throw new NotFoundException("Course not found");
    if (input.departmentId !== undefined) {
      const dept = await this.prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw new BadRequestException("Unknown department");
    }
    let prereqSet: { id: string }[] | undefined;
    if (input.prerequisiteCodes !== undefined) {
      const prereqs = await this.prisma.course.findMany({
        where: { code: { in: input.prerequisiteCodes.filter((c) => c !== code) } },
        select: { id: true },
      });
      prereqSet = prereqs.map((p) => ({ id: p.id }));
    }
    const updated = await this.prisma.course.update({
      where: { code },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.credits !== undefined ? { credits: input.credits } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(prereqSet ? { prerequisites: { set: prereqSet } } : {}),
      },
    });
    await this.prisma.auditLog.create({ data: { entity: "Course", entityId: course.id, action: "course-updated", actorId } });
    return updated;
  }

  /** Registrar/admin: create a section (a scheduled offering of a course in a term). Audited. */
  async createSection(
    actorId: string,
    input: { courseCode: string; termId: string; sectionCode: string; instructorId?: string | null; capacity: number; days: string; startTime: string; endTime: string; room?: string | null },
  ) {
    const course = await this.prisma.course.findUnique({ where: { code: input.courseCode } });
    if (!course) throw new BadRequestException("Unknown course");
    const term = await this.prisma.term.findUnique({ where: { id: input.termId } });
    if (!term) throw new BadRequestException("Unknown term");
    if (input.instructorId) {
      const inst = await this.prisma.person.findUnique({ where: { id: input.instructorId } });
      if (!inst) throw new BadRequestException("Unknown instructor");
    }
    const dup = await this.prisma.section.findFirst({
      where: { courseId: course.id, termId: input.termId, sectionCode: input.sectionCode },
    });
    if (dup) throw new ConflictException(`Section ${input.sectionCode} already exists for this course and term`);
    const section = await this.prisma.section.create({
      data: {
        courseId: course.id,
        termId: input.termId,
        sectionCode: input.sectionCode,
        instructorId: input.instructorId ?? null,
        capacity: input.capacity,
        days: input.days,
        startTime: input.startTime,
        endTime: input.endTime,
        room: input.room ?? null,
      },
    });
    await this.prisma.auditLog.create({ data: { entity: "Section", entityId: section.id, action: "section-created", actorId } });
    return section;
  }

  /** Registrar/admin: update a section's schedule/instructor/capacity. Audited. */
  async updateSection(
    actorId: string,
    id: string,
    input: { sectionCode?: string; termId?: string; instructorId?: string | null; capacity?: number; days?: string; startTime?: string; endTime?: string; room?: string | null; status?: string },
  ) {
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) throw new NotFoundException("Section not found");
    if (input.instructorId) {
      const inst = await this.prisma.person.findUnique({ where: { id: input.instructorId } });
      if (!inst) throw new BadRequestException("Unknown instructor");
    }
    if (input.termId) {
      const term = await this.prisma.term.findUnique({ where: { id: input.termId } });
      if (!term) throw new BadRequestException("Unknown term");
    }
    const updated = await this.prisma.section.update({
      where: { id },
      data: {
        ...(input.sectionCode !== undefined ? { sectionCode: input.sectionCode } : {}),
        ...(input.termId !== undefined ? { termId: input.termId } : {}),
        ...(input.instructorId !== undefined ? { instructorId: input.instructorId } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.days !== undefined ? { days: input.days } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.room !== undefined ? { room: input.room } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await this.prisma.auditLog.create({ data: { entity: "Section", entityId: id, action: "section-updated", actorId } });
    return updated;
  }

  /** Registrar/admin: delete a section. Refuses when it has enrollments. Audited. */
  async deleteSection(actorId: string, id: string) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!section) throw new NotFoundException("Section not found");
    if (section._count.enrollments > 0) throw new BadRequestException("Cannot delete a section that has enrollments");
    await this.prisma.section.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { entity: "Section", entityId: id, action: "section-deleted", actorId } });
    return { ok: true };
  }

  /** Admissions funnel + applicant list. */
  async adminApplicants() {
    const apps = await this.prisma.applicant.findMany({ orderBy: { score: "desc" } });
    const stages = ["submitted", "review", "interview", "offer", "accepted", "rejected"];
    return {
      funnel: stages.map((s) => ({ stage: s, count: apps.filter((a) => a.stage === s).length })),
      applicants: apps.map((a) => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        program: a.programCode ?? "—",
        stage: a.stage,
        score: a.score,
        country: a.country,
        feePaid: a.feePaid,
        submittedAt: a.createdAt.toISOString(),
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
      id: p.id,
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
          include: { section: { include: { course: true, term: true, instructor: true } } },
          orderBy: { enrolledAt: "desc" },
        },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    const completed = student.enrollments.filter((e) => e.status === "completed" && e.grade);
    const { gpa, completedCredits } = computeGpa(
      completed.map((e) => ({ grade: e.grade!, credits: e.section.course.credits })),
    );
    const currentTermCredits = student.enrollments
      .filter((e) => e.status === "enrolled")
      .reduce((c, e) => c + e.section.course.credits, 0);
    return {
      id: student.id,
      studentNo: student.studentNo,
      name: `${student.person.firstName} ${student.person.lastName}`,
      firstName: student.person.firstName,
      lastName: student.person.lastName,
      email: student.person.email,
      photoUrl: student.photoUrl,
      program: student.program ? `${student.program.code} — ${student.program.name}` : null,
      programCode: student.program?.code ?? null,
      department: student.program?.department.name ?? null,
      gpa,
      completedCredits,
      currentTermCredits,
      standing: standingLabel(gpa),
      status: gpa > 0 && gpa < 2 ? "probation" : "active",
      balance: student.invoices.reduce((b, i) => b + (i.totalAmount - i.amountPaid), 0),
      // --- Extended SIS profile (nullable until entered via Edit record) ---
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : null,
      gender: student.gender,
      phone: student.phone,
      address: student.address,
      city: student.city,
      nationality: student.nationality,
      guardianName: student.guardianName,
      guardianRelation: student.guardianRelation,
      guardianPhone: student.guardianPhone,
      advisor: student.advisor,
      yearLevel: student.yearLevel,
      cohort: student.cohort,
      enrolledAt: student.enrolledAt ? student.enrolledAt.toISOString().slice(0, 10) : null,
      preferredName: student.preferredName,
      nationalId: student.nationalId,
      maritalStatus: student.maritalStatus,
      personalEmail: student.personalEmail,
      bloodType: student.bloodType,
      allergies: student.allergies,
      insurance: student.insurance,
      physician: student.physician,
      emergencyName2: student.emergencyName2,
      emergencyPhone2: student.emergencyPhone2,
      major: student.major,
      minor: student.minor,
      admitTerm: student.admitTerm,
      expectedGrad: student.expectedGrad,
      enrollmentStatus: student.enrollmentStatus,
      catalogYear: student.catalogYear,
      enrollments: student.enrollments.map((e) => ({
        enrollmentId: e.id,
        courseCode: e.section.course.code,
        title: e.section.course.title,
        credits: e.section.course.credits,
        term: e.section.term.name,
        sectionCode: e.section.sectionCode,
        instructor: e.section.instructor ? `${e.section.instructor.firstName} ${e.section.instructor.lastName}` : null,
        status: e.status,
        grade: e.grade,
      })),
    };
  }

  /** Registrar/admin: per-student activity timeline (account, payments, enrollments). */
  async adminStudentActivity(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        program: true,
        payments: { where: { status: "success" }, orderBy: { createdAt: "desc" } },
        enrollments: { include: { section: { include: { course: true, term: true } } }, orderBy: { enrolledAt: "desc" } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    const events: { type: string; title: string; detail: string; at: string }[] = [];
    events.push({
      type: "account",
      title: "Account created",
      detail: student.program ? `Enrolled in ${student.program.name}` : "Student record created",
      at: (student.enrolledAt ?? student.createdAt).toISOString(),
    });
    for (const p of student.payments) {
      events.push({
        type: "payment",
        title: `Payment received — ${p.amount.toLocaleString("fr-FR")} FCFA`,
        detail: `${p.method} · ${p.providerRef}`,
        at: p.createdAt.toISOString(),
      });
    }
    for (const e of student.enrollments) {
      events.push({
        type: "enrollment",
        title: `${e.status === "completed" ? "Completed" : e.status === "dropped" ? "Dropped" : "Enrolled in"} ${e.section.course.code}`,
        detail: `${e.section.course.title} · ${e.section.term.name}`,
        at: e.enrolledAt.toISOString(),
      });
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return events;
  }

  /** Registrar/admin: update a student's record (person name/email + extended SIS fields). Audited. */
  async updateStudent(actorId: string, studentId: string, input: UpdateStudentFields) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, include: { person: true } });
    if (!student) throw new NotFoundException("Student not found");

    const personData: { firstName?: string; lastName?: string; email?: string } = {};
    if (input.fullName !== undefined) {
      const parts = input.fullName.replace(/\s+/g, " ").trim().split(" ");
      personData.firstName = parts.shift() ?? student.person.firstName;
      personData.lastName = parts.join(" ") || personData.firstName;
    }
    if (input.email !== undefined) personData.email = input.email.toLowerCase();

    let programId: string | null | undefined;
    if (input.programCode !== undefined) {
      if (input.programCode === null || input.programCode === "") {
        programId = null;
      } else {
        const program = await this.prisma.program.findUnique({ where: { code: input.programCode } });
        if (!program) throw new BadRequestException(`Unknown program code "${input.programCode}"`);
        programId = program.id;
      }
    }

    const studentData = {
      ...(programId !== undefined ? { programId } : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.nationality !== undefined ? { nationality: input.nationality } : {}),
      ...(input.guardianName !== undefined ? { guardianName: input.guardianName } : {}),
      ...(input.guardianRelation !== undefined ? { guardianRelation: input.guardianRelation } : {}),
      ...(input.guardianPhone !== undefined ? { guardianPhone: input.guardianPhone } : {}),
      ...(input.advisor !== undefined ? { advisor: input.advisor } : {}),
      ...(input.yearLevel !== undefined ? { yearLevel: input.yearLevel } : {}),
      ...(input.cohort !== undefined ? { cohort: input.cohort } : {}),
      ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
      ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
      ...(input.maritalStatus !== undefined ? { maritalStatus: input.maritalStatus } : {}),
      ...(input.personalEmail !== undefined ? { personalEmail: input.personalEmail } : {}),
      ...(input.bloodType !== undefined ? { bloodType: input.bloodType } : {}),
      ...(input.allergies !== undefined ? { allergies: input.allergies } : {}),
      ...(input.insurance !== undefined ? { insurance: input.insurance } : {}),
      ...(input.physician !== undefined ? { physician: input.physician } : {}),
      ...(input.emergencyName2 !== undefined ? { emergencyName2: input.emergencyName2 } : {}),
      ...(input.emergencyPhone2 !== undefined ? { emergencyPhone2: input.emergencyPhone2 } : {}),
      ...(input.major !== undefined ? { major: input.major } : {}),
      ...(input.minor !== undefined ? { minor: input.minor } : {}),
      ...(input.admitTerm !== undefined ? { admitTerm: input.admitTerm } : {}),
      ...(input.expectedGrad !== undefined ? { expectedGrad: input.expectedGrad } : {}),
      ...(input.enrollmentStatus !== undefined ? { enrollmentStatus: input.enrollmentStatus } : {}),
      ...(input.catalogYear !== undefined ? { catalogYear: input.catalogYear } : {}),
    };

    await this.prisma.$transaction([
      ...(Object.keys(personData).length ? [this.prisma.person.update({ where: { id: student.personId }, data: personData })] : []),
      this.prisma.student.update({ where: { id: studentId }, data: studentData }),
      this.prisma.auditLog.create({ data: { entity: "Student", entityId: studentId, action: "student-updated", actorId } }),
    ]);
    return this.adminStudentDetail(studentId);
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
    input: { title: string; kind: string; category?: string; fileUrl?: string; fileName?: string },
    personId: string,
    isAdmin: boolean,
  ) {
    await this.assertSectionOwner(sectionId, personId, isAdmin);
    const material = await this.prisma.sectionMaterial.create({
      data: {
        sectionId,
        title: input.title,
        kind: input.kind,
        ...(input.category ? { category: input.category as never } : {}),
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

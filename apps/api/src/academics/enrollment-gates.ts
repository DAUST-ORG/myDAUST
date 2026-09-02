import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@mydaust/db";
import {
  type EnrollmentGate,
  type EnrollmentGateFailure,
} from "@mydaust/shared";
import { bestPointsByCourse } from "../transcript/transcript-calculation.js";
import {
  MAX_CREDITS_PER_TERM,
  STANDING_RANK,
  meetingsOverlap,
  meetsPrerequisite,
} from "./academics.service.js";

/**
 * Evaluate the single-section gates used by enrollment-override review,
 * returning waivable failures instead of throwing. Self-service enrollment
 * uses the bundle-aware path in AcademicsService; keep its policy changes
 * mirrored here so every override is rechecked against the same gates.
 *
 * Hard invariants (term ended, duplicate enrollment, closed section) are NOT waivable and
 * always throw -- they are not gates, they are data-integrity checks.
 */
export async function evaluateEnrollmentGates(
  tx: Prisma.TransactionClient,
  studentId: string,
  sectionId: string,
): Promise<EnrollmentGateFailure[]> {
  const locked = await tx.$queryRaw<
    { id: string; capacity: number; courseId: string; termId: string }[]
  >`SELECT id, capacity, "courseId", "termId" FROM "Section" WHERE id = ${sectionId} FOR UPDATE`;
  const section = locked[0];
  if (!section) throw new NotFoundException("Section not found");
  const lockedStudent = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Student" WHERE id = ${studentId} FOR UPDATE
  `;
  if (!lockedStudent[0]) throw new NotFoundException("Student not found");

  const term = await tx.term.findUniqueOrThrow({
    where: { id: section.termId },
  });
  const failures: EnrollmentGateFailure[] = [];

  // Gate: add deadline
  if (term.endDate.getTime() < Date.now()) {
    // Not waivable -- term already ended. Caller will throw.
    throw new BadRequestException("Registration is closed for this term");
  }
  if (term.addDeadline && term.addDeadline.getTime() < Date.now()) {
    failures.push({
      gate: "add_deadline",
      closedOn: term.addDeadline.toISOString().slice(0, 10),
    });
  }

  // Duplicate enrollment is a hard invariant -- never waivable.
  const existing = await tx.enrollment.findUnique({
    where: { studentId_sectionId: { studentId, sectionId } },
  });
  if (existing?.status === "enrolled") {
    throw new ConflictException("Already enrolled");
  }

  const full = await tx.section.findUniqueOrThrow({ where: { id: sectionId } });
  if (full.status === "closed") {
    // Hard invariant.
    throw new ConflictException("This section is closed for registration");
  }

  // Gate: capacity
  const taken = await tx.enrollment.count({
    where: { sectionId, status: "enrolled" },
  });
  if (taken >= section.capacity) {
    failures.push({ gate: "capacity", taken, capacity: section.capacity });
  }

  // Gate: holds
  const holds = await tx.studentHold.findMany({
    where: { studentId, active: true },
  });
  if (holds.length > 0) {
    failures.push({
      gate: "holds",
      kinds: [...new Set(holds.map((h) => h.type))],
    });
  }

  const course = await tx.course.findUniqueOrThrow({
    where: { id: section.courseId },
    include: {
      prereqRules: { include: { prereqCourse: true } },
      coreqRules: { include: { coreqCourse: true } },
      rule: true,
    },
  });

  // Gate: prerequisites
  const completed = await tx.transcriptEntry.findMany({
    where: { studentId, voidedAt: null, courseId: { not: null } },
    select: {
      courseId: true,
      courseCode: true,
      credits: true,
      earnedCredits: true,
      gradePoints: true,
      countsTowardGpa: true,
      countsTowardCredits: true,
    },
  });
  const bestGrade = bestPointsByCourse(completed);
  const unmetPrereqs = course.prereqRules.filter(
    (pr) => !meetsPrerequisite(bestGrade, pr.prereqCourseId, pr.minGrade),
  );
  if (unmetPrereqs.length > 0) {
    failures.push({
      gate: "prerequisite",
      courses: unmetPrereqs.map((pr) => ({
        code: pr.prereqCourse.code,
        minGrade: pr.minGrade ?? null,
      })),
    });
  }

  // Term context for coreq / clash / credit cap.
  const termEnrollments = await tx.enrollment.findMany({
    where: {
      studentId,
      status: "enrolled",
      section: { termId: section.termId },
    },
    include: { section: { include: { course: true } } },
  });

  // A second section of the same course is a duplicate enrollment just as
  // surely as reusing the exact same section. Keep this non-waivable: an
  // override may relax an academic gate, but it must not create two active
  // same-term attempts for one course.
  if (
    termEnrollments.some(
      (enrollment) => enrollment.section.courseId === section.courseId,
    )
  ) {
    throw new ConflictException(`Already enrolled in ${course.code}`);
  }

  // Gate: corequisites
  if (course.coreqRules.length > 0) {
    const heldCourseIds = new Set(
      termEnrollments.map((e) => e.section.courseId),
    );
    const missingCoreqs = course.coreqRules
      .filter(
        (c) =>
          !heldCourseIds.has(c.coreqCourseId) &&
          !bestGrade.has(c.coreqCourseId),
      )
      .map((c) => c.coreqCourse.code);
    if (missingCoreqs.length > 0) {
      failures.push({ gate: "corequisite", courses: missingCoreqs });
    }
  }

  // Gate: timetable clash -- hard invariant, never waivable. Matches enroll()
  // order: clash is checked BEFORE credit_cap so the student sees the real
  // blocker rather than a waivable red herring.
  const clash = termEnrollments.find((e) => meetingsOverlap(e.section, full));
  if (clash) {
    throw new ConflictException(
      `Time conflict with ${clash.section.course.code} (${clash.section.days} ${clash.section.startTime}-${clash.section.endTime})`,
    );
  }

  // Gate: credit cap
  const currentCredits = termEnrollments.reduce(
    (s, e) => s + e.section.course.credits,
    0,
  );
  if (currentCredits + course.credits > MAX_CREDITS_PER_TERM) {
    failures.push({
      gate: "credit_cap",
      currentCredits,
      afterAdd: currentCredits + course.credits,
      ceiling: MAX_CREDITS_PER_TERM,
    });
  }

  // Gate: recordStatus
  const studentForStatus = await tx.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { recordStatus: true },
  });
  if (studentForStatus.recordStatus !== "active") {
    failures.push({
      gate: "record_status",
      status: studentForStatus.recordStatus,
    });
  }

  // Gate: standing
  if (course.rule?.standingRequired) {
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { yearLevel: true },
    });
    const firstWord = course.rule.standingRequired.trim().split(/\s+/)[0] ?? "";
    const needed = STANDING_RANK[firstWord.toLowerCase()];
    const yr = student.yearLevel ?? 0;
    if (needed !== undefined && yr > 0 && yr < needed) {
      failures.push({
        gate: "standing",
        required: course.rule.standingRequired,
        actual: yr,
      });
    }
  }

  // Gate: major restriction
  if (course.rule?.majorRestriction) {
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { program: true },
    });
    const allowed = course.rule.majorRestriction.toLowerCase();
    const mine = (student.major ?? student.program?.name ?? "").toLowerCase();
    const tokens = allowed
      .split(/[/,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tokenHeads = tokens.map((t) => t.split(/\s+/)[0] ?? t);
    if (mine && !tokenHeads.some((head) => mine.includes(head))) {
      failures.push({
        gate: "major_restriction",
        required: course.rule.majorRestriction,
      });
    }
  }

  return failures;
}

/** Filter the failures against the registrar's waiver set. Returns the gates still
 * blocking enrollment after waivers are applied. Capacity is bumped by the caller; this
 * helper only validates the waivers are consistent. */
export function unwavedFailures(
  failures: EnrollmentGateFailure[],
  waived: Iterable<EnrollmentGate>,
): EnrollmentGateFailure[] {
  const waivedSet = new Set(waived);
  return failures.filter((f) => !waivedSet.has(f.gate));
}

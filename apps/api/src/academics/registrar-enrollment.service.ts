import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type EnrollmentGateFailure,
  REGISTRAR_WAIVABLE_GATES,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  DROP_GUARD_INCLUDE,
  gradedWorkBlockingDrop,
} from "./enrollment-drop-guard.js";
import { evaluateEnrollmentGates } from "./enrollment-gates.js";

/** Plain-language reason for a gate, for an error a registrar has to act on. */
export function describeGateFailure(failure: EnrollmentGateFailure): string {
  switch (failure.gate) {
    case "capacity":
      return `the section is full (${failure.taken} of ${failure.capacity} seats)`;
    case "holds":
      return `the student has an active hold (${failure.kinds.join(", ")})`;
    case "record_status":
      return `the student record is ${failure.status}, not active`;
    case "prerequisite":
      return `missing prerequisite ${failure.courses.map((c) => c.code).join(", ")}`;
    case "corequisite":
      return `missing corequisite ${failure.courses.join(", ")}`;
    case "credit_cap":
      return `over the credit ceiling (${failure.afterAdd} of ${failure.ceiling})`;
    case "standing":
      return `requires ${failure.required}`;
    case "major_restriction":
      return `restricted to ${failure.required}`;
    case "add_deadline":
      return `the add period closed on ${failure.closedOn}`;
  }
}

/**
 * Roster editing for the registrar: read a section's enrollments and place a
 * student on it directly.
 *
 * A sibling of AcademicsService rather than a method on it, because the gate
 * evaluation lives in enrollment-gates, which imports AcademicsService — going
 * through the service would make that import circular.
 */
@Injectable()
export class RegistrarEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every enrollment ever made against the section, dropped rows included and
   * each carrying the enrollmentId the drop endpoint needs. Deliberately not
   * AcademicsService.roster(), which is scoped to live enrollments of active
   * students and returns no id, so it cannot drive an edit.
   */
  async sectionEnrollments(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true, term: true, instructor: true },
    });
    if (!section) throw new NotFoundException("Section not found");

    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId },
      include: {
        student: { include: { person: true, program: true } },
        ...DROP_GUARD_INCLUDE,
      },
      orderBy: [{ status: "asc" }, { enrolledAt: "asc" }],
    });

    const now = Date.now();
    const deadlinePassed = (at: Date | null) =>
      at ? at.getTime() < now : false;

    return {
      section: {
        id: section.id,
        courseCode: section.course.code,
        courseTitle: section.course.title,
        credits: section.course.credits,
        sectionCode: section.sectionCode,
        status: section.status,
        capacity: section.capacity,
        seatsTaken: enrollments.filter((e) => e.status === "enrolled").length,
        days: section.days,
        schedule: `${section.days} ${section.startTime}–${section.endTime}`,
        room: section.room,
        instructor: section.instructor
          ? `${section.instructor.firstName} ${section.instructor.lastName}`
          : null,
        termName: section.term.name,
        addDeadline: section.term.addDeadline?.toISOString() ?? null,
        dropDeadline: section.term.dropDeadline?.toISOString() ?? null,
        addDeadlinePassed: deadlinePassed(section.term.addDeadline),
        dropDeadlinePassed: deadlinePassed(section.term.dropDeadline),
      },
      enrollments: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        studentNo: enrollment.student.studentNo,
        name: `${enrollment.student.person.firstName} ${enrollment.student.person.lastName}`,
        email: enrollment.student.person.email,
        program: enrollment.student.program?.code ?? null,
        recordStatus: enrollment.student.recordStatus,
        status: enrollment.status,
        grade: enrollment.grade,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        // The UI disables Remove using the server's own reason, rather than
        // offering a button that is guaranteed to fail.
        removalBlockedReason:
          enrollment.status === "enrolled"
            ? gradedWorkBlockingDrop(enrollment)
            : null,
      })),
    };
  }

  /**
   * Place a student on the roster.
   *
   * Gates are evaluated with the same function the override-approval path
   * uses, so registrar policy cannot drift from what a student would face.
   * Academic gates are waived and recorded on the audit entry; capacity, holds
   * and record status still block. The hard invariants — timetable clash,
   * duplicate enrollment, closed section, ended term — throw inside
   * evaluateEnrollmentGates and never reach the waiver check.
   */
  async enrollStudent(
    sectionId: string,
    studentId: string,
    actorId: string,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const failures = await evaluateEnrollmentGates(tx, studentId, sectionId);
      const blocking = failures.filter(
        (failure) => !REGISTRAR_WAIVABLE_GATES.has(failure.gate),
      );
      if (blocking.length > 0) {
        throw new ConflictException(
          `Cannot add this student — ${blocking.map(describeGateFailure).join("; ")}.`,
        );
      }

      // Enrollment is unique on (studentId, sectionId), so a student who was
      // dropped earlier is revived rather than duplicated.
      const existing = await tx.enrollment.findUnique({
        where: { studentId_sectionId: { studentId, sectionId } },
      });
      const row = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status: "enrolled", enrolledAt: new Date() },
          })
        : await tx.enrollment.create({
            data: { studentId, sectionId, status: "enrolled" },
          });

      await tx.auditLog.create({
        data: {
          entity: "Enrollment",
          entityId: row.id,
          action: "admin-enrolled",
          actorId,
          data: {
            sectionId,
            studentId,
            reason,
            waivedGates: failures.map((failure) => failure.gate),
            revivedFromDropped: existing?.status === "dropped",
          },
        },
      });

      return {
        enrollmentId: row.id,
        status: row.status,
        waivedGates: failures.map((failure) => failure.gate),
      };
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type ApprovalRequestStatus } from "@mydaust/db";
import {
  FACULTY_WAIVABLE_GATES,
  type EnrollmentGate,
  type EnrollmentGateFailure,
} from "@mydaust/shared";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  evaluateEnrollmentGates,
  unwavedFailures,
} from "./enrollment-gates.js";

const OVERRIDE_TARGET_TYPE = "Section" as const;

/**
 * Student-initiated enrollment override flow.
 *
 * Lifecycle:
 *   1. Student calls `request()` after enroll() rejects them. The service runs the same
 *      gate evaluator enroll() runs and stores the structured failures on the approval
 *      row so the registrar/faculty sees exactly what is blocking.
 *   2. Admin calls `approve(waivedGates)` or faculty calls `facultyApprove(waivedGates)`
 *      to pick which gates to waive. The apply path runs enroll() with those gates
 *      skipped, and bumps Section.capacity by 1 if capacity was waived.
 *   3. Admin or faculty can `reject()` / `facultyReject()` (with reason) and the student
 *      can `cancel()` their own request.
 */
@Injectable()
export class EnrollmentOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Build the request: capture current gate failures so the reviewer sees what they
   * are approving against, not just a free-form reason. The entire operation is
   * transactional so the approval request, event, and audit log are consistent. */
  async request(actor: AuthUser, input: {
    sectionId: string;
    reason: string;
    requestedWaivers: EnrollmentGate[];
  }) {
    if (!actor.studentId && !actor.roles.includes("admin")) {
      throw new ForbiddenException("Only a student may submit an override");
    }
    const studentId = actor.studentId;
    if (!studentId) {
      throw new BadRequestException("Student identity is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: { id: true, recordStatus: true },
      });
      if (!student) throw new NotFoundException("Student not found");

      const failures = await evaluateEnrollmentGates(tx, studentId, input.sectionId);

      // Idempotency: at most one pending request per (student, section). A previous
      // pending request blocks a new submission until the reviewer decides.
      const pending = await tx.approvalRequest.findFirst({
        where: {
          kind: "student_enrollment_override",
          targetType: OVERRIDE_TARGET_TYPE,
          targetId: input.sectionId,
          status: "pending",
          requestedById: actor.personId,
        },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException(
          "An override request for this section is already awaiting a decision",
        );
      }

      const created = await tx.approvalRequest.create({
        data: {
          kind: "student_enrollment_override",
          status: "pending",
          targetType: OVERRIDE_TARGET_TYPE,
          targetId: input.sectionId,
          reason: input.reason.trim(),
          beforeJson: Prisma.JsonNull,
          afterJson: {
            studentId,
            sectionId: input.sectionId,
            requestedWaivers: input.requestedWaivers,
            failures,
          } satisfies Prisma.InputJsonValue,
          baseRevision: 0,
          requestedById: actor.personId,
        },
      });
      await tx.approvalEvent.create({
        data: {
          requestId: created.id,
          action: "submitted",
          actorId: actor.personId,
          data: {
            requestedWaivers: input.requestedWaivers,
            failureCount: failures.length,
          } satisfies Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "EnrollmentOverrideRequest",
          entityId: created.id,
          action: "submitted",
          actorId: actor.personId,
          data: {
            sectionId: input.sectionId,
            studentId,
            failureCount: failures.length,
          } satisfies Prisma.InputJsonValue,
        },
      });
      return { id: created.id, status: created.status, failures };
    });
  }

  /** List the requesting student's own pending + recent decisions. */
  async listMine(actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    return this.prisma.approvalRequest.findMany({
      where: {
        kind: "student_enrollment_override",
        requestedById: actor.personId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        events: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  /** Admin path: pick the gates to waive, then apply. Uses CAS on the approval
   * row to prevent concurrent double-approvals. */
  async approve(
    id: string,
    actor: AuthUser,
    input: { waivedGates: EnrollmentGate[]; note?: string },
  ) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only an administrator can approve overrides");
    }
    if (!input.waivedGates || input.waivedGates.length === 0) {
      throw new BadRequestException(
        "Pick at least one gate to waive, or reject the request",
      );
    }
    const result = await this.applyApproval(id, actor, input.waivedGates, input.note);
    // Notify student outside the transaction -- notification failure must not roll
    // back the approval, and emit() swallows errors by design.
    await this.sendApprovalNotification(id, result.studentId, "override_approved",
      "Override approved",
      `Your enrollment override for this section was approved.${input.note ? ` Note: ${input.note}` : ""}`,
    );
    return { id: result.id, status: result.status as ApprovalRequestStatus, enrollmentId: result.enrollmentId };
  }

  async reject(id: string, actor: AuthUser, reason: string) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only an administrator can reject overrides");
    }
    if (!reason.trim()) {
      throw new BadRequestException("A rejection reason is required");
    }
    const result = await this.decideWithoutApply(id, actor.personId, "rejected", reason.trim());
    await this.sendApprovalNotification(id, result.studentId, "override_rejected",
      "Override rejected",
      `Your enrollment override request was rejected. Reason: ${reason.trim()}`,
    );
    return { id: result.id, status: result.status };
  }

  async cancel(id: string, actor: AuthUser, note?: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException("Approval request not found");
    if (
      request.requestedById !== actor.personId &&
      !actor.roles.includes("admin")
    ) {
      throw new ForbiddenException("You can cancel only your own request");
    }
    return this.decideWithoutApply(
      id,
      actor.personId,
      "cancelled",
      note?.trim() || "",
    );
  }

  /** Faculty list: override requests for sections the faculty member teaches in the
   * current term. Admin bypasses the ownership check. */
  async listForFaculty(actor: AuthUser) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    const isAdmin = actor.roles.includes("admin");
    const where: Prisma.ApprovalRequestWhereInput = {
      kind: "student_enrollment_override",
      ...(isAdmin
        ? {}
        : {
            targetId: {
              in: await this.prisma.section
                .findMany({
                  where: {
                    instructorId: actor.personId,
                    term: { status: "active" },
                  },
                  select: { id: true },
                })
                .then((s) => s.map((x) => x.id)),
            },
          }),
    };
    return this.prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            student: { select: { studentNo: true } },
          },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  /** Faculty approve: waives only FACULTY_WAIVABLE_GATES, with section ownership check. */
  async facultyApprove(
    id: string,
    actor: AuthUser,
    input: { waivedGates: EnrollmentGate[]; note?: string },
  ) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    if (!input.waivedGates || input.waivedGates.length === 0) {
      throw new BadRequestException(
        "Pick at least one gate to waive, or reject the request",
      );
    }
    for (const gate of input.waivedGates) {
      if (!FACULTY_WAIVABLE_GATES.has(gate)) {
        throw new ForbiddenException(
          `Faculty may not waive gate "${gate}" — only an administrator can`,
        );
      }
    }
    const result = await this.applyApproval(id, actor, input.waivedGates, input.note, true);
    await this.sendApprovalNotification(id, result.studentId, "override_approved",
      "Override approved",
      `Your enrollment override for this section was approved.${input.note ? ` Note: ${input.note}` : ""}`,
    );
    return { id: result.id, status: result.status as ApprovalRequestStatus, enrollmentId: result.enrollmentId };
  }

  /** Faculty reject: with section ownership check. */
  async facultyReject(id: string, actor: AuthUser, reason: string) {
    if (!actor.personId) throw new ForbiddenException("Sign in required");
    if (!reason.trim()) {
      throw new BadRequestException("A rejection reason is required");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Approval request not found");
      if (request.kind !== "student_enrollment_override") {
        throw new BadRequestException("Not an enrollment override request");
      }
      const after = request.afterJson as { sectionId: string };
      if (!actor.roles.includes("admin")) {
        const section = await tx.section.findUnique({
          where: { id: after.sectionId },
          select: { instructorId: true },
        });
        if (!section || section.instructorId !== actor.personId) {
          throw new ForbiddenException("You do not teach this section");
        }
      }
      const claimed = await tx.approvalRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          status: "rejected" satisfies ApprovalRequestStatus,
          reviewedById: actor.personId,
          reviewedAt: new Date(),
          decisionNote: reason.trim(),
        },
      });
      if (claimed.count === 0) {
        const current = await tx.approvalRequest.findUnique({ where: { id } });
        throw new BadRequestException(
          `Request is already ${current?.status ?? "unknown"}`,
        );
      }
      await tx.approvalEvent.create({
        data: {
          requestId: id,
          action: "rejected",
          actorId: actor.personId,
          data: { note: reason.trim() } satisfies Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "EnrollmentOverrideRequest",
          entityId: id,
          action: "rejected",
          actorId: actor.personId,
          data: { note: reason.trim() },
        },
      });
      return { id, status: "rejected" as const, studentId: request.requestedById };
    });
    await this.sendApprovalNotification(id, result.studentId, "override_rejected",
      "Override rejected",
      `Your enrollment override request was rejected. Reason: ${reason.trim()}`,
    );
    return { id: result.id, status: result.status };
  }

  /** Look up the requester and send a best-effort notification. Catches internally
   * so notification failure never breaks the caller. */
  private async sendApprovalNotification(
    requestId: string,
    fallbackPersonId: string,
    kind: "override_approved" | "override_rejected",
    title: string,
    body: string,
  ) {
    try {
      const row = await this.prisma.approvalRequest.findUnique({
        where: { id: requestId },
        select: { requestedById: true },
      });
      const personId = row?.requestedById ?? fallbackPersonId;
      if (personId) {
        await this.notifyStudent(personId, kind, title, body, "/student/overrides");
      }
    } catch {
      /* notification is best-effort */
    }
  }

  private async notifyStudent(
    personId: string,
    kind: "override_approved" | "override_rejected",
    title: string,
    body: string,
    href?: string,
  ) {
    await this.notifications.emit([
      { personId, kind, title, body, href },
    ]);
  }

  /** Shared apply logic for admin and faculty approve. Runs inside a transaction
   * with CAS on the approval request row to prevent concurrent double-approvals. */
  private async applyApproval(
    id: string,
    actor: AuthUser,
    waivedGates: EnrollmentGate[],
    note?: string,
    isFaculty = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Approval request not found");
      if (request.kind !== "student_enrollment_override") {
        throw new BadRequestException("Not an enrollment override request");
      }
      if (request.status !== "pending") {
        throw new BadRequestException(
          `Request is already ${request.status}`,
        );
      }

      const after = request.afterJson as {
        studentId: string;
        sectionId: string;
        requestedWaivers: EnrollmentGate[];
        failures: EnrollmentGateFailure[];
      };

      // Ownership: faculty must teach the section. Admin bypasses.
      if (!actor.roles.includes("admin")) {
        const section = await tx.section.findUnique({
          where: { id: after.sectionId },
          select: { instructorId: true },
        });
        if (!section || section.instructorId !== actor.personId) {
          throw new ForbiddenException("You do not teach this section");
        }
      }

      const waived = new Set(waivedGates);
      const validGates = new Set(after.failures.map((f) => f.gate));
      for (const gate of waived) {
        if (!validGates.has(gate)) {
          throw new BadRequestException(
            `Gate "${gate}" did not block this enrollment, nothing to waive`,
          );
        }
      }

      const freshFailures = await evaluateEnrollmentGates(
        tx,
        after.studentId,
        after.sectionId,
      );
      const stillBlocking = unwavedFailures(freshFailures, waived);
      if (stillBlocking.length > 0) {
        throw new BadRequestException(
          `Cannot apply: ${stillBlocking.map((g) => g.gate).join(", ")} still blocked after waivers`,
        );
      }

      if (waived.has("capacity")) {
        await tx.section.update({
          where: { id: after.sectionId },
          data: { capacity: { increment: 1 } },
        });
      }

      const existing = await tx.enrollment.findUnique({
        where: {
          studentId_sectionId: {
            studentId: after.studentId,
            sectionId: after.sectionId,
          },
        },
      });
      const enrollment = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status: "enrolled", enrolledAt: new Date() },
          })
        : await tx.enrollment.create({
            data: {
              studentId: after.studentId,
              sectionId: after.sectionId,
              status: "enrolled",
            },
          });
      await tx.auditLog.create({
        data: {
          entity: "Enrollment",
          entityId: enrollment.id,
          action: "enrolled-via-override",
          actorId: actor.personId,
          data: {
            requestId: id,
            waivedGates: [...waived],
            approvedBy: isFaculty ? "faculty" : "admin",
          } satisfies Prisma.InputJsonValue,
        },
      });

      // CAS: claim the pending row. If another transaction already approved/rejected
      // this request, count will be 0 and we bail.
      const claimed = await tx.approvalRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          status: "approved" satisfies ApprovalRequestStatus,
          reviewedById: actor.personId,
          reviewedAt: new Date(),
          appliedAt: new Date(),
          decisionNote: note?.trim() || null,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.approvalRequest.findUnique({ where: { id } });
        throw new BadRequestException(
          `Request is already ${current?.status ?? "unknown"}`,
        );
      }

      await tx.approvalEvent.create({
        data: {
          requestId: id,
          action: "approved",
          actorId: actor.personId,
          data: {
            waivedGates: [...waived],
            enrollmentId: enrollment.id,
            approvedBy: isFaculty ? "faculty" : "admin",
            note: note ?? null,
          } satisfies Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "EnrollmentOverrideRequest",
          entityId: id,
          action: "approved-and-applied",
          actorId: actor.personId,
          data: {
            waivedGates: [...waived],
            enrollmentId: enrollment.id,
            approvedBy: isFaculty ? "faculty" : "admin",
          } satisfies Prisma.InputJsonValue,
        },
      });
      return {
        id,
        status: "approved" as const,
        enrollmentId: enrollment.id,
        studentId: request.requestedById,
      };
    });
  }

  private async decideWithoutApply(
    id: string,
    actorId: string,
    status: ApprovalRequestStatus,
    note: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Approval request not found");
      if (request.kind !== "student_enrollment_override") {
        throw new BadRequestException("Not an enrollment override request");
      }
      const claimed = await tx.approvalRequest.updateMany({
        where: { id, status: "pending" },
        data: {
          status,
          reviewedById: actorId,
          reviewedAt: new Date(),
          decisionNote: note,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.approvalRequest.findUnique({
          where: { id },
        });
        if (!current) throw new NotFoundException("Approval request not found");
        throw new BadRequestException(`Request is already ${current.status}`);
      }
      await tx.approvalEvent.create({
        data: {
          requestId: id,
          action: status,
          actorId,
          data: { note } satisfies Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "EnrollmentOverrideRequest",
          entityId: id,
          action: status,
          actorId,
          data: { note },
        },
      });
      return { id, status, studentId: request.requestedById };
    });
  }
}

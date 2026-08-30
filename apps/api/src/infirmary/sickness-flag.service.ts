import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

const EMERGENCY_RECIPIENTS_KEY = "infirmary.emergencyRecipients";

/**
 * Sick-flag flow: a nurse / infirmary admin marks a Consultation as sick-flagged.
 * For every active-term enrollment the student has today, today's AttendanceRecord
 * row is upserted to `status: absent` with `reason = sick | infirmary_emergency`,
 * `source: infirmary`. Faculty-of-today and the admin role receive a notification;
 * if `isEmergency`, the operator-configured emergency paging list is also notified.
 *
 * The sick flag overrides any prior faculty-recorded attendance for the day. That is
 * the user's intent ("faculty or student affairs can put down his absense as sick"):
 * once the student has been seen at the infirmary, the infirmary record is the
 * authoritative source for the day's absence.
 *
 * The recipient list is resolved in-line rather than via
 * `NotificationsService.emitForAudience` so this branch is independent of the
 * `utachicodes/notification-infra` PR — see the spec for the refactor path once
 * that branch merges.
 */
@Injectable()
export class SicknessFlagService {
  private readonly logger = new Logger(SicknessFlagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async flagSick(
    consultationId: string,
    isEmergency: boolean,
    actorPersonId: string,
    actorName: string,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        student: { include: { person: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!consultation) throw new NotFoundException("Consultation not found");

    const today = startOfUtcDay(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: consultation.studentId,
        section: {
          term: {
            startDate: { lte: tomorrow },
            endDate: { gte: today },
          },
        },
      },
      select: {
        id: true,
        sectionId: true,
        section: { select: { instructorId: true, days: true } },
      },
    });

    const reason = isEmergency ? "infirmary_emergency" : "sick";

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark the consultation as sick-flagged.
      const updated = await tx.consultation.update({
        where: { id: consultationId },
        data: {
          sickFlagged: true,
          sickFlaggedAt: new Date(),
          sickFlaggedById: actorPersonId,
        },
      });

      // 2. Upsert today's AttendanceRecord for every active-term enrollment.
      for (const e of enrollments) {
        await tx.attendanceRecord.upsert({
          where: { enrollmentId_date: { enrollmentId: e.id, date: today } },
          create: {
            enrollmentId: e.id,
            sectionId: e.sectionId,
            date: today,
            status: "absent",
            reason,
            source: "infirmary",
            notedById: actorPersonId,
          },
          update: {
            status: "absent",
            reason,
            source: "infirmary",
            notedById: actorPersonId,
          },
        });
      }

      // 3. Resolve notification recipients.
      const facultyIds = Array.from(
        new Set(
          enrollments
            .map((e) => e.section.instructorId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const adminIds = (
        await tx.person.findMany({
          where: { roles: { has: "admin" } },
          select: { id: true },
        })
      ).map((p) => p.id);

      let emergencyIds: string[] = [];
      if (isEmergency) {
        emergencyIds = await this.readEmergencyIds(tx);
      }

      const allRecipients = Array.from(
        new Set([...facultyIds, ...adminIds, ...emergencyIds]),
      );

      // 4. Emit one notification row per recipient.
      const studentName = `${consultation.student.person.firstName} ${consultation.student.person.lastName}`.trim();
      const kind = isEmergency
        ? "infirmary_emergency_flagged"
        : "infirmary_visit_logged";
      const title = isEmergency
        ? `Infirmary emergency: ${studentName}`
        : `${studentName} seen at the infirmary`;
      const body = isEmergency
        ? `${actorName} flagged a visit as an emergency. The student has been marked absent for today's sections.`
        : `${actorName} flagged a visit as sick. The student has been marked absent for today's sections.`;
      const href = `/infirmary/consultations/${consultation.id}`;

      if (allRecipients.length > 0) {
        await this.notifications.emit(
          allRecipients.map((personId) => ({
            personId,
            kind: kind as never,
            title,
            body,
            href,
          })),
        );
      }

      // 5. Audit log inside the transaction.
      await tx.auditLog.create({
        data: {
          entity: "Consultation",
          entityId: consultationId,
          action: "flag_sick",
          actorId: actorPersonId,
          data: {
            isEmergency,
            studentId: consultation.studentId,
            attendanceRowsWritten: enrollments.length,
            recipientCount: allRecipients.length,
            facultyCount: facultyIds.length,
            adminCount: adminIds.length,
            emergencyCount: emergencyIds.length,
          },
        },
      });

      return { updated, recipientCount: allRecipients.length };
    });

    return result;
  }

  async clearSick(consultationId: string, actorPersonId: string, actorName: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { id: true, studentId: true, sickFlaggedAt: true, sickFlaggedById: true },
    });
    if (!consultation) throw new NotFoundException("Consultation not found");

    // Only admin or the original flagger can clear.
    const actor = await this.prisma.person.findUnique({
      where: { id: actorPersonId },
      select: { roles: true },
    });
    if (!actor) throw new ForbiddenException("Actor not found");
    const isAdmin = actor.roles.includes("admin");
    if (!isAdmin) {
      throw new ForbiddenException("Only an admin can clear a sick flag");
    }

    const today = startOfUtcDay(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(async (tx) => {
      // Drop infirmary-source attendance rows that this flag created for today.
      await tx.attendanceRecord.deleteMany({
        where: {
          date: today,
          source: "infirmary",
          reason: { in: ["sick", "infirmary_emergency"] },
          enrollment: { studentId: consultation.studentId },
        },
      });

      const cleared = await tx.consultation.update({
        where: { id: consultationId },
        data: {
          sickFlagged: false,
          sickFlaggedAt: null,
          sickFlaggedById: null,
        },
      });

      // Notify admin + faculty-of-today that the flag was cleared.
      const enrollments = await tx.enrollment.findMany({
        where: {
          studentId: consultation.studentId,
          section: { term: { startDate: { lte: tomorrow }, endDate: { gte: today } } },
        },
        select: { section: { select: { instructorId: true } } },
      });
      const facultyIds = Array.from(
        new Set(
          enrollments
            .map((e) => e.section.instructorId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const adminIds = (
        await tx.person.findMany({
          where: { roles: { has: "admin" } },
          select: { id: true },
        })
      ).map((p) => p.id);
      const recipients = Array.from(new Set([...facultyIds, ...adminIds]));
      if (recipients.length > 0) {
        await this.notifications.emit(
          recipients.map((personId) => ({
            personId,
            kind: "infirmary_visit_logged" as never,
            title: "Sick flag cleared",
            body: `${actorName} cleared the sick flag on consultation ${consultationId.slice(0, 8)}.`,
            href: `/infirmary/consultations/${consultationId}`,
          })),
        );
      }

      await tx.auditLog.create({
        data: {
          entity: "Consultation",
          entityId: consultationId,
          action: "flag_sick_cleared",
          actorId: actorPersonId,
          data: { studentId: consultation.studentId, recipientCount: recipients.length },
        },
      });

      return { cleared, removedAttendanceRows: true };
    });

    return result;
  }

  async listFlaggedToday() {
    const today = startOfUtcDay(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const flagged = await this.prisma.consultation.findMany({
      where: {
        sickFlagged: true,
        sickFlaggedAt: { gte: today, lt: tomorrow },
      },
      orderBy: { sickFlaggedAt: "desc" },
      include: {
        student: { include: { person: { select: { firstName: true, lastName: true } } } },
        sickFlaggedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return flagged.map((c) => ({
      id: c.id,
      reason: c.reason,
      visitedAt: c.visitedAt,
      sickFlaggedAt: c.sickFlaggedAt,
      student: {
        id: c.student.id,
        name: `${c.student.person.firstName} ${c.student.person.lastName}`.trim(),
      },
      flaggedBy: c.sickFlaggedBy
        ? `${c.sickFlaggedBy.firstName} ${c.sickFlaggedBy.lastName}`.trim()
        : null,
    }));
  }

  private async readEmergencyIds(
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const row = await tx.appSetting.findUnique({
      where: { key: EMERGENCY_RECIPIENTS_KEY },
    });
    if (!row) return [];
    const value = row.valueJson;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
  }
}

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

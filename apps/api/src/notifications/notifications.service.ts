import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export type NotificationKind =
  | "grade_posted"
  | "assignment_created"
  | "work_graded"
  | "material_published"
  | "override_approved"
  | "override_rejected"
  | "form_response_received"
  | "infirmary_visit_logged"
  | "infirmary_emergency_flagged"
  | "helpdesk_ticket_created"
  | "helpdesk_ticket_updated"
  | "applicant_note_added";

interface NewNotification {
  personId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
}
/**
 * In-app only, deliberately. Nothing here sends mail: delivery is the nav badge and the
 * notifications list, so a failed notification can never fail the action that caused it.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fan out to many people at once. Never throws — a notification is a side effect of a
   * domain write, and losing one must not roll back a grade or a submission.
   */
  async emit(notifications: NewNotification[]) {
    if (notifications.length === 0) return { created: 0 };
    try {
      const result = await this.prisma.notification.createMany({
        data: notifications.map((n) => ({
          personId: n.personId,
          kind: n.kind,
          title: n.title,
          body: n.body ?? null,
          href: n.href ?? null,
        })),
      });
      return { created: result.count };
    } catch {
      return { created: 0 };
    }
  }

  /**
   * Resolve an audience, write one in-app row per recipient, and hand the resulting
   * ids off to the mail-delivery seam for any recipient whose channels include
   * `email`. Never throws — losing a notification must not roll back the action
   * that caused it.
   */
  async emitForAudience(
    recipients: ReadonlyArray<{
      personId: string;
      channels: ReadonlyArray<"in_app" | "email">;
    }>,
    template: {
      kind: NotificationKind;
      title: string;
      body?: string;
      href?: string;
    },
    mail: {
      deliver(
        inputs: ReadonlyArray<{
          notificationId: string;
          personId: string;
          title: string;
          body: string | null;
          href: string | null;
        }>,
      ): Promise<{ attempted: number; sent: number; deferred: number }>;
    },
  ): Promise<{ created: number; mailed: number }> {
    if (recipients.length === 0) return { created: 0, mailed: 0 };
    let created = 0;
    let mailed = 0;
    try {
      const result = await this.prisma.notification.createMany({
        data: recipients.map((r) => ({
          personId: r.personId,
          kind: template.kind,
          title: template.title,
          body: template.body ?? null,
          href: template.href ?? null,
        })),
      });
      created = result.count;
    } catch {
      return { created: 0, mailed: 0 };
    }

    const emailRecipients = recipients.filter((r) =>
      r.channels.includes("email"),
    );
    if (emailRecipients.length === 0) return { created, mailed: 0 };

    try {
      const written = await this.prisma.notification.findMany({
        where: {
          personId: { in: emailRecipients.map((r) => r.personId) },
          kind: template.kind,
          title: template.title,
          href: template.href ?? null,
        },
        orderBy: { createdAt: "desc" },
        take: emailRecipients.length,
        select: { id: true, personId: true, title: true, body: true, href: true },
      });
      const byPersonId = new Map<string, (typeof written)[number]>();
      for (const row of written) {
        if (!byPersonId.has(row.personId)) byPersonId.set(row.personId, row);
      }
      const inputs = emailRecipients
        .map((r) => {
          const row = byPersonId.get(r.personId);
          return row
            ? {
                notificationId: row.id,
                personId: row.personId,
                title: row.title,
                body: row.body,
                href: row.href,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const result = await mail.deliver(inputs);
      mailed = result.sent;
    } catch {
      // Mail hand-off is best-effort; the in-app rows are already committed.
    }
    return { created, mailed };
  }


  list(personId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  unreadCount(personId: string) {
    return this.prisma.notification.count({
      where: { personId, readAt: null },
    });
  }

  async markAllRead(personId: string) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { personId, readAt: null },
      data: { readAt: now },
    });
    return { marked: result.count };
  }

  async markRead(id: string, personId: string) {
    // Scoped by personId so one reader cannot clear another's notification.
    const result = await this.prisma.notification.updateMany({
      where: { id, personId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  }
}

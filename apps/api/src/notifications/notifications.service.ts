import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export type NotificationKind =
  | "grade_posted"
  | "assignment_created"
  | "work_graded"
  | "material_published"
  | "form_response_received";

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

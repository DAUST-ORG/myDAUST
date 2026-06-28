import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthUser } from "../auth/current-user.js";

@Injectable()
export class CommsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Announcements targeted at the user's audience (always includes "all"). */
  async announcements(user: AuthUser) {
    const audiences = new Set<string>(["all"]);
    if (user.roles.includes("student")) audiences.add("student");
    if (user.roles.includes("faculty")) audiences.add("faculty");
    if (user.roles.some((r) => r !== "student" && r !== "faculty")) audiences.add("staff");

    return this.prisma.announcement.findMany({
      where: { audience: { in: [...audiences] } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  // --- Messaging ---

  /** Threads the person participates in, with the other party, last message, and unread count. */
  async myThreads(personId: string) {
    const threads = await this.prisma.thread.findMany({
      where: { participants: { some: { personId } } },
      orderBy: { updatedAt: "desc" },
      include: {
        participants: { include: { person: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return Promise.all(
      threads.map(async (t) => {
        const me = t.participants.find((p) => p.personId === personId);
        const other = t.participants.find((p) => p.personId !== personId)?.person;
        const last = t.messages[0];
        const unread = await this.prisma.message.count({
          where: {
            threadId: t.id,
            senderId: { not: personId },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        });
        return {
          id: t.id,
          subject: t.subject,
          who: other ? `${other.firstName} ${other.lastName}` : "Conversation",
          role: other?.roles[0] ?? "",
          initials: other ? `${other.firstName[0] ?? ""}${other.lastName[0] ?? ""}` : "?",
          preview: last?.body ?? "",
          time: (last?.createdAt ?? t.updatedAt).toISOString(),
          unread,
        };
      }),
    );
  }

  private async assertParticipant(threadId: string, personId: string) {
    const part = await this.prisma.threadParticipant.findUnique({
      where: { threadId_personId: { threadId, personId } },
    });
    if (!part) throw new ForbiddenException("Not a participant in this thread");
    return part;
  }

  /** Full thread (messages + header), marking it read for the requesting person. */
  async getThread(threadId: string, personId: string) {
    await this.assertParticipant(threadId, personId);
    const thread = await this.prisma.thread.findUniqueOrThrow({
      where: { id: threadId },
      include: {
        participants: { include: { person: true } },
        messages: { orderBy: { createdAt: "asc" }, include: { sender: true } },
      },
    });
    await this.prisma.threadParticipant.update({
      where: { threadId_personId: { threadId, personId } },
      data: { lastReadAt: new Date() },
    });

    const other = thread.participants.find((p) => p.personId !== personId)?.person;
    return {
      id: thread.id,
      subject: thread.subject,
      who: other ? `${other.firstName} ${other.lastName}` : "Conversation",
      role: other?.roles[0] ?? "",
      initials: other ? `${other.firstName[0] ?? ""}${other.lastName[0] ?? ""}` : "?",
      messages: thread.messages.map((m) => ({
        id: m.id,
        body: m.body,
        me: m.senderId === personId,
        sender: `${m.sender.firstName} ${m.sender.lastName}`,
        time: m.createdAt.toISOString(),
      })),
    };
  }

  async sendMessage(threadId: string, personId: string, body: string) {
    await this.assertParticipant(threadId, personId);
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { threadId, senderId: personId, body } }),
      this.prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
      this.prisma.threadParticipant.update({
        where: { threadId_personId: { threadId, personId } },
        data: { lastReadAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Start (or reuse) a 1:1 thread with an allowed contact, so conversations don't fragment. */
  async startThread(personId: string, recipientId: string, subject: string | undefined, body: string) {
    const allowed = await this.contacts(personId);
    if (!allowed.some((c) => c.id === recipientId)) {
      throw new ForbiddenException("You cannot message this person");
    }

    const existing = await this.prisma.thread.findFirst({
      where: {
        participants: { every: { personId: { in: [personId, recipientId] } } },
        AND: [
          { participants: { some: { personId } } },
          { participants: { some: { personId: recipientId } } },
        ],
      },
    });

    const thread =
      existing ??
      (await this.prisma.thread.create({
        data: { subject, participants: { create: [{ personId }, { personId: recipientId }] } },
      }));

    await this.sendMessage(thread.id, personId, body);
    return { threadId: thread.id };
  }

  /** Directory of people the requester may message, scoped by role/relationship. */
  async contacts(personId: string) {
    const me = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      include: { student: true },
    });

    const ids = new Set<string>();

    if (me.roles.includes("student") && me.student) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { studentId: me.student.id, status: { in: ["enrolled", "completed"] } },
        include: { section: { select: { instructorId: true } } },
      });
      for (const e of enrollments) if (e.section.instructorId) ids.add(e.section.instructorId);
    }

    if (me.roles.includes("faculty")) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { section: { instructorId: personId }, status: { in: ["enrolled", "completed"] } },
        include: { student: { select: { personId: true } } },
      });
      for (const e of enrollments) ids.add(e.student.personId);
    }

    // Support staff are reachable by everyone.
    const staff = await this.prisma.person.findMany({
      where: { roles: { hasSome: ["registrar", "bursar", "student_affairs", "admin"] } },
      select: { id: true },
    });
    for (const s of staff) ids.add(s.id);

    // Staff/admin requesters can reach anyone with a role.
    if (me.roles.some((r) => !["student", "faculty"].includes(r))) {
      const all = await this.prisma.person.findMany({ where: { roles: { isEmpty: false } }, select: { id: true } });
      for (const p of all) ids.add(p.id);
    }

    ids.delete(personId);
    const people = await this.prisma.person.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ lastName: "asc" }],
    });
    return people.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      role: p.roles[0] ?? "",
      initials: `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`,
    }));
  }
}

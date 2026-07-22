import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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

  createAnnouncement(
    input: { title: string; body: string; category: string; audience: string },
    author: string,
  ) {
    return this.prisma.announcement.create({
      data: { title: input.title, body: input.body, category: input.category, audience: input.audience, author },
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

  /**
   * Message every student enrolled in one of the caller's own sections.
   *
   * Fans out into ordinary one-to-one threads rather than a group thread, so a
   * student's reply reaches only the instructor. Ownership is checked here: an
   * instructor may only broadcast to a section they teach.
   */
  async broadcastToSection(personId: string, sectionId: string, subject: string | undefined, body: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        course: true,
        enrollments: {
          where: { status: "enrolled" },
          include: { student: { select: { personId: true } } },
        },
      },
    });
    if (!section) throw new NotFoundException("Section not found");
    if (section.instructorId !== personId) {
      throw new ForbiddenException("You do not teach this section");
    }

    const recipients = section.enrollments.map((e) => e.student.personId);
    for (const recipientId of recipients) {
      await this.startThread(personId, recipientId, subject, body);
    }
    return { sent: recipients.length, course: section.course.code };
  }

  /**
   * Registrar broadcast: message a whole audience (one student, a year, a
   * programme, or every student). Unlike startThread this does not gate on the
   * caller's contacts — a registrar is authorised to reach any student by role,
   * checked at the controller — and it fans out into individual 1:1 threads so a
   * reply goes back only to the registrar. The Broadcast row records what was sent.
   */
  async broadcastToAudience(
    personId: string,
    input: { audienceType: "individual" | "year" | "program" | "all"; audienceValue?: string; subject: string; body: string },
  ) {
    const recipientIds = await this.resolveAudience(input.audienceType, input.audienceValue);
    if (recipientIds.length === 0) throw new BadRequestException("That audience has no students");

    for (const recipientId of recipientIds) {
      const existing = await this.prisma.thread.findFirst({
        where: {
          AND: [
            { participants: { some: { personId } } },
            { participants: { some: { personId: recipientId } } },
          ],
        },
      });
      const thread =
        existing ??
        (await this.prisma.thread.create({
          data: { subject: input.subject, participants: { create: [{ personId }, { personId: recipientId }] } },
        }));
      await this.sendMessage(thread.id, personId, input.body);
    }

    const broadcast = await this.prisma.broadcast.create({
      data: {
        senderId: personId,
        audienceType: input.audienceType,
        audienceValue: input.audienceValue ?? null,
        subject: input.subject,
        body: input.body,
        recipientCount: recipientIds.length,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Broadcast",
        entityId: broadcast.id,
        action: "broadcast-sent",
        actorId: personId,
        data: { audienceType: input.audienceType, audienceValue: input.audienceValue ?? null, recipients: recipientIds.length },
      },
    });
    return { id: broadcast.id, sent: recipientIds.length };
  }

  private async resolveAudience(
    audienceType: "individual" | "year" | "program" | "all",
    audienceValue?: string,
  ): Promise<string[]> {
    if (audienceType === "individual") {
      if (!audienceValue) throw new BadRequestException("Select a student");
      const student = await this.prisma.student.findFirst({
        where: { OR: [{ id: audienceValue }, { studentNo: audienceValue }] },
        select: { personId: true },
      });
      if (!student) throw new NotFoundException("Student not found");
      return [student.personId];
    }
    const where =
      audienceType === "year"
        ? { yearLevel: Number(audienceValue) }
        : audienceType === "program"
          ? { program: { code: audienceValue } }
          : {};
    const students = await this.prisma.student.findMany({ where, select: { personId: true } });
    return students.map((s) => s.personId);
  }

  /** Broadcasts the caller has sent, most recent first, for the "Sent messages" list. */
  async listBroadcasts(personId: string) {
    const rows = await this.prisma.broadcast.findMany({
      where: { senderId: personId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((b) => ({
      id: b.id,
      audienceType: b.audienceType,
      audienceValue: b.audienceValue,
      subject: b.subject,
      body: b.body,
      recipientCount: b.recipientCount,
      createdAt: b.createdAt,
    }));
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
      where: { roles: { hasSome: ["registrar", "bursar", "admin"] } },
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

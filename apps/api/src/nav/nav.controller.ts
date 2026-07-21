import { Controller, Get } from "@nestjs/common";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Class standing by year of study, for the student's sidebar identity line. */
const STANDING_BY_YEAR: Record<number, string> = {
  1: "Freshman", 2: "Sophomore", 3: "Junior", 4: "Senior",
};

/** Applicant stages still awaiting a decision — what the Admissions badge counts. */
const OPEN_APPLICANT_STAGES = ["submitted", "review", "interview", "offer"];

/**
 * Counts for the sidebar badge pills the design puts on nav items.
 *
 * The prototype hardcodes these (`{register:'7', messages:'2', finance:'!'}`);
 * here each one is a live count, scoped to the caller's own roles so a single
 * request serves whichever portal they land in. Read-only and cheap — the shell
 * calls it once per page load.
 */
@Controller("nav")
export class NavController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The sidebar identity line. The design shows what the person *is* in context
   * ("Junior · Computer Eng.", "Guardian of Aïssatou") rather than a role name,
   * so it is derived per portal and falls back to the portal's static label.
   */
  @Get("context")
  async context(@CurrentUser() user: AuthUser) {
    return { badges: await this.badges(user), meta: await this.meta(user) };
  }

  private async meta(user: AuthUser): Promise<string | null> {
    const roles = user.roles ?? [];

    if (user.studentId) {
      const student = await this.prisma.student.findUnique({
        where: { id: user.studentId },
        include: { program: true },
      });
      if (!student) return null;
      const parts = [STANDING_BY_YEAR[student.yearLevel ?? 0], student.program?.name].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : null;
    }

    if (roles.includes("parent")) {
      const links = await this.prisma.guardianStudent.findMany({
        where: { guardianId: user.personId },
        include: { student: { include: { person: true } } },
      });
      const names = links.map((l) => l.student.person.firstName);
      if (names.length === 0) return null;
      return names.length === 1 ? `Guardian of ${names[0]}` : `Guardian · ${names.length} children`;
    }

    if (roles.includes("faculty")) return "Faculty";

    return null;
  }

  @Get("badges")
  async badges(@CurrentUser() user: AuthUser) {
    const roles = user.roles ?? [];
    const out: Record<string, string> = {};

    if (roles.includes("admin") || roles.includes("registrar")) {
      const [applicants, approvals] = await Promise.all([
        this.prisma.applicant.count({ where: { stage: { in: OPEN_APPLICANT_STAGES } } }),
        this.prisma.gradeSubmission.count({ where: { status: "submitted" } }),
      ]);
      if (applicants > 0) out.admissions = String(applicants);
      if (approvals > 0) out.approvals = String(approvals);
    }

    if (user.studentId) {
      const [openSections, invoices] = await Promise.all([
        this.prisma.section.count({ where: { status: "open" } }),
        this.prisma.invoice.findMany({
          where: { studentId: user.studentId },
          select: { totalAmount: true, amountPaid: true },
        }),
      ]);
      if (openSections > 0) out.register = String(openSections);
      // A balance is a call to action, not a quantity — the design shows "!" for it.
      const balance = invoices.reduce((sum, i) => sum + (i.totalAmount - i.amountPaid), 0);
      if (balance > 0) out.billing = "!";
    }

    const unread = await this.unreadThreads(user.personId);
    if (unread > 0) out.messages = String(unread);

    return out;
  }

  /**
   * Threads carrying a message the caller has not seen. Read state lives on the
   * participant row (`lastReadAt`), so "unread" is any message from someone else
   * that is newer than that mark — or any message at all when it is still null.
   */
  private async unreadThreads(personId: string) {
    const parts = await this.prisma.threadParticipant.findMany({
      where: { personId },
      select: { threadId: true, lastReadAt: true },
    });
    if (parts.length === 0) return 0;

    const counts = await Promise.all(
      parts.map((p) =>
        this.prisma.message.count({
          where: {
            threadId: p.threadId,
            senderId: { not: personId },
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    );
    return counts.filter((c) => c > 0).length;
  }
}

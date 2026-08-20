import { Controller, Get } from "@nestjs/common";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { deriveApiAccountPosition } from "../finance/account-position.js";
import { AcademicCatalogService } from "../academic-catalog/academic-catalog.service.js";
import { summarizeTranscriptRows } from "../transcript/transcript-calculation.js";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogs: AcademicCatalogService = new AcademicCatalogService(
      prisma,
    ),
  ) {}

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
        include: {
          program: true,
          transcriptEntries: { where: { voidedAt: null } },
          enrollments: {
            where: { status: "enrolled" },
            include: { section: { include: { course: true } } },
          },
        },
      });
      if (!student) return null;
      const transcript = summarizeTranscriptRows(student.transcriptEntries);
      const inProgressCredits = student.enrollments.reduce(
        (sum, enrollment) => sum + enrollment.section.course.credits,
        0,
      );
      const progress = await this.catalogs.progress({
        programId: student.programId,
        catalogYearId: student.catalogYearId,
        catalogYearLabel: student.catalogYear,
        earnedCredits: transcript.completedCredits,
        inProgressCredits,
      });
      const parts = [
        progress.level ? `Level ${progress.level.code}` : null,
        student.program?.name,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : null;
    }

    if (roles.includes("parent")) {
      const links = await this.prisma.guardianStudent.findMany({
        where: { guardianId: user.personId },
        include: { student: { include: { person: true } } },
      });
      const names = links.map((l) => l.student.person.firstName);
      if (names.length === 0) return null;
      return names.length === 1
        ? `Guardian of ${names[0]}`
        : `Guardian · ${names.length} children`;
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
        this.prisma.applicant.count({
          where: { stage: { in: OPEN_APPLICANT_STAGES } },
        }),
        this.prisma.gradeSubmission.count({ where: { status: "submitted" } }),
      ]);
      if (applicants > 0) out.admissions = String(applicants);
      if (approvals > 0) out.approvals = String(approvals);
    }

    if (roles.includes("admin") || roles.includes("bursar")) {
      const approvalRequests = await this.prisma.approvalRequest.count({
        where: {
          status: "pending",
          ...(roles.includes("admin") ? {} : { requestedById: user.personId }),
        },
      });
      if (approvalRequests > 0) {
        out.approvalRequests = String(approvalRequests);
      }
    }

    if (user.studentId) {
      const [openSections, invoices] = await Promise.all([
        this.prisma.section.count({ where: { status: "open" } }),
        this.prisma.invoice.findMany({
          where: { studentId: user.studentId },
          include: { plan: { include: { installments: true } } },
        }),
      ]);
      if (openSections > 0) out.register = String(openSections);
      // A balance is a call to action, not a quantity — the design shows "!" for it.
      if (deriveApiAccountPosition(invoices).summary.outstandingXof > 0) {
        out.billing = "!";
      }
    }

    if (roles.includes("faculty")) {
      // Exactly the count facultyOverview already computes as itemsToGrade.
      const toGrade = await this.prisma.submission.count({
        where: {
          status: "submitted",
          assignment: { section: { instructorId: user.personId } },
        },
      });
      if (toGrade > 0) out.grading = String(toGrade);
    }

    const notifications = await this.prisma.notification.count({
      where: { personId: user.personId, readAt: null },
    });
    if (notifications > 0) out.notifications = String(notifications);

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

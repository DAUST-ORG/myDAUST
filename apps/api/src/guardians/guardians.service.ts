import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { FinanceService } from "../finance/finance.service.js";
import { computeGpa, standingLabel } from "../academics/academics.service.js";

/** Password-setup invites are short-lived; the registrar can always re-issue one. */
const INVITE_TTL_HOURS = 72;

/** Attendance rate as a percentage; a late counts as half a present. */
function attendanceRate(records: { status: string }[]): number | null {
  if (records.length === 0) return null;
  const present = records.filter((r) => r.status === "present").length;
  const late = records.filter((r) => r.status === "late").length;
  return Math.round(((present + late * 0.5) / records.length) * 100);
}

/** One graded course on a child's transcript. */
export interface TranscriptRow {
  code: string;
  title: string;
  credits: number;
  grade: string | null;
}

export interface CreateGuardianInput {
  fullName: string;
  email: string;
  studentIds: string[];
  relation?: string;
}

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly finance: FinanceService,
  ) {}

  /** Invite tokens are stored hashed — a leaked database row must not grant access. */
  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.replace(/\s+/g, " ").trim().split(" ");
    const firstName = parts.shift() ?? "";
    return { firstName, lastName: parts.join(" ") || firstName };
  }

  // --- Registrar-facing ---------------------------------------------------

  async list() {
    const guardians = await this.prisma.person.findMany({
      where: { kind: "parent" },
      orderBy: { createdAt: "desc" },
      include: {
        guardianOf: { include: { student: { include: { person: true } } } },
        guardianInvites: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return guardians.map((g) => {
      const invite = g.guardianInvites[0];
      return {
        id: g.id,
        name: `${g.firstName} ${g.lastName}`,
        email: g.email,
        // "invited" until they set a password; the invite itself may also have lapsed.
        status: g.passwordHash
          ? "active"
          : invite && invite.expiresAt.getTime() < Date.now()
            ? "invite-expired"
            : "invited",
        children: g.guardianOf.map((link) => ({
          studentId: link.studentId,
          studentNo: link.student.studentNo,
          name: `${link.student.person.firstName} ${link.student.person.lastName}`,
          relation: link.relation,
        })),
      };
    });
  }

  /**
   * Provision a guardian account and email a password-setup link. Guardians never
   * self-register — the registrar creates the account and chooses which students
   * it may see.
   */
  async create(actorId: string, input: CreateGuardianInput) {
    if (input.studentIds.length === 0) {
      throw new BadRequestException("Link at least one student to the guardian");
    }
    const email = input.email.trim().toLowerCase();
    const students = await this.prisma.student.findMany({
      where: { id: { in: input.studentIds } },
    });
    if (students.length !== input.studentIds.length) {
      throw new BadRequestException("One or more students do not exist");
    }

    const existing = await this.prisma.person.findUnique({ where: { email } });
    if (existing && existing.kind !== "parent") {
      throw new BadRequestException("That email already belongs to a non-guardian account");
    }

    const { firstName, lastName } = this.splitName(input.fullName);
    const guardian = existing
      ? await this.prisma.person.update({
          where: { id: existing.id },
          data: { firstName, lastName },
        })
      : await this.prisma.person.create({
          data: { email, firstName, lastName, kind: "parent", roles: ["parent"] },
        });

    await this.prisma.guardianStudent.createMany({
      data: students.map((s) => ({
        guardianId: guardian.id,
        studentId: s.id,
        relation: input.relation ?? null,
      })),
      skipDuplicates: true,
    });

    await this.prisma.auditLog.create({
      data: {
        entity: "Person",
        entityId: guardian.id,
        action: "guardian-created",
        actorId,
        data: { email, students: students.map((s) => s.studentNo) },
      },
    });

    const invite = await this.issueInvite(guardian.id, guardian.email, `${firstName} ${lastName}`);
    return {
      id: guardian.id,
      email: guardian.email,
      inviteExpiresAt: invite.expiresAt,
      inviteLink: invite.link,
    };
  }

  /** Issue (or re-issue) a password-setup token and email it. */
  async issueInvite(guardianId: string, email: string, name: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);
    await this.prisma.guardianInvite.create({
      data: { guardianId, tokenHash: this.hashToken(token), expiresAt },
    });

    // Top level, not /parent/*: everything under the parent area sits behind the
    // authenticated portal layout, and the guardian has no password yet.
    const origin = process.env.PUBLIC_URL ?? "http://localhost:3000";
    const link = `${origin}/set-password?token=${token}`;
    await this.mail.send({
      to: email,
      subject: "Set up your myDAUST parent account",
      html: `
        <p>Hello ${name},</p>
        <p>A myDAUST parent account has been created for you so you can follow your
        child's grades, attendance and fees.</p>
        <p><a href="${link}">Set your password</a> (link valid for ${INVITE_TTL_HOURS} hours).</p>
        <p>If you were not expecting this, you can ignore this email.</p>
      `,
    });
    // The link goes back to the registrar too: they already hold the authority to
    // create the account, and guardians routinely need it read out over the phone
    // when the email does not arrive.
    return { expiresAt, link };
  }

  async resendInvite(actorId: string, guardianId: string) {
    const guardian = await this.prisma.person.findFirst({
      where: { id: guardianId, kind: "parent" },
    });
    if (!guardian) throw new NotFoundException("Guardian not found");
    if (guardian.passwordHash) {
      throw new BadRequestException("This guardian has already set a password");
    }
    const invite = await this.issueInvite(
      guardian.id,
      guardian.email,
      `${guardian.firstName} ${guardian.lastName}`,
    );
    await this.prisma.auditLog.create({
      data: { entity: "Person", entityId: guardian.id, action: "guardian-invite-resent", actorId },
    });
    return { ok: true, inviteLink: invite.link, inviteExpiresAt: invite.expiresAt };
  }

  /** Replace a guardian's linked students. */
  async setChildren(actorId: string, guardianId: string, studentIds: string[]) {
    const guardian = await this.prisma.person.findFirst({
      where: { id: guardianId, kind: "parent" },
    });
    if (!guardian) throw new NotFoundException("Guardian not found");
    if (studentIds.length === 0) {
      throw new BadRequestException("A guardian must be linked to at least one student");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.guardianStudent.deleteMany({
        where: { guardianId, studentId: { notIn: studentIds } },
      });
      await tx.guardianStudent.createMany({
        data: studentIds.map((studentId) => ({ guardianId, studentId })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: guardianId,
          action: "guardian-children-changed",
          actorId,
          data: { studentIds },
        },
      });
    });
    return { ok: true };
  }

  // --- Invite redemption (public) -----------------------------------------

  /**
   * Redeem a password-setup token. Single-use and time-limited; the token is
   * compared by hash so the stored value is never usable on its own.
   */
  async redeemInvite(token: string, password: string) {
    if (password.length < 10) {
      throw new BadRequestException("Password must be at least 10 characters");
    }
    const invite = await this.prisma.guardianInvite.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { guardian: true },
    });
    // Same generic failure for unknown, used and expired tokens — no oracle.
    if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("That invitation link is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: invite.guardianId },
        data: { passwordHash },
      });
      await tx.guardianInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
      // Any other outstanding invites for this guardian are now moot.
      await tx.guardianInvite.updateMany({
        where: { guardianId: invite.guardianId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: invite.guardianId,
          action: "guardian-password-set",
          actorId: invite.guardianId,
        },
      });
    });
    return { ok: true, email: invite.guardian.email };
  }

  // --- Parent-facing ------------------------------------------------------

  /**
   * The students a guardian may view. Every parent-facing read funnels through
   * here, so authorisation lives in exactly one place.
   */
  async assertGuardianOf(guardianId: string, studentId: string) {
    const link = await this.prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId, studentId } },
    });
    if (!link) throw new ForbiddenException("You do not have access to that student");
    return link;
  }

  /**
   * A child's transcript, grouped by term with a per-term GPA. Read-only: a
   * guardian can never mutate academic records.
   */
  async childGrades(guardianId: string, studentId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    const completed = await this.prisma.enrollment.findMany({
      where: { studentId, status: "completed" },
      include: { section: { include: { course: true, term: true } } },
    });

    const byTerm = new Map<string, { term: string; courses: TranscriptRow[] }>();
    for (const e of completed) {
      const key = e.section.term.name;
      if (!byTerm.has(key)) byTerm.set(key, { term: key, courses: [] });
      byTerm.get(key)!.courses.push({
        code: e.section.course.code,
        title: e.section.course.title,
        credits: e.section.course.credits,
        grade: e.grade,
      });
    }

    const terms = [...byTerm.values()].map((t) => {
      const graded = t.courses
        .filter((c) => c.grade)
        .map((c) => ({ grade: c.grade!, credits: c.credits }));
      const { gpa, completedCredits } = computeGpa(graded);
      return { term: t.term, gpa, credits: completedCredits, courses: t.courses };
    });

    const all = completed
      .filter((e) => e.grade)
      .map((e) => ({ grade: e.grade!, credits: e.section.course.credits }));
    return { cumulativeGpa: computeGpa(all).gpa, terms };
  }

  /** A child's per-course attendance. Late counts as half a present. */
  async childAttendance(guardianId: string, studentId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: "enrolled" },
      include: { section: { include: { course: true } }, attendance: true },
    });

    const rows = enrollments.map((e) => {
      const present = e.attendance.filter((a) => a.status === "present").length;
      const late = e.attendance.filter((a) => a.status === "late").length;
      const absent = e.attendance.filter((a) => a.status === "absent").length;
      const total = present + late + absent;
      return {
        code: e.section.course.code,
        title: e.section.course.title,
        present,
        late,
        absent,
        // A late arrival is half-credit, matching how the design reports the rate.
        pct: total === 0 ? null : Math.round(((present + late * 0.5) / total) * 100),
      };
    });

    const rated = rows.filter((r) => r.pct !== null);
    const overall =
      rated.length === 0
        ? null
        : Math.round(rated.reduce((s, r) => s + (r.pct ?? 0), 0) / rated.length);
    return { overall, rows };
  }

  /**
   * A child's fee account. Deliberately the same read the bursar and the student
   * see — one source of truth for money, so a parent can never be shown a balance
   * that disagrees with what payment.daust.net would charge.
   */
  async childAccount(guardianId: string, studentId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    return this.finance.getStudentAccount(studentId);
  }

  async myChildren(guardianId: string) {
    const links = await this.prisma.guardianStudent.findMany({
      where: { guardianId },
      include: {
        student: {
          include: {
            person: true,
            program: true,
            invoices: true,
            enrollments: {
              include: { section: { include: { course: true } }, attendance: true },
            },
          },
        },
      },
    });

    // Credits required for the degree come from the programme's requirement
    // categories, the same source the student's own degree audit sums.
    const requirements = await this.prisma.programRequirement.groupBy({
      by: ["programId"],
      _sum: { requiredCredits: true },
    });
    const requiredByProgram = new Map(
      requirements.map((r) => [r.programId, r._sum.requiredCredits ?? 0]),
    );

    return links.map(({ student, relation }) => {
      const graded = student.enrollments
        .filter((e) => e.status === "completed" && e.grade)
        .map((e) => ({ grade: e.grade!, credits: e.section.course.credits }));
      const { gpa, completedCredits } = computeGpa(graded);
      const billed = student.invoices.reduce((s, i) => s + i.totalAmount, 0);
      const paid = student.invoices.reduce((s, i) => s + i.amountPaid, 0);
      return {
        studentId: student.id,
        studentNo: student.studentNo,
        name: `${student.person.firstName} ${student.person.lastName}`,
        program: student.program?.name ?? "—",
        yearLevel: student.yearLevel,
        photoUrl: student.photoUrl,
        relation,
        gpa,
        completedCredits,
        standing: student.standing ?? standingLabel(gpa),
        balance: billed - paid,
        requiredCredits: student.programId ? requiredByProgram.get(student.programId) ?? null : null,
        attendanceRate: attendanceRate(student.enrollments.flatMap((e) => e.attendance)),
      };
    });
  }
}

import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../auth/current-user.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { FinanceService } from "../finance/finance.service.js";
import { standingLabel } from "../academics/academics.service.js";
import { summarizeTranscriptRows } from "../transcript/transcript-calculation.js";
import { TranscriptService } from "../transcript/transcript.service.js";
import { deriveApiAccountPosition } from "../finance/account-position.js";
import { PaymentSubmissionsService } from "../finance/payment-submissions.service.js";
import { AcademicCatalogService } from "../academic-catalog/academic-catalog.service.js";

/** Password-setup invites are short-lived; the registrar can always re-issue one. */
const INVITE_TTL_HOURS = 72;

/** Attendance rate as a percentage; a late counts as half a present. */
function attendanceRate(records: { status: string }[]): number | null {
  if (records.length === 0) return null;
  const present = records.filter((r) => r.status === "present").length;
  const late = records.filter((r) => r.status === "late").length;
  return Math.round(((present + late * 0.5) / records.length) * 100);
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
    private readonly paymentSubmissions: PaymentSubmissionsService,
    private readonly transcripts: TranscriptService = new TranscriptService(
      prisma,
    ),
    private readonly catalogs: AcademicCatalogService = new AcademicCatalogService(
      prisma,
    ),
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
      throw new BadRequestException(
        "Link at least one student to the guardian",
      );
    }
    const email = input.email.trim().toLowerCase();
    const students = await this.prisma.student.findMany({
      where: { id: { in: input.studentIds }, recordStatus: "active" },
    });
    if (students.length !== input.studentIds.length) {
      throw new BadRequestException("One or more students do not exist");
    }

    const existing = await this.prisma.person.findUnique({ where: { email } });
    if (existing && existing.kind !== "parent") {
      throw new BadRequestException(
        "That email already belongs to a non-guardian account",
      );
    }

    const { firstName, lastName } = this.splitName(input.fullName);
    const guardian = existing
      ? await this.prisma.person.update({
          where: { id: existing.id },
          data: { firstName, lastName },
        })
      : await this.prisma.person.create({
          data: {
            email,
            firstName,
            lastName,
            kind: "parent",
            roles: ["parent"],
          },
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

    // An already-activated guardian is just being linked to another child. Issuing
    // a fresh invite here would let anyone who can create guardians reset an
    // existing guardian's password without access to their mailbox.
    if (guardian.passwordHash) {
      return {
        id: guardian.id,
        email: guardian.email,
        inviteExpiresAt: null,
        inviteDelivery: "not_needed" as const,
      };
    }

    const invite = await this.issueInvite(
      guardian.id,
      guardian.email,
      `${firstName} ${lastName}`,
    );
    return {
      id: guardian.id,
      email: guardian.email,
      inviteExpiresAt: invite.expiresAt,
      inviteDelivery: invite.sent ? ("sent" as const) : ("not_sent" as const),
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
    const sent = await this.mail
      .send({
        to: email,
        subject: "Set up your myDAUST parent account",
        html: `
          <p>Hello ${name},</p>
          <p>A myDAUST parent account has been created for you so you can follow your
          child's grades, attendance and fees.</p>
          <p><a href="${link}">Set your password</a> (link valid for ${INVITE_TTL_HOURS} hours).</p>
          <p>If you were not expecting this, you can ignore this email.</p>
        `,
      })
      .then((delivery) => delivery?.sent === true)
      // Account creation must remain truthful when the provider is unavailable:
      // preserve the valid invite and let the registrar retry/disclose it safely.
      .catch(() => false);
    return { expiresAt, link, sent };
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
    // The link is returned, not just emailed: guardians routinely need it read out
    // when the mail does not arrive. Safe only on this path, which refuses a
    // guardian who already has a password, so it can never reset a live account.
    // Disclosure is audited because the token is a credential.
    await this.prisma.auditLog.create({
      data: {
        entity: "Person",
        entityId: guardian.id,
        action: "guardian-invite-resent",
        actorId,
        data: { linkDisclosedToActor: true },
      },
    });
    return {
      ok: true,
      inviteLink: invite.link,
      inviteExpiresAt: invite.expiresAt,
      inviteDelivery: invite.sent ? ("sent" as const) : ("not_sent" as const),
    };
  }

  /** Replace a guardian's linked students. */
  async setChildren(actorId: string, guardianId: string, studentIds: string[]) {
    const guardian = await this.prisma.person.findFirst({
      where: { id: guardianId, kind: "parent" },
    });
    if (!guardian) throw new NotFoundException("Guardian not found");
    if (studentIds.length === 0) {
      throw new BadRequestException(
        "A guardian must be linked to at least one student",
      );
    }
    const uniqueStudentIds = [...new Set(studentIds)];
    const activeStudents = await this.prisma.student.findMany({
      where: { id: { in: uniqueStudentIds }, recordStatus: "active" },
      select: { id: true },
    });
    if (activeStudents.length !== uniqueStudentIds.length) {
      throw new BadRequestException(
        "One or more selected students do not exist or are archived",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.guardianStudent.deleteMany({
        where: { guardianId, studentId: { notIn: uniqueStudentIds } },
      });
      await tx.guardianStudent.createMany({
        data: uniqueStudentIds.map((studentId) => ({ guardianId, studentId })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: guardianId,
          action: "guardian-children-changed",
          actorId,
          data: { studentIds: uniqueStudentIds },
        },
      });
    });
    return { ok: true };
  }

  /** Edit a guardian's name and/or email. */
  async update(
    actorId: string,
    guardianId: string,
    input: { fullName?: string; email?: string },
  ) {
    const guardian = await this.prisma.person.findFirst({
      where: { id: guardianId, kind: "parent" },
    });
    if (!guardian) throw new NotFoundException("Guardian not found");

    const data: { firstName?: string; lastName?: string; email?: string } = {};
    if (input.fullName !== undefined) {
      const { firstName, lastName } = this.splitName(input.fullName);
      data.firstName = firstName;
      data.lastName = lastName;
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      const clash = await this.prisma.person.findUnique({ where: { email } });
      if (clash && clash.id !== guardianId) {
        throw new BadRequestException(
          "That email already belongs to another account",
        );
      }
      data.email = email;
    }
    const emailChanged =
      data.email !== undefined && data.email !== guardian.email;
    const invalidateInvites = emailChanged && !guardian.passwordHash;
    const updated = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.update({
        where: { id: guardianId },
        data,
      });
      if (invalidateInvites) {
        // An invite sent to the old mailbox is a credential. Once the account's
        // email changes it must stop working immediately, even if it has not expired.
        await tx.guardianInvite.updateMany({
          where: { guardianId, usedAt: null },
          data: { usedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: guardianId,
          action: "guardian-updated",
          actorId,
          data: {
            email: person.email,
            previousEmail: emailChanged ? guardian.email : undefined,
            outstandingInvitesInvalidated: invalidateInvites,
          },
        },
      });
      return person;
    });

    const replacementInvite = invalidateInvites
      ? await this.issueInvite(
          updated.id,
          updated.email,
          `${updated.firstName} ${updated.lastName}`,
        )
      : null;
    return {
      id: updated.id,
      name: `${updated.firstName} ${updated.lastName}`,
      email: updated.email,
      inviteDelivery: replacementInvite
        ? replacementInvite.sent
          ? "sent"
          : "not_sent"
        : null,
      inviteExpiresAt: replacementInvite?.expiresAt ?? null,
    };
  }

  /** Remove a guardian account and its student links. */
  async remove(actorId: string, guardianId: string) {
    const guardian = await this.prisma.person.findFirst({
      where: { id: guardianId, kind: "parent" },
    });
    if (!guardian) throw new NotFoundException("Guardian not found");
    // GuardianStudent and GuardianInvite cascade on the guardian relation. Keep
    // the audit write in the same transaction so a deletion is never completed
    // without its immutable registrar evidence (or logged when deletion fails).
    await this.prisma.$transaction(async (tx) => {
      await tx.person.delete({ where: { id: guardianId } });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: guardianId,
          action: "guardian-deleted",
          actorId,
          data: { email: guardian.email },
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
    const tokenHash = this.hashToken(token);
    const invalidInvite = () =>
      new BadRequestException("That invitation link is invalid or has expired");

    // Guardian invite first, then the student invite — one opaque token, one page.
    const gInvite = await this.prisma.guardianInvite.findUnique({
      where: { tokenHash },
      include: { guardian: true },
    });
    if (gInvite) {
      const passwordHash = await bcrypt.hash(password, 10);
      const redeemedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        // Claim before changing the password. updateMany makes the single-use
        // condition part of the write, so two concurrent requests cannot both
        // redeem a token they read while it was still unused.
        const claim = await tx.guardianInvite.updateMany({
          where: {
            id: gInvite.id,
            usedAt: null,
            expiresAt: { gte: redeemedAt },
          },
          data: { usedAt: redeemedAt },
        });
        if (claim.count !== 1) throw invalidInvite();
        await tx.person.update({
          where: { id: gInvite.guardianId },
          data: { passwordHash },
        });
        // Any other outstanding invites for this guardian are now moot.
        await tx.guardianInvite.updateMany({
          where: { guardianId: gInvite.guardianId, usedAt: null },
          data: { usedAt: redeemedAt },
        });
        await tx.auditLog.create({
          data: {
            entity: "Person",
            entityId: gInvite.guardianId,
            action: "guardian-password-set",
            actorId: gInvite.guardianId,
          },
        });
      });
      return { ok: true, email: gInvite.guardian.email };
    }

    const sInvite = await this.prisma.studentInvite.findUnique({
      where: { tokenHash },
      include: { person: true },
    });
    if (sInvite) {
      const passwordHash = await bcrypt.hash(password, 10);
      const redeemedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.studentInvite.updateMany({
          where: {
            id: sInvite.id,
            usedAt: null,
            expiresAt: { gte: redeemedAt },
          },
          data: { usedAt: redeemedAt },
        });
        if (claim.count !== 1) throw invalidInvite();
        await tx.person.update({
          where: { id: sInvite.studentPersonId },
          data: { passwordHash },
        });
        await tx.studentInvite.updateMany({
          where: { studentPersonId: sInvite.studentPersonId, usedAt: null },
          data: { usedAt: redeemedAt },
        });
        await tx.auditLog.create({
          data: {
            entity: "Person",
            entityId: sInvite.studentPersonId,
            action: "student-password-set",
            actorId: sInvite.studentPersonId,
          },
        });
      });
      return { ok: true, email: sInvite.person.email };
    }

    // Same generic failure for unknown, used and expired tokens — no oracle.
    throw invalidInvite();
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
    if (!link)
      throw new ForbiddenException("You do not have access to that student");
    return link;
  }

  /**
   * A child's transcript, grouped by term with a per-term GPA. Read-only: a
   * guardian can never mutate academic records.
   */
  async childGrades(guardianId: string, studentId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    return this.transcripts.view(studentId);
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
        pct:
          total === 0
            ? null
            : Math.round(((present + late * 0.5) / total) * 100),
      };
    });

    const rated = rows.filter((r) => r.pct !== null);
    const overall =
      rated.length === 0
        ? null
        : Math.round(
            rated.reduce((s, r) => s + (r.pct ?? 0), 0) / rated.length,
          );
    return { overall, rows };
  }

  /**
   * A child's fee account. Deliberately the same read the bursar and the student
   * see — one source of truth for money, so a parent can never be shown a balance
   * that disagrees with what payment.daust.net would charge.
   */
  async childAccount(guardianId: string, studentId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    const account = await this.finance.getStudentAccount(studentId);
    return {
      ...account,
      invoices: account.invoices.map((invoice) => ({
        ...invoice,
        // Finance keeps contact snapshots for notification/audit, but a second
        // guardian of the same child must not learn another payer's email.
        payments: invoice.payments.map((payment) => {
          const { initiatedByEmail: _email, ...safe } =
            payment as typeof payment & {
              initiatedByEmail?: string | null;
            };
          return safe;
        }),
        wireTransfers: invoice.wireTransfers.map((wire) => {
          const { contactEmail: _email, ...safe } = wire;
          return safe;
        }),
      })),
    };
  }

  /** Verify the selected child and invoice as one scope before any money moves. */
  private async assertChildInvoice(
    guardianId: string,
    studentId: string,
    invoiceId: string,
  ) {
    await this.assertGuardianOf(guardianId, studentId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, studentId },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /** Start or resume a proof-based payment for a linked child. */
  async initiateChildPayment(
    guardian: AuthUser,
    studentId: string,
    input: {
      invoiceId: string;
      amount: number;
      method: "wave" | "orange_money" | "wire";
    },
  ) {
    await this.assertChildInvoice(
      guardian.personId,
      studentId,
      input.invoiceId,
    );
    const result = await this.paymentSubmissions.createForStudent({
      studentId,
      invoiceId: input.invoiceId,
      amountXof: input.amount,
      method: input.method,
      source: "parent_portal",
      actor: guardian,
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Payment",
        entityId: result.id,
        action: "parent-initiated",
        actorId: guardian.personId,
        data: { studentId, invoiceId: input.invoiceId, method: input.method },
      },
    });
    return result;
  }

  /** Send a PI-SPI request for a linked child; never save the alias on the child. */
  async submitChildPiSpi(
    guardian: AuthUser,
    studentId: string,
    input: { invoiceId: string; alias: string; amountXof: number },
  ) {
    await this.assertChildInvoice(
      guardian.personId,
      studentId,
      input.invoiceId,
    );
    const result = await this.finance.submitStudentPiSpi(
      studentId,
      guardian.personId,
      input,
      {
        source: "parent_portal",
        initiatedByEmail: guardian.email,
      },
    );
    await this.prisma.auditLog.create({
      data: {
        entity: "PiSpiRequest",
        entityId: result.txId,
        action: "parent-initiated",
        actorId: guardian.personId,
        data: { studentId, invoiceId: input.invoiceId },
      },
    });
    return result;
  }

  async childPiSpiStatus(guardianId: string, studentId: string, txId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    return this.finance.getPiSpiRequest(txId, { studentId });
  }

  async childPaymentAttempts(guardianId: string, studentId: string) {
    await this.assertGuardianOf(guardianId, studentId);
    return this.paymentSubmissions.listForStudent(studentId);
  }

  /** Submit private proof for a linked child using the guardian's account email. */
  async submitChildWire(
    guardian: AuthUser,
    studentId: string,
    input: { invoiceId: string; amountXof: number },
    file: Express.Multer.File,
  ) {
    await this.assertChildInvoice(
      guardian.personId,
      studentId,
      input.invoiceId,
    );
    if (!file) throw new BadRequestException("Choose a wire-transfer proof");

    const result = await this.finance.submitGuardianWire(
      studentId,
      { personId: guardian.personId, email: guardian.email },
      input.invoiceId,
      input.amountXof,
      file,
    );

    await this.prisma.auditLog.create({
      data: {
        entity: "WireTransferSubmission",
        entityId: result.id,
        action: "parent-submitted",
        actorId: guardian.personId,
        data: { studentId, invoiceId: input.invoiceId },
      },
    });
    return result;
  }

  private async assertChildPayment(
    guardianId: string,
    studentId: string,
    paymentId: string,
  ) {
    await this.assertGuardianOf(guardianId, studentId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, studentId },
      include: { invoice: { select: { studentId: true } } },
    });
    if (!payment || payment.invoice.studentId !== studentId) {
      throw new NotFoundException("Payment not found");
    }
    return payment;
  }

  async childPaymentStatus(
    guardianId: string,
    studentId: string,
    paymentId: string,
  ) {
    const payment = await this.assertChildPayment(
      guardianId,
      studentId,
      paymentId,
    );
    const durable = payment as typeof payment & {
      source?: string;
      settledAt?: Date | null;
      refundedAt?: Date | null;
    };
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      providerRef: payment.providerRef,
      source: durable.source ?? "legacy",
      settledAt: durable.settledAt ?? null,
      refundedAt: durable.refundedAt ?? null,
      createdAt: payment.createdAt,
    };
  }

  async childPaymentReceipt(
    guardianId: string,
    studentId: string,
    paymentId: string,
  ) {
    await this.assertChildPayment(guardianId, studentId, paymentId);
    const receipt = await this.finance.getReceipt(paymentId);
    const { initiatedByEmail: _payerEmail, ...safe } = receipt;
    return safe;
  }

  async myChildren(guardianId: string) {
    const links = await this.prisma.guardianStudent.findMany({
      where: { guardianId, student: { recordStatus: "active" } },
      include: {
        student: {
          include: {
            person: true,
            program: true,
            invoices: {
              include: { plan: { include: { installments: true } } },
            },
            transcriptEntries: { where: { voidedAt: null } },
            enrollments: {
              include: {
                section: { include: { course: true } },
                attendance: true,
              },
            },
          },
        },
      },
    });

    return Promise.all(
      links.map(async ({ student, relation }) => {
        const transcript = summarizeTranscriptRows(student.transcriptEntries);
        const gpa = transcript.attemptedCredits === 0 ? null : transcript.gpa;
        const summary = deriveApiAccountPosition(student.invoices).summary;
        const inProgressCredits = student.enrollments
          .filter((enrollment) => enrollment.status === "enrolled")
          .reduce(
            (total, enrollment) => total + enrollment.section.course.credits,
            0,
          );
        const academicProgress = await this.catalogs.progress({
          programId: student.programId,
          catalogYearId: student.catalogYearId,
          catalogYearLabel: student.catalogYear,
          earnedCredits: transcript.completedCredits,
          inProgressCredits,
        });
        return {
          studentId: student.id,
          studentNo: student.studentNo,
          name: `${student.person.firstName} ${student.person.lastName}`,
          program: student.program?.name ?? "—",
          yearLevel: student.yearLevel,
          photoUrl: student.photoUrl,
          relation,
          gpa,
          completedCredits: transcript.completedCredits,
          standing:
            student.standing ??
            (gpa === null ? "Not yet graded" : standingLabel(gpa)),
          balance: summary.balanceXof,
          summary,
          requiredCredits: academicProgress.requiredCredits,
          academicProgress,
          attendanceRate: attendanceRate(
            student.enrollments.flatMap((e) => e.attendance),
          ),
        };
      }),
    );
  }
}

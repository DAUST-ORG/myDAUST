import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { loadEnv } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";

const SETUP_LINK_TTL_MS = 30 * 60_000;

export type StudentCredentialMethod = "temporary_password" | "setup_link";

type LockedStudent = Prisma.StudentGetPayload<{
  include: { person: true };
}>;

@Injectable()
export class StudentAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(studentId: string) {
    const now = new Date();
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        person: {
          include: {
            studentInvites: {
              where: { usedAt: null, expiresAt: { gte: now } },
              orderBy: { createdAt: "desc" },
              select: {
                purpose: true,
                expiresAt: true,
                boundEmailSha256: true,
                activationRequest: {
                  select: {
                    verificationMethod: true,
                    approvedAt: true,
                    approvedById: true,
                    consumedAt: true,
                    invalidatedAt: true,
                    expiresAt: true,
                    studentActivationCard: {
                      select: {
                        claimedAt: true,
                        usedAt: true,
                        revokedAt: true,
                        batch: { select: { status: true, revokedAt: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException("Student not found");

    const uniqueLoginEmail = student.person.email
      ? (await this.prisma.person.count({
          where: {
            email: { equals: student.person.email, mode: "insensitive" },
          },
        })) === 1
      : false;
    const eligibility = this.credentialEligibility(student, uniqueLoginEmail);
    const pending =
      student.person.studentInvites.find((invite) => {
        if (
          !student.person.email ||
          !invite.boundEmailSha256 ||
          this.sha256(student.person.email) !== invite.boundEmailSha256
        ) {
          return false;
        }
        const request = invite.activationRequest;
        // Pre-request legacy student invites remain redeemable and therefore
        // remain visible. Every newer request must still be approved, live,
        // and consistent with its proof lifecycle.
        if (!request) return true;
        if (
          !request.approvedAt ||
          request.consumedAt ||
          request.invalidatedAt ||
          request.expiresAt.getTime() < now.getTime()
        ) {
          return false;
        }
        if (request.verificationMethod === "registrar_issued") {
          return request.approvedById !== null;
        }
        if (request.verificationMethod === "issued_code") {
          const card = request.studentActivationCard;
          return (
            !!card?.claimedAt &&
            !card.usedAt &&
            !card.revokedAt &&
            card.batch.status === "active" &&
            !card.batch.revokedAt
          );
        }
        return (
          request.verificationMethod === null ||
          request.verificationMethod === "student_id_dob"
        );
      }) ?? null;
    const hasLogin = student.person.passwordHash !== null;

    let accountState:
      | "suspended"
      | "archived"
      | "pending_payment"
      | "setup_pending"
      | "not_activated"
      | "must_change_password"
      | "active";
    if (student.recordStatus === "archived") accountState = "archived";
    else if (student.recordStatus === "pending_payment")
      accountState = "pending_payment";
    else if (student.person.status === "suspended") accountState = "suspended";
    else if (!hasLogin && pending) accountState = "setup_pending";
    else if (!hasLogin) accountState = "not_activated";
    else if (student.person.mustChangePassword)
      accountState = "must_change_password";
    else accountState = "active";

    return {
      studentId: student.id,
      personId: student.personId,
      loginEmail: student.person.email,
      contactEmail: student.personalEmail,
      accountState,
      eligibleForCredentialAction: eligibility.eligible,
      credentialBlockReason: eligibility.reason,
      hasLogin,
      mustChangePassword: student.person.mustChangePassword,
      accountCreatedAt: student.person.createdAt,
      lastLoginAt: student.person.lastLoginAt,
      passwordChangedAt: student.person.passwordChangedAt,
      pendingCredential: pending
        ? { purpose: pending.purpose, expiresAt: pending.expiresAt }
        : null,
    };
  }

  async updateContactEmail(
    actorId: string,
    studentId: string,
    contactEmail: string | null,
  ) {
    const normalized = contactEmail?.trim().toLowerCase() ?? null;
    await this.serializable(async (tx) => {
      const existing = await this.lockStudent(tx, studentId);
      this.assertExactActiveStudent(existing);
      if (existing.personalEmail === normalized) return;
      await tx.student.update({
        where: { id: studentId },
        data: { personalEmail: normalized },
      });
      await tx.auditLog.create({
        data: {
          entity: "Student",
          entityId: studentId,
          action: "student-contact-email-updated",
          actorId,
          // Deliberately record only the shape of the change, not contact PII.
          data: {
            previousContactEmailPresent: existing.personalEmail !== null,
            contactEmailPresent: normalized !== null,
          },
        },
      });
    });
    return this.getAccount(studentId);
  }

  async issueCredentials(
    actorId: string,
    studentId: string,
    method: StudentCredentialMethod,
  ) {
    if (method === "temporary_password") {
      return this.issueTemporaryPassword(actorId, studentId);
    }
    return this.issueSetupLink(actorId, studentId);
  }

  async signOutAll(actorId: string, studentId: string) {
    return this.serializable(async (tx) => {
      const student = await this.lockStudent(tx, studentId);
      await this.assertCredentialEligible(tx, student);
      const invalidatedAt = new Date();
      await this.invalidateLiveCapabilities(
        tx,
        student.personId,
        invalidatedAt,
      );
      await tx.person.update({
        where: { id: student.personId },
        data: { sessionVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: student.personId,
          action: "student-sessions-invalidated",
          actorId,
          data: { studentId: student.id },
        },
      });
      return { ok: true as const, invalidatedAt };
    });
  }

  private async issueTemporaryPassword(actorId: string, studentId: string) {
    const temporaryPassword = this.randomTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const result = await this.serializable(async (tx) => {
      const student = await this.lockStudent(tx, studentId);
      await this.assertCredentialEligible(tx, student);
      const issuedAt = new Date();
      const purpose = student.person.passwordHash
        ? ("password_reset" as const)
        : ("first_time" as const);
      const invalidatedInviteCount = await this.invalidateLiveCapabilities(
        tx,
        student.personId,
        issuedAt,
      );
      const updated = await tx.person.updateMany({
        where: {
          id: student.personId,
          kind: "student",
          roles: { equals: ["student"] },
          status: "active",
          student: { is: { id: student.id, recordStatus: "active" } },
        },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: issuedAt,
          sessionVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          "This student account is not eligible for credential management",
        );
      }
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: student.personId,
          action: "student-temporary-password-issued",
          actorId,
          data: {
            studentId: student.id,
            purpose,
            invalidatedInviteCount,
            disclosedToActor: true,
          },
        },
      });
      return { loginEmail: student.person.email! };
    });

    // The plaintext exists only in this response and the caller's local stack.
    return {
      method: "temporary_password" as const,
      loginEmail: result.loginEmail,
      temporaryPassword,
    };
  }

  private async issueSetupLink(actorId: string, studentId: string) {
    // Validate the disclosure destination before committing a live bearer
    // capability. A config error must not strand an undisclosed valid link.
    const portalOrigin = loadEnv().PORTAL_ORIGIN;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.sha256(token);
    const result = await this.serializable(async (tx) => {
      const student = await this.lockStudent(tx, studentId);
      await this.assertCredentialEligible(tx, student);
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + SETUP_LINK_TTL_MS);
      const purpose = student.person.passwordHash
        ? ("password_reset" as const)
        : ("first_time" as const);
      const invalidatedInviteCount = await this.invalidateLiveCapabilities(
        tx,
        student.personId,
        issuedAt,
      );
      const invite = await tx.studentInvite.create({
        data: {
          studentPersonId: student.personId,
          tokenHash,
          boundEmailSha256: this.sha256(student.person.email!),
          purpose,
          expiresAt,
        },
      });
      const request = await tx.studentActivationRequest.create({
        data: {
          studentPersonId: student.personId,
          accountKeyHash: this.registrarAccountBinding(
            student.personId,
            student.person.email!,
            student.person.sessionVersion,
            purpose,
          ),
          requestTokenHash: tokenHash,
          approvalCodeHash: null,
          expiresAt,
          approvedAt: issuedAt,
          approvedById: actorId,
          studentInviteId: invite.id,
          verificationMethod: "registrar_issued",
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "StudentActivationRequest",
          entityId: request.id,
          action:
            invalidatedInviteCount > 0
              ? "student-setup-link-rotated-by-registrar"
              : "student-setup-link-issued-by-registrar",
          actorId,
          data: {
            studentId: student.id,
            inviteId: invite.id,
            purpose,
            expiresAt: expiresAt.toISOString(),
            disclosedToActor: true,
            invalidatedInviteCount,
          },
        },
      });
      return {
        loginEmail: student.person.email!,
        expiresAt,
      };
    });

    return {
      method: "setup_link" as const,
      loginEmail: result.loginEmail,
      setupUrl: `${portalOrigin}/set-password#token=${encodeURIComponent(token)}`,
      expiresAt: result.expiresAt,
    };
  }

  private async lockStudent(
    tx: Prisma.TransactionClient,
    studentId: string,
  ): Promise<LockedStudent> {
    const rows = await tx.$queryRaw<Array<{ id: string; personId: string }>>(
      Prisma.sql`
        SELECT "id", "personId"
        FROM "Student"
        WHERE "id" = ${studentId}
        FOR UPDATE
      `,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("Student not found");
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Person" WHERE "id" = ${row.personId} FOR UPDATE`,
    );
    const student = await tx.student.findUnique({
      where: { id: row.id },
      include: { person: true },
    });
    if (!student || student.personId !== row.personId) {
      throw new NotFoundException("Student not found");
    }
    return student;
  }

  private credentialEligibility(
    student: {
      recordStatus: string;
      person: {
        status: string;
        kind: string;
        roles: string[];
        email: string | null;
      };
    },
    uniqueLoginEmail: boolean,
  ): { eligible: boolean; reason: string | null } {
    if (student.recordStatus === "archived") {
      return { eligible: false, reason: "The student record is archived" };
    }
    if (student.recordStatus !== "active") {
      return {
        eligible: false,
        reason: "The student record is pending payment",
      };
    }
    if (student.person.status !== "active") {
      return { eligible: false, reason: "The account is suspended" };
    }
    if (
      student.person.kind !== "student" ||
      student.person.roles.length !== 1 ||
      student.person.roles[0] !== "student"
    ) {
      return {
        eligible: false,
        reason: "The identity is not an exact student-only account",
      };
    }
    if (!student.person.email || !uniqueLoginEmail) {
      return {
        eligible: false,
        reason: "The account does not have a unique DAUST login email",
      };
    }
    return { eligible: true, reason: null };
  }

  private assertExactActiveStudent(student: LockedStudent) {
    if (
      student.recordStatus !== "active" ||
      student.person.status !== "active" ||
      student.person.kind !== "student" ||
      student.person.roles.length !== 1 ||
      student.person.roles[0] !== "student"
    ) {
      throw new BadRequestException(
        "This student account is read-only in its current state",
      );
    }
  }

  private async assertCredentialEligible(
    tx: Prisma.TransactionClient,
    student: LockedStudent,
  ) {
    const uniqueLoginEmail = student.person.email
      ? (await tx.person.count({
          where: {
            email: { equals: student.person.email, mode: "insensitive" },
          },
        })) === 1
      : false;
    const result = this.credentialEligibility(student, uniqueLoginEmail);
    if (!result.eligible) {
      throw new BadRequestException(
        result.reason ??
          "This student account is not eligible for credential management",
      );
    }
  }

  private async invalidateLiveCapabilities(
    tx: Prisma.TransactionClient,
    studentPersonId: string,
    invalidatedAt: Date,
  ): Promise<number> {
    const invites = await tx.studentInvite.findMany({
      where: { studentPersonId, usedAt: null },
      select: { id: true },
    });
    if (invites.length === 0) return 0;
    const inviteIds = invites.map((invite) => invite.id);
    await tx.studentInvite.updateMany({
      where: { id: { in: inviteIds }, usedAt: null },
      data: { usedAt: invalidatedAt },
    });
    await tx.studentActivationRequest.updateMany({
      where: {
        studentInviteId: { in: inviteIds },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt },
    });
    return inviteIds.length;
  }

  private randomTemporaryPassword(): string {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(14);
    let password = "";
    for (let index = 0; index < bytes.length; index += 1) {
      password += alphabet[bytes[index]! % alphabet.length];
    }
    return password;
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private registrarAccountBinding(
    personId: string,
    email: string,
    sessionVersion: number,
    purpose: "first_time" | "password_reset",
  ): string {
    return this.sha256(
      `mydaust:registrar-student-credential:v1\0${personId}\0${email}\0${sessionVersion}\0${purpose}`,
    );
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        const candidate = error as {
          code?: string;
          meta?: { code?: string };
        };
        const retryable =
          candidate?.code === "P2034" ||
          (candidate?.code === "P2010" && candidate.meta?.code === "40001");
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable transaction retry limit exhausted");
  }
}

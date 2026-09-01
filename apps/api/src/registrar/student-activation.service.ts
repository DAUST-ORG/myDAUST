import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import { normalizeStudentNumber } from "@mydaust/shared";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { loadEnv } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";

const REQUEST_TTL_MS = 10 * 60_000;
const INVITE_TTL_MS = 30 * 60_000;
const LOGIN_EMAIL = z.string().max(320).email();
const PENDING_WHERE = {
  approvedAt: null,
  consumedAt: null,
  invalidatedAt: null,
} as const;
const PUBLIC_START_FLOOR_MS = 100;
const EXPIRED_REQUEST_RETENTION_MS = 60 * 60_000;
const CLEANUP_BATCH_SIZE = 200;
const GENERIC_STAFF_MISS =
  "No pending activation request matches those details";

type LockedActivationRequest = {
  id: string;
  studentPersonId: string | null;
  accountKeyHash: string;
  requestTokenHash: string;
  approvalCodeHash: string;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
};

@Injectable()
export class StudentActivationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start a paired activation without revealing whether the supplied identity
   * matched. Every syntactically valid call returns the same 202 response shape;
   * unmatched/ineligible inputs receive a durable decoy request.
   */
  async start(studentNoInput: string, dobInput: string) {
    const startedAt = Date.now();
    const normalizedStudentNo = normalizeStudentNumber(studentNoInput);
    const dob = this.canonicalDateKey(dobInput);
    const codeKey = this.activationCodeKey();
    // The slot key includes the candidate DOB so a wrong-DOB decoy cannot occupy
    // the correct student's pending slot. HMAC prevents an offline dictionary of
    // IDs and birthdays from being recovered from a database snapshot.
    const accountKeyHash = this.accountDigest(
      normalizedStudentNo || "__invalid_student_number__",
      dob ?? `__invalid_date__:${this.sha256(dobInput)}`,
      codeKey,
    );

    let response:
      | {
          requestToken: string;
          approvalCode: string;
          requestExpiresAt: Date;
        }
      | undefined;

    // Approval-code collisions and same-account start races are settled by the
    // database partial unique indexes. Retry with fresh opaque values; if another
    // request won the account slot, this response remains an indistinguishable
    // ephemeral decoy and never rotates the winner.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const requestToken = randomBytes(32).toString("base64url");
      const approvalCode = randomInt(0, 1_000_000)
        .toString()
        .padStart(6, "0");
      const requestTokenHash = this.sha256(requestToken);
      const approvalCodeHash = this.codeDigest(approvalCode, codeKey);
      const now = new Date();
      const requestExpiresAt = new Date(now.getTime() + REQUEST_TTL_MS);
      response = { requestToken, approvalCode, requestExpiresAt };

      try {
        await this.serializable(async (tx) => {
          // Release this exact account slot while retaining the expired row for
          // the browser's final status/grace checks.
          await tx.studentActivationRequest.updateMany({
            where: {
              accountKeyHash,
              ...PENDING_WHERE,
              expiresAt: { lt: now },
            },
            data: { invalidatedAt: now },
          });
          // Bound maintenance per public call: first expire, then prune only a
          // fixed-size batch of never-approved rows older than the one-hour
          // diagnostic/grace retention window.
          await tx.$executeRaw(Prisma.sql`
            WITH candidates AS (
              SELECT "id" FROM "StudentActivationRequest"
              WHERE "approvedAt" IS NULL
                AND "consumedAt" IS NULL
                AND "invalidatedAt" IS NULL
                AND "expiresAt" < ${now}
              ORDER BY "expiresAt" ASC
              LIMIT ${CLEANUP_BATCH_SIZE}
              FOR UPDATE SKIP LOCKED
            )
            UPDATE "StudentActivationRequest" request
            SET "invalidatedAt" = ${now}, "updatedAt" = ${now}
            FROM candidates
            WHERE request."id" = candidates."id"
          `);
          const retentionCutoff = new Date(
            now.getTime() - EXPIRED_REQUEST_RETENTION_MS,
          );
          await tx.$executeRaw(Prisma.sql`
            WITH candidates AS (
              SELECT "id" FROM "StudentActivationRequest"
              WHERE "approvedAt" IS NULL
                AND "studentInviteId" IS NULL
                AND "invalidatedAt" IS NOT NULL
                AND "expiresAt" < ${retentionCutoff}
              ORDER BY "expiresAt" ASC
              LIMIT ${CLEANUP_BATCH_SIZE}
              FOR UPDATE SKIP LOCKED
            )
            DELETE FROM "StudentActivationRequest" request
            USING candidates
            WHERE request."id" = candidates."id"
          `);
          const existing = await tx.studentActivationRequest.findFirst({
            where: {
              accountKeyHash,
              ...PENDING_WHERE,
              expiresAt: { gte: now },
            },
            select: { id: true },
          });
          if (existing) return;

          let studentPersonId: string | null = null;
          if (normalizedStudentNo && dob) {
            const lockedStudents = await tx.$queryRaw<
              Array<{ id: string; personId: string }>
            >(Prisma.sql`
              SELECT "id", "personId"
              FROM "Student"
              WHERE lower("studentNo") = lower(${normalizedStudentNo})
              LIMIT 2
              FOR UPDATE
            `);
            if (lockedStudents.length === 1) {
              const lockedStudent = lockedStudents[0]!;
              await tx.$queryRaw(
                Prisma.sql`SELECT "id" FROM "Person" WHERE "id" = ${lockedStudent.personId} FOR UPDATE`,
              );
              const student = await tx.student.findUnique({
                where: { id: lockedStudent.id },
                include: {
                  person: {
                    include: {
                      studentInvites: {
                        where: { usedAt: null, expiresAt: { gte: now } },
                        select: { id: true },
                      },
                    },
                  },
                },
              });
              if (
                student &&
                student.personId === lockedStudent.personId &&
                student.dateOfBirth?.toISOString().slice(0, 10) === dob &&
                this.baseEligible(student, student.person) &&
                (await this.hasUniqueValidEmail(tx, student.person.email)) &&
                student.person.studentInvites.length === 0
              ) {
                studentPersonId = student.person.id;
              }
            }
          }

          if (studentPersonId) {
            await tx.studentActivationRequest.updateMany({
              where: {
                studentPersonId,
                ...PENDING_WHERE,
                expiresAt: { lt: now },
              },
              data: { invalidatedAt: now },
            });
            const existingForPerson =
              await tx.studentActivationRequest.findFirst({
                where: {
                  studentPersonId,
                  ...PENDING_WHERE,
                  expiresAt: { gte: now },
                },
                select: { id: true },
              });
            if (existingForPerson) return;
          }

          await tx.studentActivationRequest.create({
            data: {
              studentPersonId,
              accountKeyHash,
              requestTokenHash,
              approvalCodeHash,
              expiresAt: requestExpiresAt,
            },
          });
        });
        break;
      } catch (error) {
        if (!this.isPrismaCode(error, "P2002") || attempt === 4) throw error;
      }
    }

    await this.waitForPublicFloor(startedAt);
    return response!;
  }

  /** Poll by a 256-bit capability in the POST body. Unknown tokens stay pending. */
  async status(requestToken: string) {
    const requestTokenHash = this.sha256(requestToken);
    const now = new Date();
    const request = await this.prisma.studentActivationRequest.findUnique({
      where: { requestTokenHash },
      select: {
        id: true,
        expiresAt: true,
        approvedAt: true,
        consumedAt: true,
        invalidatedAt: true,
        studentInviteId: true,
      },
    });

    if (!request) return { status: "pending" as const };
    if (request.consumedAt || request.invalidatedAt) {
      return { status: "expired" as const };
    }
    if (!request.approvedAt) {
      if (request.expiresAt.getTime() < now.getTime()) {
        const invalidated = await this.prisma.studentActivationRequest.updateMany({
          where: { id: request.id, ...PENDING_WHERE },
          data: { invalidatedAt: now },
        });
        if (invalidated.count === 1) return { status: "expired" as const };
        // Approval may have claimed the request between the read and expiry
        // CAS. Re-read rather than destroying the student's retained bearer on
        // a false-expired response.
        const current = await this.prisma.studentActivationRequest.findUnique({
          where: { id: request.id },
          select: {
            approvedAt: true,
            consumedAt: true,
            invalidatedAt: true,
            studentInviteId: true,
          },
        });
        if (
          !current ||
          current.consumedAt ||
          current.invalidatedAt ||
          !current.approvedAt ||
          !current.studentInviteId
        ) {
          return { status: "expired" as const };
        }
        const claimedInvite = await this.prisma.studentInvite.findUnique({
          where: { id: current.studentInviteId },
          select: { usedAt: true, expiresAt: true },
        });
        return claimedInvite &&
          !claimedInvite.usedAt &&
          claimedInvite.expiresAt.getTime() >= now.getTime()
          ? { status: "approved" as const }
          : { status: "expired" as const };
      }
      return { status: "pending" as const };
    }

    const invite = request.studentInviteId
      ? await this.prisma.studentInvite.findUnique({
          where: { id: request.studentInviteId },
          select: { usedAt: true, expiresAt: true },
        })
      : null;
    if (invite && !invite.usedAt && invite.expiresAt.getTime() >= now.getTime()) {
      return { status: "approved" as const };
    }
    return { status: "expired" as const };
  }

  /** Resolve only the exact student number + code physically presented. */
  async resolveForStaff(studentNoInput: string, approvalCode: string) {
    const studentNo = normalizeStudentNumber(studentNoInput);
    const approvalCodeHash = this.codeDigest(
      approvalCode,
      this.activationCodeKey(),
    );
    const now = new Date();
    const request = await this.prisma.studentActivationRequest.findFirst({
      where: {
        approvalCodeHash,
        studentPersonId: { not: null },
        ...PENDING_WHERE,
        expiresAt: { gte: now },
      },
      include: { studentPerson: { include: { student: true } } },
    });
    const student = request?.studentPerson?.student;
    const person = request?.studentPerson;
    const currentDob = student?.dateOfBirth?.toISOString().slice(0, 10);
    const currentAccountKey =
      student && currentDob
        ? this.accountDigest(
            normalizeStudentNumber(student.studentNo),
            currentDob,
            this.activationCodeKey(),
          )
        : null;
    if (
      !request ||
      !student ||
      !person ||
      normalizeStudentNumber(student.studentNo) !== studentNo ||
      !currentAccountKey ||
      !this.safeHexEqual(request.accountKeyHash, currentAccountKey) ||
      !this.baseEligible(student, person)
    ) {
      throw new NotFoundException(GENERIC_STAFF_MISS);
    }
    return {
      requestId: request.id,
      studentId: student.id,
      studentNo: student.studentNo,
      name: `${person.firstName} ${person.lastName}`.trim(),
      requestExpiresAt: request.expiresAt,
    };
  }

  /** Approve a resolved request and mint the student's same-token invite atomically. */
  async approve(
    actorId: string,
    requestId: string,
    approvalCode: string,
    verification: {
      identityVerification: "official_photo_credential_checked_in_person";
    },
  ) {
    const suppliedCodeHash = this.codeDigest(
      approvalCode,
      this.activationCodeKey(),
    );
    const outcome = await this.serializable(async (tx) => {
      const rows = await tx.$queryRaw<LockedActivationRequest[]>(Prisma.sql`
        SELECT "id", "studentPersonId", "accountKeyHash", "requestTokenHash", "approvalCodeHash",
               "expiresAt", "approvedAt", "consumedAt", "invalidatedAt"
        FROM "StudentActivationRequest"
        WHERE "id" = ${requestId}
        FOR UPDATE
      `);
      const request = rows[0];
      const now = new Date();
      if (
        !request ||
        !request.studentPersonId ||
        request.approvedAt ||
        request.consumedAt ||
        request.invalidatedAt ||
        request.expiresAt.getTime() < now.getTime() ||
        !this.safeHexEqual(request.approvalCodeHash, suppliedCodeHash)
      ) {
        if (
          request &&
          !request.approvedAt &&
          !request.consumedAt &&
          !request.invalidatedAt &&
          request.expiresAt.getTime() < now.getTime()
        ) {
          await tx.studentActivationRequest.update({
            where: { id: request.id },
            data: { invalidatedAt: now },
          });
        }
        return { kind: "miss" as const };
      }

      const lockedStudents = await tx.$queryRaw<
        Array<{ id: string; personId: string }>
      >(Prisma.sql`
        SELECT "id", "personId"
        FROM "Student"
        WHERE "personId" = ${request.studentPersonId}
        FOR UPDATE
      `);
      const lockedStudent = lockedStudents[0];
      if (!lockedStudent) return { kind: "drift" as const, reason: "student" };
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Person" WHERE "id" = ${request.studentPersonId} FOR UPDATE`,
      );
      const student = await tx.student.findUnique({
        where: { id: lockedStudent.id },
        include: {
          person: {
            include: {
              studentInvites: {
                where: { usedAt: null, expiresAt: { gte: now } },
                select: { id: true },
              },
            },
          },
        },
      });
      const person = student?.person;
      const currentDob = student?.dateOfBirth?.toISOString().slice(0, 10);
      const currentAccountKey =
        student && currentDob
          ? this.accountDigest(
              normalizeStudentNumber(student.studentNo),
              currentDob,
              this.activationCodeKey(),
            )
          : null;
      const eligible =
        !!student &&
        !!person &&
        student.personId === request.studentPersonId &&
        this.baseEligible(student, person) &&
        !!currentAccountKey &&
        this.safeHexEqual(request.accountKeyHash, currentAccountKey) &&
        (await this.hasUniqueValidEmail(tx, person.email)) &&
        person.studentInvites.length === 0;
      if (!eligible || !student || !person || !person.email) {
        await tx.studentActivationRequest.update({
          where: { id: request.id },
          data: { invalidatedAt: now },
        });
        await tx.auditLog.create({
          data: {
            entity: "StudentActivationRequest",
            entityId: request.id,
            action: "student-activation-invalidated",
            actorId,
            data: { reason: "identity_state_drift" },
          },
        });
        return { kind: "drift" as const, reason: "identity" };
      }

      const approved = await tx.studentActivationRequest.updateMany({
        where: { id: request.id, ...PENDING_WHERE, expiresAt: { gte: now } },
        data: {
          approvedAt: now,
          approvedById: actorId,
        },
      });
      if (approved.count !== 1) {
        // Throw, rather than return a miss, so any credential written later in
        // this transaction can never survive a lost conditional claim.
        throw new ConflictException(GENERIC_STAFF_MISS);
      }
      const inviteExpiresAt = new Date(now.getTime() + INVITE_TTL_MS);
      const invite = await tx.studentInvite.create({
        data: {
          studentPersonId: person.id,
          tokenHash: request.requestTokenHash,
          boundEmailSha256: this.sha256(person.email),
          expiresAt: inviteExpiresAt,
        },
      });
      await tx.studentActivationRequest.update({
        where: { id: request.id },
        data: { studentInviteId: invite.id },
      });
      await tx.studentActivationRequest.updateMany({
        where: {
          id: { not: request.id },
          studentPersonId: person.id,
          ...PENDING_WHERE,
        },
        data: { invalidatedAt: now },
      });
      await tx.auditLog.create({
        data: {
          entity: "StudentActivationRequest",
          entityId: request.id,
          action: "student-activation-approved",
          actorId,
          data: {
            studentId: student.id,
            inviteId: invite.id,
            inviteExpiresAt: inviteExpiresAt.toISOString(),
            disclosure: "student_browser_retained_bearer",
            identityVerification: verification.identityVerification,
          },
        },
      });
      return {
        kind: "approved" as const,
        studentId: student.id,
        studentNo: student.studentNo,
        name: `${person.firstName} ${person.lastName}`.trim(),
        inviteExpiresAt,
      };
    });

    if (outcome.kind !== "approved") {
      throw new ConflictException(GENERIC_STAFF_MISS);
    }
    return outcome;
  }

  private baseEligible(
    student: { recordStatus: string },
    person: {
      status: string;
      kind: string;
      roles: string[];
      passwordHash: string | null;
      mustChangePassword: boolean;
    },
  ): boolean {
    return (
      student.recordStatus === "active" &&
      person.status === "active" &&
      person.kind === "student" &&
      person.roles.length === 1 &&
      person.roles[0] === "student" &&
      person.passwordHash === null &&
      person.mustChangePassword === false
    );
  }

  private async hasUniqueValidEmail(
    tx: Prisma.TransactionClient,
    email: string | null,
  ): Promise<boolean> {
    if (!email || email.trim() !== email || !LOGIN_EMAIL.safeParse(email).success) {
      return false;
    }
    return (
      (await tx.person.count({
        where: { email: { equals: email, mode: "insensitive" } },
      })) === 1
    );
  }

  private canonicalDateKey(input: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
    const parsed = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10) === input ? input : null;
  }

  private activationCodeKey(): Buffer {
    const encoded = loadEnv().STUDENT_ACTIVATION_CODE_KEY_V1?.trim() ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
      throw new ServiceUnavailableException(
        "Student activation is temporarily unavailable",
      );
    }
    const key = Buffer.from(encoded, "base64url");
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        "Student activation is temporarily unavailable",
      );
    }
    return key;
  }

  private codeDigest(code: string, key: Buffer): string {
    return createHmac("sha256", key)
      .update("mydaust:student-activation-code:v1\0")
      .update(code)
      .digest("hex");
  }

  private accountDigest(studentNo: string, dobKey: string, key: Buffer): string {
    return createHmac("sha256", key)
      .update("mydaust:student-activation-account:v1\0")
      .update(studentNo)
      .update("\0")
      .update(dobKey)
      .digest("hex");
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private safeHexEqual(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left, "hex");
    const rightBytes = Buffer.from(right, "hex");
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }

  private async waitForPublicFloor(startedAt: number) {
    const remaining = PUBLIC_START_FLOOR_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }

  private isPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
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
        if (!this.isSerializationFailure(error) || attempt === 2) throw error;
      }
    }
    throw new Error("Student activation transaction retry limit exhausted");
  }

  private isSerializationFailure(error: unknown): boolean {
    if (this.isPrismaCode(error, "P2034")) return true;
    if (!this.isPrismaCode(error, "P2010") || !error || typeof error !== "object") {
      return false;
    }
    const meta = "meta" in error ? error.meta : null;
    return (
      typeof meta === "object" &&
      meta !== null &&
      "code" in meta &&
      meta.code === "40001"
    );
  }
}

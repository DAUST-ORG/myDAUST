import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import {
  normalizeStudentActivationCode,
  normalizeStudentNumber,
} from "@mydaust/shared";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadEnv } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";

const INVITE_TTL_MS = 30 * 60_000;
const PUBLIC_START_FLOOR_MS = 100;
const MAX_CARD_FAILURES = 5;
const LOGIN_EMAIL = z.string().max(320).email();
const GENERIC_RESPONSE = { accepted: true as const };

type StartActivationInput = {
  studentNo: string;
  dob: string;
  activationCode: string;
  requestToken: string;
};

type LockedActivationCard = {
  id: string;
  batchId: string;
  studentPersonId: string;
  codeHmacSha256: string;
  boundEmailSha256: string;
  expiresAt: Date;
  failedAttempts: number;
  claimedAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
};

type LockedActivationBatch = {
  id: string;
  status: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

@Injectable()
export class StudentActivationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exchange an institution-issued physical card for a 30-minute setup invite.
   * Every well-formed request receives the same response, regardless of code,
   * identity, lifecycle, or completion-token validity.
   */
  async start(input: StartActivationInput): Promise<typeof GENERIC_RESPONSE> {
    const startedAt = Date.now();
    try {
      const studentNo = normalizeStudentNumber(input.studentNo);
      const dob = this.canonicalDateKey(input.dob);
      const activationCode = normalizeStudentActivationCode(
        input.activationCode,
      );
      const codeKey = this.activationCodeKey();
      if (!studentNo || !dob || !activationCode) return GENERIC_RESPONSE;

      const codeHmacSha256 = this.codeDigest(activationCode, codeKey);
      const requestTokenHash = this.sha256(input.requestToken);

      try {
        await this.serializable(async (tx) => {
          // Locate by the secret HMAC without taking a lock, then follow the
          // same batch -> card -> student -> person lock order as batch revoke.
          // The card is re-read and fully validated after both durable locks.
          const candidates = await tx.$queryRaw<
            Array<{ id: string; batchId: string }>
          >(Prisma.sql`
            SELECT "id", "batchId"
            FROM "StudentActivationCard"
            WHERE "codeHmacSha256" = ${codeHmacSha256}
          `);
          const candidate = candidates[0];
          if (!candidate) return;

          const batchRows = await tx.$queryRaw<LockedActivationBatch[]>(
            Prisma.sql`
              SELECT "id", "status", "expiresAt", "revokedAt"
              FROM "StudentActivationCardBatch"
              WHERE "id" = ${candidate.batchId}
              FOR SHARE
            `,
          );
          const batch = batchRows[0];
          if (!batch) return;
          const cardRows = await tx.$queryRaw<
            LockedActivationCard[]
          >(Prisma.sql`
            SELECT "id", "batchId", "studentPersonId", "codeHmacSha256",
                   "boundEmailSha256", "expiresAt", "failedAttempts", "claimedAt", "usedAt", "revokedAt"
            FROM "StudentActivationCard"
            WHERE "id" = ${candidate.id}
              AND "batchId" = ${batch.id}
              AND "codeHmacSha256" = ${codeHmacSha256}
            FOR UPDATE
          `);
          const card = cardRows[0];
          const now = new Date();
          if (!this.isLiveCard(card, batch, now)) return;

          const studentRows = await tx.$queryRaw<
            Array<{ id: string; personId: string }>
          >(Prisma.sql`
            SELECT "id", "personId"
            FROM "Student"
            WHERE "personId" = ${card.studentPersonId}
            FOR UPDATE
          `);
          const lockedStudent = studentRows[0];
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Person" WHERE "id" = ${card.studentPersonId} FOR UPDATE`,
          );

          const student = lockedStudent
            ? await tx.student.findUnique({
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
              })
            : null;
          const person = student?.person;
          const currentDob = student?.dateOfBirth?.toISOString().slice(0, 10);
          const eligible =
            !!student &&
            !!person &&
            student.personId === card.studentPersonId &&
            normalizeStudentNumber(student.studentNo) === studentNo &&
            currentDob === dob &&
            this.baseEligible(student, person) &&
            this.safeHexEqual(
              card.boundEmailSha256,
              this.sha256(person.email ?? ""),
            ) &&
            (await this.hasUniqueValidEmail(tx, person.email)) &&
            person.studentInvites.length === 0;

          if (!eligible || !student || !person || !person.email) {
            await this.recordFailedCardAttempt(tx, card, now);
            return;
          }

          // Re-state every live-card predicate in the write. The preceding row
          // locks protect the claim, while this conditional update makes the
          // single-use contract explicit and fail closed under future changes.
          const claimed = await tx.studentActivationCard.updateMany({
            where: {
              id: card.id,
              batchId: batch.id,
              studentPersonId: person.id,
              codeHmacSha256,
              failedAttempts: { lt: MAX_CARD_FAILURES },
              claimedAt: null,
              usedAt: null,
              revokedAt: null,
              expiresAt: { gte: now },
              batch: {
                is: {
                  status: "active",
                  revokedAt: null,
                  expiresAt: { gte: now },
                },
              },
            },
            data: { claimedAt: now },
          });
          if (claimed.count !== 1) return;

          const inviteExpiresAt = new Date(now.getTime() + INVITE_TTL_MS);
          const invite = await tx.studentInvite.create({
            data: {
              studentPersonId: person.id,
              tokenHash: requestTokenHash,
              boundEmailSha256: this.sha256(person.email),
              expiresAt: inviteExpiresAt,
            },
          });
          const request = await tx.studentActivationRequest.create({
            data: {
              studentPersonId: person.id,
              accountKeyHash: this.accountDigest(studentNo, dob, codeKey),
              requestTokenHash,
              approvalCodeHash: codeHmacSha256,
              expiresAt: inviteExpiresAt,
              approvedAt: now,
              approvedById: null,
              verificationMethod: "issued_code",
              studentActivationCardId: card.id,
              studentInviteId: invite.id,
            },
          });
          // Any legacy unresolved request for the same identity becomes moot.
          // Previously approved requests and their bearer invites are preserved.
          await tx.studentActivationRequest.updateMany({
            where: {
              id: { not: request.id },
              studentPersonId: person.id,
              approvedAt: null,
              consumedAt: null,
              invalidatedAt: null,
            },
            data: { invalidatedAt: now },
          });
          await tx.auditLog.create({
            data: {
              entity: "StudentActivationRequest",
              entityId: request.id,
              action: "student-activation-self-service-issued",
              actorId: null,
              data: {
                studentId: student.id,
                inviteId: invite.id,
                inviteExpiresAt: inviteExpiresAt.toISOString(),
                verificationMethod: "issued_code",
              },
            },
          });
        });
      } catch (error) {
        // A caller can intentionally reuse a browser capability. Its hash may
        // collide with an existing request/invite, but this must not become an
        // existence oracle. The transaction rolls the card claim back.
        if (!this.isPrismaCode(error, "P2002")) throw error;
      }
      return GENERIC_RESPONSE;
    } finally {
      await this.waitForPublicFloor(startedAt);
    }
  }

  private isLiveCard(
    card: LockedActivationCard | undefined,
    batch: LockedActivationBatch | undefined,
    now: Date,
  ): card is LockedActivationCard {
    return (
      !!card &&
      !!batch &&
      card.batchId === batch.id &&
      card.claimedAt === null &&
      card.usedAt === null &&
      card.revokedAt === null &&
      card.failedAttempts < MAX_CARD_FAILURES &&
      card.expiresAt.getTime() >= now.getTime() &&
      batch.status === "active" &&
      batch.revokedAt === null &&
      batch.expiresAt.getTime() >= now.getTime()
    );
  }

  private async recordFailedCardAttempt(
    tx: Prisma.TransactionClient,
    card: LockedActivationCard,
    now: Date,
  ) {
    const failedAttempts = Math.min(MAX_CARD_FAILURES, card.failedAttempts + 1);
    await tx.studentActivationCard.update({
      where: { id: card.id },
      data: {
        failedAttempts,
        revokedAt: failedAttempts >= MAX_CARD_FAILURES ? now : undefined,
      },
    });
    if (failedAttempts >= MAX_CARD_FAILURES) {
      await tx.auditLog.create({
        data: {
          entity: "StudentActivationCard",
          entityId: card.id,
          action: "student-activation-card-revoked",
          actorId: null,
          data: { reason: "failed_attempt_limit" },
        },
      });
    }
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
    if (
      !email ||
      email.trim() !== email ||
      !LOGIN_EMAIL.safeParse(email).success
    ) {
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
      .update("mydaust:student-activation-card-code:v1\0")
      .update(code)
      .digest("hex");
  }

  private accountDigest(
    studentNo: string,
    dobKey: string,
    key: Buffer,
  ): string {
    return createHmac("sha256", key)
      .update("mydaust:student-activation-account:v2\0")
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
    if (
      !this.isPrismaCode(error, "P2010") ||
      !error ||
      typeof error !== "object"
    ) {
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

import { Injectable } from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import { normalizeStudentNumber } from "@mydaust/shared";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { loadEnv } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";

const INVITE_TTL_MS = 30 * 60_000;
const PUBLIC_START_FLOOR_MS = 100;
const LOGIN_EMAIL = z.string().max(320).email();
const GENERIC_RESPONSE = { accepted: true as const };

type StartActivationInput = {
  studentNo: string;
  dob: string;
  requestToken: string;
};

@Injectable()
export class StudentActivationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a 30-minute, browser-owned setup invite after an exact match on the
   * student's current ID and date of birth. Every well-formed request receives
   * the same response, regardless of identity or account state.
   */
  async start(input: StartActivationInput): Promise<typeof GENERIC_RESPONSE> {
    const startedAt = Date.now();
    try {
      const studentNo = normalizeStudentNumber(input.studentNo);
      const dob = this.canonicalDateKey(input.dob);
      if (!studentNo || !dob) return GENERIC_RESPONSE;

      const requestTokenHash = this.sha256(input.requestToken);
      const accountKeyHash = this.accountDigest(studentNo, dob);

      try {
        await this.serializable(async (tx) => {
          // Lock the exact student before reading invitation state. Requests
          // for the same account therefore serialize even when they carry
          // different browser capabilities.
          const studentRows = await tx.$queryRaw<
            Array<{ id: string; personId: string }>
          >(Prisma.sql`
            SELECT "id", "personId"
            FROM "Student"
            WHERE LOWER("studentNo") = LOWER(${studentNo})
            ORDER BY "id"
            FOR UPDATE
          `);
          if (studentRows.length !== 1) return;

          const lockedStudent = studentRows[0]!;
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Person" WHERE "id" = ${lockedStudent.personId} FOR UPDATE`,
          );

          const now = new Date();
          const student = await tx.student.findUnique({
            where: { id: lockedStudent.id },
            include: { person: true },
          });
          const person = student?.person;
          const currentDob = student?.dateOfBirth?.toISOString().slice(0, 10);
          const eligible =
            !!student &&
            !!person &&
            student.personId === lockedStudent.personId &&
            normalizeStudentNumber(student.studentNo) === studentNo &&
            currentDob === dob &&
            this.baseEligible(student, person) &&
            (await this.hasUniqueValidEmail(tx, person.email));

          if (!eligible || !student || !person || !person.email) return;

          const expiredInvites = await tx.studentInvite.findMany({
            where: {
              studentPersonId: person.id,
              usedAt: null,
              expiresAt: { lt: now },
            },
            select: { id: true },
          });
          if (expiredInvites.length > 0) {
            const expiredIds = expiredInvites.map((invite) => invite.id);
            await tx.studentInvite.updateMany({
              where: { id: { in: expiredIds }, usedAt: null },
              data: { usedAt: now },
            });
            await tx.studentActivationRequest.updateMany({
              where: {
                studentInviteId: { in: expiredIds },
                consumedAt: null,
                invalidatedAt: null,
              },
              data: { invalidatedAt: now },
            });
          }
          const liveInviteCount = await tx.studentInvite.count({
            where: {
              studentPersonId: person.id,
              usedAt: null,
              expiresAt: { gte: now },
            },
          });
          if (liveInviteCount !== 0) return;

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
              accountKeyHash,
              requestTokenHash,
              approvalCodeHash: null,
              expiresAt: inviteExpiresAt,
              approvedAt: now,
              approvedById: null,
              verificationMethod: "student_id_dob",
              studentInviteId: invite.id,
            },
          });
          // Any unresolved request from the retired pairing workflow is moot.
          // Previously issued setup invites remain untouched.
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
                verificationMethod: "student_id_dob",
              },
            },
          });
        });
      } catch (error) {
        // Browser-token reuse and concurrent uniqueness conflicts remain
        // indistinguishable from every other public outcome. The transaction
        // rolls back any partially-created invite.
        if (!this.isPrismaCode(error, "P2002")) throw error;
      }
      return GENERIC_RESPONSE;
    } finally {
      await this.waitForPublicFloor(startedAt);
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

  private accountDigest(studentNo: string, dobKey: string): string {
    return createHmac("sha256", loadEnv().SESSION_SECRET)
      .update("mydaust:student-activation-account:v3\0")
      .update(studentNo)
      .update("\0")
      .update(dobKey)
      .digest("hex");
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
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

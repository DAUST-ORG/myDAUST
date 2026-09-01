import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { isAppRole } from "@mydaust/shared";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthUser, Role } from "./current-user.js";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Verify email + password (used by the Passport local strategy). */
  async validateUser(email: string, password: string): Promise<AuthUser> {
    const person = await this.prisma.person.findUnique({
      where: { email },
      include: { student: true },
    });
    if (
      !person ||
      !person.email ||
      !person.passwordHash ||
      person.status !== "active" ||
      (person.student !== null && person.student.recordStatus !== "active")
    ) {
      // One generic message for every rejection: a distinct "account suspended" reply
      // would confirm the address exists to anyone probing it.
      throw new UnauthorizedException("Invalid credentials");
    }

    const ok = await bcrypt.compare(password, person.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    // Track only completed password authentication. Failed attempts must not
    // alter this operational account timestamp.
    await this.prisma.person.update({
      where: { id: person.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      personId: person.id,
      roles: person.roles.filter(isAppRole) as Role[],
      studentId: person.student?.id,
      email: person.email,
      name: `${person.firstName} ${person.lastName}`,
      sessionVersion: person.sessionVersion,
    };
  }

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Fresh read of the force-change flag (never from the JWT, so it clears immediately after a change). */
  async mustChangePassword(personId: string): Promise<boolean> {
    const p = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { mustChangePassword: true },
    });
    return p?.mustChangePassword ?? false;
  }

  /** Self-service change: verify the current password, set the new hash, clear the force-change flag. */
  async changePassword(
    personId: string,
    current: string,
    next: string,
  ): Promise<{ sessionVersion: number }> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: { student: { select: { id: true } } },
    });
    if (!person || !person.passwordHash)
      throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(current, person.passwordHash);
    if (!ok) throw new BadRequestException("Current password is incorrect");
    const passwordHash = await bcrypt.hash(next, 10);
    // Bumping the version ends every session signed with the old password. The caller's own
    // cookie is re-minted by the controller, so changing a password does not sign you out of
    // the tab you changed it in -- which would strand every first-login user.
    const changedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // The verified hash and session version are optimistic-concurrency keys.
      // A simultaneous registrar reset/redemption wins cleanly instead of being
      // overwritten by this stale self-service request.
      const changed = await tx.person.updateMany({
        where: {
          id: personId,
          passwordHash: person.passwordHash,
          sessionVersion: person.sessionVersion,
          status: "active",
          ...(person.student
            ? {
                student: {
                  is: { id: person.student.id, recordStatus: "active" },
                },
              }
            : {}),
        },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: changedAt,
          sessionVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new BadRequestException(
          "Your account changed while the password was being updated. Sign in and try again.",
        );
      }
      if (person.student) {
        const invites = await tx.studentInvite.findMany({
          where: { studentPersonId: personId, usedAt: null },
          select: { id: true },
        });
        if (invites.length > 0) {
          const inviteIds = invites.map((invite) => invite.id);
          await tx.studentInvite.updateMany({
            where: { id: { in: inviteIds }, usedAt: null },
            data: { usedAt: changedAt },
          });
          await tx.studentActivationRequest.updateMany({
            where: {
              studentInviteId: { in: inviteIds },
              consumedAt: null,
              invalidatedAt: null,
            },
            data: { invalidatedAt: changedAt },
          });
        }
      }
      // Audit the action only — never the secret.
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: personId,
          action: "password-changed",
          actorId: personId,
        },
      });
      const current = await tx.person.findUnique({
        where: { id: personId },
        select: { sessionVersion: true },
      });
      if (!current) throw new UnauthorizedException("Invalid credentials");
      return current;
    });
    return { sessionVersion: updated.sessionVersion };
  }
}

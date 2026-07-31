import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
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
    if (!person || !person.passwordHash) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(password, person.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    return {
      personId: person.id,
      roles: person.roles.filter(isAppRole) as Role[],
      studentId: person.student?.id,
      email: person.email,
      name: `${person.firstName} ${person.lastName}`,
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
  async changePassword(personId: string, current: string, next: string): Promise<void> {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person || !person.passwordHash) throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(current, person.passwordHash);
    if (!ok) throw new BadRequestException("Current password is incorrect");
    const passwordHash = await bcrypt.hash(next, 10);
    await this.prisma.person.update({
      where: { id: personId },
      data: { passwordHash, mustChangePassword: false },
    });
    // Audit the action only — never the secret.
    await this.prisma.auditLog.create({
      data: { entity: "Person", entityId: personId, action: "password-changed", actorId: personId },
    });
  }
}

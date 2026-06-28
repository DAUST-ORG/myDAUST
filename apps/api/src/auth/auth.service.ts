import { Injectable, UnauthorizedException } from "@nestjs/common";
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
}

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { isAppRole } from "@mydaust/shared";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { cookieExtractor } from "./constants.js";
import type { AuthUser, Role } from "./current-user.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: env.SESSION_SECRET,
    });
  }

  /**
   * passport-jwt has already verified the signature and expiry; this re-reads the person so
   * account state and roles come from the database rather than from a cookie that can be up
   * to seven days old. Without it, revoking a role or suspending an account has no effect on
   * anyone already signed in.
   *
   * Costs one indexed primary-key read per authenticated request. The token is kept only for
   * the session-version comparison; every other field is taken from the row.
   */
  async validate(payload: AuthUser): Promise<AuthUser> {
    const person = await this.prisma.person.findUnique({
      where: { id: payload.personId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        status: true,
        sessionVersion: true,
        student: { select: { id: true } },
      },
    });

    // Tokens signed before sessionVersion existed carry no claim. Those predate any bump,
    // so they compare equal to the default of 0 and survive the deploy rather than logging
    // the whole institution out.
    const claimed = payload.sessionVersion ?? 0;

    if (
      !person ||
      person.status !== "active" ||
      person.sessionVersion !== claimed
    ) {
      throw new UnauthorizedException();
    }

    return {
      personId: person.id,
      roles: person.roles.filter(isAppRole) as Role[],
      studentId: person.student?.id,
      email: person.email ?? payload.email,
      name: `${person.firstName} ${person.lastName}`,
      sessionVersion: person.sessionVersion,
    };
  }
}

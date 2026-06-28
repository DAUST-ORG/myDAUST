import { Inject, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { cookieExtractor } from "./constants.js";
import type { AuthUser } from "./current-user.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ENV) env: Env) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: env.SESSION_SECRET,
    });
  }

  /** passport-jwt has already verified the signature/expiry; shape the payload into AuthUser. */
  validate(payload: AuthUser): AuthUser {
    return {
      personId: payload.personId,
      roles: payload.roles,
      studentId: payload.studentId,
      email: payload.email,
      name: payload.name,
    };
  }
}

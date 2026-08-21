import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AppRole } from "@mydaust/shared";

export type Role = AppRole;

export interface AuthUser {
  personId: string;
  roles: Role[];
  /** Set when the person has a Student profile; used for ownership checks. */
  studentId?: string;
  email: string;
  name: string;
  /**
   * Person.sessionVersion as of login. JwtStrategy compares it against the current row on
   * every request, so bumping the column ends this session. Optional because tokens signed
   * before this field existed carry no claim; those are treated as version 0.
   */
  sessionVersion?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);

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
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);

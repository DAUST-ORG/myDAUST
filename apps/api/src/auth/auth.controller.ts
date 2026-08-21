import { Body, Controller, Get, Inject, Post, Res, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ChangePasswordInput } from "@mydaust/shared";
import type { Response } from "express";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE } from "./constants.js";
import { type AuthUser, CurrentUser } from "./current-user.js";
import { Public } from "./decorators.js";
import { LocalAuthGuard } from "./guards.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private cookieOpts() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      // COOKIE_SECURE override exists for pre-TLS staging (plain HTTP); it must never be "false" in real production.
      secure:
        this.env.COOKIE_SECURE !== undefined
          ? this.env.COOKIE_SECURE === "true"
          : this.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  /** Email + password login (LocalAuthGuard validates; req.user is the authenticated user). */
  @Post("login")
  @Public()
  @UseGuards(LocalAuthGuard)
  async login(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const token = await this.jwt.signAsync({ ...user });
    res.cookie(SESSION_COOKIE, token, this.cookieOpts());
    return { ...user, mustChangePassword: await this.auth.mustChangePassword(user.personId) };
  }

  @Post("logout")
  @Public()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    return { ...user, mustChangePassword: await this.auth.mustChangePassword(user.personId) };
  }

  /** Self-service password change (any authenticated role). Also clears the first-login flag. */
  @Post("change-password")
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = ChangePasswordInput.parse(body);
    const { sessionVersion } = await this.auth.changePassword(user.personId, input.currentPassword, input.newPassword);
    // The change bumped the session version, which invalidates every cookie signed with the
    // old password -- including the one this request arrived on. Re-mint it, or the caller is
    // signed out by their own password change (and every first-login user with it).
    const token = await this.jwt.signAsync({ ...user, sessionVersion });
    res.cookie(SESSION_COOKIE, token, this.cookieOpts());
    return { ok: true };
  }
}

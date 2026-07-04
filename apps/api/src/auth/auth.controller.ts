import { Controller, Get, Inject, Post, Res, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { SESSION_COOKIE } from "./constants.js";
import { type AuthUser, CurrentUser } from "./current-user.js";
import { Public } from "./decorators.js";
import { LocalAuthGuard } from "./guards.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
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
    return user;
  }

  @Post("logout")
  @Public()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ENV } from "../config/config.module.js";
import type { Env } from "../config/env.js";
import { AuthController } from "./auth.controller.js";
import { UsersController } from "./users.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { LocalStrategy } from "./local.strategy.js";
import { RolesGuard } from "./roles.guard.js";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.SESSION_SECRET,
        signOptions: { expiresIn: "7d" },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    // Global: verify JWT cookie (skips @Public), then enforce @Roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}

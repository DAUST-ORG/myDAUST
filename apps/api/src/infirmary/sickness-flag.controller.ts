import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { SicknessFlagService } from "./sickness-flag.service.js";

const FlagInput = z.object({
  isEmergency: z.boolean().optional().default(false),
  notes: z.string().max(8000).optional(),
});

/**
 * Sick-flag endpoints. Default route auth is `infirmary + admin` (set at the class level);
 * the clear endpoint overrides to `admin` only.
 */
@Roles("infirmary", "admin")
@Controller("infirmary/consultations/:consultationId/flag-sick")
export class SicknessFlagController {
  constructor(private readonly svc: SicknessFlagService) {}

  @Post()
  flag(
    @CurrentUser() user: AuthUser,
    @Param("consultationId") consultationId: string,
    @Body() body: unknown,
  ) {
    const input = FlagInput.parse(body);
    return this.svc.flagSick(
      consultationId,
      input.isEmergency,
      user.personId,
      user.name,
    );
  }

  @Delete()
  @Roles("admin")
  clear(@CurrentUser() user: AuthUser, @Param("consultationId") consultationId: string) {
    return this.svc.clearSick(consultationId, user.personId, user.name);
  }
}

@Roles("infirmary", "admin", "registrar")
@Controller("infirmary/consultations/flagged")
export class FlaggedTodayController {
  constructor(private readonly svc: SicknessFlagService) {}

  @Get()
  list() {
    return this.svc.listFlaggedToday();
  }
}

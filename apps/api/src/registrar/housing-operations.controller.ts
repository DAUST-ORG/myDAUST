import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user.js";
import { Roles } from "../auth/decorators.js";
import { HousingOperationsService } from "./housing-operations.service.js";

const AcademicYearLabel = z.string().trim().min(4).max(20);
const HousingMutationInput = z.object({
  academicYearLabel: AcademicYearLabel,
  expectedUpdatedAt: z.string().datetime(),
  reason: z.string().trim().min(5).max(1000),
});
const AssignHousingInput = HousingMutationInput.extend({
  hallId: z.string().min(1).max(64),
  room: z.string().trim().min(1).max(80),
});

@Controller("registrar/housing")
@Roles("registrar", "admin")
export class HousingOperationsController {
  constructor(private readonly housing: HousingOperationsService) {}

  @Get()
  list(@Query("academicYearLabel") academicYearLabel?: string) {
    return this.housing.list(
      academicYearLabel
        ? AcademicYearLabel.parse(academicYearLabel)
        : undefined,
    );
  }

  @Post(":id/assign")
  assign(
    @CurrentUser() user: AuthUser,
    @Param("id") assignmentId: string,
    @Body() body: unknown,
  ) {
    const input = AssignHousingInput.parse(body);
    return this.housing.assign(user.personId, {
      assignmentId,
      academicYearLabel: input.academicYearLabel,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      hallId: input.hallId,
      room: input.room,
      reason: input.reason,
    });
  }

  @Post(":id/release")
  release(
    @CurrentUser() user: AuthUser,
    @Param("id") assignmentId: string,
    @Body() body: unknown,
  ) {
    const input = HousingMutationInput.parse(body);
    return this.housing.release(user.personId, {
      assignmentId,
      academicYearLabel: input.academicYearLabel,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      reason: input.reason,
    });
  }
}

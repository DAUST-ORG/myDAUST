import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
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
const HallInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(120),
  beds: z.number().int().min(0).max(10000),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
const HallPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: z.string().trim().min(1).max(120).optional(),
  beds: z.number().int().min(0).max(10000).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
const DormRoomInput = z.object({
  floor: z.number().int().min(0).max(60),
  roomNo: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(12),
  note: z.string().trim().max(300).nullish(),
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

  // --- Dorm registry (the buildings themselves, apart from residents) ---

  @Get("dorms")
  dorms(@Query("academicYearLabel") academicYearLabel?: string) {
    return this.housing.listDorms(
      academicYearLabel
        ? AcademicYearLabel.parse(academicYearLabel)
        : undefined,
    );
  }

  @Post("dorms")
  createDorm(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.housing.createHall(user.personId, HallInput.parse(body));
  }

  @Patch("dorms/:id")
  updateDorm(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.housing.updateHall(user.personId, id, HallPatch.parse(body));
  }

  @Post("dorms/:id/rooms")
  saveRoom(
    @CurrentUser() user: AuthUser,
    @Param("id") hallId: string,
    @Body() body: unknown,
  ) {
    const input = DormRoomInput.parse(body);
    return this.housing.upsertRoom(user.personId, hallId, {
      floor: input.floor,
      roomNo: input.roomNo,
      capacity: input.capacity,
      note: input.note ?? null,
    });
  }

  @Delete("rooms/:roomId")
  deleteRoom(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Query("academicYearLabel") academicYearLabel?: string,
  ) {
    return this.housing.deleteRoom(
      user.personId,
      roomId,
      academicYearLabel
        ? AcademicYearLabel.parse(academicYearLabel)
        : undefined,
    );
  }
}

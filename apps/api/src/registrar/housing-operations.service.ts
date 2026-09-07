import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import { PrismaService } from "../prisma/prisma.service.js";

interface HousingMutationInput {
  assignmentId: string;
  academicYearLabel: string;
  expectedUpdatedAt: Date;
  reason: string;
}

interface AssignHousingInput extends HousingMutationInput {
  hallId: string;
  room: string;
}

const assignmentInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      recordStatus: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
  billedServiceOption: {
    select: {
      id: true,
      academicYearLabel: true,
      kind: true,
      code: true,
      label: true,
      amountXof: true,
      active: true,
    },
  },
  hall: { select: { id: true, name: true, kind: true, beds: true } },
} satisfies Prisma.HousingAssignmentInclude;

type HousingAssignmentDetail = Prisma.HousingAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

type HousingBilledSelection = {
  serviceOptionId: string;
  optionCode: string;
  label: string;
  amountXof: number;
  profile: { studentId: string };
};

type RoomContext = {
  capacity: 1 | 2 | null;
  occupants: number;
  mixedOccupancy: boolean;
};

export function housingRoomCapacity(optionCode: string): 1 | 2 | null {
  if (optionCode === "double" || optionCode === "double_ac") return 2;
  if (optionCode === "individual" || optionCode === "individual_ac") return 1;
  return null;
}

function normalizedRoom(room: string) {
  return room.trim().toLocaleLowerCase("en-US");
}

function annualRoomKey(hallId: string | null, room: string | null) {
  return hallId && room?.trim() ? `${hallId}:${normalizedRoom(room)}` : null;
}

@Injectable()
export class HousingOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async yearLabel(requested?: string) {
    const label = requested?.trim();
    const year = label
      ? await this.prisma.academicYear.findUnique({ where: { label } })
      : await this.prisma.academicYear.findFirst({
          where: { status: "active" },
          orderBy: [{ startsOn: "desc" }, { label: "desc" }],
        });
    if (!year) throw new NotFoundException("Academic year not found");
    return year.label;
  }

  private warnings(
    assignment: HousingAssignmentDetail,
    selection: HousingBilledSelection | null,
    roomContext?: RoomContext,
  ): string[] {
    const warnings: string[] = [];
    const option = assignment.billedServiceOption;
    if (
      !option ||
      !selection ||
      selection.optionCode === "none" ||
      selection.amountXof <= 0
    ) {
      warnings.push("No billed housing option");
    } else if (
      option.kind !== "housing" ||
      option.academicYearLabel !== assignment.academicYearLabel
    ) {
      warnings.push("Billed housing option does not match this academic year");
    } else if (!option.active) {
      warnings.push("Billed housing option is inactive");
    }
    if (assignment.student.recordStatus !== "active") {
      warnings.push(`Student record is ${assignment.student.recordStatus}`);
    }
    if (
      assignment.status === "assigned" &&
      (!assignment.hallId || !assignment.room?.trim())
    ) {
      warnings.push("Assigned status is missing a hall or room");
    }
    if (selection && housingRoomCapacity(selection.optionCode) === null) {
      warnings.push("Billed housing option has no supported room capacity");
    }
    if (roomContext?.mixedOccupancy) {
      warnings.push("Room mixes shared and individual housing options");
    }
    if (
      roomContext?.capacity !== null &&
      roomContext &&
      roomContext.occupants > roomContext.capacity
    ) {
      warnings.push("Room occupancy exceeds the billed housing capacity");
    }
    return warnings;
  }

  private present(
    assignment: HousingAssignmentDetail,
    selection: HousingBilledSelection | null,
    roomContext: RoomContext = {
      capacity: selection ? housingRoomCapacity(selection.optionCode) : null,
      occupants: 0,
      mixedOccupancy: false,
    },
  ) {
    return {
      id: assignment.id,
      academicYearLabel: assignment.academicYearLabel,
      studentId: assignment.studentId,
      studentNo: assignment.student.studentNo,
      studentName:
        `${assignment.student.person.firstName} ${assignment.student.person.lastName}`.trim(),
      studentRecordStatus: assignment.student.recordStatus,
      billedOption:
        assignment.billedServiceOption && selection
          ? {
              id: assignment.billedServiceOption.id,
              code: selection.optionCode,
              label: selection.label,
              // BillingProfileSelection is the immutable per-profile price snapshot;
              // the annual catalog row may be edited after this Student was billed.
              amountXof: selection.amountXof,
              active: assignment.billedServiceOption.active,
            }
          : null,
      status: assignment.status,
      hallId: assignment.hallId,
      hallName: assignment.hall?.name ?? null,
      room: assignment.room,
      roomCapacity: roomContext.capacity,
      roomOccupants: roomContext.occupants,
      note: assignment.note,
      updatedAt: assignment.updatedAt.toISOString(),
      warnings: this.warnings(assignment, selection, roomContext),
    };
  }

  async list(academicYearLabel?: string) {
    const year = await this.yearLabel(academicYearLabel);
    const [assignments, halls] = await Promise.all([
      this.prisma.housingAssignment.findMany({
        where: { academicYearLabel: year },
        include: assignmentInclude,
        orderBy: [{ student: { studentNo: "asc" } }, { id: "asc" }],
      }),
      this.prisma.hall.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              assignments: {
                where: { academicYearLabel: year, status: "assigned" },
              },
            },
          },
        },
      }),
    ]);
    const selections = await this.prisma.billingProfileSelection.findMany({
      where: {
        academicYearLabel: year,
        kind: "housing",
        profile: {
          status: "active",
          studentId: {
            in: assignments.map((assignment) => assignment.studentId),
          },
        },
      },
      select: {
        serviceOptionId: true,
        optionCode: true,
        label: true,
        amountXof: true,
        profile: { select: { studentId: true } },
      },
    });
    const selectionByStudentOption = new Map(
      selections.map((selection) => [
        `${selection.profile.studentId}:${selection.serviceOptionId}`,
        selection,
      ]),
    );
    const assignedByRoom = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      if (assignment.status !== "assigned") continue;
      const key = annualRoomKey(assignment.hallId, assignment.room);
      if (!key) continue;
      const roomAssignments = assignedByRoom.get(key) ?? [];
      roomAssignments.push(assignment);
      assignedByRoom.set(key, roomAssignments);
    }
    return {
      academicYearLabel: year,
      assignments: assignments.map((assignment) => {
        const selection =
          selectionByStudentOption.get(
            `${assignment.studentId}:${assignment.billedServiceOptionId ?? ""}`,
          ) ?? null;
        const roomAssignments =
          assignedByRoom.get(
            annualRoomKey(assignment.hallId, assignment.room) ?? "",
          ) ?? [];
        const capacity = selection
          ? housingRoomCapacity(selection.optionCode)
          : null;
        const occupantCapacities = roomAssignments.map((occupant) => {
          const occupantSelection = selectionByStudentOption.get(
            `${occupant.studentId}:${occupant.billedServiceOptionId ?? ""}`,
          );
          return occupantSelection
            ? housingRoomCapacity(occupantSelection.optionCode)
            : null;
        });
        return this.present(assignment, selection, {
          capacity,
          occupants: roomAssignments.length,
          mixedOccupancy: occupantCapacities.some(
            (occupantCapacity) =>
              occupantCapacity === null || occupantCapacity !== capacity,
          ),
        });
      }),
      halls: halls.map((hall) => ({
        id: hall.id,
        name: hall.name,
        kind: hall.kind,
        beds: hall.beds,
        occupiedBeds: hall._count.assignments,
        availableBeds: Math.max(0, hall.beds - hall._count.assignments),
      })),
    };
  }

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        const retryable =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Serializable housing transaction retry limit exhausted");
  }

  private async lockedAssignment(
    tx: Prisma.TransactionClient,
    input: HousingMutationInput,
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "HousingAssignment"
      WHERE id = ${input.assignmentId}
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw new NotFoundException("Housing assignment not found");
    }
    const assignment = await tx.housingAssignment.findUnique({
      where: { id: input.assignmentId },
      include: assignmentInclude,
    });
    if (!assignment)
      throw new NotFoundException("Housing assignment not found");
    if (assignment.academicYearLabel !== input.academicYearLabel) {
      throw new BadRequestException(
        "Housing assignment belongs to a different academic year",
      );
    }
    if (assignment.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new ConflictException(
        "Housing assignment changed; refresh before trying again",
      );
    }
    return assignment;
  }

  private async billedSelection(
    tx: Prisma.TransactionClient,
    assignment: HousingAssignmentDetail,
  ): Promise<HousingBilledSelection | null> {
    if (!assignment.billedServiceOptionId) return null;
    return tx.billingProfileSelection.findFirst({
      where: {
        academicYearLabel: assignment.academicYearLabel,
        kind: "housing",
        serviceOptionId: assignment.billedServiceOptionId,
        profile: {
          studentId: assignment.studentId,
          status: "active",
        },
      },
      select: {
        serviceOptionId: true,
        optionCode: true,
        label: true,
        amountXof: true,
        profile: { select: { studentId: true } },
      },
    });
  }

  private async assignedRoomOccupants(
    tx: Prisma.TransactionClient,
    input: {
      assignmentId: string;
      academicYearLabel: string;
      hallId: string | null;
      room: string | null;
    },
  ) {
    if (!input.hallId || !input.room?.trim()) return [];
    return tx.$queryRaw<
      Array<{
        id: string;
        studentId: string;
        billedServiceOptionId: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "studentId", "billedServiceOptionId"
      FROM "HousingAssignment"
      WHERE "academicYearLabel" = ${input.academicYearLabel}
        AND "hallId" = ${input.hallId}
        AND "status" = 'assigned'::"HousingStatus"
        AND "id" <> ${input.assignmentId}
        AND lower(btrim("room")) = lower(btrim(${input.room}))
      ORDER BY "id"
    `);
  }

  async assign(actorId: string, input: AssignHousingInput) {
    const room = input.room.trim();
    if (!room) throw new BadRequestException("Room is required");
    return this.transaction(async (tx) => {
      const assignment = await this.lockedAssignment(tx, input);
      if (assignment.student.recordStatus !== "active") {
        throw new BadRequestException(
          "Only active Students can receive a room assignment",
        );
      }
      if (
        assignment.status !== "pending" &&
        assignment.status !== "unassigned"
      ) {
        throw new BadRequestException(
          "Release the current room before assigning another one",
        );
      }
      const option = assignment.billedServiceOption;
      if (
        !option ||
        option.kind !== "housing" ||
        option.academicYearLabel !== input.academicYearLabel
      ) {
        throw new BadRequestException(
          "The Student has no valid billed housing option for this academic year",
        );
      }
      const billedSelection = await this.billedSelection(tx, assignment);
      if (
        !billedSelection ||
        billedSelection.optionCode === "none" ||
        billedSelection.amountXof <= 0
      ) {
        throw new BadRequestException(
          "The Student has no billed housing profile selection for this academic year",
        );
      }
      const lockedHall = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "Hall" WHERE id = ${input.hallId} FOR UPDATE
      `);
      if (lockedHall.length !== 1)
        throw new NotFoundException("Hall not found");
      const hall = await tx.hall.findUniqueOrThrow({
        where: { id: input.hallId },
      });
      const occupied = await tx.housingAssignment.count({
        where: {
          academicYearLabel: input.academicYearLabel,
          hallId: hall.id,
          status: "assigned",
        },
      });
      if (occupied >= hall.beds) {
        throw new BadRequestException("This hall is already at capacity");
      }
      const roomCapacity = housingRoomCapacity(billedSelection.optionCode);
      if (roomCapacity === null) {
        throw new BadRequestException(
          `Housing option ${billedSelection.optionCode} has no supported room capacity`,
        );
      }
      const roomOccupants = await this.assignedRoomOccupants(tx, {
        assignmentId: assignment.id,
        academicYearLabel: input.academicYearLabel,
        hallId: hall.id,
        room,
      });
      const occupantSelections = await tx.billingProfileSelection.findMany({
        where: {
          academicYearLabel: input.academicYearLabel,
          kind: "housing",
          profile: {
            status: "active",
            studentId: {
              in: roomOccupants.map((occupant) => occupant.studentId),
            },
          },
        },
        select: {
          serviceOptionId: true,
          optionCode: true,
          profile: { select: { studentId: true } },
        },
      });
      const occupantSelectionByStudentOption = new Map(
        occupantSelections.map((selection) => [
          `${selection.profile.studentId}:${selection.serviceOptionId}`,
          selection,
        ]),
      );
      const occupantCapacities = roomOccupants.map((occupant) => {
        const selection = occupantSelectionByStudentOption.get(
          `${occupant.studentId}:${occupant.billedServiceOptionId ?? ""}`,
        );
        return selection ? housingRoomCapacity(selection.optionCode) : null;
      });
      if (occupantCapacities.some((capacity) => capacity === null)) {
        throw new BadRequestException(
          "Existing room occupancy has no valid billed housing capacity",
        );
      }
      if (occupantCapacities.some((capacity) => capacity !== roomCapacity)) {
        throw new BadRequestException(
          "Shared and individual housing options cannot occupy the same room",
        );
      }
      if (roomOccupants.length >= roomCapacity) {
        throw new BadRequestException(
          roomCapacity === 1
            ? "This individual room is already assigned for the selected academic year"
            : "This shared room is already at its two-resident capacity",
        );
      }
      const updated = await tx.housingAssignment.updateMany({
        where: {
          id: assignment.id,
          academicYearLabel: input.academicYearLabel,
          updatedAt: input.expectedUpdatedAt,
          status: { in: ["pending", "unassigned"] },
        },
        data: { hallId: hall.id, room, status: "assigned" },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Housing assignment changed; refresh before trying again",
        );
      }
      await tx.auditLog.create({
        data: {
          entity: "HousingAssignment",
          entityId: assignment.id,
          action: "housing-room-assigned",
          actorId,
          data: {
            academicYearLabel: input.academicYearLabel,
            hallId: hall.id,
            room,
            billedServiceOptionId: option.id,
            billedOptionCode: billedSelection.optionCode,
            roomCapacity,
            roomOccupancyAfter: roomOccupants.length + 1,
            previousStatus: assignment.status,
            reason: input.reason,
          },
        },
      });
      const result = await tx.housingAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: assignmentInclude,
      });
      return this.present(result, billedSelection, {
        capacity: roomCapacity,
        occupants: roomOccupants.length + 1,
        mixedOccupancy: false,
      });
    });
  }

  async release(actorId: string, input: HousingMutationInput) {
    return this.transaction(async (tx) => {
      const assignment = await this.lockedAssignment(tx, input);
      if (assignment.status !== "assigned") {
        throw new BadRequestException("Only an assigned room can be released");
      }
      const updated = await tx.housingAssignment.updateMany({
        where: {
          id: assignment.id,
          academicYearLabel: input.academicYearLabel,
          updatedAt: input.expectedUpdatedAt,
          status: "assigned",
        },
        // Hall and room intentionally remain as historical evidence.
        data: { status: "unassigned" },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "Housing assignment changed; refresh before trying again",
        );
      }
      await tx.auditLog.create({
        data: {
          entity: "HousingAssignment",
          entityId: assignment.id,
          action: "housing-room-released",
          actorId,
          data: {
            academicYearLabel: input.academicYearLabel,
            retainedHallId: assignment.hallId,
            retainedRoom: assignment.room,
            billedServiceOptionId: assignment.billedServiceOptionId,
            reason: input.reason,
          },
        },
      });
      const result = await tx.housingAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: assignmentInclude,
      });
      const billedSelection = await this.billedSelection(tx, result);
      const roomOccupants = await this.assignedRoomOccupants(tx, {
        assignmentId: result.id,
        academicYearLabel: result.academicYearLabel,
        hallId: result.hallId,
        room: result.room,
      });
      return this.present(result, billedSelection, {
        capacity: billedSelection
          ? housingRoomCapacity(billedSelection.optionCode)
          : null,
        occupants: roomOccupants.length,
        mixedOccupancy: false,
      });
    });
  }

  // --- Dorm registry -------------------------------------------------------

  /** Every dorm with its managed rooms and live per-room occupancy for the year. */
  async listDorms(academicYearLabel?: string) {
    const year = await this.yearLabel(academicYearLabel);
    const halls = await this.prisma.hall.findMany({
      orderBy: { name: "asc" },
      include: { rooms: { orderBy: [{ floor: "asc" }, { roomNo: "asc" }] } },
    });
    const assignments = await this.prisma.housingAssignment.findMany({
      where: { academicYearLabel: year, status: "assigned" },
      select: { hallId: true, room: true },
    });
    const occupantsByRoom = new Map<string, number>();
    for (const a of assignments) {
      const key = annualRoomKey(a.hallId, a.room);
      if (key) occupantsByRoom.set(key, (occupantsByRoom.get(key) ?? 0) + 1);
    }
    return {
      academicYearLabel: year,
      halls: halls.map((hall) => {
        const rooms = hall.rooms.map((room) => {
          const occupants =
            occupantsByRoom.get(`${hall.id}:${normalizedRoom(room.roomNo)}`) ?? 0;
          return {
            id: room.id,
            floor: room.floor,
            roomNo: room.roomNo,
            capacity: room.capacity,
            note: room.note,
            occupants,
            full: occupants >= room.capacity,
          };
        });
        const capacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
        const occupants = rooms.reduce((sum, r) => sum + r.occupants, 0);
        return {
          id: hall.id,
          name: hall.name,
          kind: hall.kind,
          beds: hall.beds,
          color: hall.color,
          floors: rooms.length ? Math.max(...rooms.map((r) => r.floor)) + 1 : 0,
          roomCount: rooms.length,
          managedCapacity: capacity,
          occupants,
          rooms,
        };
      }),
    };
  }

  async createHall(
    actorId: string,
    input: { name: string; kind: string; beds: number; color?: string },
  ) {
    const hall = await this.prisma.hall.create({
      data: {
        name: input.name,
        kind: input.kind,
        beds: input.beds,
        ...(input.color ? { color: input.color } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Hall",
        entityId: hall.id,
        action: "dorm-created",
        actorId,
        data: { name: hall.name, kind: hall.kind, beds: hall.beds },
      },
    });
    return hall;
  }

  async updateHall(
    actorId: string,
    id: string,
    input: { name?: string; kind?: string; beds?: number; color?: string },
  ) {
    const hall = await this.prisma.hall.findUnique({ where: { id } });
    if (!hall) throw new NotFoundException("Dorm not found");
    const updated = await this.prisma.hall.update({ where: { id }, data: input });
    await this.prisma.auditLog.create({
      data: {
        entity: "Hall",
        entityId: id,
        action: "dorm-updated",
        actorId,
        data: { from: hall, to: input },
      },
    });
    return updated;
  }

  async upsertRoom(
    actorId: string,
    hallId: string,
    input: { floor: number; roomNo: string; capacity: number; note?: string | null },
  ) {
    const hall = await this.prisma.hall.findUnique({ where: { id: hallId } });
    if (!hall) throw new NotFoundException("Dorm not found");
    const room = await this.prisma.dormRoom.upsert({
      where: { hallId_roomNo: { hallId, roomNo: input.roomNo } },
      create: {
        hallId,
        floor: input.floor,
        roomNo: input.roomNo,
        capacity: input.capacity,
        note: input.note ?? null,
      },
      update: {
        floor: input.floor,
        capacity: input.capacity,
        note: input.note ?? null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "DormRoom",
        entityId: room.id,
        action: "dorm-room-saved",
        actorId,
        data: { hallId, ...input },
      },
    });
    return room;
  }

  async deleteRoom(actorId: string, roomId: string, academicYearLabel?: string) {
    const room = await this.prisma.dormRoom.findUnique({
      where: { id: roomId },
      include: { hall: true },
    });
    if (!room) throw new NotFoundException("Room not found");
    const year = await this.yearLabel(academicYearLabel);
    const occupants = await this.prisma.housingAssignment.count({
      where: {
        academicYearLabel: year,
        status: "assigned",
        hallId: room.hallId,
        room: { equals: room.roomNo, mode: "insensitive" },
      },
    });
    if (occupants > 0) {
      throw new BadRequestException(
        `Room ${room.roomNo} still houses ${occupants} resident(s) for ${year}`,
      );
    }
    await this.prisma.dormRoom.delete({ where: { id: roomId } });
    await this.prisma.auditLog.create({
      data: {
        entity: "DormRoom",
        entityId: roomId,
        action: "dorm-room-deleted",
        actorId,
        data: { hallId: room.hallId, roomNo: room.roomNo, academicYearLabel: year },
      },
    });
    return { ok: true };
  }
}

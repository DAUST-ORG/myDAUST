import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@mydaust/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthUser } from "../auth/current-user.js";
import { HousingOperationsController } from "./housing-operations.controller.js";
import { HousingOperationsService } from "./housing-operations.service.js";

const SCHEMA = `housing_operations_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const YEAR = "2041-2042";
const OTHER_YEAR = "2042-2043";
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

describe.skipIf(!DB_URL)("annual Housing operations", () => {
  let prisma: PrismaClient;
  let service: HousingOperationsService;
  let controller: HousingOperationsController;
  let actor: AuthUser;
  let housingOptionId: string;
  let noHousingOptionId: string;
  let otherYearHousingOptionId: string;
  let cafeteriaOptionId: string;

  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    service = new HousingOperationsService(prisma as never);
    controller = new HousingOperationsController(service);

    await prisma.costCenter.createMany({
      data: [
        { code: "3700", name: "Housing", type: "auxiliary" },
        { code: "3600", name: "Cafeteria", type: "auxiliary" },
      ],
      skipDuplicates: true,
    });
    await prisma.academicYear.createMany({
      data: [
        {
          label: YEAR,
          status: "draft",
          startsOn: new Date("2041-08-01T00:00:00.000Z"),
          endsOn: new Date("2042-07-31T00:00:00.000Z"),
        },
        {
          label: OTHER_YEAR,
          status: "draft",
          startsOn: new Date("2042-08-01T00:00:00.000Z"),
          endsOn: new Date("2043-07-31T00:00:00.000Z"),
        },
      ],
    });
    const options = await Promise.all([
      prisma.billingServiceOption.create({
        data: {
          academicYearLabel: YEAR,
          kind: "housing",
          code: "double",
          label: "Double room",
          amountXof: 680_000,
          costCenterCode: "3700",
        },
      }),
      prisma.billingServiceOption.create({
        data: {
          academicYearLabel: YEAR,
          kind: "housing",
          code: "none",
          label: "No housing",
          amountXof: 0,
          costCenterCode: "3700",
        },
      }),
      prisma.billingServiceOption.create({
        data: {
          academicYearLabel: OTHER_YEAR,
          kind: "housing",
          code: "double",
          label: "Double room",
          amountXof: 680_000,
          costCenterCode: "3700",
        },
      }),
      prisma.billingServiceOption.create({
        data: {
          academicYearLabel: YEAR,
          kind: "cafeteria",
          code: "full",
          label: "Full cafeteria",
          amountXof: 630_000,
          costCenterCode: "3600",
        },
      }),
    ]);
    [
      housingOptionId,
      noHousingOptionId,
      otherYearHousingOptionId,
      cafeteriaOptionId,
    ] = options.map((option) => option.id);

    const person = await prisma.person.create({
      data: {
        email: `housing-registrar-${randomUUID()}@test.local`,
        firstName: "Housing",
        lastName: "Registrar",
        kind: "staff",
        roles: ["registrar"],
      },
    });
    actor = {
      personId: person.id,
      roles: ["registrar"],
      email: person.email!,
      name: `${person.firstName} ${person.lastName}`,
      sessionVersion: 0,
    };
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  async function createAssignment(input?: {
    recordStatus?: "active" | "archived" | "pending_payment";
    optionId?: string | null;
    optionCode?: string;
    optionAmountXof?: number;
    academicYearLabel?: string;
    status?: "pending" | "assigned" | "unassigned";
    hallId?: string | null;
    room?: string | null;
    withBilledSelection?: boolean;
  }) {
    const academicYearLabel = input?.academicYearLabel ?? YEAR;
    const optionId =
      input && "optionId" in input ? input.optionId : housingOptionId;
    const person = await prisma.person.create({
      data: {
        email: `housing-student-${randomUUID()}@test.local`,
        firstName: "Housing",
        lastName: "Student",
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.create({
      data: {
        personId: person.id,
        studentNo: `HSG-${randomUUID().slice(0, 12).toUpperCase()}`,
        recordStatus: input?.recordStatus ?? "active",
      },
    });
    if (optionId && input?.withBilledSelection !== false) {
      await prisma.annualBillingProfile.create({
        data: {
          studentId: student.id,
          academicYearLabel,
          status: "active",
          sourceKind: "staff",
          selections: {
            create: {
              kind: "housing",
              serviceOptionId: optionId,
              optionCode: input?.optionCode ?? "double",
              label:
                (input?.optionCode ?? "double") === "none"
                  ? "No housing"
                  : "Double room",
              amountXof: input?.optionAmountXof ?? 680_000,
            },
          },
        },
      });
    }
    const assignment = await prisma.housingAssignment.create({
      data: {
        studentId: student.id,
        academicYearLabel,
        billedServiceOptionId: optionId,
        hallId: input?.hallId ?? null,
        room: input?.room ?? null,
        status: input?.status ?? "pending",
      },
    });
    return { assignment, student };
  }

  function assignBody(
    assignment: { updatedAt: Date },
    hallId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      academicYearLabel: YEAR,
      expectedUpdatedAt: assignment.updatedAt.toISOString(),
      hallId,
      room: " A-12 ",
      reason: "Registrar reviewed the annual room assignment",
      ...overrides,
    };
  }

  it("assigns and releases through the controller while preserving the exact annual billed option and audit trail", async () => {
    const hall = await prisma.hall.create({
      data: {
        name: `Baobab ${randomUUID()}`,
        kind: "Mixed",
        beds: 2,
      },
    });
    const { assignment } = await createAssignment();

    const assigned = await controller.assign(
      actor,
      assignment.id,
      assignBody(assignment, hall.id),
    );
    expect(assigned).toMatchObject({
      id: assignment.id,
      academicYearLabel: YEAR,
      status: "assigned",
      hallId: hall.id,
      room: "A-12",
      billedOption: {
        id: housingOptionId,
        code: "double",
        amountXof: 680_000,
      },
    });
    const persistedAssigned = await prisma.housingAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(persistedAssigned.billedServiceOptionId).toBe(housingOptionId);
    expect(
      await prisma.auditLog.findFirst({
        where: {
          entity: "HousingAssignment",
          entityId: assignment.id,
          action: "housing-room-assigned",
          actorId: actor.personId,
        },
      }),
    ).toMatchObject({
      data: expect.objectContaining({
        academicYearLabel: YEAR,
        hallId: hall.id,
        room: "A-12",
        billedServiceOptionId: housingOptionId,
        billedOptionCode: "double",
        previousStatus: "pending",
      }),
    });

    const released = await controller.release(actor, assignment.id, {
      academicYearLabel: YEAR,
      expectedUpdatedAt: persistedAssigned.updatedAt.toISOString(),
      reason: "Resident checked out after Registrar review",
    });
    expect(released).toMatchObject({
      status: "unassigned",
      hallId: hall.id,
      room: "A-12",
      billedOption: { id: housingOptionId, amountXof: 680_000 },
    });
    const persistedReleased = await prisma.housingAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(persistedReleased).toMatchObject({
      status: "unassigned",
      hallId: hall.id,
      room: "A-12",
      billedServiceOptionId: housingOptionId,
    });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          entityId: assignment.id,
          action: "housing-room-released",
          actorId: actor.personId,
        },
      }),
    ).toMatchObject({
      data: expect.objectContaining({
        retainedHallId: hall.id,
        retainedRoom: "A-12",
        billedServiceOptionId: housingOptionId,
      }),
    });
  });

  it("rejects stale timestamps before mutating or auditing", async () => {
    const hall = await prisma.hall.create({
      data: { name: `Stale ${randomUUID()}`, kind: "Mixed", beds: 2 },
    });
    const { assignment } = await createAssignment();
    const stale = new Date(assignment.updatedAt.getTime() - 1_000);

    await expect(
      controller.assign(
        actor,
        assignment.id,
        assignBody(assignment, hall.id, {
          expectedUpdatedAt: stale.toISOString(),
        }),
      ),
    ).rejects.toThrow(/changed; refresh/);
    await expect(
      prisma.housingAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      }),
    ).resolves.toMatchObject({ status: "pending", hallId: null, room: null });
    expect(
      await prisma.auditLog.count({ where: { entityId: assignment.id } }),
    ).toBe(0);
  });

  it("rejects unbilled and explicit no-housing profiles", async () => {
    const hall = await prisma.hall.create({
      data: { name: `Unbilled ${randomUUID()}`, kind: "Mixed", beds: 4 },
    });
    const unbilled = await createAssignment({ optionId: null });
    await expect(
      controller.assign(
        actor,
        unbilled.assignment.id,
        assignBody(unbilled.assignment, hall.id),
      ),
    ).rejects.toThrow(/no valid billed housing option/);

    const noHousing = await createAssignment({
      optionId: noHousingOptionId,
      optionCode: "none",
      optionAmountXof: 0,
    });
    await expect(
      controller.assign(
        actor,
        noHousing.assignment.id,
        assignBody(noHousing.assignment, hall.id),
      ),
    ).rejects.toThrow(/no billed housing profile selection/);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: { in: [unbilled.assignment.id, noHousing.assignment.id] },
        },
      }),
    ).toBe(0);
  });

  it("rejects archived and payment-pending Students", async () => {
    const hall = await prisma.hall.create({
      data: { name: `Inactive ${randomUUID()}`, kind: "Mixed", beds: 4 },
    });
    for (const recordStatus of ["archived", "pending_payment"] as const) {
      const { assignment } = await createAssignment({ recordStatus });
      await expect(
        controller.assign(
          actor,
          assignment.id,
          assignBody(assignment, hall.id),
        ),
      ).rejects.toThrow(/Only active Students/);
      await expect(
        prisma.housingAssignment.findUniqueOrThrow({
          where: { id: assignment.id },
        }),
      ).resolves.toMatchObject({ status: "pending" });
    }
  });

  it("enforces annual hall capacity and a two-resident shared-room limit case-insensitively", async () => {
    const fullHall = await prisma.hall.create({
      data: { name: `Full ${randomUUID()}`, kind: "Mixed", beds: 1 },
    });
    await createAssignment({
      status: "assigned",
      hallId: fullHall.id,
      room: "F-01",
    });
    const atCapacity = await createAssignment();
    await expect(
      controller.assign(
        actor,
        atCapacity.assignment.id,
        assignBody(atCapacity.assignment, fullHall.id, { room: "F-02" }),
      ),
    ).rejects.toThrow(/at capacity/);

    const sharedHall = await prisma.hall.create({
      data: { name: `Shared ${randomUUID()}`, kind: "Mixed", beds: 5 },
    });
    await createAssignment({
      status: "assigned",
      hallId: sharedHall.id,
      room: "D-17",
    });
    const secondResident = await createAssignment();
    await expect(
      controller.assign(
        actor,
        secondResident.assignment.id,
        assignBody(secondResident.assignment, sharedHall.id, { room: "d-17" }),
      ),
    ).resolves.toMatchObject({ status: "assigned", roomOccupants: 2 });

    const thirdResident = await createAssignment();
    await expect(
      controller.assign(
        actor,
        thirdResident.assignment.id,
        assignBody(thirdResident.assignment, sharedHall.id, { room: "D-17" }),
      ),
    ).rejects.toThrow(/two-resident capacity/);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: {
            in: [atCapacity.assignment.id, thirdResident.assignment.id],
          },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { entityId: secondResident.assignment.id },
      }),
    ).toBe(1);
  });

  it("rejects a wrong requested year and database-level wrong-year or non-housing option links", async () => {
    const hall = await prisma.hall.create({
      data: { name: `Wrong year ${randomUUID()}`, kind: "Mixed", beds: 2 },
    });
    const { assignment } = await createAssignment();
    await expect(
      controller.assign(actor, assignment.id, {
        ...assignBody(assignment, hall.id),
        academicYearLabel: OTHER_YEAR,
      }),
    ).rejects.toThrow(/different academic year/);

    await expect(
      prisma.housingAssignment.update({
        where: { id: assignment.id },
        data: { billedServiceOptionId: otherYearHousingOptionId },
      }),
    ).rejects.toThrow();
    const nonHousingPerson = await prisma.person.create({
      data: {
        email: `non-housing-${randomUUID()}@test.local`,
        firstName: "Non",
        lastName: "Housing",
        kind: "student",
        roles: ["student"],
      },
    });
    const nonHousingStudent = await prisma.student.create({
      data: {
        personId: nonHousingPerson.id,
        studentNo: `HSG-NON-${randomUUID().slice(0, 8).toUpperCase()}`,
      },
    });
    await expect(
      prisma.housingAssignment.create({
        data: {
          studentId: nonHousingStudent.id,
          academicYearLabel: YEAR,
          billedServiceOptionId: cafeteriaOptionId,
          billedServiceKind: "cafeteria",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.housingAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      }),
    ).resolves.toMatchObject({
      academicYearLabel: YEAR,
      billedServiceOptionId: housingOptionId,
      status: "pending",
    });
  });

  it("rolls the assignment back when the required audit insert fails", async () => {
    const hall = await prisma.hall.create({
      data: { name: `Atomic ${randomUUID()}`, kind: "Mixed", beds: 2 },
    });
    const { assignment } = await createAssignment();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${SCHEMA}".reject_housing_assignment_audit()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'housing-room-assigned' THEN
          RAISE EXCEPTION 'forced housing audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_housing_assignment_audit
      BEFORE INSERT ON "${SCHEMA}"."AuditLog"
      FOR EACH ROW EXECUTE FUNCTION "${SCHEMA}".reject_housing_assignment_audit()
    `);
    try {
      await expect(
        controller.assign(
          actor,
          assignment.id,
          assignBody(assignment, hall.id),
        ),
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS reject_housing_assignment_audit
        ON "${SCHEMA}"."AuditLog"
      `);
      await prisma.$executeRawUnsafe(`
        DROP FUNCTION IF EXISTS "${SCHEMA}".reject_housing_assignment_audit()
      `);
    }

    await expect(
      prisma.housingAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      }),
    ).resolves.toMatchObject({ status: "pending", hallId: null, room: null });
    expect(
      await prisma.auditLog.count({ where: { entityId: assignment.id } }),
    ).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import { HousingOperationsController } from "./housing-operations.controller.js";
import { HousingOperationsService } from "./housing-operations.service.js";

const UPDATED_AT = new Date("2026-09-01T10:00:00.000Z");

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    studentId: "student-1",
    academicYearLabel: "2026-2027",
    billedServiceOptionId: "housing-double",
    billedServiceKind: "housing",
    hallId: null,
    room: null,
    status: "pending",
    note: null,
    updatedAt: UPDATED_AT,
    student: {
      id: "student-1",
      studentNo: "S2026001AB",
      recordStatus: "active",
      person: { firstName: "Awa", lastName: "Ndiaye" },
    },
    billedServiceOption: {
      id: "housing-double",
      academicYearLabel: "2026-2027",
      kind: "housing",
      code: "double",
      label: "Double room",
      amountXof: 680_000,
      active: true,
    },
    hall: null,
    ...overrides,
  };
}

function harness(initial = assignment()) {
  const updated = assignment({
    ...initial,
    status: "assigned",
    hallId: "hall-1",
    room: "A-12",
    hall: { id: "hall-1", name: "Baobab", kind: "Mixed", beds: 2 },
    updatedAt: new Date("2026-09-01T10:01:00.000Z"),
  });
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ id: "assignment-1" }])
      .mockResolvedValueOnce([{ id: "hall-1" }])
      .mockResolvedValueOnce([]),
    housingAssignment: {
      findUnique: vi.fn().mockResolvedValue(initial),
      findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    billingProfileSelection: {
      findFirst: vi.fn().mockResolvedValue({
        serviceOptionId: "housing-double",
        optionCode: "double",
        label: "Double room",
        amountXof: 680_000,
        profile: { studentId: "student-1" },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    hall: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: "hall-1", name: "Baobab", beds: 2 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  return {
    tx,
    service: new HousingOperationsService(prisma as never),
  };
}

describe("HousingOperationsService", () => {
  it("keeps every housing operations route behind registrar or admin authorization", () => {
    expect(Reflect.getMetadata(ROLES_KEY, HousingOperationsController)).toEqual(
      ["registrar", "admin"],
    );
    for (const method of ["list", "assign", "release"]) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          HousingOperationsController.prototype[
            method as keyof HousingOperationsController
          ],
        ),
      ).toBeUndefined();
    }
  });

  it("lists annual assignments with billed-option warnings and hall capacity", async () => {
    const current = assignment({
      billedServiceOptionId: null,
      billedServiceOption: null,
    });
    const prisma = {
      academicYear: {
        findUnique: vi.fn().mockResolvedValue({ label: "2026-2027" }),
      },
      housingAssignment: { findMany: vi.fn().mockResolvedValue([current]) },
      billingProfileSelection: { findMany: vi.fn().mockResolvedValue([]) },
      hall: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "hall-1",
            name: "Baobab",
            kind: "Mixed",
            beds: 30,
            _count: { assignments: 28 },
          },
        ]),
      },
    };
    const service = new HousingOperationsService(prisma as never);
    await expect(service.list("2026-2027")).resolves.toMatchObject({
      academicYearLabel: "2026-2027",
      assignments: [
        {
          studentNo: "S2026001AB",
          billedOption: null,
          warnings: ["No billed housing option"],
        },
      ],
      halls: [{ occupiedBeds: 28, availableBeds: 2 }],
    });
  });

  it("assigns a pending billed resident with optimistic, capacity, and audit guards", async () => {
    const { service, tx } = harness();
    await expect(
      service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: " A-12 ",
        reason: "Registrar reviewed room availability",
      }),
    ).resolves.toMatchObject({
      status: "assigned",
      hallId: "hall-1",
      room: "A-12",
      billedOption: { code: "double", amountXof: 680_000 },
    });
    expect(tx.housingAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: UPDATED_AT,
          status: { in: ["pending", "unassigned"] },
        }),
        data: { hallId: "hall-1", room: "A-12", status: "assigned" },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "housing-room-assigned",
          actorId: "registrar-1",
        }),
      }),
    );
  });

  it("rejects an unbilled or no-housing assignment", async () => {
    const { service, tx } = harness(
      assignment({ billedServiceOptionId: null, billedServiceOption: null }),
    );
    await expect(
      service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: "A-12",
        reason: "Attempted assignment",
      }),
    ).rejects.toThrow(/no valid billed housing option/);
    expect(tx.housingAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("uses the billed profile snapshot even when its catalog option is later inactive", async () => {
    const current = assignment({
      billedServiceOption: {
        ...assignment().billedServiceOption,
        active: false,
        amountXof: 0,
      },
    });
    const { service } = harness(current);
    await expect(
      service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: "A-12",
        reason: "Honoring the already billed housing selection",
      }),
    ).resolves.toMatchObject({
      status: "assigned",
      billedOption: {
        code: "double",
        amountXof: 680_000,
        active: false,
      },
    });
  });

  it("rejects a stale room mutation before checking capacity", async () => {
    const { service, tx } = harness(
      assignment({ updatedAt: new Date("2026-09-01T10:00:01.000Z") }),
    );
    await expect(
      service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: "A-12",
        reason: "Attempted assignment",
      }),
    ).rejects.toThrow(/changed; refresh/);
    expect(tx.hall.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.housingAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects archived and payment-pending Students", async () => {
    for (const recordStatus of ["archived", "pending_payment"]) {
      const current = assignment();
      current.student.recordStatus = recordStatus;
      const { service } = harness(current);
      await expect(
        service.assign("registrar-1", {
          assignmentId: "assignment-1",
          academicYearLabel: "2026-2027",
          expectedUpdatedAt: UPDATED_AT,
          hallId: "hall-1",
          room: "A-12",
          reason: "Attempted assignment",
        }),
      ).rejects.toThrow(/Only active Students/);
    }
  });

  it("rejects full halls, allows two shared residents, and rejects a third", async () => {
    const full = harness();
    full.tx.housingAssignment.count.mockResolvedValue(2);
    await expect(
      full.service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: "A-12",
        reason: "Attempted assignment",
      }),
    ).rejects.toThrow(/at capacity/);

    const shared = harness();
    shared.tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ id: "assignment-1" }])
      .mockResolvedValueOnce([{ id: "hall-1" }])
      .mockResolvedValueOnce([
        {
          id: "assignment-2",
          studentId: "student-2",
          billedServiceOptionId: "housing-double-2",
        },
      ]);
    shared.tx.billingProfileSelection.findMany.mockResolvedValue([
      {
        serviceOptionId: "housing-double-2",
        optionCode: "double",
        profile: { studentId: "student-2" },
      },
    ]);
    await expect(
      shared.service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: "A-12",
        reason: "Assigning the second resident to a shared room",
      }),
    ).resolves.toMatchObject({ status: "assigned", room: "A-12" });

    const third = harness();
    third.tx.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ id: "assignment-1" }])
      .mockResolvedValueOnce([{ id: "hall-1" }])
      .mockResolvedValueOnce([
        {
          id: "assignment-2",
          studentId: "student-2",
          billedServiceOptionId: "housing-double-2",
        },
        {
          id: "assignment-3",
          studentId: "student-3",
          billedServiceOptionId: "housing-double-3",
        },
      ]);
    third.tx.billingProfileSelection.findMany.mockResolvedValue([
      {
        serviceOptionId: "housing-double-2",
        optionCode: "double",
        profile: { studentId: "student-2" },
      },
      {
        serviceOptionId: "housing-double-3",
        optionCode: "double",
        profile: { studentId: "student-3" },
      },
    ]);
    await expect(
      third.service.assign("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        hallId: "hall-1",
        room: "A-12",
        reason: "Attempting a third shared-room assignment",
      }),
    ).rejects.toThrow(/two-resident capacity/);
  });

  it("releases a room without erasing retained hall and room history", async () => {
    const assigned = assignment({
      status: "assigned",
      hallId: "hall-1",
      room: "A-12",
      hall: { id: "hall-1", name: "Baobab", kind: "Mixed", beds: 2 },
    });
    const { service, tx } = harness(assigned);
    tx.$queryRaw.mockReset().mockResolvedValue([{ id: "assignment-1" }]);
    tx.housingAssignment.findUniqueOrThrow.mockResolvedValue({
      ...assigned,
      status: "unassigned",
      updatedAt: new Date("2026-09-01T10:01:00.000Z"),
    });
    await expect(
      service.release("registrar-1", {
        assignmentId: "assignment-1",
        academicYearLabel: "2026-2027",
        expectedUpdatedAt: UPDATED_AT,
        reason: "Resident checked out",
      }),
    ).resolves.toMatchObject({
      status: "unassigned",
      hallId: "hall-1",
      room: "A-12",
    });
    expect(tx.housingAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "unassigned" } }),
    );
    expect(
      tx.housingAssignment.updateMany.mock.calls[0]![0].data,
    ).not.toHaveProperty("hallId");
    expect(
      tx.housingAssignment.updateMany.mock.calls[0]![0].data,
    ).not.toHaveProperty("room");
  });
});

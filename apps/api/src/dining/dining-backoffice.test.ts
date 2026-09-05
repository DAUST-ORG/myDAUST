import { describe, expect, it, vi } from "vitest";
import { DiningService } from "./dining.service.js";

function service(prisma: unknown) {
  return new DiningService(
    { SESSION_SECRET: "test-secret" } as never,
    prisma as never,
    {} as never,
  );
}

describe("inventory adjustments", () => {
  it("refuses an adjustment that would drive stock negative", async () => {
    const tx = {
      inventoryItem: { update: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      inventoryItem: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "item-1",
          name: "Rice",
          unit: "kg",
          qtyOnHand: 5,
        }),
      },
      $transaction: vi.fn(),
    };
    await expect(
      service(prisma).adjustInventory(
        "item-1",
        { delta: -5.5, reason: "spoilage" },
        "person-1",
      ),
    ).rejects.toThrow("would drive Rice to -0.50 kg");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("moves stock and appends the ledger row plus audit atomically", async () => {
    const update = vi.fn().mockResolvedValue({ id: "item-1", qtyOnHand: 15 });
    const createMovement = vi.fn().mockResolvedValue({ id: "move-1" });
    const createAudit = vi.fn().mockResolvedValue({ id: "audit-1" });
    const prisma = {
      inventoryItem: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "item-1",
          name: "Rice",
          unit: "kg",
          qtyOnHand: 5,
        }),
        update,
      },
      inventoryMovement: { create: createMovement },
      auditLog: { create: createAudit },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    await service(prisma).adjustInventory(
      "item-1",
      { delta: 10, reason: "weekly delivery" },
      "person-1",
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { qtyOnHand: 15 },
    });
    expect(createMovement).toHaveBeenCalledWith({
      data: {
        itemId: "item-1",
        delta: 10,
        reason: "weekly delivery",
        actorId: "person-1",
      },
    });
    expect(createAudit).toHaveBeenCalled();
  });
});

describe("dietary profiles", () => {
  it("attaches a profile to the exact student number or to nobody", async () => {
    const prisma = {
      student: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    await expect(
      service(prisma).upsertDietary(
        {
          studentNo: "s20261zz",
          restrictions: ["vegetarian"],
          allergies: [],
        },
        "person-1",
      ),
    ).rejects.toThrow("Student not found");
    expect(prisma.student.findUnique).toHaveBeenCalledWith({
      where: { studentNo: "S20261ZZ" },
      select: { id: true, studentNo: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("meal budgets", () => {
  it("upserts one row per dated service and reports plan-vs-served cost", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "budget-1" });
    const prisma = {
      mealBudget: {
        upsert,
        findMany: vi.fn().mockResolvedValue([
          {
            id: "budget-1",
            date: new Date("2026-09-07T00:00:00.000Z"),
            period: "lunch",
            plannedServings: 200,
            costPerServingXof: 720,
            notes: null,
          },
        ]),
      },
      diningScan: {
        groupBy: vi.fn().mockResolvedValue([
          {
            date: new Date("2026-09-07T00:00:00.000Z"),
            period: "lunch",
            _count: 150,
          },
        ]),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    await service(prisma).upsertBudget(
      {
        date: "2026-09-07",
        period: "lunch",
        plannedServings: 200,
        costPerServingXof: 720,
      },
      "person-1",
    );
    expect(upsert).toHaveBeenCalledWith({
      where: {
        date_period: {
          date: new Date("2026-09-07T00:00:00.000Z"),
          period: "lunch",
        },
      },
      update: expect.objectContaining({ plannedServings: 200 }),
      create: expect.objectContaining({ plannedServings: 200 }),
    });
    const [row] = await service(prisma).listBudgets("2026-09-07", "2026-09-07");
    expect(row).toMatchObject({
      date: "2026-09-07",
      period: "lunch",
      plannedServings: 200,
      plannedCostXof: 144000,
      served: 150,
      actualCostXof: 108000,
    });
  });

  it("refuses inverted or unbounded budget ranges", async () => {
    const prisma = {
      mealBudget: { findMany: vi.fn() },
      diningScan: { groupBy: vi.fn() },
    };
    await expect(
      service(prisma).listBudgets("2026-09-08", "2026-09-07"),
    ).rejects.toThrow("inverted");
    await expect(
      service(prisma).listBudgets("2026-01-01", "2026-12-31"),
    ).rejects.toThrow("93 days");
    expect(prisma.mealBudget.findMany).not.toHaveBeenCalled();
  });
});

describe("menu schedule", () => {
  it("refuses to schedule items that do not exist", async () => {
    const prisma = {
      menuItem: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    };
    await expect(
      service(prisma).setSchedule(
        {
          date: "2026-09-07",
          period: "lunch",
          items: [{ menuItemId: "missing", plannedQty: 10 }],
        },
        "person-1",
      ),
    ).rejects.toThrow("does not exist");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("replaces the whole dated service so the kitchen sees the last save", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      menuItem: {
        findMany: vi.fn().mockResolvedValue([{ id: "item-1" }]),
      },
      menuSchedule: { deleteMany, createMany },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    await service(prisma).setSchedule(
      {
        date: "2026-09-07",
        period: "lunch",
        items: [{ menuItemId: "item-1", plannedQty: 200 }],
      },
      "person-1",
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { date: new Date("2026-09-07T00:00:00.000Z"), period: "lunch" },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          date: new Date("2026-09-07T00:00:00.000Z"),
          period: "lunch",
          menuItemId: "item-1",
          plannedQty: 200,
        },
      ],
    });
  });
});

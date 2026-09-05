import { describe, expect, it, vi } from "vitest";
import { dakarMinutesNow } from "@mydaust/shared";
import { DiningService } from "./dining.service.js";
import { PaymentSubmissionsService } from "../finance/payment-submissions.service.js";

const SETTINGS_BASE = {
  mealWindows: {
    breakfast: { start: "07:00", end: "09:00" },
    lunch: { start: "12:00", end: "14:00" },
    dinner: { start: "19:00", end: "21:00" },
  },
  costPerMealXof: 720,
  enforcePayment: false,
  blockSecondScan: true,
};

function dakarClockPlus(minutesAhead: number): string {
  // Clamped, not wrapped. The cutoff is compared as minutes-into-the-day, so a
  // time that rolls past midnight reads as earlier than now: wrapping made
  // "two hours from now" mean "closed" whenever the suite ran after 22:00 in
  // Dakar, failing these tests for a two-hour window every night.
  const total = Math.min(dakarMinutesNow(new Date()) + minutesAhead, 1439);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function service(prisma: unknown) {
  return new DiningService(
    { SESSION_SECRET: "test-secret" } as never,
    prisma as never,
    {} as never,
  );
}

function basePrisma(overrides: Record<string, unknown> = {}) {
  return {
    appSetting: {
      findUnique: vi.fn().mockResolvedValue({
        key: "dining.settings",
        valueJson: {
          ...SETTINGS_BASE,
          weekendOrdering: true,
          orderCutoff: dakarClockPlus(120),
        },
      }),
    },
    student: {
      findFirst: vi.fn().mockResolvedValue({ id: "student-1" }),
    },
    ...overrides,
  };
}

describe("weekend ordering switch and cutoff", () => {
  it("refuses new carts while the dining office has closed ordering", async () => {
    const prisma = basePrisma();
    prisma.appSetting.findUnique.mockResolvedValue({
      key: "dining.settings",
      valueJson: {
        ...SETTINGS_BASE,
        weekendOrdering: false,
        orderCutoff: "23:59",
      },
    });
    await expect(
      service(prisma).createOrder("student-1", [
        { menuItemId: "item-1", qty: 1 },
      ]),
    ).rejects.toThrow("Weekend ordering is currently closed");
  });

  it("refuses new carts past the Dakar cutoff", async () => {
    const prisma = basePrisma();
    prisma.appSetting.findUnique.mockResolvedValue({
      key: "dining.settings",
      valueJson: {
        ...SETTINGS_BASE,
        weekendOrdering: true,
        orderCutoff: "00:00",
      },
    });
    await expect(
      service(prisma).createOrder("student-1", [
        { menuItemId: "item-1", qty: 1 },
      ]),
    ).rejects.toThrow("Dakar time");
  });

  it("rejects items the kitchen has switched off, not just unknown ids", async () => {
    const prisma = basePrisma({
      menuItem: {
        // The disabled item is found by id but filtered by availability.
        findMany: vi.fn().mockResolvedValue([]),
      },
      diningOrder: { create: vi.fn() },
    });
    await expect(
      service(prisma).createOrder("student-1", [
        { menuItemId: "disabled-item", qty: 2 },
      ]),
    ).rejects.toThrow("no longer available");
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["disabled-item"] }, available: true },
    });
    expect(prisma.diningOrder.create).not.toHaveBeenCalled();
  });

  it("creates the cart when ordering is open and every item is available", async () => {
    const create = vi.fn().mockResolvedValue({ id: "order-1" });
    const prisma = basePrisma({
      menuItem: {
        findMany: vi.fn().mockResolvedValue([{ id: "item-1", priceXof: 2500 }]),
      },
      diningOrder: { create },
    });
    await service(prisma).createOrder("student-1", [
      { menuItemId: "item-1", qty: 2 },
    ]);
    expect(create).toHaveBeenCalledWith({
      data: {
        studentId: "student-1",
        status: "cart",
        totalXof: 5000,
        items: {
          create: [{ menuItemId: "item-1", qty: 2, priceXof: 2500 }],
        },
      },
    });
  });
});

describe("cart cancellation", () => {
  // claimed is what the conditional status flip reports back. 0 stands for
  // "something else moved this order out of cart mid-transaction".
  function cancelPrisma(order: unknown, attempts: unknown[] = [], claimed = 1) {
    const tx = {
      diningOrder: {
        findUnique: vi.fn().mockResolvedValue(order),
        updateMany: vi.fn().mockResolvedValue({ count: claimed }),
        update: vi.fn(),
      },
      paymentSubmission: {
        findMany: vi.fn().mockResolvedValue(attempts),
        updateMany: vi.fn(),
      },
      payment: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    };
    return { prisma, tx };
  }

  it("lets a student cancel their own cart and retires live payment attempts", async () => {
    const { prisma, tx } = cancelPrisma(
      { id: "order-1", studentId: "student-1", status: "cart" },
      [{ id: "attempt-1", paymentId: "payment-1" }],
    );
    await service(prisma).cancelOrder("order-1", "student-1", "person-1");
    expect(tx.diningOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "cart" },
      data: { status: "cancelled" },
    });
    expect(tx.paymentSubmission.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["attempt-1"] },
        status: { in: ["awaiting_proof", "submitted"] },
      },
      data: { status: "cancelled", activeKey: null },
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["payment-1"] }, status: "pending" },
      data: { status: "cancelled" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        entity: "DiningOrder",
        entityId: "order-1",
        action: "cancel",
        actorId: "person-1",
        data: { from: "cart", liveAttemptsRetired: 1, cancelledOwnOrder: true },
      },
    });
  });

  it("refuses to cancel another student's cart", async () => {
    const { prisma, tx } = cancelPrisma({
      id: "order-1",
      studentId: "student-2",
      status: "cart",
    });
    await expect(
      service(prisma).cancelOrder("order-1", "student-1", "person-1"),
    ).rejects.toThrow("Not your order");
    expect(tx.diningOrder.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to cancel anything past the cart stage — paid orders need Finance", async () => {
    for (const status of ["paid", "preparing", "ready", "collected"]) {
      const { prisma, tx } = cancelPrisma({
        id: "order-1",
        studentId: "student-1",
        status,
      });
      await expect(
        service(prisma).cancelOrder("order-1", "student-1", "person-1"),
      ).rejects.toThrow("Only unpaid cart orders can be cancelled");
      expect(tx.diningOrder.updateMany).not.toHaveBeenCalled();
    }
  });

  it("lets dining staff cancel any student's cart", async () => {
    const { prisma, tx } = cancelPrisma({
      id: "order-1",
      studentId: "student-9",
      status: "cart",
    });
    await service(prisma).cancelOrder("order-1", null, "staff-person");
    expect(tx.diningOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "cart" },
      data: { status: "cancelled" },
    });
  });

  it("aborts when the order stops being a cart mid-transaction", async () => {
    // Finance verifying a proof between the read and the write. Without the
    // conditional flip this cancelled a paid order and rewrote a verified
    // submission, leaving settled cash attached to a cancelled order.
    const { prisma, tx } = cancelPrisma(
      { id: "order-1", studentId: "student-1", status: "cart" },
      [{ id: "attempt-1", paymentId: "payment-1" }],
      0,
    );
    await expect(
      service(prisma).cancelOrder("order-1", "student-1", "person-1"),
    ).rejects.toThrow("stopped being a cart");
    expect(tx.paymentSubmission.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("advancing a paid order", () => {
  function advancePrisma(status: string) {
    const prisma = {
      diningOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: "order-1", status }),
        update: vi.fn().mockResolvedValue({ id: "order-1" }),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    return prisma;
  }

  it("refuses to advance a cancelled order", async () => {
    // Cancelling retires the order's payment attempts, so advancing one would
    // hand over food against money that was never taken.
    const prisma = advancePrisma("cancelled");
    await expect(
      service(prisma).advanceOrder("order-1", "preparing", "staff-person"),
    ).rejects.toThrow("cancelled and cannot be prepared");
    expect(prisma.diningOrder.update).not.toHaveBeenCalled();
  });

  it("refuses to advance an unpaid cart", async () => {
    const prisma = advancePrisma("cart");
    await expect(
      service(prisma).advanceOrder("order-1", "preparing", "staff-person"),
    ).rejects.toThrow("not paid yet");
    expect(prisma.diningOrder.update).not.toHaveBeenCalled();
  });

  it("advances a paid order", async () => {
    const prisma = advancePrisma("paid");
    await service(prisma).advanceOrder("order-1", "preparing", "staff-person");
    expect(prisma.diningOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "preparing" },
    });
  });
});

describe("dining-visible plan changes", () => {
  it("exposes each student's pending billing-profile request to the dining desk", async () => {
    const prisma = {
      academicYear: {
        findMany: vi.fn().mockResolvedValue([{ label: "2026–2027" }]),
      },
      mealPlan: {
        findMany: vi.fn().mockResolvedValue([
          {
            studentId: "student-1",
            type: "full",
            active: true,
            academicYearLabel: "2026–2027",
            term: "Fall 2026",
            student: {
              studentNo: "S20261AA",
              person: { firstName: "Awa", lastName: "Ba" },
            },
          },
        ]),
      },
      diningScan: { groupBy: vi.fn().mockResolvedValue([]) },
      approvalRequest: {
        findMany: vi.fn().mockResolvedValue([
          {
            targetId: "student-1",
            createdAt: new Date("2026-09-05T10:00:00Z"),
            afterJson: { cafeteriaOptionCode: "half" },
          },
        ]),
      },
    };
    const [row] = await service(prisma).adminStudents();
    expect(row).toMatchObject({
      studentNo: "S20261AA",
      plan: "full",
      pendingPlanChange: {
        requestedOptionCode: "half",
        createdAt: "2026-09-05T10:00:00.000Z",
      },
    });
  });

  it("marks non-cafeteria pending requests as generic instead of inventing an option", async () => {
    const prisma = {
      academicYear: {
        findMany: vi.fn().mockResolvedValue([{ label: "2026–2027" }]),
      },
      mealPlan: {
        findMany: vi.fn().mockResolvedValue([
          {
            studentId: "student-1",
            type: "full",
            active: true,
            academicYearLabel: "2026–2027",
            term: "Fall 2026",
            student: {
              studentNo: "S20261AA",
              person: { firstName: "Awa", lastName: "Ba" },
            },
          },
        ]),
      },
      diningScan: { groupBy: vi.fn().mockResolvedValue([]) },
      approvalRequest: {
        findMany: vi.fn().mockResolvedValue([
          {
            targetId: "student-1",
            createdAt: new Date("2026-09-05T10:00:00Z"),
            afterJson: { housingOptionCode: "single" },
          },
        ]),
      },
    };
    const [row] = await service(prisma).adminStudents();
    expect(row?.pendingPlanChange).toMatchObject({
      requestedOptionCode: null,
    });
  });
});

describe("verify cannot resurrect a cancelled dining order", () => {
  it("refuses verification once the cart is cancelled, before storing any file", async () => {
    const filesPut = vi.fn();
    const prisma = {
      paymentSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "attempt-1",
          status: "submitted",
          proofObjectKey: "payment-files/proof.png",
          diningOrderId: "order-1",
        }),
      },
      diningOrder: {
        findUnique: vi.fn().mockResolvedValue({ status: "cancelled" }),
      },
    };
    const submissions = new PaymentSubmissionsService(
      prisma as never,
      { put: filesPut } as never,
      {} as never,
      {} as never,
    );
    await expect(
      submissions.verify(
        "attempt-1",
        { transactionReference: "REF-1" },
        { originalname: "v.png" } as never,
        { personId: "bursar-1", email: "b@daust.edu", name: "Bursar" },
      ),
    ).rejects.toThrow("no longer awaiting payment");
    expect(filesPut).not.toHaveBeenCalled();
  });
});

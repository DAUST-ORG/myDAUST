import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import {
  AddChargeInput,
  AdminFinanceController,
} from "./admin-finance.controller.js";

const ACTOR = { personId: "person-1", roles: ["bursar"] } as never;

function buildController() {
  const request = vi.fn(async () => ({ applied: false, id: "approval-1" }));
  const controller = new AdminFinanceController(
    {} as never,
    { request } as never,
    {} as never,
  );
  return { controller, request };
}

const CHARGE = {
  studentIds: ["student-1"],
  description: "Laboratory replacement fee",
  amountXof: 25_000,
  requestReason: "Broke a spectrometer lens",
};

describe("AddChargeInput", () => {
  it("accepts a single-line charge", () => {
    expect(AddChargeInput.parse(CHARGE).amountXof).toBe(25_000);
  });

  it("accepts a charge split across its own payment dates", () => {
    expect(
      AddChargeInput.parse({
        ...CHARGE,
        installments: [
          { dueDate: "2026-10-01", amountXof: 10_000, label: "First" },
          { dueDate: "2026-11-01", amountXof: 15_000 },
        ],
      }).installments,
    ).toHaveLength(2);
  });

  it("rejects a charge with no student", () => {
    expect(() => AddChargeInput.parse({ ...CHARGE, studentIds: [] })).toThrow();
  });

  it("rejects a fractional or negative amount", () => {
    expect(() =>
      AddChargeInput.parse({ ...CHARGE, amountXof: 25_000.5 }),
    ).toThrow();
    expect(() => AddChargeInput.parse({ ...CHARGE, amountXof: -1 })).toThrow();
  });

  it("rejects a charge with no reason", () => {
    expect(() =>
      AddChargeInput.parse({ ...CHARGE, requestReason: "   " }),
    ).toThrow();
  });

  it("rejects more than 24 payment dates", () => {
    expect(() =>
      AddChargeInput.parse({
        ...CHARGE,
        installments: Array.from({ length: 25 }, () => ({
          dueDate: "2026-10-01",
          amountXof: 1_000,
        })),
      }),
    ).toThrow();
  });
});

describe("charge endpoints", () => {
  it("submits a charge to the approval rail rather than writing it", async () => {
    const { controller, request } = buildController();
    await controller.addCharge(ACTOR, CHARGE);
    expect(request).toHaveBeenCalledWith(ACTOR, {
      kind: "custom_charge",
      targetType: "Invoice",
      reason: CHARGE.requestReason,
      after: {
        studentIds: CHARGE.studentIds,
        description: CHARGE.description,
        amountXof: CHARGE.amountXof,
      },
    });
  });

  it("submits a credit to the approval rail rather than writing it", async () => {
    const { controller, request } = buildController();
    await controller.applyDiscount(ACTOR, {
      studentId: "student-1",
      label: "Goodwill adjustment",
      amountXof: 50_000,
      requestReason: "Agreed with the family",
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      kind: "discount",
      targetType: "Student",
      targetId: "student-1",
    });
  });

  it("keeps both charge routes behind the Finance role gate", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminFinanceController)).toEqual([
      "bursar",
      "admin",
    ]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminFinanceController.prototype.addCharge,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminFinanceController.prototype.applyDiscount,
      ),
    ).toBeUndefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators.js";
import type { AuthUser } from "../auth/current-user.js";
import {
  AdminFinanceController,
  RecordStudentPaymentInput,
} from "./admin-finance.controller.js";
import { FinanceService } from "./finance.service.js";

const IDEMPOTENCY_KEY = "A8F70978-86F2-4A1D-960F-209975F596E4";
const NORMALIZED_PAYMENT_ID = IDEMPOTENCY_KEY.toLowerCase();

describe("RecordStudentPaymentInput", () => {
  it("accepts cash without a transaction reference", () => {
    expect(
      RecordStudentPaymentInput.parse({
        amountXof: 75_000,
        method: "cash",
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).toEqual({
      amountXof: 75_000,
      method: "cash",
      idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  it.each(["wave", "orange_money"] as const)(
    "accepts %s only with an alphanumeric transaction reference",
    (method) => {
      expect(
        RecordStudentPaymentInput.parse({
          amountXof: 50_000,
          method,
          transactionReference: "  TXN-2026 / 0042  ",
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ).toEqual({
        amountXof: 50_000,
        method,
        transactionReference: "TXN-2026 / 0042",
        idempotencyKey: IDEMPOTENCY_KEY,
      });
    },
  );

  it.each([
    { method: "cash", transactionReference: "CASH-42" },
    { method: "wave" },
    { method: "orange_money", transactionReference: "   " },
    { method: "wave", transactionReference: "---///" },
  ])("rejects an invalid method/reference pair: $method", (input) => {
    expect(() =>
      RecordStudentPaymentInput.parse({
        amountXof: 50_000,
        idempotencyKey: IDEMPOTENCY_KEY,
        ...input,
      }),
    ).toThrow();
  });

  it.each([
    { amountXof: 0, idempotencyKey: IDEMPOTENCY_KEY },
    { amountXof: 1.5, idempotencyKey: IDEMPOTENCY_KEY },
    { amountXof: 100_000_001, idempotencyKey: IDEMPOTENCY_KEY },
    { amountXof: 1_000, idempotencyKey: "not-a-uuid" },
  ])("rejects an invalid amount or idempotency key", (input) => {
    expect(() =>
      RecordStudentPaymentInput.parse({
        method: "cash",
        ...input,
      }),
    ).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() =>
      RecordStudentPaymentInput.parse({
        amountXof: 50_000,
        method: "cash",
        idempotencyKey: IDEMPOTENCY_KEY,
        invoiceId: "client-selected-invoice",
      }),
    ).toThrow();
  });
});

describe("manual payment route", () => {
  it("is bursar-only even though the controller also allows administrators", () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminFinanceController.prototype.recordStudentPayment,
      ),
    ).toEqual(["bursar"]);
  });

  it("passes the authenticated actor and parsed body to FinanceService", async () => {
    const recordStudentPayment = vi.fn().mockResolvedValue({ ok: true });
    const controller = new AdminFinanceController(
      { recordStudentPayment } as never,
      {} as never,
      {} as never,
    );
    const actor: AuthUser = {
      personId: "finance-person",
      email: "cashier@daust.edu",
      name: "Finance Cashier",
      roles: ["bursar"],
    };

    await controller.recordStudentPayment(actor, "student-1", {
      amountXof: 60_000,
      method: "wave",
      transactionReference: "  WAVE-REF-42  ",
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(recordStudentPayment).toHaveBeenCalledWith({
      studentId: "student-1",
      amountXof: 60_000,
      method: "wave",
      transactionReference: "WAVE-REF-42",
      idempotencyKey: IDEMPOTENCY_KEY,
      actor,
    });
  });
});

function financeServiceFixture(
  existingPayment: Record<string, unknown> | null,
) {
  const prisma = {
    payment: { findUnique: vi.fn().mockResolvedValue(existingPayment) },
    student: {
      findUnique: vi.fn().mockResolvedValue({
        id: "student-1",
        person: { email: "student@daust.edu" },
      }),
    },
  };
  const finance = new FinanceService(
    prisma as never,
    { send: vi.fn() } as never,
    {} as never,
    new Map() as never,
  );
  const loadPayableAccount = vi.fn().mockResolvedValue({ invoices: [] });
  const requirePayableTarget = vi.fn().mockReturnValue({
    invoice: { id: "invoice-1" },
  });
  const assertFinanceReferenceAvailable = vi
    .fn()
    .mockResolvedValue("reference-fingerprint");
  const settlePayment = vi.fn().mockResolvedValue(undefined);
  const receipt = { id: NORMALIZED_PAYMENT_ID };
  const getReceipt = vi
    .spyOn(finance, "getReceipt")
    .mockResolvedValue(receipt as never);

  Object.assign(finance as object, {
    loadPayableAccount,
    requirePayableTarget,
    assertFinanceReferenceAvailable,
    settlePayment,
  });

  return {
    finance,
    prisma,
    loadPayableAccount,
    requirePayableTarget,
    assertFinanceReferenceAvailable,
    settlePayment,
    getReceipt,
    receipt,
  };
}

describe("FinanceService.recordStudentPayment", () => {
  const actor = {
    personId: "finance-person",
    email: "cashier@daust.edu",
    name: "Finance Cashier",
  };

  it("derives a stable ledger id/reference and sends the canonical target to settlement", async () => {
    const fixture = financeServiceFixture(null);

    await expect(
      fixture.finance.recordStudentPayment({
        studentId: "student-1",
        amountXof: 60_000,
        method: "wave",
        transactionReference: "  Wave Ref / 42  ",
        idempotencyKey: IDEMPOTENCY_KEY,
        actor,
      }),
    ).resolves.toEqual({
      ok: true,
      paymentId: NORMALIZED_PAYMENT_ID,
      receipt: fixture.receipt,
    });

    expect(fixture.assertFinanceReferenceAvailable).toHaveBeenCalledWith(
      "wave",
      "Wave Ref / 42",
      NORMALIZED_PAYMENT_ID,
    );
    expect(fixture.settlePayment).toHaveBeenCalledWith(
      NORMALIZED_PAYMENT_ID,
      expect.objectContaining({
        via: "finance_manual",
        actorId: actor.personId,
        method: "wave",
        confirmedAmount: 60_000,
        payload: {
          externalReference: "Wave Ref / 42",
          recordedByFinance: true,
        },
        createPayment: {
          invoiceId: "invoice-1",
          studentId: "student-1",
          amount: 60_000,
          method: "wave",
          providerRef: `FINANCE-MANUAL-${NORMALIZED_PAYMENT_ID}`,
          externalReferenceFingerprintSha256: "reference-fingerprint",
          source: "finance_manual",
          initiatedById: actor.personId,
          initiatedByEmail: null,
        },
        financeRecord: expect.objectContaining({
          contactEmail: "student@daust.edu",
          transactionReference: "Wave Ref / 42",
          reviewedByName: actor.name,
          reviewedByEmail: actor.email,
        }),
      }),
    );
  });

  it("returns an exact successful replay without settling or auditing twice", async () => {
    const fixture = financeServiceFixture({
      id: NORMALIZED_PAYMENT_ID,
      invoiceId: "invoice-1",
      studentId: "student-1",
      amount: 75_000,
      method: "cash",
      status: "success",
      source: "finance_manual",
      providerRef: `FINANCE-MANUAL-${NORMALIZED_PAYMENT_ID}`,
      externalReferenceFingerprintSha256: null,
    });

    await expect(
      fixture.finance.recordStudentPayment({
        studentId: "student-1",
        amountXof: 75_000,
        method: "cash",
        idempotencyKey: IDEMPOTENCY_KEY,
        actor,
      }),
    ).resolves.toEqual({
      ok: true,
      paymentId: NORMALIZED_PAYMENT_ID,
      receipt: fixture.receipt,
    });

    expect(fixture.settlePayment).not.toHaveBeenCalled();
    expect(fixture.prisma.student.findUnique).not.toHaveBeenCalled();
    expect(fixture.getReceipt).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";
import {
  InitiatePaymentInput,
  PLAN_TEMPLATES,
  PaymentMethod,
  PiSpiAliasInput,
  PiSpiInitiateInput,
  WireApprovalInput,
  WirePaymentConfig,
  piSpiReasonText,
  splitEvenXof,
} from "./finance.js";

describe("splitEvenXof", () => {
  it("always sums back to the exact total (zero-decimal XOF)", () => {
    for (const total of [2_975_000, 1_487_500, 1_000_001, 7, 30_000]) {
      for (const parts of [1, 2, 3, 4, 8]) {
        const split = splitEvenXof(total, parts);
        expect(split).toHaveLength(parts);
        expect(split.reduce((s, v) => s + v, 0)).toBe(total);
      }
    }
  });

  it("gives earlier installments the remainder, never differing by more than 1", () => {
    const split = splitEvenXof(1_000_001, 3);
    expect(split).toEqual([333_334, 333_334, 333_333]);
    expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
  });

  it("covers every plan template", () => {
    for (const t of PLAN_TEMPLATES) {
      const split = splitEvenXof(2_975_000, t.installments);
      expect(split.reduce((s, v) => s + v, 0)).toBe(2_975_000);
    }
  });
});

describe("wire payment contracts", () => {
  it("recognizes wire as a payment method", () => {
    expect(PaymentMethod.parse("wire")).toBe("wire");
  });

  it("recognizes cheque for accounting-only historical records", () => {
    expect(PaymentMethod.parse("cheque")).toBe("cheque");
  });

  it("recognizes cash for Finance-recorded payments", () => {
    expect(PaymentMethod.parse("cash")).toBe("cash");
  });

  it("recognizes an explicitly unknown legacy rail only in the ledger schema", () => {
    expect(PaymentMethod.parse("legacy_unknown")).toBe("legacy_unknown");
    expect(
      InitiatePaymentInput.safeParse({
        invoiceId: "2afba2e0-c43a-4870-845a-c7510faaf110",
        amount: 315_000,
        method: "legacy_unknown",
      }).success,
    ).toBe(false);
  });

  it("rejects cheque from payer-facing checkout initiation", () => {
    expect(
      InitiatePaymentInput.safeParse({
        invoiceId: "2afba2e0-c43a-4870-845a-c7510faaf110",
        amount: 315_000,
        method: "cheque",
      }).success,
    ).toBe(false);
  });

  it("rejects cash from payer-facing checkout initiation", () => {
    expect(
      InitiatePaymentInput.safeParse({
        invoiceId: "00000000-0000-4000-8000-000000000000",
        amount: 1000,
        method: "cash",
      }).success,
    ).toBe(false);
  });

  it("requires approval evidence and a positive confirmed amount", () => {
    expect(
      WireApprovalInput.safeParse({ confirmedAmountXof: 1000 }).success,
    ).toBe(false);
    expect(
      WireApprovalInput.safeParse({
        confirmedAmountXof: 1000,
        bankReference: "BNK-42",
      }).success,
    ).toBe(true);
  });

  it("validates notification recipient emails", () => {
    expect(
      WirePaymentConfig.safeParse({
        enabled: false,
        notificationRecipients: ["not-an-email"],
      }).success,
    ).toBe(false);
  });
});

describe("PI-SPI contracts", () => {
  it("accepts pi_spi as a payment method", () => {
    expect(PaymentMethod.safeParse("pi_spi").success).toBe(true);
  });

  it("requires the alias to be a UUID, not a phone number or free text", () => {
    expect(
      PiSpiAliasInput.safeParse({
        alias: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
    expect(PiSpiAliasInput.safeParse({ alias: "+221771234567" }).success).toBe(
      false,
    );
    expect(PiSpiAliasInput.safeParse({ alias: "" }).success).toBe(false);
  });

  it("rejects a zero, negative or non-integer amount", () => {
    const alias = "550e8400-e29b-41d4-a716-446655440000";
    expect(PiSpiInitiateInput.safeParse({ alias, amountXof: 0 }).success).toBe(
      false,
    );
    expect(
      PiSpiInitiateInput.safeParse({ alias, amountXof: -100 }).success,
    ).toBe(false);
    expect(
      PiSpiInitiateInput.safeParse({ alias, amountXof: 12.5 }).success,
    ).toBe(false);
    expect(
      PiSpiInitiateInput.safeParse({ alias, amountXof: 450000 }).success,
    ).toBe(true);
  });

  it("maps rail reason codes to human copy and never leaks a bare code", () => {
    expect(piSpiReasonText("BE23")).toMatch(/alias was not recognised/i);
    expect(piSpiReasonText("DU03")).toMatch(/already exists/i);
    expect(piSpiReasonText("ZZ99")).toMatch(/code ZZ99/);
    expect(piSpiReasonText(null)).toMatch(/not completed/i);
  });
});

describe("WireApprovalInput bounds", () => {
  it("rejects an absurd confirmed amount", () => {
    expect(
      WireApprovalInput.safeParse({
        confirmedAmountXof: 999_999_999_999,
        bankReference: "BNK-1",
      }).success,
    ).toBe(false);
  });
});

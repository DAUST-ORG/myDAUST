import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertHistoricalInstallmentAllocations } from "./historical-cash-settlement.js";

describe("assertHistoricalInstallmentAllocations", () => {
  it("rejects duplicate installment IDs before ledger writes", () => {
    expect(() =>
      assertHistoricalInstallmentAllocations({
        paymentAmountXof: 600_000,
        allocations: [
          { installmentId: "installment-1", amountXof: 300_000 },
          { installmentId: "installment-1", amountXof: 300_000 },
        ],
        capacities: new Map([["installment-1", 400_000]]),
      }),
    ).toThrow(BadRequestException);
  });

  it("accepts unique allocations that reconcile within aggregate capacity", () => {
    expect(() =>
      assertHistoricalInstallmentAllocations({
        paymentAmountXof: 600_000,
        allocations: [
          { installmentId: "installment-1", amountXof: 400_000 },
          { installmentId: "installment-2", amountXof: 200_000 },
        ],
        capacities: new Map([
          ["installment-1", 400_000],
          ["installment-2", 300_000],
        ]),
      }),
    ).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  isRunRateEligibleCashRecognition,
  paymentCashRecognition,
} from "./payment-cash-recognition.js";

describe("paymentCashRecognition", () => {
  it("uses a real settlement timestamp when one exists", () => {
    const settledAt = new Date("2026-08-27T14:30:00.000Z");
    expect(
      paymentCashRecognition({
        settledAt,
        paymentBalanceImportRow: {
          batch: {
            sourceAsOfDate: new Date("2026-08-29T00:00:00.000Z"),
          },
        },
      }),
    ).toEqual({ occurredOn: settledAt, basis: "settlement" });
  });

  it("uses the reviewed aggregate source date without fabricating settlement", () => {
    const sourceAsOfDate = new Date("2026-08-29T00:00:00.000Z");
    const recognition = paymentCashRecognition({
      settledAt: null,
      paymentBalanceImportRow: { batch: { sourceAsOfDate } },
    });
    expect(recognition).toEqual({
      occurredOn: sourceAsOfDate,
      basis: "source_as_of_balance",
    });
    expect(isRunRateEligibleCashRecognition(recognition!)).toBe(false);
  });

  it("does not invent a reporting date when neither basis exists", () => {
    expect(
      paymentCashRecognition({
        settledAt: null,
        paymentBalanceImportRow: null,
      }),
    ).toBeNull();
  });
});

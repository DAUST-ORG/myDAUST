import { describe, expect, it } from "vitest";
import {
  isRunRateEligibleCashRecognition,
  paymentCashRecognition,
  paymentDateProjection,
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

  it("recognizes workbook-cutover paid-to-date cash on the batch source date", () => {
    const sourceAsOfDate = new Date("2026-08-29T00:00:00.000Z");
    const recognition = paymentCashRecognition({
      settledAt: null,
      recognizedOn: null,
      workbookCutoverRecords: [{ batch: { sourceAsOfDate } }],
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

  it("keeps settlement and source-as-of recognition distinct in API projections", () => {
    const recognizedOn = new Date("2026-08-29T00:00:00.000Z");
    expect(paymentDateProjection({ settledAt: null, recognizedOn })).toEqual({
      settledAt: null,
      recognizedOn,
      dateBasis: "source_as_of_balance",
    });
    const settledAt = new Date("2026-09-01T11:00:00.000Z");
    expect(paymentDateProjection({ settledAt, recognizedOn })).toEqual({
      settledAt,
      recognizedOn: null,
      dateBasis: "settlement",
    });
  });
});

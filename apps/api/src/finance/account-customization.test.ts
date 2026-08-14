import { describe, expect, it } from "vitest";
import {
  deriveAccountSpecialStatus,
  invoicePlanType,
} from "./account-customization.js";

const invoice = (
  patch: Partial<{
    id: string;
    status: string;
    totalAmount: number;
    packageType: string;
    feeScheduleId: string | null;
  }> = {},
) => ({
  id: "invoice-1",
  status: "open",
  totalAmount: 4_285_000,
  packageType: "standard_full",
  feeScheduleId: "schedule-2",
  ...patch,
});

describe("account customization flags", () => {
  it("keeps a linked standard package unflagged", () => {
    expect(deriveAccountSpecialStatus([invoice()])).toEqual({
      isSpecial: false,
      hasIndividualPlan: false,
      hasIndividualComponents: false,
      hasPendingPlanChange: false,
      reasons: [],
    });
    expect(invoicePlanType(invoice())).toBe("global_standard");
  });

  it("flags an unlinked standard package as an individual override", () => {
    const row = invoice({ feeScheduleId: null });
    expect(deriveAccountSpecialStatus([row])).toMatchObject({
      isSpecial: true,
      hasIndividualPlan: true,
      reasons: [{ code: "individual_plan_override", invoiceId: "invoice-1" }],
    });
    expect(invoicePlanType(row)).toBe("individual_override");
  });

  it("reports pending requests and other exceptional ledger entries once", () => {
    const result = deriveAccountSpecialStatus(
      [
        invoice(),
        invoice({
          id: "custom-1",
          packageType: "custom",
          feeScheduleId: null,
          totalAmount: 25_000,
        }),
        invoice({
          id: "custom-2",
          packageType: "custom",
          feeScheduleId: null,
          totalAmount: 30_000,
        }),
        invoice({
          id: "credit-1",
          packageType: "credit",
          feeScheduleId: null,
          totalAmount: -10_000,
        }),
      ],
      new Set(["invoice-1"]),
    );
    expect(result.hasPendingPlanChange).toBe(true);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "pending_plan_change",
      "custom_charge",
      "account_credit",
    ]);
  });

  it("ignores void invoices", () => {
    expect(
      deriveAccountSpecialStatus([
        invoice({ status: "void", feeScheduleId: null }),
      ]).isSpecial,
    ).toBe(false);
  });
});

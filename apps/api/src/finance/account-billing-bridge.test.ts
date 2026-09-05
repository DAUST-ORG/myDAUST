import { describe, expect, it } from "vitest";
import { approvedAccountBillingBridge } from "./finance.service.js";

/**
 * The bridge reports gross charges, and the difference against the net bill is
 * presented to the bursar as approved adjustments. Only an active profile
 * describes what is actually billed, so anything else must fall back to the
 * invoice total or the bursar sees a discount nobody granted.
 */
describe("approvedAccountBillingBridge", () => {
  const invoice = (profileStatus: string | null) => ({
    status: "open",
    totalAmount: 3_000_000,
    amountPaid: 0,
    billingProfile: profileStatus
      ? {
          status: profileStatus,
          grossChargesXof: 4_285_000,
          netBilledXof: 3_000_000,
        }
      : null,
  });

  it("uses the profile gross when the profile is active", () => {
    expect(approvedAccountBillingBridge([invoice("active")], 3_000_000)).toEqual(
      {
        grossChargesXof: 4_285_000,
        adjustmentsXof: -1_285_000,
        netBillXof: 3_000_000,
        paidXof: 0,
        outstandingXof: 3_000_000,
      },
    );
  });

  it.each(["draft", "archived"])(
    "ignores a %s profile and reports no adjustment",
    (status) => {
      expect(approvedAccountBillingBridge([invoice(status)], 3_000_000)).toEqual(
        {
          grossChargesXof: 3_000_000,
          adjustmentsXof: 0,
          netBillXof: 3_000_000,
          paidXof: 0,
          outstandingXof: 3_000_000,
        },
      );
    },
  );

  it("falls back to the invoice total when there is no profile", () => {
    expect(approvedAccountBillingBridge([invoice(null)], 3_000_000)).toEqual({
      grossChargesXof: 3_000_000,
      adjustmentsXof: 0,
      netBillXof: 3_000_000,
      paidXof: 0,
      outstandingXof: 3_000_000,
    });
  });

  it("excludes void invoices from every total", () => {
    expect(
      approvedAccountBillingBridge(
        [
          invoice("active"),
          { ...invoice("active"), status: "void", amountPaid: 500_000 },
        ],
        3_000_000,
      ),
    ).toMatchObject({ grossChargesXof: 4_285_000, paidXof: 0 });
  });
});

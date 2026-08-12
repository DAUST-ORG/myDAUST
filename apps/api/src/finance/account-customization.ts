export type AccountSpecialReasonCode =
  | "individual_plan_override"
  | "pending_plan_change"
  | "legacy_package"
  | "custom_charge"
  | "account_credit";

export type AccountSpecialReason = {
  code: AccountSpecialReasonCode;
  label: string;
  invoiceId: string;
};

type AccountInvoiceCustomizationSource = {
  id: string;
  status: string;
  totalAmount: number;
  packageType: string;
  feeScheduleId: string | null;
};

const REASON_LABELS: Record<AccountSpecialReasonCode, string> = {
  individual_plan_override: "Individual payment plan",
  pending_plan_change: "Payment-plan change awaiting approval",
  legacy_package: "Legacy tuition package",
  custom_charge: "Custom charge",
  account_credit: "Discount, scholarship, or account credit",
};

/**
 * Account flags are derived from the ledger, so they cannot drift from billing.
 * An approved individual override deliberately unlinks a standard invoice from the
 * global schedule; future global revisions therefore cannot overwrite that account.
 */
export function deriveAccountSpecialStatus(
  invoices: readonly AccountInvoiceCustomizationSource[],
  pendingPlanInvoiceIds: ReadonlySet<string> = new Set(),
) {
  const reasons: AccountSpecialReason[] = [];
  const add = (code: AccountSpecialReasonCode, invoiceId: string) => {
    if (reasons.some((reason) => reason.code === code)) return;
    reasons.push({ code, label: REASON_LABELS[code], invoiceId });
  };

  for (const invoice of invoices) {
    if (invoice.status === "void") continue;
    if (pendingPlanInvoiceIds.has(invoice.id)) {
      add("pending_plan_change", invoice.id);
    }
    if (
      invoice.packageType === "standard_full" &&
      invoice.totalAmount > 0 &&
      invoice.feeScheduleId === null
    ) {
      add("individual_plan_override", invoice.id);
    } else if (
      invoice.packageType === "standard_tuition_legacy" &&
      invoice.totalAmount > 0
    ) {
      add("legacy_package", invoice.id);
    } else if (invoice.packageType === "custom" && invoice.totalAmount > 0) {
      add("custom_charge", invoice.id);
    } else if (invoice.packageType === "credit" || invoice.totalAmount < 0) {
      add("account_credit", invoice.id);
    }
  }

  return {
    isSpecial: reasons.length > 0,
    hasIndividualPlan: reasons.some(
      (reason) => reason.code === "individual_plan_override",
    ),
    hasPendingPlanChange: reasons.some(
      (reason) => reason.code === "pending_plan_change",
    ),
    reasons,
  };
}

export function invoicePlanType(invoice: AccountInvoiceCustomizationSource) {
  if (
    invoice.packageType === "standard_full" &&
    invoice.feeScheduleId === null
  ) {
    return "individual_override" as const;
  }
  if (invoice.packageType === "standard_full") {
    return "global_standard" as const;
  }
  if (invoice.packageType === "standard_tuition_legacy") {
    return "legacy" as const;
  }
  if (invoice.packageType === "credit" || invoice.totalAmount < 0) {
    return "credit" as const;
  }
  return "custom" as const;
}

export type PaymentCashRecognition = {
  occurredOn: Date;
  basis: "settlement" | "source_as_of_balance";
};

export type PaymentCashRecognitionInput = {
  settledAt: Date | null;
  paymentBalanceImportRow?: {
    batch: { sourceAsOfDate: Date };
  } | null;
};

/**
 * Return the date on which a successful Payment belongs in cash reporting.
 *
 * Ordinary payments use their real settlement timestamp. Paid-to-date balance
 * imports deliberately keep Payment.settledAt null because the source has no
 * transaction dates; their reviewed source-as-of date is a separate aggregate
 * accounting-recognition basis, not a fabricated settlement timestamp.
 */
export function paymentCashRecognition(
  payment: PaymentCashRecognitionInput,
): PaymentCashRecognition | null {
  if (payment.settledAt) {
    return { occurredOn: payment.settledAt, basis: "settlement" };
  }
  const sourceAsOfDate =
    payment.paymentBalanceImportRow?.batch.sourceAsOfDate ?? null;
  return sourceAsOfDate
    ? { occurredOn: sourceAsOfDate, basis: "source_as_of_balance" }
    : null;
}

/** Aggregate source-as-of balances are cash controls, not velocity samples. */
export function isRunRateEligibleCashRecognition(
  recognition: PaymentCashRecognition,
): boolean {
  return recognition.basis === "settlement";
}

export type PaymentCashRecognition = {
  occurredOn: Date;
  basis: "settlement" | "source_as_of_balance";
};

export type PaymentDateProjection = {
  settledAt: Date | null;
  recognizedOn: Date | null;
  dateBasis: PaymentCashRecognition["basis"] | null;
};

export type PaymentCashRecognitionInput = {
  settledAt: Date | null;
  recognizedOn?: Date | null;
  paymentBalanceImportRow?: {
    batch: { sourceAsOfDate: Date };
  } | null;
  workbookCutoverRecords?: { batch: { sourceAsOfDate: Date } }[];
  workbookReplacementEvents?: {
    kind: string;
    batch: { sourceAsOfDate: Date };
  }[];
};

/**
 * Return the date on which a successful Payment belongs in cash reporting.
 *
 * Ordinary payments use their real settlement timestamp. Paid-to-date balance
 * imports and workbook-cutover reconstructions deliberately keep Payment.settledAt
 * null because the source has no transaction dates; their reviewed source-as-of
 * date is a separate aggregate accounting-recognition basis, not a fabricated
 * settlement timestamp.
 */
export function paymentCashRecognition(
  payment: PaymentCashRecognitionInput,
): PaymentCashRecognition | null {
  if (payment.settledAt) {
    return { occurredOn: payment.settledAt, basis: "settlement" };
  }
  const sourceAsOfDate =
    payment.recognizedOn ??
    payment.workbookCutoverRecords?.[0]?.batch.sourceAsOfDate ??
    payment.workbookReplacementEvents?.find(
      (event) => event.kind === "reconstruction_payment",
    )?.batch.sourceAsOfDate ??
    payment.paymentBalanceImportRow?.batch.sourceAsOfDate ??
    null;
  return sourceAsOfDate
    ? { occurredOn: sourceAsOfDate, basis: "source_as_of_balance" }
    : null;
}

/**
 * Public payment date contract. A source-as-of balance is deliberately exposed
 * separately from settlement so portals never present an import execution time
 * as the date money moved.
 */
export function paymentDateProjection(
  payment: PaymentCashRecognitionInput,
): PaymentDateProjection {
  const recognition = paymentCashRecognition(payment);
  return {
    settledAt: payment.settledAt,
    recognizedOn:
      recognition?.basis === "source_as_of_balance"
        ? recognition.occurredOn
        : null,
    dateBasis: recognition?.basis ?? null,
  };
}

/** Aggregate source-as-of balances are cash controls, not velocity samples. */
export function isRunRateEligibleCashRecognition(
  recognition: PaymentCashRecognition,
): boolean {
  return recognition.basis === "settlement";
}

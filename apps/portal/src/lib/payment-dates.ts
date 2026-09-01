export type PaymentDateLike = {
  status: string;
  settledAt?: string | null;
  recognizedOn?: string | null;
  dateBasis?: "settlement" | "source_as_of_balance" | null;
  refundedAt?: string | null;
  createdAt: string;
};

export type PaymentDatePresentation = {
  eventDate: string | null;
  eventLabel: "Paid" | "Balance recognized" | "Refunded" | "Recorded";
  settlementUnavailable: boolean;
  sortAt: string;
};

/** Keep a reviewed balance-recognition date visibly distinct from settlement. */
export function paymentDatePresentation(
  payment: PaymentDateLike,
): PaymentDatePresentation {
  if (payment.status === "refunded" && payment.refundedAt) {
    return {
      eventDate: payment.refundedAt,
      eventLabel: "Refunded",
      settlementUnavailable: !payment.settledAt,
      sortAt: payment.refundedAt,
    };
  }
  if (payment.settledAt && payment.dateBasis !== "source_as_of_balance") {
    return {
      eventDate: payment.settledAt,
      eventLabel: "Paid",
      settlementUnavailable: false,
      sortAt: payment.settledAt,
    };
  }
  if (payment.recognizedOn && payment.dateBasis !== "settlement") {
    return {
      eventDate: payment.recognizedOn,
      eventLabel: "Balance recognized",
      settlementUnavailable: true,
      sortAt: payment.recognizedOn,
    };
  }
  return {
    eventDate: null,
    eventLabel: "Recorded",
    settlementUnavailable:
      payment.status === "success" || payment.status === "refunded",
    sortAt: payment.createdAt,
  };
}

import {
  deriveAccountPosition,
  toDakarDateKey,
  type AccountPosition,
  type AccountPositionInvoiceInput,
  type AccountBalanceSummary,
  type DerivedAccountInstallment,
} from "@mydaust/shared";

/** Prisma-shaped invoice data accepted by the API account-summary adapter. */
export interface AccountInvoiceRecord {
  id: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  createdAt?: Date | string;
  plan?: {
    installments: readonly {
      id: string;
      sequence: number;
      dueDate: Date | string;
      amountDue: number;
      amountPaid: number;
    }[];
  } | null;
}

export interface PayableAccountTarget {
  invoiceId: string;
  installmentId: string | null;
  outstandingXof: number;
  invoicePayableXof: number;
}

const INVOICE_STATUSES = new Set(["open", "partial", "paid", "void"]);

function invoiceStatus(status: string): AccountPositionInvoiceInput["status"] {
  return INVOICE_STATUSES.has(status)
    ? (status as AccountPositionInvoiceInput["status"])
    : "open";
}

/**
 * The one API-side adapter from Prisma field names to the shared finance contract.
 * Every response surface uses this so credits, voids, dates and no-plan invoices agree.
 */
export function deriveApiAccountPosition(
  invoices: readonly AccountInvoiceRecord[],
  now: Date = new Date(),
): AccountPosition {
  const orderedInvoices = [...invoices].sort((left, right) => {
    const leftCreated = left.createdAt
      ? new Date(left.createdAt).getTime()
      : Number.MAX_SAFE_INTEGER;
    const rightCreated = right.createdAt
      ? new Date(right.createdAt).getTime()
      : Number.MAX_SAFE_INTEGER;
    return leftCreated - rightCreated || left.id.localeCompare(right.id);
  });
  const input: AccountPositionInvoiceInput[] = orderedInvoices.map(
    (invoice) => ({
      id: invoice.id,
      status: invoiceStatus(invoice.status),
      totalAmountXof: invoice.totalAmount,
      amountPaidXof: invoice.amountPaid,
      installments: [...(invoice.plan?.installments ?? [])]
        .sort((left, right) => {
          const dueOrder = toDakarDateKey(left.dueDate).localeCompare(
            toDakarDateKey(right.dueDate),
          );
          return (
            dueOrder ||
            left.sequence - right.sequence ||
            left.id.localeCompare(right.id)
          );
        })
        .map((installment) => ({
          id: installment.id,
          sequence: installment.sequence,
          dueDate: installment.dueDate,
          amountDueXof: installment.amountDue,
          amountPaidXof: installment.amountPaid,
        })),
    }),
  );
  return deriveAccountPosition({
    invoices: input,
    asOfDate: toDakarDateKey(now),
  });
}

/** Lookup table used to decorate legacy installment payloads without changing their shape. */
export function derivedInstallmentsById(position: AccountPosition) {
  return new Map(
    position.installments.flatMap((line) =>
      line.installmentId ? [[line.installmentId, line] as const] : [],
    ),
  );
}

/**
 * Canonical cash-application order: dated obligations first, then due date,
 * installment sequence, invoice creation order, and stable identifiers.
 */
export function payableLinesOldestFirst(
  invoices: readonly AccountInvoiceRecord[],
  position: AccountPosition,
): DerivedAccountInstallment[] {
  const invoiceOrder = new Map(
    [...invoices]
      .sort((left, right) => {
        const leftCreated = left.createdAt
          ? new Date(left.createdAt).getTime()
          : 0;
        const rightCreated = right.createdAt
          ? new Date(right.createdAt).getTime()
          : 0;
        return leftCreated - rightCreated || left.id.localeCompare(right.id);
      })
      .map((invoice, index) => [invoice.id, index] as const),
  );
  const originalOrder = new Map(
    position.installments.map((line, index) => [line, index] as const),
  );
  return position.installments
    .filter((line) => line.outstandingXof > 0)
    .sort((left, right) => {
      if (left.dueDate && right.dueDate) {
        const dueOrder = left.dueDate.localeCompare(right.dueDate);
        if (dueOrder !== 0) return dueOrder;
      } else if (left.dueDate) {
        return -1;
      } else if (right.dueDate) {
        return 1;
      }
      const sequenceOrder =
        (left.sequence ?? Number.MAX_SAFE_INTEGER) -
        (right.sequence ?? Number.MAX_SAFE_INTEGER);
      if (sequenceOrder !== 0) return sequenceOrder;
      const invoicePosition =
        (invoiceOrder.get(left.invoiceId) ?? Number.MAX_SAFE_INTEGER) -
        (invoiceOrder.get(right.invoiceId) ?? Number.MAX_SAFE_INTEGER);
      if (invoicePosition !== 0) return invoicePosition;
      return (
        (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0) ||
        (left.installmentId ?? "").localeCompare(right.installmentId ?? "")
      );
    });
}

export function selectOldestPayableTarget(
  invoices: readonly AccountInvoiceRecord[],
  position: AccountPosition,
): PayableAccountTarget | null {
  const ordered = payableLinesOldestFirst(invoices, position);
  const oldest = ordered[0];
  if (!oldest) return null;
  let invoicePayableXof = 0;
  for (const line of ordered) {
    // Stop before cash would leapfrog an older obligation on another invoice.
    if (line.invoiceId !== oldest.invoiceId) break;
    invoicePayableXof += line.outstandingXof;
  }
  return {
    invoiceId: oldest.invoiceId,
    installmentId: oldest.installmentId,
    outstandingXof: oldest.outstandingXof,
    invoicePayableXof,
  };
}

/** Effective position of one invoice after account-wide credits have been assigned. */
export function invoicePositionSummary(
  position: AccountPosition,
  invoiceId: string,
): AccountBalanceSummary {
  const open = position.installments.filter(
    (line) => line.invoiceId === invoiceId && line.outstandingXof > 0,
  );
  const amount = (state: DerivedAccountInstallment["dueState"]) =>
    open
      .filter((line) => line.dueState === state)
      .reduce((sum, line) => sum + line.outstandingXof, 0);
  const overdueXof = amount("overdue");
  const dueTodayXof = amount("due_today");
  const futureScheduledXof = amount("not_yet_due");
  const notYetDueXof = dueTodayXof + futureScheduledXof;
  const unscheduledXof = amount("unscheduled");
  const outstandingXof = overdueXof + notYetDueXof + unscheduledXof;
  const futureDates = open
    .filter(
      (line) =>
        line.dueState === "due_today" || line.dueState === "not_yet_due",
    )
    .flatMap((line) => line.dueDate ?? [])
    .sort();
  const overdueDates = open
    .filter((line) => line.dueState === "overdue")
    .flatMap((line) => line.dueDate ?? [])
    .sort();
  return {
    balanceXof: outstandingXof,
    outstandingXof,
    creditXof: 0,
    overdueXof,
    dueTodayXof,
    notYetDueXof,
    futureScheduledXof,
    unscheduledXof,
    nextDueDate: futureDates[0] ?? null,
    oldestOverdueDate: overdueDates[0] ?? null,
    daysPastDue: open.reduce(
      (days, line) => Math.max(days, line.daysPastDue),
      0,
    ),
    standing:
      outstandingXof === 0
        ? "cleared"
        : overdueXof > 0
          ? "overdue"
          : unscheduledXof > 0
            ? "unscheduled"
            : "on_time",
  };
}

/**
 * The legacy enum cannot express "partial and overdue". Overdue therefore wins whenever
 * money remains; richer clients should use paymentProgress + dueState instead.
 */
export function legacyInstallmentStatus(
  line: DerivedAccountInstallment,
): "pending" | "partial" | "paid" | "overdue" {
  if (line.outstandingXof <= 0) return "paid";
  if (line.dueState === "overdue") return "overdue";
  return line.paymentProgress === "partial" ? "partial" : "pending";
}

export function decorateInstallment<T extends { id: string }>(
  installment: T,
  derived: ReadonlyMap<string, DerivedAccountInstallment>,
): T & {
  status: "pending" | "partial" | "paid" | "overdue";
  outstanding: number;
  creditApplied: number;
  paymentProgress: DerivedAccountInstallment["paymentProgress"];
  dueState: DerivedAccountInstallment["dueState"];
  daysPastDue: number;
  outstandingXof: number;
  creditAppliedXof: number;
  effectiveSettledXof: number;
  amountDueXof: number;
  amountPaidXof: number;
} {
  const line = derived.get(installment.id);
  if (!line) {
    return {
      ...installment,
      status: "pending",
      outstanding: 0,
      creditApplied: 0,
      paymentProgress: "unpaid",
      dueState: "unscheduled",
      daysPastDue: 0,
      outstandingXof: 0,
      creditAppliedXof: 0,
      effectiveSettledXof: 0,
      amountDueXof: 0,
      amountPaidXof: 0,
    };
  }
  return {
    ...installment,
    status: legacyInstallmentStatus(line),
    outstanding: line.outstandingXof,
    creditApplied: line.creditAppliedXof,
    paymentProgress: line.paymentProgress,
    dueState: line.dueState,
    daysPastDue: line.daysPastDue,
    outstandingXof: line.outstandingXof,
    creditAppliedXof: line.creditAppliedXof,
    effectiveSettledXof: line.amountPaidXof + line.creditAppliedXof,
    amountDueXof: line.amountDueXof,
    amountPaidXof: line.amountPaidXof,
  };
}

/** Status projection for writes; a due date remains current through its Dakar calendar day. */
export function projectedInstallmentStatus(
  input: {
    dueDate: Date | string;
    amountDue: number;
    amountPaid: number;
  },
  now: Date = new Date(),
): "pending" | "partial" | "paid" | "overdue" {
  const projection = deriveAccountPosition({
    invoices: [
      {
        id: "status-projection",
        status: "open",
        totalAmountXof: input.amountDue,
        amountPaidXof: input.amountPaid,
        installments: [
          {
            id: "status-projection-line",
            sequence: 1,
            dueDate: input.dueDate,
            amountDueXof: input.amountDue,
            amountPaidXof: input.amountPaid,
          },
        ],
      },
    ],
    asOfDate: toDakarDateKey(now),
  });
  return legacyInstallmentStatus(projection.installments[0]!);
}

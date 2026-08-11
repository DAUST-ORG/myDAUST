import { z } from "zod";

/** Finance dates are calendar dates in Senegal, never rolling UTC instants. */
export const DAKAR_TIME_ZONE = "Africa/Dakar" as const;

export const AccountStanding = z.enum([
  "no_billing",
  "credit",
  "cleared",
  "on_time",
  "unscheduled",
  "overdue",
]);
export type AccountStanding = z.infer<typeof AccountStanding>;

/** How much of an installment has been settled, including account-level credits. */
export const InstallmentPaymentProgress = z.enum(["unpaid", "partial", "paid"]);
export type InstallmentPaymentProgress = z.infer<
  typeof InstallmentPaymentProgress
>;

/** Calendar position of an installment, independent of its payment progress. */
export const InstallmentDueState = z.enum([
  "unscheduled",
  "not_yet_due",
  "due_today",
  "overdue",
]);
export type InstallmentDueState = z.infer<typeof InstallmentDueState>;

export interface AccountPositionInstallmentInput {
  id: string;
  sequence?: number | null;
  /** Date-only values are preferred; Date/ISO inputs are read in Africa/Dakar. */
  dueDate?: string | Date | null;
  amountDueXof: number;
  amountPaidXof: number;
}

export interface AccountPositionInvoiceInput {
  id: string;
  status: "open" | "partial" | "paid" | "void";
  totalAmountXof: number;
  amountPaidXof: number;
  installments?: readonly AccountPositionInstallmentInput[] | null;
}

export interface DeriveAccountPositionInput {
  invoices: readonly AccountPositionInvoiceInput[];
  /** Injected Dakar business date (`YYYY-MM-DD`); the calculator never reads the clock. */
  asOfDate: string;
}

export interface DerivedAccountInstallment {
  invoiceId: string;
  installmentId: string | null;
  sequence: number | null;
  dueDate: string | null;
  amountDueXof: number;
  amountPaidXof: number;
  /** Credits or unallocated invoice settlement applied oldest-due-first. */
  creditAppliedXof: number;
  outstandingXof: number;
  paymentProgress: InstallmentPaymentProgress;
  dueState: InstallmentDueState;
  daysPastDue: number;
}

export interface AccountBalanceSummary {
  /** Signed net account balance. A negative value is an account credit. */
  balanceXof: number;
  /** Gross amount still owed by this account after its own credits are applied. */
  outstandingXof: number;
  /** Credit left after all positive obligations on this account are covered. */
  creditXof: number;
  overdueXof: number;
  /** Scheduled amount due today or later; `dueTodayXof` is a subset. */
  notYetDueXof: number;
  dueTodayXof: number;
  /** Scheduled amount strictly after the injected Dakar business date. */
  futureScheduledXof: number;
  /** Positive balance that has no payment-plan due date. */
  unscheduledXof: number;
  nextDueDate: string | null;
  oldestOverdueDate: string | null;
  /** Age of the oldest unpaid overdue amount; zero when the account is current. */
  daysPastDue: number;
  standing: AccountStanding;
}

export interface AccountPosition {
  summary: AccountBalanceSummary;
  installments: DerivedAccountInstallment[];
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const dakarFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DAKAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateOnlyEpoch(value: string, label: string): number {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new RangeError(`${label} must be YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  if (new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${label} is not a valid calendar date`);
  }
  return epoch;
}

/** Convert a Date or ISO value to its calendar date as observed in Africa/Dakar. */
export function toDakarDateKey(value: string | Date): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    dateOnlyEpoch(value, "date");
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");
  const parts = dakarFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  const key = `${part("year")}-${part("month")}-${part("day")}`;
  dateOnlyEpoch(key, "date");
  return key;
}

function xof(value: number, label: string, signed = false): number {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) {
    throw new RangeError(
      `${label} must be a ${signed ? "safe" : "non-negative"} integer XOF amount`,
    );
  }
  return value;
}

function dueState(
  dueDate: string | null,
  asOfEpoch: number,
): { state: InstallmentDueState; daysPastDue: number } {
  if (!dueDate) return { state: "unscheduled", daysPastDue: 0 };
  const dueEpoch = dateOnlyEpoch(dueDate, "dueDate");
  const days = Math.round((asOfEpoch - dueEpoch) / DAY_MS);
  if (days > 0) return { state: "overdue", daysPastDue: days };
  if (days === 0) return { state: "due_today", daysPastDue: 0 };
  return { state: "not_yet_due", daysPastDue: 0 };
}

interface MutableLine extends DerivedAccountInstallment {
  order: number;
}

function oldestDueFirst(a: MutableLine, b: MutableLine): number {
  if (a.dueDate && b.dueDate) {
    const dateOrder = a.dueDate.localeCompare(b.dueDate);
    if (dateOrder !== 0) return dateOrder;
  } else if (a.dueDate) {
    return -1;
  } else if (b.dueDate) {
    return 1;
  }
  return (
    (a.sequence ?? Number.MAX_SAFE_INTEGER) -
      (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.order - b.order
  );
}

function applyOffset(lines: MutableLine[], amountXof: number): void {
  let remaining = amountXof;
  for (const line of [...lines].sort(oldestDueFirst)) {
    if (remaining <= 0) break;
    const applied = Math.min(line.outstandingXof, remaining);
    line.creditAppliedXof += applied;
    line.outstandingXof -= applied;
    remaining -= applied;
  }
}

function refreshProgress(line: MutableLine): void {
  if (line.outstandingXof <= 0) line.paymentProgress = "paid";
  else if (line.outstandingXof < line.amountDueXof)
    line.paymentProgress = "partial";
  else line.paymentProgress = "unpaid";
}

/**
 * Derive the canonical financial position for one student account.
 *
 * Void invoices are ignored. Invoice/plan drift and account credits are both applied to
 * the oldest due obligations first. No wall clock is read: callers inject the Dakar date.
 */
export function deriveAccountPosition(
  input: DeriveAccountPositionInput,
): AccountPosition {
  const asOfEpoch = dateOnlyEpoch(input.asOfDate, "asOfDate");
  const invoices = input.invoices.filter(
    (invoice) => invoice.status !== "void",
  );
  const lines: MutableLine[] = [];
  let order = 0;
  let positiveInvoiceOutstanding = 0;
  let accountOffsets = 0;

  for (const invoice of invoices) {
    const totalAmountXof = xof(
      invoice.totalAmountXof,
      `invoice ${invoice.id} totalAmountXof`,
      true,
    );
    const amountPaidXof = xof(
      invoice.amountPaidXof,
      `invoice ${invoice.id} amountPaidXof`,
    );
    const invoiceBalance = totalAmountXof - amountPaidXof;
    if (invoiceBalance < 0) accountOffsets += -invoiceBalance;
    const targetOutstanding = Math.max(0, invoiceBalance);
    positiveInvoiceOutstanding += targetOutstanding;

    // Negative credit memos do not carry collectible schedule lines.
    if (totalAmountXof <= 0) continue;

    const invoiceLines: MutableLine[] = [];
    for (const installment of invoice.installments ?? []) {
      const amountDueXof = xof(
        installment.amountDueXof,
        `installment ${installment.id} amountDueXof`,
      );
      const installmentPaidXof = xof(
        installment.amountPaidXof,
        `installment ${installment.id} amountPaidXof`,
      );
      const date =
        installment.dueDate === null || installment.dueDate === undefined
          ? null
          : toDakarDateKey(installment.dueDate);
      const due = dueState(date, asOfEpoch);
      const outstandingXof = Math.max(0, amountDueXof - installmentPaidXof);
      const line: MutableLine = {
        invoiceId: invoice.id,
        installmentId: installment.id,
        sequence: installment.sequence ?? null,
        dueDate: date,
        amountDueXof,
        amountPaidXof: installmentPaidXof,
        creditAppliedXof: 0,
        outstandingXof,
        paymentProgress:
          outstandingXof === 0
            ? "paid"
            : installmentPaidXof > 0
              ? "partial"
              : "unpaid",
        dueState: due.state,
        daysPastDue: due.daysPastDue,
        order: order++,
      };
      invoiceLines.push(line);
      lines.push(line);
    }

    const scheduledOutstanding = invoiceLines.reduce(
      (sum, line) => sum + line.outstandingXof,
      0,
    );
    if (scheduledOutstanding > targetOutstanding) {
      // Invoice payment and allocation can briefly drift; honor the invoice roll-up and
      // apply the difference using the same oldest-due-first rule as settlement.
      applyOffset(invoiceLines, scheduledOutstanding - targetOutstanding);
    } else if (scheduledOutstanding < targetOutstanding) {
      const amount = targetOutstanding - scheduledOutstanding;
      lines.push({
        invoiceId: invoice.id,
        installmentId: null,
        sequence: null,
        dueDate: null,
        amountDueXof: amount,
        amountPaidXof: 0,
        creditAppliedXof: 0,
        outstandingXof: amount,
        paymentProgress: "unpaid",
        dueState: "unscheduled",
        daysPastDue: 0,
        order: order++,
      });
    }
  }

  // Negative invoices and overpaid invoices are account-level credits. They cannot offset
  // another student's debt, and within this account they cover the oldest obligations first.
  applyOffset(lines, accountOffsets);
  lines.forEach(refreshProgress);

  const balanceXof = positiveInvoiceOutstanding - accountOffsets;
  const outstandingXof = Math.max(0, balanceXof);
  const creditXof = Math.max(0, -balanceXof);
  const overdue = lines.filter(
    (line) => line.outstandingXof > 0 && line.dueState === "overdue",
  );
  const notYetDue = lines.filter(
    (line) =>
      line.outstandingXof > 0 &&
      (line.dueState === "due_today" || line.dueState === "not_yet_due"),
  );
  const unscheduled = lines.filter(
    (line) => line.outstandingXof > 0 && line.dueState === "unscheduled",
  );
  const overdueXof = overdue.reduce(
    (sum, line) => sum + line.outstandingXof,
    0,
  );
  const notYetDueXof = notYetDue.reduce(
    (sum, line) => sum + line.outstandingXof,
    0,
  );
  const dueTodayXof = notYetDue
    .filter((line) => line.dueState === "due_today")
    .reduce((sum, line) => sum + line.outstandingXof, 0);
  const futureScheduledXof = notYetDueXof - dueTodayXof;
  const unscheduledXof = unscheduled.reduce(
    (sum, line) => sum + line.outstandingXof,
    0,
  );

  // The input is integer XOF, so any failure to reconcile is a programming error rather
  // than floating-point noise. Keep this invariant close to its source of truth.
  if (overdueXof + notYetDueXof + unscheduledXof !== outstandingXof) {
    throw new Error(
      "Account position did not reconcile to its outstanding balance",
    );
  }

  const futureDates = notYetDue
    .map((line) => line.dueDate)
    .filter((value): value is string => value !== null)
    .sort();
  const overdueDates = overdue
    .map((line) => line.dueDate)
    .filter((value): value is string => value !== null)
    .sort();
  const oldestOverdueDate = overdueDates[0] ?? null;
  const daysPastDue = oldestOverdueDate
    ? Math.round(
        (asOfEpoch - dateOnlyEpoch(oldestOverdueDate, "oldestOverdueDate")) /
          DAY_MS,
      )
    : 0;

  const standing: AccountStanding =
    invoices.length === 0
      ? "no_billing"
      : balanceXof < 0
        ? "credit"
        : balanceXof === 0
          ? "cleared"
          : overdueXof > 0
            ? "overdue"
            : unscheduledXof > 0
              ? "unscheduled"
              : "on_time";

  return {
    summary: {
      balanceXof,
      outstandingXof,
      creditXof,
      overdueXof,
      notYetDueXof,
      dueTodayXof,
      futureScheduledXof,
      unscheduledXof,
      nextDueDate: futureDates[0] ?? null,
      oldestOverdueDate,
      daysPastDue,
      standing,
    },
    installments: lines
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...line }) => line),
  };
}

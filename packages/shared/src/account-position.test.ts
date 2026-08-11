import { describe, expect, it } from "vitest";
import {
  deriveAccountPosition,
  toDakarDateKey,
  type AccountPositionInvoiceInput,
} from "./account-position.js";

const AS_OF = "2026-08-10";

function invoice(
  patch: Partial<AccountPositionInvoiceInput> = {},
): AccountPositionInvoiceInput {
  return {
    id: "inv-1",
    status: "open",
    totalAmountXof: 300,
    amountPaidXof: 0,
    installments: [
      {
        id: "inst-1",
        sequence: 1,
        dueDate: "2026-08-15",
        amountDueXof: 300,
        amountPaidXof: 0,
      },
    ],
    ...patch,
  };
}

function position(
  invoices: readonly AccountPositionInvoiceInput[],
  asOfDate = AS_OF,
) {
  return deriveAccountPosition({ invoices, asOfDate });
}

describe("deriveAccountPosition account standing", () => {
  it("distinguishes no billing from a cleared account and excludes void invoices", () => {
    expect(position([]).summary.standing).toBe("no_billing");
    expect(
      position([invoice({ totalAmountXof: 0, installments: [] })]).summary
        .standing,
    ).toBe("cleared");
    expect(position([invoice({ status: "void" })]).summary).toMatchObject({
      standing: "no_billing",
      balanceXof: 0,
    });
  });

  it("distinguishes a remaining credit from a fully cleared billed account", () => {
    const cleared = position([
      invoice({ totalAmountXof: 300, amountPaidXof: 300 }),
    ]);
    expect(cleared.summary).toMatchObject({
      standing: "cleared",
      balanceXof: 0,
      outstandingXof: 0,
      creditXof: 0,
    });

    const credit = position([
      invoice({ totalAmountXof: 300, amountPaidXof: 400 }),
    ]);
    expect(credit.summary).toMatchObject({
      standing: "credit",
      balanceXof: -100,
      outstandingXof: 0,
      creditXof: 100,
    });
  });

  it("marks a future positive balance on time instead of overdue", () => {
    expect(position([invoice()]).summary).toMatchObject({
      standing: "on_time",
      balanceXof: 300,
      outstandingXof: 300,
      overdueXof: 0,
      notYetDueXof: 300,
      dueTodayXof: 0,
      futureScheduledXof: 300,
      nextDueDate: "2026-08-15",
    });
  });

  it("keeps the inclusive due date current and exposes its amber subset", () => {
    const result = position([
      invoice({
        installments: [
          {
            id: "today",
            sequence: 1,
            dueDate: AS_OF,
            amountDueXof: 300,
            amountPaidXof: 0,
          },
        ],
      }),
    ]);
    expect(result.summary).toMatchObject({
      standing: "on_time",
      overdueXof: 0,
      notYetDueXof: 300,
      dueTodayXof: 300,
      futureScheduledXof: 0,
      daysPastDue: 0,
    });
    expect(result.installments[0]).toMatchObject({
      dueState: "due_today",
      paymentProgress: "unpaid",
    });
  });

  it("becomes overdue on the following Dakar calendar day", () => {
    const result = position([
      invoice({
        amountPaidXof: 100,
        installments: [
          {
            id: "late",
            sequence: 1,
            dueDate: "2026-08-09",
            amountDueXof: 300,
            amountPaidXof: 100,
          },
        ],
      }),
    ]);
    expect(result.summary).toMatchObject({
      standing: "overdue",
      balanceXof: 200,
      overdueXof: 200,
      oldestOverdueDate: "2026-08-09",
      daysPastDue: 1,
    });
    expect(result.installments[0]).toMatchObject({
      outstandingXof: 200,
      paymentProgress: "partial",
      dueState: "overdue",
      daysPastDue: 1,
    });
  });

  it("calls a positive invoice without a complete schedule unscheduled", () => {
    const result = position([invoice({ installments: [] })]);
    expect(result.summary).toMatchObject({
      standing: "unscheduled",
      unscheduledXof: 300,
      overdueXof: 0,
      notYetDueXof: 0,
    });
    expect(result.installments[0]).toMatchObject({
      installmentId: null,
      dueDate: null,
      dueState: "unscheduled",
      outstandingXof: 300,
    });
  });
});

describe("deriveAccountPosition reconciliation", () => {
  it("applies account credits oldest-due-first before deciding standing", () => {
    const result = position([
      invoice({
        id: "tuition",
        totalAmountXof: 300,
        installments: [
          {
            id: "old",
            sequence: 1,
            dueDate: "2026-08-01",
            amountDueXof: 100,
            amountPaidXof: 0,
          },
          {
            id: "future",
            sequence: 2,
            dueDate: "2026-09-01",
            amountDueXof: 200,
            amountPaidXof: 0,
          },
        ],
      }),
      invoice({
        id: "scholarship",
        status: "paid",
        totalAmountXof: -150,
        amountPaidXof: 0,
        installments: [],
      }),
    ]);

    expect(result.summary).toMatchObject({
      standing: "on_time",
      balanceXof: 150,
      outstandingXof: 150,
      overdueXof: 0,
      notYetDueXof: 150,
    });
    expect(result.installments[0]).toMatchObject({
      installmentId: "old",
      creditAppliedXof: 100,
      outstandingXof: 0,
      paymentProgress: "paid",
    });
    expect(result.installments[1]).toMatchObject({
      installmentId: "future",
      creditAppliedXof: 50,
      outstandingXof: 150,
      paymentProgress: "partial",
    });
  });

  it("leaves only the uncovered portion red when a credit is insufficient", () => {
    const result = position([
      invoice({
        id: "charge",
        totalAmountXof: 100,
        installments: [
          {
            id: "late",
            dueDate: "2026-08-01",
            amountDueXof: 100,
            amountPaidXof: 0,
          },
        ],
      }),
      invoice({
        id: "discount",
        status: "paid",
        totalAmountXof: -40,
        amountPaidXof: 0,
        installments: [],
      }),
    ]);
    expect(result.summary).toMatchObject({
      standing: "overdue",
      outstandingXof: 60,
      overdueXof: 60,
    });
  });

  it("reconciles unallocated invoice payment against the oldest schedule line", () => {
    const result = position([
      invoice({
        totalAmountXof: 300,
        amountPaidXof: 100,
        installments: [
          {
            id: "old",
            dueDate: "2026-08-01",
            amountDueXof: 100,
            amountPaidXof: 0,
          },
          {
            id: "future",
            dueDate: "2026-09-01",
            amountDueXof: 200,
            amountPaidXof: 0,
          },
        ],
      }),
    ]);
    expect(result.summary).toMatchObject({
      standing: "on_time",
      balanceXof: 200,
      outstandingXof: 200,
      overdueXof: 0,
    });
    expect(result.installments[0]).toMatchObject({
      creditAppliedXof: 100,
      outstandingXof: 0,
    });
  });

  it("surfaces invoice balance missing from its schedule as unscheduled", () => {
    const result = position([
      invoice({
        totalAmountXof: 300,
        installments: [
          {
            id: "planned",
            dueDate: "2026-09-01",
            amountDueXof: 200,
            amountPaidXof: 0,
          },
        ],
      }),
    ]);
    expect(result.summary).toMatchObject({
      standing: "unscheduled",
      outstandingXof: 300,
      notYetDueXof: 200,
      unscheduledXof: 100,
    });
  });

  it("reconciles every mixed account to integer XOF exactly", () => {
    const result = position([
      invoice({
        id: "mixed",
        totalAmountXof: 400,
        installments: [
          {
            id: "late",
            dueDate: "2026-07-01",
            amountDueXof: 100,
            amountPaidXof: 20,
          },
          {
            id: "today",
            dueDate: AS_OF,
            amountDueXof: 100,
            amountPaidXof: 0,
          },
          {
            id: "future",
            dueDate: "2026-10-01",
            amountDueXof: 100,
            amountPaidXof: 0,
          },
        ],
      }),
    ]);
    const s = result.summary;
    expect(s.overdueXof + s.notYetDueXof + s.unscheduledXof).toBe(
      s.outstandingXof,
    );
    expect(s.dueTodayXof).toBeLessThanOrEqual(s.notYetDueXof);
    expect(s.futureScheduledXof).toBe(s.notYetDueXof - s.dueTodayXof);
  });
});

describe("Dakar business dates", () => {
  it("converts instants to a stable Dakar calendar key", () => {
    expect(toDakarDateKey(new Date("2026-08-10T23:59:59Z"))).toBe("2026-08-10");
    expect(toDakarDateKey("2026-08-10")).toBe("2026-08-10");
  });

  it("rejects impossible dates and non-integer XOF", () => {
    expect(() => position([], "2026-02-30")).toThrow(/valid calendar date/);
    expect(() => position([invoice({ totalAmountXof: 100.5 })])).toThrow(
      /integer XOF/,
    );
  });
});

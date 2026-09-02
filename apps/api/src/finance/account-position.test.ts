import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveApiAccountPosition,
  payableLinesOldestFirst,
  projectedInstallmentStatus,
  selectOldestPayableTarget,
} from "./account-position.js";

describe("API account-position adapter", () => {
  afterEach(() => vi.useRealTimers());

  it("applies credits oldest-first and keeps unscheduled charges separate", () => {
    const result = deriveApiAccountPosition(
      [
        {
          id: "tuition",
          status: "partial",
          totalAmount: 1_000,
          amountPaid: 200,
          plan: {
            installments: [
              {
                id: "past",
                sequence: 1,
                dueDate: "2026-08-01",
                amountDue: 500,
                amountPaid: 200,
              },
              {
                id: "future",
                sequence: 2,
                dueDate: "2026-09-01",
                amountDue: 500,
                amountPaid: 0,
              },
            ],
          },
        },
        {
          id: "credit",
          status: "open",
          totalAmount: -100,
          amountPaid: 0,
          plan: null,
        },
        {
          id: "no-plan",
          status: "open",
          totalAmount: 200,
          amountPaid: 0,
          plan: null,
        },
        {
          id: "void",
          status: "void",
          totalAmount: 9_999,
          amountPaid: 0,
          plan: null,
        },
      ],
      new Date("2026-08-10T12:00:00Z"),
    );

    expect(result.summary).toMatchObject({
      balanceXof: 900,
      outstandingXof: 900,
      creditXof: 0,
      overdueXof: 200,
      notYetDueXof: 500,
      dueTodayXof: 0,
      unscheduledXof: 200,
      standing: "overdue",
    });
    expect(
      result.installments.find((line) => line.installmentId === "past"),
    ).toMatchObject({
      creditAppliedXof: 100,
      outstandingXof: 200,
      paymentProgress: "partial",
      dueState: "overdue",
      daysPastDue: 9,
    });
    expect(result.installments).toContainEqual(
      expect.objectContaining({
        invoiceId: "no-plan",
        installmentId: null,
        outstandingXof: 200,
        dueState: "unscheduled",
      }),
    );
    expect(
      result.summary.overdueXof +
        result.summary.notYetDueXof +
        result.summary.unscheduledXof,
    ).toBe(result.summary.outstandingXof);
  });

  it("does not age a due-today installment until the next Dakar day", () => {
    const now = new Date("2026-08-10T22:30:00Z");
    expect(
      projectedInstallmentStatus(
        {
          dueDate: "2026-08-10",
          amountDue: 100,
          amountPaid: 40,
        },
        now,
      ),
    ).toBe("partial");
    expect(
      projectedInstallmentStatus(
        {
          dueDate: "2026-08-09",
          amountDue: 100,
          amountPaid: 40,
        },
        now,
      ),
    ).toBe("overdue");
  });

  it("marks a zero-value installment paid when no position line is emitted", () => {
    expect(
      projectedInstallmentStatus({
        dueDate: "2026-09-05",
        amountDue: 0,
        amountPaid: 0,
      }),
    ).toBe("paid");
  });

  it("ignores stale stored installment status in favor of the Dakar due date", () => {
    const records = [
      {
        id: "invoice",
        status: "open",
        totalAmount: 200,
        amountPaid: 0,
        plan: {
          installments: [
            {
              id: "future-but-stale",
              sequence: 1,
              dueDate: "2026-09-01",
              amountDue: 100,
              amountPaid: 0,
              status: "overdue",
            },
            {
              id: "past-but-stale",
              sequence: 2,
              dueDate: "2026-08-09",
              amountDue: 100,
              amountPaid: 0,
              status: "pending",
            },
          ],
        },
      },
    ];

    const result = deriveApiAccountPosition(
      records,
      new Date("2026-08-10T12:00:00Z"),
    );

    expect(
      result.installments.find(
        (line) => line.installmentId === "future-but-stale",
      ),
    ).toMatchObject({ dueState: "not_yet_due", daysPastDue: 0 });
    expect(
      result.installments.find(
        (line) => line.installmentId === "past-but-stale",
      ),
    ).toMatchObject({ dueState: "overdue", daysPastDue: 1 });
  });

  it("selects exact global oldest-due order without leapfrogging another invoice", () => {
    const invoiceA = {
      id: "invoice-a",
      createdAt: "2026-01-01T00:00:00Z",
      status: "open",
      totalAmount: 200,
      amountPaid: 0,
      plan: {
        installments: [
          {
            id: "a-dec",
            sequence: 2,
            dueDate: "2026-12-01",
            amountDue: 100,
            amountPaid: 0,
          },
          {
            id: "a-aug",
            sequence: 1,
            dueDate: "2026-08-01",
            amountDue: 100,
            amountPaid: 0,
          },
        ],
      },
    };
    const invoiceB = {
      id: "invoice-b",
      createdAt: "2026-01-02T00:00:00Z",
      status: "open",
      totalAmount: 100,
      amountPaid: 0,
      plan: {
        installments: [
          {
            id: "b-sep",
            sequence: 1,
            dueDate: "2026-09-01",
            amountDue: 100,
            amountPaid: 0,
          },
        ],
      },
    };
    const invoices = [invoiceA, invoiceB];
    const position = deriveApiAccountPosition(
      invoices,
      new Date("2026-07-01T00:00:00Z"),
    );

    expect(
      payableLinesOldestFirst(invoices, position).map(
        (line) => line.installmentId,
      ),
    ).toEqual(["a-aug", "b-sep", "a-dec"]);
    expect(selectOldestPayableTarget(invoices, position)).toMatchObject({
      invoiceId: "invoice-a",
      installmentId: "a-aug",
      outstandingXof: 100,
      invoicePayableXof: 100,
    });
  });

  it("assigns equal-date credits identically regardless of query order", () => {
    const charge = (id: string, installmentId: string, createdAt: string) => ({
      id,
      createdAt,
      status: "open",
      totalAmount: 100,
      amountPaid: 0,
      plan: {
        installments: [
          {
            id: installmentId,
            sequence: 1,
            dueDate: "2026-08-01",
            amountDue: 100,
            amountPaid: 0,
          },
        ],
      },
    });
    const first = charge("first", "first-line", "2026-01-01T00:00:00Z");
    const second = charge("second", "second-line", "2026-01-02T00:00:00Z");
    const credit = {
      id: "credit",
      createdAt: "2026-01-03T00:00:00Z",
      status: "paid",
      totalAmount: -75,
      amountPaid: 0,
      plan: null,
    };
    const asOf = new Date("2026-08-10T00:00:00Z");
    const normal = deriveApiAccountPosition([first, second, credit], asOf);
    const reversed = deriveApiAccountPosition([credit, second, first], asOf);
    const allocations = (position: typeof normal) =>
      Object.fromEntries(
        position.installments.map((line) => [
          line.installmentId,
          line.creditAppliedXof,
        ]),
      );

    expect(reversed.summary).toEqual(normal.summary);
    expect(allocations(reversed)).toEqual(allocations(normal));
    expect(allocations(normal)).toMatchObject({
      "first-line": 75,
      "second-line": 0,
    });
  });
});

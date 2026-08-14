import { describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service.js";
import { deriveApiAccountPosition } from "./account-position.js";

function settlementFixture(options?: { retryOnce?: boolean }) {
  const term = { id: "term", name: "Fall 2026" };
  const aAug = {
    id: "a-aug",
    sequence: 1,
    dueDate: new Date("2026-08-01T00:00:00Z"),
    amountDue: 100,
    amountPaid: 50,
    status: "partial",
  };
  const aDec = {
    id: "a-dec",
    sequence: 2,
    dueDate: new Date("2026-12-01T00:00:00Z"),
    amountDue: 100,
    amountPaid: 0,
    status: "pending",
  };
  const bSep = {
    id: "b-sep",
    sequence: 1,
    dueDate: new Date("2026-09-01T00:00:00Z"),
    amountDue: 100,
    amountPaid: 0,
    status: "pending",
  };
  const invoiceA = {
    id: "invoice-a",
    studentId: "student",
    termId: term.id,
    term,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    totalAmount: 200,
    amountPaid: 50,
    status: "partial",
    costCenterCode: "9100",
    plan: { installments: [aAug, aDec] },
  };
  const invoiceB = {
    id: "invoice-b",
    studentId: "student",
    termId: term.id,
    term,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    totalAmount: 100,
    amountPaid: 0,
    status: "open",
    costCenterCode: "9100",
    plan: { installments: [bSep] },
  };
  const invoices: any[] = [invoiceA, invoiceB];
  const allocations: any[] = [];
  const audits: any[] = [];
  const payment: any = {
    id: "payment",
    invoiceId: invoiceA.id,
    studentId: "student",
    amount: 100,
    method: "card",
    status: "pending",
    providerRef: "GW-100",
    student: {
      person: {
        email: "student@daust.edu",
        firstName: "Awa",
        lastName: "Ndiaye",
      },
    },
  };

  let refundRacePaidXof: number | null = null;
  let refundRaceInjected = false;

  const invoice = {
    findMany: vi.fn(async () => invoices),
    findUnique: vi.fn(async ({ where }: any) =>
      where.number
        ? (invoices.find((item) => item.number === where.number) ?? null)
        : (invoices.find((item) => item.id === where.id) ?? null),
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const found = invoices.find((item) => item.id === where.id);
      if (!found) throw new Error("missing invoice");
      return found;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const found = invoices.find((item) => item.id === where.id)!;
      Object.assign(found, data);
      return found;
    }),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: `credit-${invoices.length}`,
        createdAt: new Date("2026-08-10T00:00:00Z"),
        term,
        plan: null,
        ...data,
      };
      invoices.push(created);
      return created;
    }),
  };
  const paymentDelegate = {
    findUnique: vi.fn(async () => {
      const currentInvoice = invoices.find(
        (item) => item.id === payment.invoiceId,
      )!;
      if (
        refundRacePaidXof !== null &&
        !refundRaceInjected &&
        payment.status === "success"
      ) {
        // The refund endpoint reads this snapshot before entering its transaction.
        // Simulate another payment settling immediately after that read.
        const staleInvoice = { ...currentInvoice };
        const added = refundRacePaidXof - currentInvoice.amountPaid;
        currentInvoice.amountPaid = refundRacePaidXof;
        aAug.amountPaid += added;
        refundRaceInjected = true;
        return {
          ...payment,
          invoice: staleInvoice,
          allocations: [...allocations],
        };
      }
      return {
        ...payment,
        invoice: currentInvoice,
        allocations: [...allocations],
      };
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (where.status && payment.status !== where.status) return { count: 0 };
      Object.assign(payment, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: any) => {
      Object.assign(payment, data);
      return payment;
    }),
  };
  const installmentById = new Map(
    [aAug, aDec, bSep].map((item) => [item.id, item] as const),
  );
  const tx: any = {
    invoice,
    payment: paymentDelegate,
    installment: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) =>
        installmentById.get(where.id),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const item = installmentById.get(where.id)!;
        Object.assign(item, data);
        return item;
      }),
    },
    paymentAllocation: {
      create: vi.fn(async ({ data }: any) => {
        allocations.push({ id: `allocation-${allocations.length}`, ...data });
        return allocations.at(-1);
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        audits.push(data);
        return data;
      }),
    },
    piSpiRequest: { update: vi.fn() },
    paymentLink: { update: vi.fn() },
    paymentSubmission: { update: vi.fn() },
  };
  let transactionCalls = 0;
  const prisma: any = {
    ...tx,
    $transaction: vi.fn(async (work: any) => {
      transactionCalls += 1;
      if (options?.retryOnce && transactionCalls === 1) {
        throw Object.assign(new Error("serialization conflict"), {
          code: "P2034",
        });
      }
      return work(tx);
    }),
  };
  const mail = { send: vi.fn(async () => undefined) };
  const finance = new FinanceService(
    prisma,
    mail as never,
    {} as never,
    new Map() as never,
  );
  const settle = (finance as any).settlePayment.bind(finance) as (
    paymentId: string,
    options: { via: "ipn" },
  ) => Promise<void>;
  return {
    finance,
    settle,
    prisma,
    payment,
    invoices,
    invoiceA,
    invoiceB,
    aAug,
    aDec,
    bSep,
    allocations,
    audits,
    injectRefundRace(invoicePaidXof: number) {
      refundRacePaidXof = invoicePaidXof;
    },
  };
}

describe("settlement release safety", () => {
  it("posts stale landed cash as canonical direct cash plus a reversible credit memo", async () => {
    const state = settlementFixture();

    await state.settle("payment", { via: "ipn" });

    expect(state.payment.status).toBe("success");
    expect(state.aAug.amountPaid).toBe(100);
    expect(state.aDec.amountPaid).toBe(0);
    expect(state.bSep.amountPaid).toBe(0);
    expect(state.invoiceA.amountPaid).toBe(100);
    expect(state.allocations).toEqual([
      expect.objectContaining({ installmentId: "a-aug", amount: 50 }),
    ]);
    const creditMemo = state.invoices.find(
      (invoice) => invoice.number === "CR-PAY-payment",
    );
    expect(creditMemo).toMatchObject({ totalAmount: -50, status: "paid" });

    const after = deriveApiAccountPosition(
      state.invoices,
      new Date("2026-08-10T00:00:00Z"),
    );
    expect(
      after.installments.find((line) => line.installmentId === "b-sep"),
    ).toMatchObject({ creditAppliedXof: 50, outstandingXof: 50 });
    expect(
      after.installments.find((line) => line.installmentId === "a-dec"),
    ).toMatchObject({ creditAppliedXof: 0, outstandingXof: 100 });
    expect(state.audits[0]?.data).toMatchObject({
      directAppliedXof: 50,
      creditMemoXof: 50,
      unappliedCreditXof: 50,
    });

    await state.finance.refundPayment("payment", "duplicate", "bursar");
    expect(state.payment.status).toBe("refunded");
    expect(state.aAug.amountPaid).toBe(50);
    expect(state.invoiceA.amountPaid).toBe(50);
    expect(creditMemo.status).toBe("void");
  });

  it("retries a serializable settlement conflict", async () => {
    const state = settlementFixture({ retryOnce: true });

    await state.settle("payment", { via: "ipn" });

    expect(state.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(state.payment.status).toBe("success");
  });

  it("subtracts a refund from the current transactional invoice total", async () => {
    const state = settlementFixture();
    await state.settle("payment", { via: "ipn" });

    // Settlement applied 50 XOF directly. A second payment then raises the invoice
    // and installment cash totals from 100 to 130 while this refund is starting.
    state.injectRefundRace(130);
    await state.finance.refundPayment("payment", "payer request", "bursar");

    expect(state.payment.status).toBe("refunded");
    expect(state.invoiceA.amountPaid).toBe(80);
    expect(state.aAug.amountPaid).toBe(80);
  });
});

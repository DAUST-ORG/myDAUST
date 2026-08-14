import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service.js";

const TERM = { id: "term", name: "Fall 2026" };

interface TestInstallment {
  id: string;
  sequence: number;
  dueDate: Date;
  amountDue: number;
  amountPaid: number;
  status: string;
}

function invoice(input: {
  id: string;
  studentId: string;
  totalAmount: number;
  installments?: TestInstallment[];
  status?: string;
}) {
  return {
    id: input.id,
    studentId: input.studentId,
    status: input.status ?? "open",
    totalAmount: input.totalAmount,
    amountPaid: 0,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    description: "Test charge",
    number: `INV-${input.id}`,
    term: TERM,
    plan: input.installments ? { installments: input.installments } : null,
  };
}

function installment(id: string, dueDate: string, amountDue = 100) {
  return {
    id,
    sequence: Number(id.replace(/\D/g, "")) || 1,
    dueDate: new Date(`${dueDate}T00:00:00Z`),
    amountDue,
    amountPaid: 0,
    // Deliberately stale: the report must derive state from the date and money.
    status: "pending",
  };
}

function student(input: {
  id: string;
  invoices?: ReturnType<typeof invoice>[];
  recordStatus?: string;
  held?: boolean;
}) {
  return {
    id: input.id,
    studentNo: `DAUST-${input.id}`,
    recordStatus: input.recordStatus ?? "active",
    photoUrl: null,
    person: {
      firstName: "Student",
      lastName: input.id,
      email: `${input.id}@test.local`,
    },
    program: null,
    holds: input.held ? [{ id: `hold-${input.id}` }] : [],
    invoices: input.invoices ?? [],
  };
}

function service(students: ReturnType<typeof student>[]) {
  const prisma = {
    student: { findMany: vi.fn().mockResolvedValue(students) },
    approvalRequest: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return new FinanceService(
    prisma as never,
    { send: vi.fn() } as never,
    {} as never,
    new Map() as never,
  );
}

describe("canonical accounts-receivable aging", () => {
  afterEach(() => vi.useRealTimers());

  it("places exact 1/30/31/60/61/90/91-day boundaries in the right buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
    const lines = [
      installment("day-1", "2026-08-09"),
      installment("day-30", "2026-07-11"),
      installment("day-31", "2026-07-10"),
      installment("day-60", "2026-06-11"),
      installment("day-61", "2026-06-10"),
      installment("day-90", "2026-05-12"),
      installment("day-91", "2026-05-11"),
    ];
    const debt = invoice({
      id: "boundaries",
      studentId: "boundaries",
      totalAmount: 700,
      installments: lines,
    });

    const result = await service([
      student({ id: "boundaries", invoices: [debt] }),
    ]).arAging();
    const buckets = new Map(
      result.buckets.map((bucket) => [bucket.key, bucket]),
    );

    expect(buckets.get("1-30")).toMatchObject({ amount: 200, count: 2 });
    expect(buckets.get("31-60")).toMatchObject({ amount: 200, count: 2 });
    expect(buckets.get("61-90")).toMatchObject({ amount: 200, count: 2 });
    expect(buckets.get("90+")).toMatchObject({ amount: 100, count: 1 });
    expect(
      result.rows.map((row) => row.daysOverdue).sort((a, b) => a - b),
    ).toEqual([1, 30, 31, 60, 61, 90, 91]);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.amount, 0)).toBe(
      result.totalOutstanding,
    );
    expect(
      result.summary.overdueXof +
        result.summary.notYetDueXof +
        result.summary.unscheduledXof,
    ).toBe(result.summary.outstandingXof);
  });

  it("includes active never-billed accounts and archived debt, but excludes settled archives", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
    const archivedDebt = invoice({
      id: "archive-debt",
      studentId: "archive-debt",
      totalAmount: 100,
      installments: [installment("archive-line", "2026-08-09")],
    });
    const finance = service([
      student({ id: "active-never-billed" }),
      student({
        id: "archive-debt",
        recordStatus: "archived",
        invoices: [archivedDebt],
      }),
      student({ id: "archive-cleared", recordStatus: "archived" }),
    ]);

    const [aging, rows] = await Promise.all([
      finance.arAging(),
      finance.listStudentAccounts(),
    ]);

    expect(aging.accountCount).toBe(2);
    expect(aging.accountCounts.noBilling).toBe(1);
    expect(aging.accountCounts.overdue).toBe(1);
    expect(rows.map((row) => row.id).sort()).toEqual([
      "active-never-billed",
      "archive-debt",
    ]);
  });

  it("does not net one student's credit against another student's overdue debt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
    const debtorInvoice = invoice({
      id: "debt",
      studentId: "debtor",
      totalAmount: 100,
      installments: [installment("debt-line", "2026-08-09")],
    });
    const creditInvoice = invoice({
      id: "credit",
      studentId: "creditor",
      totalAmount: -100,
      status: "open",
    });

    const result = await service([
      student({ id: "debtor", invoices: [debtorInvoice] }),
      student({ id: "creditor", invoices: [creditInvoice] }),
    ]).arAging();

    expect(result.summary).toMatchObject({
      balanceXof: 0,
      outstandingXof: 100,
      creditXof: 100,
      overdueXof: 100,
    });
    expect(result.accountCounts).toMatchObject({ overdue: 1, credit: 1 });
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.amount, 0)).toBe(
      100,
    );
  });
});

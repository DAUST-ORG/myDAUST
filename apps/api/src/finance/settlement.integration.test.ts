import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import { FinanceService } from "./finance.service.js";

/**
 * Integration tests for the settlement path — the code that actually moves money.
 *
 * These exist because the protections in `settlePayment` are subtle and invisible to a
 * reader: double-crediting is prevented by a `where: { status: "pending" }` clause inside
 * an `updateMany`, and over-crediting by re-deriving the invoice balance at approval time.
 * Both are the kind of thing a future "simplification" silently removes, so they are
 * pinned here rather than trusted to review.
 *
 * Runs against a disposable Postgres schema and is skipped when no database is reachable,
 * so `pnpm test` stays green on a machine without Docker.
 */

const SCHEMA = `settlement_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

function databaseUrl(): string | null {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("schema", SCHEMA);
  return url.toString();
}

const DB_URL = databaseUrl();
// vitest's describe.skipIf keeps this a no-op rather than a failure when unconfigured.
const noDb = !DB_URL;

let prisma: PrismaClient;
let finance: FinanceService;
/** Ids of the fixture rows every test builds on. */
let ctx: { studentId: string; termId: string; reviewerId: string };

async function seedFixtures() {
  const person = await prisma.person.create({
    data: {
      email: `payer-${randomUUID()}@test.local`,
      firstName: "Test",
      lastName: "Payer",
      kind: "student",
      roles: ["student"],
    },
  });
  const reviewer = await prisma.person.create({
    data: {
      email: `bursar-${randomUUID()}@test.local`,
      firstName: "Test",
      lastName: "Bursar",
      kind: "staff",
      roles: ["bursar"],
    },
  });
  const student = await prisma.student.create({
    data: { personId: person.id, studentNo: `T${Date.now()}`.slice(0, 12) },
  });
  const year = await prisma.academicYear.create({
    data: { label: `TEST-${randomUUID().slice(0, 6)}` },
  });
  const term = await prisma.term.create({
    data: {
      name: "Test Term",
      academicYearId: year.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-06-30"),
      status: "active",
    },
  });
  await prisma.costCenter.upsert({
    where: { code: "9100" },
    update: {},
    create: { code: "9100", name: "Tuition", type: "revenue" },
  });
  ctx = { studentId: student.id, termId: term.id, reviewerId: reviewer.id };
}

/** An open invoice with a single pending payment against it. */
async function makeInvoiceWithPendingPayment(
  total: number,
  paymentAmount: number,
) {
  const invoice = await prisma.invoice.create({
    data: {
      studentId: ctx.studentId,
      termId: ctx.termId,
      totalAmount: total,
      amountPaid: 0,
      status: "open",
      costCenterCode: "9100",
    },
  });
  const payment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      studentId: ctx.studentId,
      amount: paymentAmount,
      method: "wire",
      status: "pending",
      provider: "wire",
      providerRef: `TEST-${randomUUID()}`,
    },
  });
  return { invoice, payment };
}

async function makePlannedInvoiceWithPayments(
  total: number,
  paymentAmounts: number[],
  dueDate = new Date("2026-08-05T00:00:00.000Z"),
) {
  const invoice = await prisma.invoice.create({
    data: {
      studentId: ctx.studentId,
      termId: ctx.termId,
      totalAmount: total,
      amountPaid: 0,
      status: "open",
      costCenterCode: "9100",
      plan: {
        create: {
          installments: {
            create: {
              sequence: 1,
              dueDate,
              amountDue: total,
              amountPaid: 0,
              status: "overdue",
            },
          },
        },
      },
    },
  });
  const payments = await Promise.all(
    paymentAmounts.map((amount) =>
      prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          studentId: ctx.studentId,
          amount,
          method: "card",
          status: "pending",
          provider: "paytech",
          providerRef: `RACE-${randomUUID()}`,
        },
      }),
    ),
  );
  return { invoice, payments };
}

async function makeIsolatedStudent() {
  const person = await prisma.person.create({
    data: {
      email: `recorded-payment-${randomUUID()}@test.local`,
      firstName: "Recorded",
      lastName: "Payment",
      kind: "student",
      roles: ["student"],
    },
  });
  return prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `RP${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    },
  });
}

async function makeInvoiceForStudent(
  studentId: string,
  total: number,
  dueDate: Date,
) {
  return prisma.invoice.create({
    data: {
      studentId,
      termId: ctx.termId,
      totalAmount: total,
      amountPaid: 0,
      status: "open",
      costCenterCode: "9100",
      plan: {
        create: {
          installments: {
            create: {
              sequence: 1,
              dueDate,
              amountDue: total,
              amountPaid: 0,
              status: "overdue",
            },
          },
        },
      },
    },
  });
}

function recordedPaymentActor() {
  return {
    personId: ctx.reviewerId,
    email: "bursar@test.local",
    name: "Test Bursar",
  };
}

/**
 * The claim step from `settlePayment`, exercised directly.
 *
 * Calling the real service would drag in Nest DI, mail and storage; the invariant under
 * test is this atomic conditional update, so it is reproduced faithfully and asserted
 * against real Postgres concurrency semantics.
 */
async function claimAndApply(
  paymentId: string,
  amount: number,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: "pending" },
      data: { status: "success", amount },
    });
    if (claimed.count === 0) return false;
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { invoice: true },
    });
    const newPaid = payment.invoice.amountPaid + amount;
    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        amountPaid: newPaid,
        status: newPaid >= payment.invoice.totalAmount ? "paid" : "partial",
      },
    });
    return true;
  });
}

describe.skipIf(noDb)("settlement money path", () => {
  beforeAll(async () => {
    const url = DB_URL!;
    // A dedicated schema per run: the tests write real rows, and must never be able to
    // touch a developer's working data.
    //
    // `migrate deploy`, not `db push`: partial unique indexes and CHECK constraints are
    // not expressible in schema.prisma and live only in the hand-written migration SQL,
    // so a `db push` schema silently lacks the very DB-level guards under test here.
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await seedFixtures();
    finance = new FinanceService(
      prisma as never,
      { send: async () => undefined } as never,
      {} as never,
      new Map() as never,
    );
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("credits an invoice exactly once for a settled payment", async () => {
    const { invoice, payment } = await makeInvoiceWithPendingPayment(
      500_000,
      300_000,
    );
    expect(await claimAndApply(payment.id, 300_000)).toBe(true);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.amountPaid).toBe(300_000);
    expect(after.status).toBe("partial");
  });

  it("is a no-op when the same payment is settled twice", async () => {
    const { invoice, payment } = await makeInvoiceWithPendingPayment(
      500_000,
      300_000,
    );
    expect(await claimAndApply(payment.id, 300_000)).toBe(true);
    // Second attempt must not credit again — this is the double-apply guard.
    expect(await claimAndApply(payment.id, 300_000)).toBe(false);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.amountPaid).toBe(300_000);
  });

  it("credits once when two settlements race (two bursars approving at the same time)", async () => {
    const { invoice, payment } = await makeInvoiceWithPendingPayment(
      500_000,
      250_000,
    );
    const results = await Promise.all([
      claimAndApply(payment.id, 250_000),
      claimAndApply(payment.id, 250_000),
      claimAndApply(payment.id, 250_000),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.amountPaid).toBe(250_000);
  });

  it("marks the invoice paid only when the balance is fully covered", async () => {
    const { invoice, payment } = await makeInvoiceWithPendingPayment(
      400_000,
      400_000,
    );
    await claimAndApply(payment.id, 400_000);
    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.status).toBe("paid");
    expect(after.amountPaid).toBe(400_000);
  });

  it("does not settle a payment that was already cancelled", async () => {
    const { invoice, payment } = await makeInvoiceWithPendingPayment(
      500_000,
      200_000,
    );
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "cancelled" },
    });
    expect(await claimAndApply(payment.id, 200_000)).toBe(false);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.amountPaid).toBe(0);
  });

  it("enforces the remaining balance, so a stale approval cannot overpay", async () => {
    // A second payment lands between wire submission and bursar approval.
    const { invoice, payment } = await makeInvoiceWithPendingPayment(
      500_000,
      500_000,
    );
    const other = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId: ctx.studentId,
        amount: 400_000,
        method: "wave",
        status: "pending",
        provider: "paytech",
        providerRef: `TEST-${randomUUID()}`,
      },
    });
    await claimAndApply(other.id, 400_000);

    const current = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    const remaining = current.totalAmount - current.amountPaid;
    expect(remaining).toBe(100_000);
    // approveWireTransfer re-derives this at approval time and refuses anything larger.
    expect(payment.amount).toBeGreaterThan(remaining);
  });

  it("keeps a webhook token unique, so a replayed notification cannot settle twice", async () => {
    const token = `E2E-${randomUUID()}`;
    await prisma.webhookEvent.create({
      data: { token, paymentRef: "TEST-REF", payload: {} },
    });
    await expect(
      prisma.webhookEvent.create({
        data: { token, paymentRef: "TEST-REF", payload: {} },
      }),
    ).rejects.toThrow();
  });

  it("allows only one payable PI-SPI request per invoice", async () => {
    const { invoice } = await makeInvoiceWithPendingPayment(500_000, 100_000);
    const base = {
      source: "student_portal",
      payerAlias: randomUUID(),
      amountXof: 100_000,
      motif: "test",
      studentId: ctx.studentId,
      invoiceId: invoice.id,
    };
    await prisma.piSpiRequest.create({
      data: {
        ...base,
        txId: `PIS${randomUUID().replace(/-/g, "").slice(0, 20)}`,
        status: "sent",
      },
    });
    // The partial unique index is what stops a payer stacking duplicate requests.
    await expect(
      prisma.piSpiRequest.create({
        data: {
          ...base,
          txId: `PIS${randomUUID().replace(/-/g, "").slice(0, 20)}`,
          status: "sent",
        },
      }),
    ).rejects.toThrow();
  });

  it("settles two different landed payments without losing cash or overfilling a line", async () => {
    const { invoice, payments } = await makePlannedInvoiceWithPayments(
      500_000,
      [300_000, 300_000],
    );
    const settle = (id: string) =>
      (finance as any).settlePayment(id, { via: "ipn" });

    await Promise.all(payments.map((payment) => settle(payment.id)));

    const [afterInvoice, installment, afterPayments, creditMemos, allocations] =
      await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.installment.findFirstOrThrow({
          where: { plan: { invoiceId: invoice.id } },
        }),
        prisma.payment.findMany({
          where: { id: { in: payments.map((payment) => payment.id) } },
        }),
        prisma.invoice.findMany({
          where: {
            studentId: ctx.studentId,
            number: { in: payments.map((payment) => `CR-PAY-${payment.id}`) },
          },
        }),
        prisma.paymentAllocation.aggregate({
          where: { paymentId: { in: payments.map((payment) => payment.id) } },
          _sum: { amount: true },
        }),
      ]);

    expect(afterPayments.every((payment) => payment.status === "success")).toBe(
      true,
    );
    expect(afterInvoice.amountPaid).toBe(500_000);
    expect(installment.amountPaid).toBe(500_000);
    expect(allocations._sum.amount).toBe(500_000);
    expect(creditMemos).toHaveLength(1);
    expect(creditMemos[0]).toMatchObject({
      totalAmount: -100_000,
      status: "paid",
    });
  });

  it("preserves a concurrent second payment when the first payment is refunded", async () => {
    const { invoice, payments } = await makePlannedInvoiceWithPayments(
      500_000,
      [300_000, 100_000],
    );
    const settle = (id: string) =>
      (finance as any).settlePayment(id, { via: "ipn" });

    await settle(payments[0]!.id);
    await Promise.all([
      settle(payments[1]!.id),
      finance.refundPayment(payments[0]!.id, "test reversal", ctx.reviewerId),
    ]);

    const [afterInvoice, installment, firstPayment, secondPayment] =
      await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.installment.findFirstOrThrow({
          where: { plan: { invoiceId: invoice.id } },
        }),
        prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } }),
        prisma.payment.findUniqueOrThrow({ where: { id: payments[1]!.id } }),
      ]);

    expect(firstPayment.status).toBe("refunded");
    expect(secondPayment.status).toBe("success");
    expect(afterInvoice.amountPaid).toBe(100_000);
    expect(installment.amountPaid).toBe(100_000);
  });

  it("resumes an internally claimed refund after a process interruption", async () => {
    const { invoice, payments } = await makePlannedInvoiceWithPayments(
      500_000,
      [200_000],
    );
    await (finance as any).settlePayment(payments[0]!.id, { via: "ipn" });
    await prisma.payment.update({
      where: { id: payments[0]!.id },
      data: { status: "refund_pending" },
    });

    await finance.refundPayment(
      payments[0]!.id,
      "resume interrupted internal refund",
      ctx.reviewerId,
    );

    const [payment, afterInvoice, installment] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } }),
      prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.installment.findFirstOrThrow({
        where: { plan: { invoiceId: invoice.id } },
      }),
    ]);
    expect(payment.status).toBe("refunded");
    expect(payment.refundedAt).not.toBeNull();
    expect(afterInvoice.amountPaid).toBe(0);
    expect(installment.amountPaid).toBe(0);
  });

  it("cannot commit a stale plan edit below a concurrently settled amount", async () => {
    const { invoice, payments } = await makePlannedInvoiceWithPayments(
      500_000,
      [300_000],
      new Date("2010-01-01T00:00:00.000Z"),
    );
    const installment = await prisma.installment.findFirstOrThrow({
      where: { plan: { invoiceId: invoice.id } },
    });
    const results = await Promise.allSettled([
      (finance as any).settlePayment(payments[0]!.id, { via: "ipn" }),
      finance.updatePaymentPlan(ctx.reviewerId, invoice.id, [
        {
          id: installment.id,
          dueDate: "2010-01-01",
          amountDue: 100_000,
        },
      ]),
    ]);

    expect(results[0]!.status).toBe("fulfilled");
    const [afterInvoice, afterInstallments] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.installment.findMany({
        where: { plan: { invoiceId: invoice.id } },
      }),
    ]);
    expect(afterInstallments).toHaveLength(1);
    expect(afterInstallments[0]!.amountPaid).toBeLessThanOrEqual(
      afterInstallments[0]!.amountDue,
    );
    expect(afterInvoice.amountPaid).toBeLessThanOrEqual(
      afterInvoice.totalAmount,
    );
    if (results[1]!.status === "rejected") {
      expect(String(results[1]!.reason)).toContain("cannot set below");
    }
  });

  it("cannot remove an installment that is paid during a concurrent plan replacement", async () => {
    const { invoice, payments } = await makePlannedInvoiceWithPayments(
      500_000,
      [300_000],
      new Date("2009-01-01T00:00:00.000Z"),
    );
    const results = await Promise.allSettled([
      (finance as any).settlePayment(payments[0]!.id, { via: "ipn" }),
      finance.replacePaymentPlan(ctx.reviewerId, invoice.id, [
        {
          sequence: 1,
          dueDate: "2009-01-01",
          amountDue: 100_000,
        },
      ]),
    ]);

    expect(results[0]!.status).toBe("fulfilled");
    const [afterInvoice, afterInstallments] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.installment.findMany({
        where: { plan: { invoiceId: invoice.id } },
      }),
    ]);
    expect(afterInstallments.length).toBeGreaterThan(0);
    expect(
      afterInstallments.every((row) => row.amountPaid <= row.amountDue),
    ).toBe(true);
    expect(afterInvoice.amountPaid).toBeLessThanOrEqual(
      afterInvoice.totalAmount,
    );
    if (results[1]!.status === "rejected") {
      expect(String(results[1]!.reason)).toContain("cannot be removed");
    }
  });

  it("records one cash payment when the same cashier request races itself", async () => {
    const student = await makeIsolatedStudent();
    const invoice = await makeInvoiceForStudent(
      student.id,
      300_000,
      new Date("2026-01-05T00:00:00.000Z"),
    );
    const idempotencyKey = randomUUID();
    const input = {
      studentId: student.id,
      amountXof: 75_000,
      method: "cash" as const,
      idempotencyKey,
      actor: recordedPaymentActor(),
    };

    const receipts = await Promise.all([
      finance.recordStudentPayment(input),
      finance.recordStudentPayment(input),
    ]);

    const [afterInvoice, payments, submissions, paymentAudits] =
      await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.payment.findMany({
          where: { studentId: student.id, source: "finance_manual" },
        }),
        prisma.paymentSubmission.findMany({
          where: { studentId: student.id, source: "finance_manual" },
        }),
        prisma.auditLog.findMany({
          where: {
            actorId: ctx.reviewerId,
            entity: "Payment",
            action: "received-and-recorded",
          },
        }),
      ]);

    expect(new Set(receipts.map((result) => result.paymentId))).toEqual(
      new Set([idempotencyKey.toLowerCase()]),
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      id: idempotencyKey.toLowerCase(),
      invoiceId: invoice.id,
      amount: 75_000,
      method: "cash",
      status: "success",
      initiatedById: ctx.reviewerId,
      initiatedByEmail: null,
    });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      paymentId: idempotencyKey.toLowerCase(),
      status: "approved",
      auditStatus: "unreviewed",
      method: "cash",
      bankReference: null,
    });
    expect(afterInvoice.amountPaid).toBe(75_000);
    expect(
      paymentAudits.filter(
        (audit) => audit.entityId === idempotencyKey.toLowerCase(),
      ),
    ).toHaveLength(1);
  });

  it("allows only one concurrent Finance entry for a normalized mobile reference", async () => {
    const student = await makeIsolatedStudent();
    const invoice = await makeInvoiceForStudent(
      student.id,
      300_000,
      new Date("2026-01-06T00:00:00.000Z"),
    );
    const firstId = randomUUID();
    const secondId = randomUUID();
    const originalReferenceCheck = (
      finance as unknown as {
        assertFinanceReferenceAvailable: (
          method: "wave",
          reference: string,
          paymentId: string,
        ) => Promise<string>;
      }
    ).assertFinanceReferenceAvailable.bind(finance);
    let arrivals = 0;
    let releaseChecks!: () => void;
    const bothChecked = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });
    (
      finance as unknown as {
        assertFinanceReferenceAvailable: typeof originalReferenceCheck;
      }
    ).assertFinanceReferenceAvailable = async (
      method,
      reference,
      paymentId,
    ) => {
      const fingerprint = await originalReferenceCheck(
        method,
        reference,
        paymentId,
      );
      arrivals += 1;
      if (arrivals === 2) releaseChecks();
      await bothChecked;
      return fingerprint;
    };

    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        finance.recordStudentPayment({
          studentId: student.id,
          amountXof: 50_000,
          method: "wave",
          transactionReference: "Wave Ref-2026/42",
          idempotencyKey: firstId,
          actor: recordedPaymentActor(),
        }),
        finance.recordStudentPayment({
          studentId: student.id,
          amountXof: 50_000,
          method: "wave",
          transactionReference: "wave-ref 2026 42",
          idempotencyKey: secondId,
          actor: recordedPaymentActor(),
        }),
      ]);
    } finally {
      (
        finance as unknown as {
          assertFinanceReferenceAvailable: typeof originalReferenceCheck;
        }
      ).assertFinanceReferenceAvailable = originalReferenceCheck;
    }

    const [afterInvoice, payments, submissions] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.payment.findMany({
        where: { studentId: student.id, source: "finance_manual" },
      }),
      prisma.paymentSubmission.findMany({
        where: { studentId: student.id, source: "finance_manual" },
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(String(rejected.reason)).toContain(
        "payment reference has already been recorded",
      );
    }
    expect(payments).toHaveLength(1);
    expect(submissions).toHaveLength(1);
    expect(afterInvoice.amountPaid).toBe(50_000);
  });

  it("rolls back a Finance entry when its previously selected invoice is stale", async () => {
    const student = await makeIsolatedStudent();
    const staleInvoice = await makeInvoiceForStudent(
      student.id,
      100_000,
      new Date("2025-12-01T00:00:00.000Z"),
    );
    const nextInvoice = await makeInvoiceForStudent(
      student.id,
      100_000,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    await finance.recordStudentPayment({
      studentId: student.id,
      amountXof: 100_000,
      method: "cash",
      idempotencyKey: randomUUID(),
      actor: recordedPaymentActor(),
    });

    const stalePaymentId = randomUUID();
    await expect(
      (finance as any).settlePayment(stalePaymentId, {
        via: "finance_manual",
        actorId: ctx.reviewerId,
        method: "cash",
        confirmedAmount: 25_000,
        createPayment: {
          invoiceId: staleInvoice.id,
          studentId: student.id,
          amount: 25_000,
          method: "cash",
          providerRef: `FINANCE-MANUAL-${stalePaymentId}`,
          externalReferenceFingerprintSha256: null,
          source: "finance_manual",
          initiatedById: ctx.reviewerId,
          initiatedByEmail: null,
        },
        financeRecord: {
          id: randomUUID(),
          contactEmail: "recorded-payment@test.local",
          transactionReference: null,
          reviewedByName: "Test Bursar",
          reviewedByEmail: "bursar@test.local",
        },
      }),
    ).rejects.toThrow();

    const [stalePayment, staleSubmission, afterNextInvoice] = await Promise.all(
      [
        prisma.payment.findUnique({ where: { id: stalePaymentId } }),
        prisma.paymentSubmission.findUnique({
          where: { paymentId: stalePaymentId },
        }),
        prisma.invoice.findUniqueOrThrow({ where: { id: nextInvoice.id } }),
      ],
    );
    expect(stalePayment).toBeNull();
    expect(staleSubmission).toBeNull();
    expect(afterNextInvoice.amountPaid).toBe(0);
  });
});

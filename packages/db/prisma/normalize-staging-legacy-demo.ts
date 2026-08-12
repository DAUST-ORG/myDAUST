import { Prisma, PrismaClient } from "@prisma/client";
import { toDakarDateKey } from "@mydaust/shared";

/**
 * One-time, tightly-scoped repair for the three legacy demo bills in staging.
 *
 * Dry run (required first):
 *   TARGET_ENV=staging pnpm --filter @mydaust/db normalize:staging-demo
 * Commit only after the dry run is clean:
 *   TARGET_ENV=staging CONFIRM=1 pnpm --filter @mydaust/db normalize:staging-demo
 */

const prisma = new PrismaClient();
const EXPECTED_YEAR = "2026–2027";
const EXPECTED_TOTALS = {
  tuition: 2_975_000,
  housing: 680_000,
  cafeteria: 630_000,
  full: 4_285_000,
} as const;

const TARGETS = [
  {
    number: "BILL-2026-001",
    studentNo: "DAUST-CE-23-0142",
    firstName: "Aïssatou",
    lastName: "Diallo",
    legacyTotalXof: 3_500_000,
    legacyInstallments: [
      { dueOn: "2026-09-15", amountDue: 1_500_000, amountPaid: 1_500_000 },
      { dueOn: "2026-10-15", amountDue: 1_000_000, amountPaid: 1_000_000 },
      { dueOn: "2026-11-15", amountDue: 1_000_000, amountPaid: 1_000_000 },
    ],
    payments: [
      { status: "success", amount: 1_500_000, source: "legacy" },
      { status: "success", amount: 2_000_000, source: "legacy" },
      { status: "refunded", amount: 1_500_000, source: "legacy" },
    ],
  },
  {
    number: "BILL-2026-002",
    studentNo: "DAUST-EE-24-0210",
    firstName: "Mamadou",
    lastName: "Sy",
    legacyTotalXof: 2_975_000,
    legacyInstallments: [
      { dueOn: "2026-09-15", amountDue: 1_487_500, amountPaid: 1_487_500 },
      { dueOn: "2026-11-15", amountDue: 1_487_500, amountPaid: 1_487_500 },
    ],
    payments: [
      { status: "success", amount: 2_975_000, source: "payment_link" },
      { status: "refunded", amount: 991_666, source: "legacy" },
    ],
  },
  {
    number: "BILL-2026-003",
    studentNo: "DAUST-CS-25-0033",
    firstName: "Bineta",
    lastName: "Faye",
    legacyTotalXof: 3_500_000,
    legacyInstallments: [
      { dueOn: "2026-09-30", amountDue: 3_500_000, amountPaid: 3_500_000 },
    ],
    payments: [
      { status: "success", amount: 3_500_000, source: "payment_link" },
    ],
  },
] as const;

type Db = PrismaClient | Prisma.TransactionClient;
type Target = (typeof TARGETS)[number];
type Action = {
  target: Target;
  invoiceId: string;
  action: "normalize" | "unchanged";
};
type Issue = { number: string; studentNo: string; reason: string };
const EVENT_NAME = "staging-legacy-demo-normalizer";
let gateEventWritten = false;
let gateContext: Record<string, unknown> = {
  mode: process.env.CONFIRM === "1" ? "commit" : "dry-run",
};

function emitGate(ok: boolean, extra: Record<string, unknown> = {}) {
  if (gateEventWritten) return;
  console.log(
    JSON.stringify({ event: EVENT_NAME, ok, ...gateContext, ...extra }),
  );
  gateEventWritten = true;
}

const invoiceInclude = {
  student: { include: { person: true } },
  term: { include: { academicYear: true } },
  plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
  payments: {
    orderBy: [{ settledAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: { allocations: true, componentAllocations: true },
  },
  components: { include: { allocations: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRecord = Prisma.InvoiceGetPayload<{
  include: typeof invoiceInclude;
}>;

function assertStagingOnly() {
  if (process.env.TARGET_ENV !== "staging") {
    throw new Error("Refusing to run: TARGET_ENV must be exactly 'staging'.");
  }
  if ((process.env.DATABASE_URL ?? "").toLowerCase().includes("daust-prod")) {
    throw new Error("Refusing to run against a production database URL.");
  }
  const requestedYear = process.env.ACADEMIC_YEAR?.trim() ?? EXPECTED_YEAR;
  if (requestedYear !== EXPECTED_YEAR) {
    throw new Error(
      `Refusing to run for ${requestedYear}; this repair is pinned to ${EXPECTED_YEAR}.`,
    );
  }
}

function installmentStatus(row: {
  dueDate: Date;
  amountDue: number;
  amountPaid: number;
}): "pending" | "partial" | "paid" | "overdue" {
  if (row.amountPaid >= row.amountDue) return "paid";
  if (toDakarDateKey(new Date()) > toDakarDateKey(row.dueDate)) {
    return "overdue";
  }
  return row.amountPaid > 0 ? "partial" : "pending";
}

function allocateProportionally(
  amountXof: number,
  balances: { id: string; availableXof: number }[],
) {
  const capacity = balances.reduce((sum, row) => sum + row.availableXof, 0);
  if (
    !Number.isSafeInteger(amountXof) ||
    amountXof < 0 ||
    amountXof > capacity
  ) {
    throw new Error("Payment exceeds package-component capacity");
  }
  if (amountXof === 0) return [];
  const weighted = balances
    .filter((row) => row.availableXof > 0)
    .map((row) => {
      const numerator = BigInt(amountXof) * BigInt(row.availableXof);
      const denominator = BigInt(capacity);
      return {
        ...row,
        amountXof: Number(numerator / denominator),
        remainder: numerator % denominator,
      };
    })
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id.localeCompare(b.id)
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  let remainder =
    amountXof - weighted.reduce((sum, row) => sum + row.amountXof, 0);
  for (const row of weighted) {
    if (remainder === 0) break;
    if (row.amountXof < row.availableXof) {
      row.amountXof += 1;
      remainder -= 1;
    }
  }
  if (remainder !== 0) {
    throw new Error("Component allocation did not reconcile");
  }
  return weighted
    .filter((row) => row.amountXof > 0)
    .map(({ id, amountXof }) => ({ id, amountXof }));
}

async function loadSchedule(db: Db) {
  const schedule = await db.feeSchedule.findFirst({
    where: { academicYearLabel: EXPECTED_YEAR, status: "approved" },
    orderBy: { revision: "desc" },
    include: { rows: { orderBy: { sequence: "asc" } } },
  });
  if (!schedule)
    throw new Error("No approved 2026–2027 fee schedule was found.");
  if (!schedule.approvedById || !schedule.approvedAt) {
    throw new Error(
      "The staging fee schedule has not been explicitly approved by an administrator.",
    );
  }
  if (
    schedule.rows.length !== 4 ||
    schedule.rows.some(
      (row, index) => row.sequence !== index + 1 || row.dueOn === null,
    )
  ) {
    throw new Error(
      "The approved fee schedule must contain sequences 1–4 with dates.",
    );
  }
  const totals = {
    tuition: schedule.rows.reduce((sum, row) => sum + row.amountTuitionXof, 0),
    housing: schedule.rows.reduce((sum, row) => sum + row.amountHousingXof, 0),
    cafeteria: schedule.rows.reduce(
      (sum, row) => sum + row.amountCafeteriaXof,
      0,
    ),
    full: schedule.rows.reduce((sum, row) => sum + row.amountFullXof, 0),
  };
  if (
    totals.tuition !== EXPECTED_TOTALS.tuition ||
    totals.housing !== EXPECTED_TOTALS.housing ||
    totals.cafeteria !== EXPECTED_TOTALS.cafeteria ||
    totals.full !== EXPECTED_TOTALS.full ||
    totals.full !== totals.tuition + totals.housing + totals.cafeteria
  ) {
    throw new Error(
      "The explicitly approved schedule is not the 4,285,000 XOF full package.",
    );
  }
  return { schedule, totals };
}

function successTotal(invoice: InvoiceRecord) {
  return invoice.payments.reduce(
    (sum, payment) => sum + (payment.status === "success" ? payment.amount : 0),
    0,
  );
}

function snapshot(invoice: InvoiceRecord) {
  return {
    invoice: {
      id: invoice.id,
      number: invoice.number,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      status: invoice.status,
      packageType: invoice.packageType,
      academicYearLabel: invoice.academicYearLabel,
      feeScheduleId: invoice.feeScheduleId,
      feeScheduleRevision: invoice.feeScheduleRevision,
      revision: invoice.revision,
    },
    installments: (invoice.plan?.installments ?? []).map((row) => ({
      id: row.id,
      sequence: row.sequence,
      label: row.label,
      dueOn: toDakarDateKey(row.dueDate),
      amountDue: row.amountDue,
      amountPaid: row.amountPaid,
      status: row.status,
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      providerRef: payment.providerRef,
      source: payment.source,
      settledAt: payment.settledAt?.toISOString() ?? null,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      installmentAllocations: payment.allocations
        .map((row) => ({
          installmentId: row.installmentId,
          amount: row.amount,
        }))
        .sort((a, b) => a.installmentId.localeCompare(b.installmentId)),
      componentAllocations: payment.componentAllocations
        .map((row) => ({
          invoiceComponentId: row.invoiceComponentId,
          amountXof: row.amountXof,
          refundedAmountXof: row.refundedAmountXof,
        }))
        .sort((a, b) =>
          a.invoiceComponentId.localeCompare(b.invoiceComponentId),
        ),
    })),
    components: invoice.components
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        costCenterCode: row.costCenterCode,
        amountXof: row.amountXof,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind)),
    officialPaidXof: successTotal(invoice),
    refundedCashXof: invoice.payments.reduce(
      (sum, payment) =>
        sum + (payment.status === "refunded" ? payment.amount : 0),
      0,
    ),
  };
}

async function validateHistory(db: Db, invoice: InvoiceRecord) {
  if (!invoice.plan) return "Invoice has no payment plan";
  if (invoice.status === "void") return "Invoice is void";
  if (invoice.payments.some((payment) => payment.status === "refund_pending")) {
    return "A refund is still pending";
  }
  if (
    invoice.payments.some(
      (payment) =>
        payment.studentId !== invoice.studentId ||
        !Number.isSafeInteger(payment.amount) ||
        payment.amount <= 0,
    )
  ) {
    return "Payment history contains an invalid amount or student relationship";
  }
  if (successTotal(invoice) > EXPECTED_TOTALS.full) {
    return "Successful payments exceed the approved full package";
  }

  const installmentIds = new Set(
    invoice.plan.installments.map((installment) => installment.id),
  );
  const componentIds = new Set(
    invoice.components.map((component) => component.id),
  );
  const allowedKinds = new Set(["tuition", "housing", "cafeteria"]);
  if (
    invoice.components.some((component) => !allowedKinds.has(component.kind))
  ) {
    return "Invoice has a non-standard accounting component";
  }
  for (const payment of invoice.payments) {
    const installmentAllocated = payment.allocations.reduce(
      (sum, row) => sum + row.amount,
      0,
    );
    const componentGross = payment.componentAllocations.reduce(
      (sum, row) => sum + row.amountXof,
      0,
    );
    const componentNet = payment.componentAllocations.reduce(
      (sum, row) => sum + row.amountXof - row.refundedAmountXof,
      0,
    );
    if (
      payment.allocations.some(
        (row) => row.amount <= 0 || !installmentIds.has(row.installmentId),
      ) ||
      installmentAllocated > payment.amount
    ) {
      return `Payment ${payment.id} has invalid installment history`;
    }
    if (
      payment.componentAllocations.some(
        (row) =>
          row.amountXof <= 0 ||
          row.refundedAmountXof < 0 ||
          row.refundedAmountXof > row.amountXof ||
          !componentIds.has(row.invoiceComponentId),
      ) ||
      componentGross > payment.amount
    ) {
      return `Payment ${payment.id} has invalid component history`;
    }
    if (payment.status === "success" && componentNet !== componentGross) {
      return `Successful payment ${payment.id} contains a refund allocation`;
    }
    if (
      payment.status === "success" &&
      (installmentAllocated !== payment.amount ||
        componentGross !== payment.amount ||
        componentNet !== payment.amount)
    ) {
      return `Successful payment ${payment.id} does not fully reconcile`;
    }
    if (
      payment.status === "refunded" &&
      componentGross > 0 &&
      componentNet !== 0
    ) {
      return `Refunded payment ${payment.id} has non-zero net component cash`;
    }
    if (payment.status === "refunded" && installmentAllocated !== 0) {
      return `Refunded payment ${payment.id} still contributes installment cash`;
    }
    if (
      payment.status === "refunded" &&
      (componentGross !== payment.amount || componentNet !== 0)
    ) {
      return `Refunded payment ${payment.id} does not preserve gross/refund cash`;
    }
    if (
      !["success", "refunded"].includes(payment.status) &&
      (installmentAllocated !== 0 || componentGross !== 0)
    ) {
      return `Unsettled payment ${payment.id} contains ledger allocations`;
    }
  }
  const successfulInstallmentAllocations = new Map<string, number>();
  for (const payment of invoice.payments) {
    if (payment.status !== "success") continue;
    for (const allocation of payment.allocations) {
      successfulInstallmentAllocations.set(
        allocation.installmentId,
        (successfulInstallmentAllocations.get(allocation.installmentId) ?? 0) +
          allocation.amount,
      );
    }
  }
  if (
    invoice.plan.installments.some(
      (installment) =>
        (successfulInstallmentAllocations.get(installment.id) ?? 0) !==
        installment.amountPaid,
    ) ||
    [...successfulInstallmentAllocations.values()].reduce(
      (sum, amount) => sum + amount,
      0,
    ) !== successTotal(invoice)
  ) {
    return "Successful payment allocations do not reconcile to installment paid amounts";
  }
  const componentNetTotal = invoice.components.reduce(
    (sum, component) =>
      sum +
      component.allocations.reduce(
        (part, allocation) =>
          part + allocation.amountXof - allocation.refundedAmountXof,
        0,
      ),
    0,
  );
  if (componentNetTotal !== successTotal(invoice)) {
    return "Net component allocations do not reconcile to successful payments";
  }

  const paymentIds = new Set(invoice.payments.map((payment) => payment.id));
  const externalInstallmentAllocation = await db.paymentAllocation.findFirst({
    where: {
      installmentId: { in: [...installmentIds] },
      paymentId: { notIn: [...paymentIds] },
    },
  });
  if (externalInstallmentAllocation) {
    return "An installment is allocated by a payment from another invoice";
  }
  const externalComponentAllocation =
    await db.paymentComponentAllocation.findFirst({
      where: {
        invoiceComponentId: { in: [...componentIds] },
        paymentId: { notIn: [...paymentIds] },
      },
    });
  if (externalComponentAllocation) {
    return "A component is allocated by a payment from another invoice";
  }
  const creditMemo = await db.invoice.findFirst({
    where: {
      number: { in: invoice.payments.map((payment) => `CR-PAY-${payment.id}`) },
      status: { not: "void" },
    },
  });
  if (creditMemo) {
    return `Payment overflow credit ${creditMemo.number} requires manual review`;
  }
  return null;
}

function matchesNormalized(
  invoice: InvoiceRecord,
  schedule: Awaited<ReturnType<typeof loadSchedule>>["schedule"],
) {
  if (!invoice.plan) return false;
  const orderedInstallments = [...invoice.plan.installments].sort((a, b) => {
    const dateOrder = toDakarDateKey(a.dueDate).localeCompare(
      toDakarDateKey(b.dueDate),
    );
    return dateOrder || a.sequence - b.sequence || a.id.localeCompare(b.id);
  });
  const paidByInstallment = new Map(
    orderedInstallments.map((installment) => [installment.id, 0]),
  );
  const componentRemaining = new Map(
    invoice.components.map((component) => [component.id, component.amountXof]),
  );
  for (const payment of invoice.payments) {
    if (payment.status !== "success") {
      if (payment.allocations.length !== 0) return false;
    } else {
      let remaining = payment.amount;
      const expected = new Map<string, number>();
      for (const installment of orderedInstallments) {
        if (remaining === 0) break;
        const available =
          installment.amountDue - (paidByInstallment.get(installment.id) ?? 0);
        const amount = Math.min(available, remaining);
        if (amount <= 0) continue;
        expected.set(installment.id, amount);
        paidByInstallment.set(
          installment.id,
          (paidByInstallment.get(installment.id) ?? 0) + amount,
        );
        remaining -= amount;
      }
      if (
        remaining !== 0 ||
        payment.allocations.length !== expected.size ||
        payment.allocations.some(
          (allocation) =>
            expected.get(allocation.installmentId) !== allocation.amount,
        )
      ) {
        return false;
      }
    }

    if (payment.status !== "success" && payment.status !== "refunded") {
      if (payment.componentAllocations.length !== 0) return false;
      continue;
    }
    const expectedComponents = allocateProportionally(
      payment.amount,
      invoice.components.map((component) => ({
        id: component.id,
        availableXof:
          payment.status === "success"
            ? (componentRemaining.get(component.id) ?? 0)
            : component.amountXof,
      })),
    );
    if (
      payment.componentAllocations.length !== expectedComponents.length ||
      payment.componentAllocations.some((allocation) => {
        const expected = expectedComponents.find(
          (row) => row.id === allocation.invoiceComponentId,
        );
        return (
          expected?.amountXof !== allocation.amountXof ||
          allocation.refundedAmountXof !==
            (payment.status === "refunded" ? allocation.amountXof : 0)
        );
      })
    ) {
      return false;
    }
    if (payment.status === "success") {
      for (const allocation of expectedComponents) {
        componentRemaining.set(
          allocation.id,
          (componentRemaining.get(allocation.id) ?? 0) - allocation.amountXof,
        );
      }
    }
  }
  const componentsByKind = new Map(
    invoice.components.map((component) => [component.kind, component]),
  );
  const componentsMatch = (
    [
      ["tuition", "9100", EXPECTED_TOTALS.tuition],
      ["housing", "3700", EXPECTED_TOTALS.housing],
      ["cafeteria", "3600", EXPECTED_TOTALS.cafeteria],
    ] as const
  ).every(([kind, costCenterCode, amountXof]) => {
    const component = componentsByKind.get(kind);
    return (
      component?.costCenterCode === costCenterCode &&
      component.amountXof === amountXof
    );
  });
  return (
    invoice.packageType === "standard_full" &&
    invoice.totalAmount === EXPECTED_TOTALS.full &&
    invoice.amountPaid === successTotal(invoice) &&
    invoice.status ===
      (invoice.amountPaid >= EXPECTED_TOTALS.full
        ? "paid"
        : invoice.amountPaid > 0
          ? "partial"
          : "open") &&
    invoice.description === "Annual tuition, housing and cafeteria package" &&
    invoice.costCenterCode === "9100" &&
    invoice.academicYearLabel === schedule.academicYearLabel &&
    invoice.feeScheduleId === schedule.id &&
    invoice.feeScheduleRevision === schedule.revision &&
    invoice.components.length === 3 &&
    componentsMatch &&
    invoice.plan.installments.length === schedule.rows.length &&
    invoice.plan.installments.every((installment) => {
      const row = schedule.rows.find(
        (candidate) => candidate.sequence === installment.sequence,
      );
      const amountPaid = paidByInstallment.get(installment.id) ?? 0;
      return (
        row !== undefined &&
        installment.label === row.label &&
        installment.amountDue === row.amountFullXof &&
        installment.amountPaid === amountPaid &&
        toDakarDateKey(installment.dueDate) === toDakarDateKey(row.dueOn!) &&
        installment.status ===
          installmentStatus({
            dueDate: row.dueOn!,
            amountDue: row.amountFullXof,
            amountPaid,
          })
      );
    })
  );
}

async function analyze(db: Db) {
  const { schedule, totals } = await loadSchedule(db);
  const actions: Action[] = [];
  const issues: Issue[] = [];
  for (const target of TARGETS) {
    const invoice = await db.invoice.findUnique({
      where: { number: target.number },
      include: invoiceInclude,
    });
    if (!invoice) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: "Exact invoice number was not found",
      });
      continue;
    }
    if (
      invoice.student.studentNo !== target.studentNo ||
      invoice.student.person.firstName !== target.firstName ||
      invoice.student.person.lastName !== target.lastName ||
      invoice.student.recordStatus !== "active"
    ) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: "Invoice is not attached to the exact confirmed demo student",
      });
      continue;
    }
    if (
      invoice.term.name !== "Fall 2026" ||
      invoice.term.academicYear?.label !== EXPECTED_YEAR
    ) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: "Invoice is not linked to Fall 2026 in academic year 2026–2027",
      });
      continue;
    }
    const duplicate = await db.invoice.findFirst({
      where: {
        id: { not: invoice.id },
        studentId: invoice.studentId,
        status: { not: "void" },
        packageType: { in: ["standard_full", "standard_tuition_legacy"] },
        academicYearLabel: schedule.academicYearLabel,
      },
    });
    if (duplicate) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: `Duplicate standard invoice ${duplicate.number ?? duplicate.id} exists`,
      });
      continue;
    }
    const historyProblem = await validateHistory(db, invoice);
    if (historyProblem) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: historyProblem,
      });
      continue;
    }
    const nonterminal = invoice.payments.find(
      (payment) =>
        payment.status !== "success" && payment.status !== "refunded",
    );
    if (nonterminal) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: `Unexpected nonterminal payment ${nonterminal.id} (${nonterminal.status})`,
      });
      continue;
    }
    const actualPaymentSignature = invoice.payments
      .map((payment) => `${payment.status}:${payment.amount}:${payment.source}`)
      .sort();
    const expectedPaymentSignature = target.payments
      .map((payment) => `${payment.status}:${payment.amount}:${payment.source}`)
      .sort();
    if (
      actualPaymentSignature.length !== expectedPaymentSignature.length ||
      actualPaymentSignature.some(
        (value, index) => value !== expectedPaymentSignature[index],
      )
    ) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason:
          "Exact payment status/amount multiset does not match live evidence",
      });
      continue;
    }
    if (invoice.packageType === "standard_full") {
      if (!matchesNormalized(invoice, schedule)) {
        issues.push({
          number: target.number,
          studentNo: target.studentNo,
          reason:
            "Previously normalized invoice has drifted from the approved schedule",
        });
        continue;
      }
      actions.push({ target, invoiceId: invoice.id, action: "unchanged" });
      continue;
    }
    const installments = invoice.plan?.installments ?? [];
    const legacyPaidXof = target.payments.reduce(
      (sum, payment) =>
        sum + (payment.status === "success" ? payment.amount : 0),
      0,
    );
    if (
      invoice.packageType !== "custom" ||
      invoice.totalAmount !== target.legacyTotalXof ||
      invoice.amountPaid !== legacyPaidXof ||
      invoice.status !== "paid" ||
      invoice.description !== null ||
      invoice.costCenterCode !== "9100" ||
      invoice.academicYearLabel !== null ||
      invoice.feeScheduleId !== null ||
      invoice.feeScheduleRevision !== null ||
      invoice.components.length !== 1 ||
      invoice.components[0]?.kind !== "tuition" ||
      invoice.components[0].costCenterCode !== "9100" ||
      invoice.components[0].amountXof !== target.legacyTotalXof ||
      installments.length !== target.legacyInstallments.length ||
      installments.some((row, index) => {
        const expected = target.legacyInstallments[index];
        if (!expected) return true;
        return (
          row.sequence !== index + 1 ||
          row.label !== null ||
          row.amountDue !== expected.amountDue ||
          row.amountPaid !== expected.amountPaid ||
          row.status !== "paid" ||
          toDakarDateKey(row.dueDate) !== expected.dueOn
        );
      })
    ) {
      issues.push({
        number: target.number,
        studentNo: target.studentNo,
        reason: `Legacy signature mismatch; expected ${target.legacyTotalXof} XOF across ${target.legacyInstallments.length} exact rows`,
      });
      continue;
    }
    actions.push({ target, invoiceId: invoice.id, action: "normalize" });
  }
  return { schedule, totals, actions, issues };
}

async function normalizeInvoice(
  tx: Prisma.TransactionClient,
  action: Action,
  schedule: Awaited<ReturnType<typeof loadSchedule>>["schedule"],
) {
  const beforeRecord = await tx.invoice.findUniqueOrThrow({
    where: { id: action.invoiceId },
    include: invoiceInclude,
  });
  if (!beforeRecord.plan) {
    throw new Error(`${action.target.number}: payment plan disappeared`);
  }
  const before = snapshot(beforeRecord);
  const oldInstallmentIds = beforeRecord.plan.installments.map((row) => row.id);
  const paymentIds = beforeRecord.payments.map((payment) => payment.id);
  const oldComponentIds = beforeRecord.components.map((row) => row.id);

  await tx.paymentAllocation.deleteMany({
    where: {
      OR: [
        { paymentId: { in: paymentIds } },
        { installmentId: { in: oldInstallmentIds } },
      ],
    },
  });
  await tx.paymentComponentAllocation.deleteMany({
    where: {
      OR: [
        { paymentId: { in: paymentIds } },
        { invoiceComponentId: { in: oldComponentIds } },
      ],
    },
  });

  for (const row of schedule.rows) {
    const existing = beforeRecord.plan.installments.find(
      (installment) => installment.sequence === row.sequence,
    );
    if (existing) {
      await tx.installment.update({
        where: { id: existing.id },
        data: {
          label: row.label,
          dueDate: row.dueOn!,
          amountDue: row.amountFullXof,
          amountPaid: 0,
          status: installmentStatus({
            dueDate: row.dueOn!,
            amountDue: row.amountFullXof,
            amountPaid: 0,
          }),
        },
      });
    } else {
      await tx.installment.create({
        data: {
          planId: beforeRecord.plan.id,
          sequence: row.sequence,
          label: row.label,
          dueDate: row.dueOn!,
          amountDue: row.amountFullXof,
          status: installmentStatus({
            dueDate: row.dueOn!,
            amountDue: row.amountFullXof,
            amountPaid: 0,
          }),
        },
      });
    }
  }

  const componentDefs = [
    {
      kind: "tuition",
      costCenterCode: "9100",
      amountXof: EXPECTED_TOTALS.tuition,
    },
    {
      kind: "housing",
      costCenterCode: "3700",
      amountXof: EXPECTED_TOTALS.housing,
    },
    {
      kind: "cafeteria",
      costCenterCode: "3600",
      amountXof: EXPECTED_TOTALS.cafeteria,
    },
  ];
  const components = [];
  for (const definition of componentDefs) {
    components.push(
      await tx.invoiceComponent.upsert({
        where: {
          invoiceId_kind: {
            invoiceId: beforeRecord.id,
            kind: definition.kind,
          },
        },
        create: { invoiceId: beforeRecord.id, ...definition },
        update: {
          costCenterCode: definition.costCenterCode,
          amountXof: definition.amountXof,
        },
      }),
    );
  }

  const installments = await tx.installment.findMany({
    where: { planId: beforeRecord.plan.id },
    orderBy: [{ dueDate: "asc" }, { sequence: "asc" }, { id: "asc" }],
  });
  const paidByInstallment = new Map(
    installments.map((installment) => [installment.id, 0]),
  );
  for (const payment of beforeRecord.payments) {
    if (payment.status !== "success") continue;
    let remaining = payment.amount;
    const allocations = [];
    for (const installment of installments) {
      if (remaining === 0) break;
      const available =
        installment.amountDue - (paidByInstallment.get(installment.id) ?? 0);
      const amount = Math.min(remaining, available);
      if (amount <= 0) continue;
      allocations.push({
        paymentId: payment.id,
        installmentId: installment.id,
        amount,
      });
      paidByInstallment.set(
        installment.id,
        (paidByInstallment.get(installment.id) ?? 0) + amount,
      );
      remaining -= amount;
    }
    if (remaining !== 0) {
      throw new Error(
        `${action.target.number}: payment exceeds installment capacity`,
      );
    }
    if (allocations.length > 0) {
      await tx.paymentAllocation.createMany({ data: allocations });
    }
  }
  for (const installment of installments) {
    const amountPaid = paidByInstallment.get(installment.id) ?? 0;
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        amountPaid,
        status: installmentStatus({
          dueDate: installment.dueDate,
          amountDue: installment.amountDue,
          amountPaid,
        }),
      },
    });
  }

  const remainingComponents = new Map(
    components.map((component) => [component.id, component.amountXof]),
  );
  for (const payment of beforeRecord.payments) {
    if (payment.status !== "success" && payment.status !== "refunded") continue;
    const split = allocateProportionally(
      payment.amount,
      components.map((component) => ({
        id: component.id,
        availableXof:
          payment.status === "success"
            ? (remainingComponents.get(component.id) ?? 0)
            : component.amountXof,
      })),
    );
    if (split.length > 0) {
      await tx.paymentComponentAllocation.createMany({
        data: split.map((row) => ({
          paymentId: payment.id,
          invoiceComponentId: row.id,
          amountXof: row.amountXof,
          refundedAmountXof: payment.status === "refunded" ? row.amountXof : 0,
        })),
      });
    }
    if (payment.status === "success") {
      for (const row of split) {
        remainingComponents.set(
          row.id,
          (remainingComponents.get(row.id) ?? 0) - row.amountXof,
        );
      }
    }
  }

  const amountPaid = successTotal(beforeRecord);
  await tx.invoice.update({
    where: { id: beforeRecord.id },
    data: {
      totalAmount: EXPECTED_TOTALS.full,
      amountPaid,
      status:
        amountPaid >= EXPECTED_TOTALS.full
          ? "paid"
          : amountPaid > 0
            ? "partial"
            : "open",
      description: "Annual tuition, housing and cafeteria package",
      costCenterCode: "9100",
      packageType: "standard_full",
      academicYearLabel: schedule.academicYearLabel,
      feeScheduleId: schedule.id,
      feeScheduleRevision: schedule.revision,
      revision: { increment: 1 },
    },
  });
  const afterRecord = await tx.invoice.findUniqueOrThrow({
    where: { id: beforeRecord.id },
    include: invoiceInclude,
  });
  const preservedPayments = beforeRecord.payments.every((payment) => {
    const current = afterRecord.payments.find((row) => row.id === payment.id);
    return (
      current?.amount === payment.amount &&
      current.status === payment.status &&
      current.providerRef === payment.providerRef &&
      current.source === payment.source &&
      current.settledAt?.getTime() === payment.settledAt?.getTime() &&
      current.refundedAt?.getTime() === payment.refundedAt?.getTime()
    );
  });
  const preservedInstallments = beforeRecord.plan.installments.every(
    (installment) =>
      afterRecord.plan?.installments.some(
        (row) =>
          row.sequence === installment.sequence && row.id === installment.id,
      ),
  );
  if (!preservedPayments || !preservedInstallments) {
    throw new Error(
      `${action.target.number}: identity preservation check failed`,
    );
  }
  if (!matchesNormalized(afterRecord, schedule)) {
    throw new Error(
      `${action.target.number}: normalized ledger did not reconcile`,
    );
  }
  const installmentPaidXof = afterRecord.plan!.installments.reduce(
    (sum, installment) => sum + installment.amountPaid,
    0,
  );
  const installmentAllocatedXof = afterRecord.payments.reduce(
    (sum, payment) =>
      sum + payment.allocations.reduce((part, row) => part + row.amount, 0),
    0,
  );
  const componentNetXof = afterRecord.payments.reduce(
    (sum, payment) =>
      sum +
      payment.componentAllocations.reduce(
        (part, row) => part + row.amountXof - row.refundedAmountXof,
        0,
      ),
    0,
  );
  if (
    installmentPaidXof !== afterRecord.amountPaid ||
    installmentAllocatedXof !== afterRecord.amountPaid ||
    componentNetXof !== afterRecord.amountPaid
  ) {
    throw new Error(
      `${action.target.number}: official, installment and component ledgers diverged`,
    );
  }
  await tx.auditLog.create({
    data: {
      entity: "Invoice",
      entityId: beforeRecord.id,
      action: "staging-legacy-demo-normalized",
      data: {
        target: {
          number: action.target.number,
          studentNo: action.target.studentNo,
        },
        feeScheduleId: schedule.id,
        feeScheduleRevision: schedule.revision,
        before,
        after: snapshot(afterRecord),
      },
    },
  });
}

async function main() {
  assertStagingOnly();
  const commit = process.env.CONFIRM === "1";
  const initial = await analyze(prisma);
  const report = {
    mode: commit ? "commit" : "dry-run",
    academicYear: initial.schedule.academicYearLabel,
    scheduleRevision: initial.schedule.revision,
    counts: {
      targets: TARGETS.length,
      normalize: initial.actions.filter((row) => row.action === "normalize")
        .length,
      unchanged: initial.actions.filter((row) => row.action === "unchanged")
        .length,
      unresolved: initial.issues.length,
    },
    unresolved: initial.issues,
  };
  gateContext = {
    mode: report.mode,
    academicYear: report.academicYear,
    scheduleRevision: report.scheduleRevision,
    counts: report.counts,
  };
  console.log(JSON.stringify(report, null, 2));
  if (initial.issues.length > 0) {
    emitGate(false);
    throw new Error(
      "Normalizer refused: exact staging signatures did not match.",
    );
  }
  if (!commit) {
    emitGate(true);
    console.log(
      "Dry run clean. Re-run with CONFIRM=1 to commit all three repairs.",
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const reviewed = await analyze(tx);
      if (reviewed.issues.length > 0) {
        throw new Error(
          "Normalizer refused: staging data changed after review.",
        );
      }
      for (const action of reviewed.actions) {
        if (action.action === "normalize") {
          await normalizeInvoice(tx, action, reviewed.schedule);
        }
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
  emitGate(true);
  console.log("Three-invoice staging normalization committed successfully.");
}

main()
  .catch((error) => {
    emitGate(false, {
      error:
        error instanceof Error ? error.message : "Unknown normalizer error",
    });
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

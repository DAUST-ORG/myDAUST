import type { PrismaClient } from "@mydaust/db";

export interface PaymentBalanceImportAuditResult {
  batchId: string;
  ok: true;
  sourceRows: number;
  importedRows: number;
  alreadyReconciledRows: number;
  previouslyImportedRows: number;
  heldRows: number;
  sourcePaidTotalXof: number;
  importedDeltaXof: number;
  paymentRows: number;
  paymentAuditRows: number;
  batchAuditRows: number;
  enrollmentActivations: number;
  activationAuditRows: number;
  activationInvitesSent: number;
  activationInvitesPending: number;
  reconciledInvoices: number;
}

function safeBigInt(value: bigint, label: string): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new Error(`${label} exceeds safe whole-XOF audit bounds`);
  }
  return converted;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Paid-to-date post-audit failed: ${message}`);
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function auditPaymentBalancePaymentEvidence(input: {
  batchId: string;
  importedRows: readonly {
    paymentId: string | null;
    sourceClaimSha256: string | null;
  }[];
  auditLogs: readonly {
    entityId: string;
    data: unknown;
  }[];
}): number {
  for (const row of input.importedRows) {
    assert(
      row.paymentId !== null && row.sourceClaimSha256 !== null,
      "an imported row lacks durable payment provenance",
    );
    const logs = input.auditLogs.filter(
      (auditLog) => auditLog.entityId === row.paymentId,
    );
    const data = logs.length === 1 ? jsonObject(logs[0]!.data) : null;
    assert(
      logs.length === 1 &&
        data?.batchId === input.batchId &&
        data.sourceClaimSha256 === row.sourceClaimSha256,
      "an imported payment lacks one exact batch/source-claim audit",
    );
  }
  return input.importedRows.length;
}

export function auditPaymentBalanceActivationEvidence(input: {
  expectedActivations: number;
  applicants: readonly {
    id: string;
    activatedByPaymentId: string | null;
    studentInviteSentAt: Date | null;
  }[];
  auditLogs: readonly {
    entityId: string;
    action: string;
    data: unknown;
  }[];
}): {
  activationAuditRows: number;
  activationInvitesSent: number;
  activationInvitesPending: number;
} {
  assert(
    Number.isSafeInteger(input.expectedActivations) &&
      input.expectedActivations >= 0 &&
      input.expectedActivations === input.applicants.length,
    "enrollment activation count differs",
  );

  let activationAuditRows = 0;
  let activationInvitesSent = 0;
  let activationInvitesPending = 0;
  for (const applicant of input.applicants) {
    const activationLogs = input.auditLogs.filter(
      (row) =>
        row.entityId === applicant.id && row.action === "onboarding-activated",
    );
    assert(
      activationLogs.length === 1 &&
        jsonObject(activationLogs[0]!.data)?.paymentId ===
          applicant.activatedByPaymentId,
      "an enrollment activation lacks exact imported-payment audit evidence",
    );
    activationAuditRows += 1;

    if (applicant.studentInviteSentAt) {
      activationInvitesSent += 1;
      continue;
    }
    const pendingLogs = input.auditLogs.filter(
      (row) =>
        row.entityId === applicant.id &&
        (row.action === "student-invite-delivery-pending" ||
          row.action === "student-invite-delivery-marker-pending"),
    );
    assert(
      pendingLogs.length >= 1,
      "an enrollment activation lacks invite delivery or pending audit evidence",
    );
    activationInvitesPending += 1;
  }
  return {
    activationAuditRows,
    activationInvitesSent,
    activationInvitesPending,
  };
}

export async function auditPaymentBalanceImportBatch(
  prisma: PrismaClient,
  batchId: string,
): Promise<PaymentBalanceImportAuditResult> {
  const batch = await prisma.paymentBalanceImportBatch.findUnique({
    where: { id: batchId },
    include: {
      rows: {
        orderBy: [{ sourceSheet: "asc" }, { sourceRowNumber: "asc" }],
        include: {
          payment: {
            include: { allocations: true, componentAllocations: true },
          },
        },
      },
    },
  });
  assert(batch, "batch does not exist");
  assert(batch.status === "imported", "batch is not imported");
  assert(
    batch.rows.length === batch.sourceRowCount,
    "source row count differs",
  );

  const imported = batch.rows.filter((row) => row.disposition === "post_delta");
  const already = batch.rows.filter(
    (row) => row.disposition === "already_reconciled",
  );
  const previous = batch.rows.filter(
    (row) => row.disposition === "previously_imported",
  );
  const held = batch.rows.filter((row) => row.disposition === "held");
  assert(
    imported.length === batch.importedRows,
    "imported row counter differs",
  );
  assert(
    already.length === batch.alreadyReconciledRows,
    "already-reconciled row counter differs",
  );
  assert(
    previous.length === batch.previouslyImportedRows,
    "previously-imported row counter differs",
  );
  assert(held.length === batch.heldRows, "held row counter differs");

  let heldSourcePaidXof = 0;
  let resolvedSourcePaidXof = 0;
  let baselineLedgerPaidXof = 0;
  let importedDeltaXof = 0;
  for (const row of batch.rows) {
    const target = safeBigInt(row.sourcePaidToDateXof, "row source target");
    if (row.disposition === "held") {
      heldSourcePaidXof += target;
      assert(!row.payment, `held row ${row.sourceRowKey} has a payment`);
      continue;
    }
    resolvedSourcePaidXof += target;
    baselineLedgerPaidXof += safeBigInt(
      row.baselineLedgerPaidXof!,
      "row baseline ledger",
    );
    if (row.disposition !== "post_delta") {
      assert(!row.payment, `no-op row ${row.sourceRowKey} has a payment`);
      continue;
    }
    const payment = row.payment;
    assert(payment, `imported row ${row.sourceRowKey} has no payment`);
    const delta = safeBigInt(row.deltaXof!, "row imported delta");
    importedDeltaXof += delta;
    assert(
      payment.amount === delta,
      `payment amount differs for ${row.sourceRowKey}`,
    );
    assert(
      payment.status === "success",
      `payment is not successful for ${row.sourceRowKey}`,
    );
    assert(
      payment.method === "legacy_unknown" &&
        payment.provider === "balance_reconciliation" &&
        payment.source === "paid_to_date_workbook" &&
        payment.settledAt === null,
      `payment accounting provenance differs for ${row.sourceRowKey}`,
    );
    assert(
      payment.importBatchId === null &&
        payment.importRowKey === null &&
        payment.importSheetName === null &&
        payment.importRowNumber === null,
      `historical import provenance was incorrectly populated for ${row.sourceRowKey}`,
    );
    assert(
      payment.allocations.reduce(
        (sum, allocation) => sum + allocation.amount,
        0,
      ) === payment.amount,
      `installment allocations differ for ${row.sourceRowKey}`,
    );
    assert(
      payment.componentAllocations.reduce(
        (sum, allocation) => sum + allocation.amountXof,
        0,
      ) === payment.amount,
      `component allocations differ for ${row.sourceRowKey}`,
    );
  }

  const sourcePaidTotalXof = safeBigInt(
    batch.sourcePaidTotalXof,
    "batch source total",
  );
  assert(
    resolvedSourcePaidXof + heldSourcePaidXof === sourcePaidTotalXof,
    "source XOF partition differs",
  );
  assert(
    baselineLedgerPaidXof + importedDeltaXof === resolvedSourcePaidXof,
    "resolved XOF equation differs",
  );
  assert(
    heldSourcePaidXof ===
      safeBigInt(batch.heldSourcePaidXof, "batch held total") &&
      resolvedSourcePaidXof ===
        safeBigInt(batch.resolvedSourcePaidXof, "batch resolved total") &&
      baselineLedgerPaidXof ===
        safeBigInt(batch.baselineLedgerPaidXof, "batch baseline total") &&
      importedDeltaXof ===
        safeBigInt(batch.importedDeltaXof, "batch imported total"),
    "persisted batch XOF controls differ",
  );

  const invoiceIds = [
    ...new Set(
      batch.rows.flatMap((row) =>
        row.disposition !== "held" && row.invoiceId ? [row.invoiceId] : [],
      ),
    ),
  ];
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    include: {
      plan: { include: { installments: true } },
      components: { include: { allocations: true } },
    },
  });
  assert(
    invoices.length === invoiceIds.length,
    "a resolved invoice is missing",
  );
  for (const invoice of invoices) {
    const installmentDue = (invoice.plan?.installments ?? []).reduce(
      (sum, installment) => sum + installment.amountDue,
      0,
    );
    const installmentPaid = (invoice.plan?.installments ?? []).reduce(
      (sum, installment) => sum + installment.amountPaid,
      0,
    );
    const componentTotal = invoice.components.reduce(
      (sum, component) => sum + component.amountXof,
      0,
    );
    const componentPaid = invoice.components.reduce(
      (sum, component) =>
        sum +
        component.allocations.reduce(
          (allocated, allocation) =>
            allocated + allocation.amountXof - allocation.refundedAmountXof,
          0,
        ),
      0,
    );
    assert(
      installmentDue === invoice.totalAmount &&
        installmentPaid === invoice.amountPaid &&
        componentTotal === invoice.totalAmount &&
        componentPaid === invoice.amountPaid,
      `invoice ${invoice.id} does not reconcile`,
    );
  }

  const importedPaymentIds = imported.flatMap((row) =>
    row.paymentId ? [row.paymentId] : [],
  );
  const [paymentAuditLogs, batchAuditLogs, activatedApplicants] =
    await Promise.all([
      prisma.auditLog.findMany({
        where: {
          entity: "Payment",
          action: "paid-to-date-balance-imported",
          entityId: { in: importedPaymentIds },
        },
        select: { entityId: true, data: true },
      }),
      prisma.auditLog.findMany({
        where: {
          entity: "PaymentBalanceImportBatch",
          entityId: batch.id,
          action: "imported",
        },
        select: { data: true },
      }),
      prisma.applicant.findMany({
        where: { activatedByPaymentId: { in: importedPaymentIds } },
        select: {
          id: true,
          activatedByPaymentId: true,
          studentInviteSentAt: true,
        },
      }),
    ]);
  const paymentAuditRows = auditPaymentBalancePaymentEvidence({
    batchId: batch.id,
    importedRows: imported,
    auditLogs: paymentAuditLogs,
  });
  assert(batchAuditLogs.length === 1, "batch audit count differs");

  const batchAuditData = jsonObject(batchAuditLogs[0]!.data);
  assert(batchAuditData, "batch audit data is missing");
  const expectedActivations = batchAuditData.activations;
  assert(
    typeof expectedActivations === "number",
    "batch activation audit count is invalid",
  );

  const activationEvidence = await prisma.auditLog.findMany({
    where: {
      entity: "Applicant",
      entityId: { in: activatedApplicants.map((applicant) => applicant.id) },
      action: {
        in: [
          "onboarding-activated",
          "student-invite-delivery-pending",
          "student-invite-delivery-marker-pending",
        ],
      },
    },
    select: { entityId: true, action: true, data: true },
  });
  const {
    activationAuditRows,
    activationInvitesSent,
    activationInvitesPending,
  } = auditPaymentBalanceActivationEvidence({
    expectedActivations,
    applicants: activatedApplicants,
    auditLogs: activationEvidence,
  });

  return {
    batchId: batch.id,
    ok: true,
    sourceRows: batch.sourceRowCount,
    importedRows: imported.length,
    alreadyReconciledRows: already.length,
    previouslyImportedRows: previous.length,
    heldRows: held.length,
    sourcePaidTotalXof,
    importedDeltaXof,
    paymentRows: imported.length,
    paymentAuditRows,
    batchAuditRows: batchAuditLogs.length,
    enrollmentActivations: activatedApplicants.length,
    activationAuditRows,
    activationInvitesSent,
    activationInvitesPending,
    reconciledInvoices: invoices.length,
  };
}

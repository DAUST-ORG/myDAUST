import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@mydaust/db";
import { toDakarDateKey } from "@mydaust/shared";
import {
  deriveApiAccountPosition,
  payableLinesOldestFirst,
  projectedInstallmentStatus,
} from "./account-position.js";
import { allocateProportionallyXof } from "./component-allocation.js";
import {
  type HistoricalPaymentManifest,
  type HistoricalPaymentManifestRow,
  historicalPaymentProviderRef,
  historicalPaymentManifestDigest,
  historicalPaymentSourceKey,
  historicalSettlementTimestamp,
  normalizeExternalReference,
  normalizePaymentIdentityName,
} from "./historical-payment-import.manifest.js";
import {
  externalReferenceFingerprintSha256,
  paymentReferenceEvidence,
} from "./payment-reference.js";

const IMPORT_ROLES = new Set(["admin", "bursar"]);

type ImportDb = Pick<
  Prisma.TransactionClient,
  | "academicYear"
  | "auditLog"
  | "installment"
  | "invoice"
  | "payment"
  | "paymentAllocation"
  | "paymentComponentAllocation"
  | "paymentImportBatch"
  | "person"
  | "student"
>;

export interface PaymentImportInvocation {
  actorEmail: string;
}

export interface PaymentImportBlocker {
  code: string;
  message: string;
  rowKey?: string;
  details?: Record<string, unknown>;
}

export interface PaymentImportWarning {
  code: string;
  message: string;
  rowKey?: string;
}

export interface PlannedHistoricalPayment {
  rowKey: string;
  sourceKey: string;
  providerRef: string;
  studentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  settledOn: string;
  amountXof: number;
  method: HistoricalPaymentManifestRow["method"];
  skippedAsExistingPaymentId: string | null;
  installmentAllocations: { installmentId: string; amountXof: number }[];
  componentAllocations: {
    invoiceComponentId: string;
    kind: string;
    costCenterCode: string;
    amountXof: number;
  }[];
  manifestRow: HistoricalPaymentManifestRow;
}

export interface HistoricalPaymentImportPlan {
  actorId: string;
  alreadyImportedBatchId: string | null;
  sourceSha256: string;
  sourceExtractionSha256: string;
  manifestSha256: string;
  sourceGroupCount: number;
  sourceTotalXof: number;
  manifestPaymentRows: number;
  excludedSourceGroups: number;
  rowsToImport: number;
  rowsAlreadyRecorded: number;
  amountToImportXof: number;
  amountAlreadyRecordedXof: number;
  excludedXof: number;
  blockers: PaymentImportBlocker[];
  warnings: PaymentImportWarning[];
  payments: PlannedHistoricalPayment[];
}

export interface HistoricalPaymentImportResult {
  batchId: string;
  alreadyImported: boolean;
  importedRows: number;
  skippedRows: number;
  importedXof: number;
}

export class HistoricalPaymentImportBlockedError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HistoricalPaymentImportBlockedError";
  }
}

export function historicalPaymentDryRunExitCode(
  plan: Pick<HistoricalPaymentImportPlan, "blockers">,
): 0 | 2 {
  return plan.blockers.length === 0 ? 0 : 2;
}

interface SimulatedInvoice {
  id: string;
  number: string | null;
  studentId: string;
  status: string;
  revision: number;
  totalAmount: number;
  amountPaid: number;
  createdAt: Date;
  academicYearLabel: string | null;
  term: { academicYear: { label: string } | null };
  plan: {
    installments: {
      id: string;
      sequence: number;
      dueDate: Date;
      amountDue: number;
      amountPaid: number;
    }[];
  } | null;
  components: {
    id: string;
    kind: string;
    costCenterCode: string;
    amountXof: number;
    netAllocatedXof: number;
  }[];
  payments: {
    id: string;
    status: string;
    settledAt: Date | null;
    providerRef: string;
    ipnPayload: Prisma.JsonValue | null;
  }[];
}

const EXISTING_PAYMENT_DATE_WINDOW_DAYS = 31;

function rowKey(row: HistoricalPaymentManifestRow): string {
  return `${row.sourceGroupKey}:${row.allocationKey}`;
}

function academicYearNumbers(label: string): [number, number] | null {
  const years = [...label.matchAll(/(?:19|20)\d{2}/g)].map((match) =>
    Number(match[0]),
  );
  if (years.length < 2 || years[1]! !== years[0]! + 1) return null;
  return [years[0]!, years[1]!];
}

function plausiblePaymentBounds(
  label: string,
  endsOn: Date | null,
): { start: string; end: string } | null {
  const years = academicYearNumbers(label);
  if (!years) return null;
  return {
    // Registration deposits commonly precede the August academic-year boundary.
    start: `${years[0]}-01-01`,
    end: endsOn ? toDakarDateKey(endsOn) : `${years[1]}-07-31`,
  };
}

async function requireImportActor(db: ImportDb, actorEmailInput: string) {
  const actorEmail = actorEmailInput.trim().toLowerCase();
  const actor = await db.person.findUnique({
    where: { email: actorEmail },
    select: { id: true, roles: true },
  });
  if (!actor || !actor.roles.some((role) => IMPORT_ROLES.has(role))) {
    throw new HistoricalPaymentImportBlockedError(
      "Import actor must be an existing bursar or administrator",
      {},
    );
  }
  return actor;
}

function existingDecisionBlocker(
  row: HistoricalPaymentManifestRow,
  candidates: { id: string }[],
): PaymentImportBlocker | null {
  if (candidates.length === 0) {
    if (row.existingPaymentDecision) {
      return {
        code: "stale_existing_payment_decision",
        rowKey: rowKey(row),
        message:
          "The manifest reviews existing payments that no longer match this row",
      };
    }
    return null;
  }
  const candidateIds = candidates.map((candidate) => candidate.id).sort();
  const decision = row.existingPaymentDecision;
  if (!decision) {
    return {
      code: "possible_existing_payment",
      rowKey: rowKey(row),
      message:
        "A settled ledger payment may represent the same source cash and requires explicit review",
      details: { candidatePaymentIds: candidateIds },
    };
  }
  if (decision.decision === "already_recorded") {
    if (candidateIds.length !== 1 || candidateIds[0] !== decision.paymentId) {
      return {
        code: "stale_existing_payment_decision",
        rowKey: rowKey(row),
        message:
          "The already-recorded decision does not match the current ledger",
        details: { candidatePaymentIds: candidateIds },
      };
    }
    return null;
  }
  const reviewed = [...decision.paymentIds].sort();
  if (
    reviewed.length !== candidateIds.length ||
    reviewed.some((id, index) => id !== candidateIds[index])
  ) {
    return {
      code: "stale_existing_payment_decision",
      rowKey: rowKey(row),
      message:
        "The confirmed-distinct decision does not cover the current matching payments",
      details: { candidatePaymentIds: candidateIds },
    };
  }
  return null;
}

function cloneInvoice(record: {
  id: string;
  number: string | null;
  studentId: string;
  status: string;
  revision: number;
  totalAmount: number;
  amountPaid: number;
  createdAt: Date;
  academicYearLabel: string | null;
  term: { academicYear: { label: string } | null };
  plan: {
    installments: {
      id: string;
      sequence: number;
      dueDate: Date;
      amountDue: number;
      amountPaid: number;
    }[];
  } | null;
  components: {
    id: string;
    kind: string;
    costCenterCode: string;
    amountXof: number;
    allocations: { amountXof: number; refundedAmountXof: number }[];
  }[];
  payments: {
    id: string;
    status: string;
    settledAt: Date | null;
    providerRef: string;
    ipnPayload: Prisma.JsonValue | null;
  }[];
}): SimulatedInvoice {
  return {
    ...record,
    plan: record.plan
      ? {
          installments: record.plan.installments.map((installment) => ({
            ...installment,
          })),
        }
      : null,
    components: record.components.map((component) => ({
      id: component.id,
      kind: component.kind,
      costCenterCode: component.costCenterCode,
      amountXof: component.amountXof,
      netAllocatedXof: component.allocations.reduce(
        (sum, allocation) =>
          sum + allocation.amountXof - allocation.refundedAmountXof,
        0,
      ),
    })),
    payments: record.payments.map((payment) => ({ ...payment })),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function dateDistanceDays(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T00:00:00.000Z`);
  const rightMs = Date.parse(`${right}T00:00:00.000Z`);
  return Math.abs(leftMs - rightMs) / 86_400_000;
}

function isExistingPaymentCandidate(
  row: HistoricalPaymentManifestRow,
  payment: {
    studentId: string;
    amount: number;
    settledAt: Date | null;
    providerRef: string;
    ipnPayload: Prisma.JsonValue | null;
    submission: { bankReference: string | null } | null;
  },
  studentId: string,
): boolean {
  if (payment.studentId !== studentId || payment.amount !== row.amountXof) {
    return false;
  }
  const sourceReference = normalizeExternalReference(row.externalReference);
  if (sourceReference) {
    const evidence = paymentReferenceEvidence(payment);
    if (
      evidence.normalized.has(sourceReference) ||
      evidence.hashes.has(sha256(sourceReference))
    ) {
      return true;
    }
  }
  // A settled row without a durable date cannot be safely ruled out. It must be
  // reviewed as a candidate rather than silently imported a second time.
  if (payment.settledAt === null) return true;
  return (
    dateDistanceDays(toDakarDateKey(payment.settledAt), row.settledOn) <=
    EXISTING_PAYMENT_DATE_WINDOW_DAYS
  );
}

function historicalOrderingBlocker(
  row: HistoricalPaymentManifestRow,
  invoice: SimulatedInvoice,
): PaymentImportBlocker | null {
  const undatedPaymentIds = invoice.payments
    .filter(
      (payment) =>
        ["success", "refund_pending", "refunded"].includes(payment.status) &&
        payment.settledAt === null,
    )
    .map((payment) => payment.id)
    .sort();
  if (undatedPaymentIds.length > 0) {
    return {
      code: "settled_payments_missing_date",
      rowKey: rowKey(row),
      message:
        "The selected invoice contains settled cash without a durable settlement date and cannot be safely replayed",
      details: { invoiceId: invoice.id, paymentIds: undatedPaymentIds },
    };
  }
  const laterPaymentIds = invoice.payments
    .filter(
      (payment) =>
        ["success", "refund_pending", "refunded"].includes(payment.status) &&
        payment.settledAt !== null &&
        toDakarDateKey(payment.settledAt) > row.settledOn,
    )
    .map((payment) => payment.id)
    .sort();
  const review = row.historicalOrderingReview;
  if (laterPaymentIds.length === 0) {
    return review
      ? {
          code: "stale_historical_ordering_review",
          rowKey: rowKey(row),
          message:
            "The reviewed later-payment set no longer exists on the selected invoice",
        }
      : null;
  }
  if (!review) {
    return {
      code: "later_settled_payments_require_review",
      rowKey: rowKey(row),
      message:
        "The selected invoice already contains later settled cash; applying this historical row to the current remaining balance requires explicit review",
      details: { invoiceId: invoice.id, laterPaymentIds },
    };
  }
  const reviewedPaymentIds = [...review.laterPaymentIds].sort();
  if (
    review.invoiceId !== invoice.id ||
    review.invoiceRevision !== invoice.revision ||
    reviewedPaymentIds.length !== laterPaymentIds.length ||
    reviewedPaymentIds.some((id, index) => id !== laterPaymentIds[index])
  ) {
    return {
      code: "stale_historical_ordering_review",
      rowKey: rowKey(row),
      message:
        "The reviewed invoice target, revision, or later-payment set has changed",
      details: {
        invoiceId: invoice.id,
        invoiceRevision: invoice.revision,
        laterPaymentIds,
      },
    };
  }
  return null;
}

function simulatePayment(
  invoices: SimulatedInvoice[],
  row: HistoricalPaymentManifestRow,
  manifest: HistoricalPaymentManifest,
):
  | {
      payment: Omit<PlannedHistoricalPayment, "studentId" | "manifestRow">;
    }
  | { blocker: PaymentImportBlocker } {
  const key = rowKey(row);
  const position = deriveApiAccountPosition(invoices);
  const lines = payableLinesOldestFirst(invoices, position);
  const first = lines[0];
  if (!first) {
    return {
      blocker: {
        code: "no_outstanding_balance",
        rowKey: key,
        message:
          "The student account has no outstanding balance for this payment",
      },
    };
  }
  const invoice = invoices.find(
    (candidate) => candidate.id === first.invoiceId,
  )!;
  const invoiceYear =
    invoice.academicYearLabel ?? invoice.term.academicYear?.label;
  if (invoiceYear !== manifest.academicYearLabel) {
    return {
      blocker: {
        code: "oldest_charge_wrong_year",
        rowKey: key,
        message:
          "The account's oldest payable charge is not in the reviewed academic year",
        details: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          invoiceAcademicYear: invoiceYear ?? null,
          expectedAcademicYear: manifest.academicYearLabel,
        },
      },
    };
  }
  const directLines = [] as typeof lines;
  for (const line of lines) {
    if (line.invoiceId !== invoice.id) break;
    directLines.push(line);
  }
  const capacityXof = directLines.reduce(
    (sum, line) => sum + line.outstandingXof,
    0,
  );
  if (row.amountXof > capacityXof) {
    return {
      blocker: {
        code: "payment_exceeds_payable_balance",
        rowKey: key,
        message:
          "The payment exceeds the current payable amount and would create an unreviewed credit",
        details: { amountXof: row.amountXof, payableXof: capacityXof },
      },
    };
  }
  if (!invoice.plan || invoice.plan.installments.length === 0) {
    return {
      blocker: {
        code: "invoice_without_plan",
        rowKey: key,
        message:
          "Historical cash can be imported only into an invoice with installments",
        details: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      },
    };
  }
  const installmentDueXof = invoice.plan.installments.reduce(
    (sum, installment) => sum + installment.amountDue,
    0,
  );
  if (installmentDueXof !== invoice.totalAmount) {
    return {
      blocker: {
        code: "installment_due_total_mismatch",
        rowKey: key,
        message: "Installment amounts do not reconcile to the invoice total",
        details: {
          invoiceId: invoice.id,
          installmentDueXof,
          invoiceTotalXof: invoice.totalAmount,
        },
      },
    };
  }
  const invalidInstallment = invoice.plan.installments.find(
    (installment) =>
      installment.amountPaid < 0 ||
      installment.amountPaid > installment.amountDue,
  );
  if (invalidInstallment) {
    return {
      blocker: {
        code: "installment_balance_invalid",
        rowKey: key,
        message: "An installment contains an invalid existing cash balance",
        details: {
          invoiceId: invoice.id,
          installmentId: invalidInstallment.id,
        },
      },
    };
  }
  const installmentPaidXof = invoice.plan.installments.reduce(
    (sum, installment) => sum + installment.amountPaid,
    0,
  );
  if (installmentPaidXof !== invoice.amountPaid) {
    return {
      blocker: {
        code: "installment_paid_total_mismatch",
        rowKey: key,
        message:
          "Installment cash does not reconcile to the invoice cash total",
        details: {
          invoiceId: invoice.id,
          installmentPaidXof,
          invoicePaidXof: invoice.amountPaid,
        },
      },
    };
  }
  if (invoice.components.length === 0) {
    return {
      blocker: {
        code: "invoice_without_components",
        rowKey: key,
        message:
          "Historical cash can be imported only into a reconciled component ledger",
        details: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      },
    };
  }
  const componentTotal = invoice.components.reduce(
    (sum, component) => sum + component.amountXof,
    0,
  );
  if (componentTotal !== invoice.totalAmount) {
    return {
      blocker: {
        code: "component_total_mismatch",
        rowKey: key,
        message: "Invoice components do not reconcile to the invoice total",
        details: {
          invoiceId: invoice.id,
          componentTotal,
          invoiceTotal: invoice.totalAmount,
        },
      },
    };
  }
  const invalidComponent = invoice.components.find(
    (component) =>
      component.netAllocatedXof < 0 ||
      component.netAllocatedXof > component.amountXof,
  );
  if (invalidComponent) {
    return {
      blocker: {
        code: "component_balance_invalid",
        rowKey: key,
        message:
          "An invoice component contains an invalid existing cash balance",
        details: {
          invoiceId: invoice.id,
          invoiceComponentId: invalidComponent.id,
          amountXof: invalidComponent.amountXof,
          netAllocatedXof: invalidComponent.netAllocatedXof,
        },
      },
    };
  }
  const componentPaidXof = invoice.components.reduce(
    (sum, component) => sum + component.netAllocatedXof,
    0,
  );
  if (componentPaidXof !== invoice.amountPaid) {
    return {
      blocker: {
        code: "component_paid_total_mismatch",
        rowKey: key,
        message: "Component cash does not reconcile to the invoice cash total",
        details: {
          invoiceId: invoice.id,
          componentPaidXof,
          invoicePaidXof: invoice.amountPaid,
        },
      },
    };
  }
  const orderingBlocker = historicalOrderingBlocker(row, invoice);
  if (orderingBlocker) return { blocker: orderingBlocker };
  const componentCapacityXof = invoice.components.reduce(
    (sum, component) => sum + component.amountXof - component.netAllocatedXof,
    0,
  );
  if (row.amountXof > componentCapacityXof) {
    return {
      blocker: {
        code: "component_capacity_mismatch",
        rowKey: key,
        message:
          "Invoice components do not have enough remaining capacity for this payment",
        details: {
          invoiceId: invoice.id,
          amountXof: row.amountXof,
          componentCapacityXof,
        },
      },
    };
  }
  const componentSplit = allocateProportionallyXof(
    row.amountXof,
    invoice.components.map((component) => ({
      id: component.id,
      availableXof: component.amountXof - component.netAllocatedXof,
    })),
  );
  const componentById = new Map(
    invoice.components.map((component) => [component.id, component]),
  );

  let remaining = row.amountXof;
  const installmentAllocations: { installmentId: string; amountXof: number }[] =
    [];
  const installments = new Map(
    invoice.plan.installments.map((installment) => [
      installment.id,
      installment,
    ]),
  );
  for (const line of directLines) {
    if (remaining === 0) break;
    if (!line.installmentId) {
      return {
        blocker: {
          code: "unscheduled_payable_line",
          rowKey: key,
          message: "The payment would touch an unscheduled charge",
          details: { invoiceId: invoice.id },
        },
      };
    }
    const installment = installments.get(line.installmentId);
    if (!installment) continue;
    const amountXof = Math.min(line.outstandingXof, remaining);
    if (amountXof <= 0) continue;
    installmentAllocations.push({
      installmentId: installment.id,
      amountXof,
    });
    remaining -= amountXof;
  }
  if (remaining !== 0) {
    return {
      blocker: {
        code: "installment_capacity_mismatch",
        rowKey: key,
        message: "Installment allocations cannot reconcile the payment exactly",
        details: { remainingXof: remaining },
      },
    };
  }
  for (const allocation of installmentAllocations) {
    installments.get(allocation.installmentId)!.amountPaid +=
      allocation.amountXof;
  }
  for (const allocation of componentSplit) {
    componentById.get(allocation.id)!.netAllocatedXof += allocation.amountXof;
  }
  invoice.amountPaid += row.amountXof;
  invoice.status =
    invoice.amountPaid >= invoice.totalAmount ? "paid" : "partial";

  const sourceKey = historicalPaymentSourceKey(manifest, row);
  return {
    payment: {
      rowKey: key,
      sourceKey,
      providerRef: historicalPaymentProviderRef(sourceKey),
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      settledOn: row.settledOn,
      amountXof: row.amountXof,
      method: row.method,
      skippedAsExistingPaymentId: null,
      installmentAllocations,
      componentAllocations: componentSplit.map((allocation) => {
        const component = componentById.get(allocation.id)!;
        return {
          invoiceComponentId: allocation.id,
          kind: component.kind,
          costCenterCode: component.costCenterCode,
          amountXof: allocation.amountXof,
        };
      }),
    },
  };
}

export async function planHistoricalPaymentImport(
  db: ImportDb,
  manifest: HistoricalPaymentManifest,
  invocation: PaymentImportInvocation,
): Promise<HistoricalPaymentImportPlan> {
  const actor = await requireImportActor(db, invocation.actorEmail);
  const manifestSha256 = historicalPaymentManifestDigest(manifest);
  const excludedXof = manifest.excludedGroups.reduce(
    (sum, group) => sum + group.sourceAmountXof,
    0,
  );
  const existingBatch = await db.paymentImportBatch.findUnique({
    where: { sourceSha256: manifest.sourceWorkbook.sha256 },
  });
  if (existingBatch) {
    if (
      existingBatch.manifestSha256 !== manifestSha256 ||
      existingBatch.sourceExtractionSha256 !== manifest.sourceExtractionSha256
    ) {
      throw new HistoricalPaymentImportBlockedError(
        "This workbook hash already belongs to a different reviewed manifest",
        {
          batchId: existingBatch.id,
          existingManifestSha256: existingBatch.manifestSha256,
          receivedManifestSha256: manifestSha256,
        },
      );
    }
    if (existingBatch.status !== "imported") {
      throw new HistoricalPaymentImportBlockedError(
        "A non-complete import batch already owns this workbook hash",
        { batchId: existingBatch.id, status: existingBatch.status },
      );
    }
    return {
      actorId: actor.id,
      alreadyImportedBatchId: existingBatch.id,
      sourceSha256: manifest.sourceWorkbook.sha256,
      sourceExtractionSha256: manifest.sourceExtractionSha256,
      manifestSha256,
      sourceGroupCount: manifest.sourceGroupCount,
      sourceTotalXof: manifest.sourceTotalXof,
      manifestPaymentRows: manifest.rows.length,
      excludedSourceGroups: manifest.excludedGroups.length,
      rowsToImport: 0,
      rowsAlreadyRecorded:
        existingBatch.importedRows + existingBatch.alreadyRecordedRows,
      amountToImportXof: 0,
      amountAlreadyRecordedXof:
        Number(existingBatch.importedXof) +
        Number(existingBatch.alreadyRecordedXof),
      excludedXof: Number(existingBatch.excludedXof),
      blockers: [],
      warnings: [],
      payments: [],
    };
  }

  const blockers: PaymentImportBlocker[] = [];
  const warnings: PaymentImportWarning[] = [];
  const academicYear = await db.academicYear.findUnique({
    where: { label: manifest.academicYearLabel },
    select: { id: true, label: true, endsOn: true },
  });
  const bounds = academicYear
    ? plausiblePaymentBounds(academicYear.label, academicYear.endsOn)
    : null;
  if (!academicYear) {
    blockers.push({
      code: "academic_year_not_found",
      message: `Academic year ${manifest.academicYearLabel} does not exist`,
    });
  } else if (!bounds) {
    blockers.push({
      code: "academic_year_label_invalid",
      message:
        "Academic year label must contain two consecutive four-digit years",
    });
  }

  const today = toDakarDateKey(new Date());
  const authoritativeRows = manifest.rows.filter((row) => {
    const key = rowKey(row);
    if (!row.reviewed) {
      blockers.push({
        code: "row_not_reviewed",
        rowKey: key,
        message: "Every payment row must be explicitly reviewed",
      });
    }
    if (row.identity.status !== "authoritative") {
      blockers.push({
        code: `identity_${row.identity.status}`,
        rowKey: key,
        message: "Every payment must map to one authoritative student number",
      });
      return false;
    }
    if (
      bounds &&
      (row.settledOn < bounds.start ||
        row.settledOn > bounds.end ||
        row.settledOn > today)
    ) {
      blockers.push({
        code: "implausible_settlement_date",
        rowKey: key,
        message:
          "Settlement date falls outside the reviewed registration/payment window",
        details: {
          settledOn: row.settledOn,
          earliest: bounds.start,
          latest: [bounds.end, today].sort()[0],
        },
      });
    }
    return true;
  });

  const studentNos = [
    ...new Set(
      authoritativeRows.map((row) =>
        row.identity.status === "authoritative" ? row.identity.studentNo : "",
      ),
    ),
  ].filter(Boolean);
  const students = await db.student.findMany({
    where: { studentNo: { in: studentNos } },
    select: {
      id: true,
      studentNo: true,
      recordStatus: true,
      person: { select: { firstName: true, lastName: true } },
    },
  });
  const studentsByNo = new Map(
    students.map((student) => [student.studentNo, student]),
  );
  for (const row of authoritativeRows) {
    if (row.identity.status !== "authoritative") continue;
    const student = studentsByNo.get(row.identity.studentNo);
    if (!student) {
      blockers.push({
        code: "student_not_found",
        rowKey: rowKey(row),
        message: "The reviewed student number does not exist",
      });
    } else if (student.recordStatus !== "active") {
      blockers.push({
        code: "student_not_active",
        rowKey: rowKey(row),
        message: "The reviewed student account is archived",
      });
    }
  }

  for (const row of authoritativeRows) {
    if (row.identity.status !== "authoritative") continue;
    const student = studentsByNo.get(row.identity.studentNo);
    if (!student) continue;
    const rosterName = normalizePaymentIdentityName(
      `${student.person.firstName} ${student.person.lastName}`,
    );
    const sourceName = normalizePaymentIdentityName(row.sourceStudentName);
    if (rosterName !== sourceName) {
      warnings.push({
        code: "reviewed_name_difference",
        rowKey: rowKey(row),
        message:
          "The workbook name differs from the SIS name; the explicit reviewed student number remains authoritative",
      });
    }
  }

  const studentIds = students.map((student) => student.id);
  const [invoiceRecords, existingPayments, providerConflicts] =
    await Promise.all([
      db.invoice.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          term: { select: { academicYear: { select: { label: true } } } },
          plan: {
            include: {
              installments: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
            },
          },
          components: {
            orderBy: { id: "asc" },
            include: {
              allocations: {
                select: { amountXof: true, refundedAmountXof: true },
              },
            },
          },
          payments: {
            select: {
              id: true,
              status: true,
              settledAt: true,
              providerRef: true,
              ipnPayload: true,
            },
          },
        },
      }),
      db.payment.findMany({
        where: {
          studentId: { in: studentIds },
          status: { in: ["success", "refund_pending", "refunded"] },
        },
        select: {
          id: true,
          invoiceId: true,
          studentId: true,
          amount: true,
          status: true,
          settledAt: true,
          providerRef: true,
          ipnPayload: true,
          submission: { select: { bankReference: true } },
        },
      }),
      db.payment.findMany({
        where: {
          providerRef: {
            in: manifest.rows.map((row) =>
              historicalPaymentProviderRef(
                historicalPaymentSourceKey(manifest, row),
              ),
            ),
          },
        },
        select: { id: true, providerRef: true },
      }),
    ]);
  const providerConflictRefs = new Map(
    providerConflicts.map((payment) => [payment.providerRef, payment.id]),
  );
  const invoicesByStudent = new Map<string, SimulatedInvoice[]>();
  for (const invoice of invoiceRecords) {
    const invoices = invoicesByStudent.get(invoice.studentId) ?? [];
    invoices.push(cloneInvoice(invoice));
    invoicesByStudent.set(invoice.studentId, invoices);
  }

  const payments: PlannedHistoricalPayment[] = [];
  const consumedExistingPaymentIds = new Set<string>();
  const sortedRows = [...authoritativeRows].sort(
    (left, right) =>
      left.settledOn.localeCompare(right.settledOn) ||
      left.sourceSheet.localeCompare(right.sourceSheet) ||
      Math.min(...left.sourceRowNumbers) -
        Math.min(...right.sourceRowNumbers) ||
      rowKey(left).localeCompare(rowKey(right)),
  );
  for (const row of sortedRows) {
    if (row.identity.status !== "authoritative") continue;
    const student = studentsByNo.get(row.identity.studentNo);
    if (!student || student.recordStatus !== "active") continue;
    const key = rowKey(row);
    const sourceKey = historicalPaymentSourceKey(manifest, row);
    const providerRef = historicalPaymentProviderRef(sourceKey);
    const conflictId = providerConflictRefs.get(providerRef);
    if (conflictId) {
      blockers.push({
        code: "source_row_already_owned",
        rowKey: key,
        message:
          "A payment already owns this source row but no completed batch owns the workbook",
        details: { paymentId: conflictId },
      });
      continue;
    }
    const candidates = existingPayments.filter((payment) =>
      isExistingPaymentCandidate(row, payment, student.id),
    );
    const decisionProblem = existingDecisionBlocker(row, candidates);
    if (decisionProblem) {
      blockers.push(decisionProblem);
      continue;
    }
    if (row.existingPaymentDecision?.decision === "already_recorded") {
      if (
        consumedExistingPaymentIds.has(row.existingPaymentDecision.paymentId)
      ) {
        blockers.push({
          code: "existing_payment_reused",
          rowKey: key,
          message:
            "One existing ledger payment cannot satisfy two workbook rows",
          details: { paymentId: row.existingPaymentDecision.paymentId },
        });
        continue;
      }
      consumedExistingPaymentIds.add(row.existingPaymentDecision.paymentId);
      payments.push({
        rowKey: key,
        sourceKey,
        providerRef,
        studentId: student.id,
        invoiceId: "",
        invoiceNumber: null,
        settledOn: row.settledOn,
        amountXof: row.amountXof,
        method: row.method,
        skippedAsExistingPaymentId: row.existingPaymentDecision.paymentId,
        installmentAllocations: [],
        componentAllocations: [],
        manifestRow: row,
      });
      continue;
    }
    const simulation = simulatePayment(
      invoicesByStudent.get(student.id) ?? [],
      row,
      manifest,
    );
    if ("blocker" in simulation) {
      blockers.push(simulation.blocker);
      continue;
    }
    payments.push({
      ...simulation.payment,
      studentId: student.id,
      manifestRow: row,
    });
  }

  const importable = payments.filter(
    (payment) => !payment.skippedAsExistingPaymentId,
  );
  const skipped = payments.filter(
    (payment) => payment.skippedAsExistingPaymentId,
  );
  return {
    actorId: actor.id,
    alreadyImportedBatchId: null,
    sourceSha256: manifest.sourceWorkbook.sha256,
    sourceExtractionSha256: manifest.sourceExtractionSha256,
    manifestSha256,
    sourceGroupCount: manifest.sourceGroupCount,
    sourceTotalXof: manifest.sourceTotalXof,
    manifestPaymentRows: manifest.rows.length,
    excludedSourceGroups: manifest.excludedGroups.length,
    rowsToImport: importable.length,
    rowsAlreadyRecorded: skipped.length,
    amountToImportXof: importable.reduce(
      (sum, payment) => sum + payment.amountXof,
      0,
    ),
    amountAlreadyRecordedXof: skipped.reduce(
      (sum, payment) => sum + payment.amountXof,
      0,
    ),
    excludedXof,
    blockers,
    warnings,
    payments,
  };
}

function assertCleanPlan(plan: HistoricalPaymentImportPlan): void {
  if (plan.blockers.length > 0) {
    throw new HistoricalPaymentImportBlockedError(
      "Historical payment import has unresolved blockers",
      {
        blockerCount: plan.blockers.length,
        blockers: plan.blockers.slice(0, 200),
      },
    );
  }
  if (
    plan.rowsToImport + plan.rowsAlreadyRecorded !==
    plan.manifestPaymentRows
  ) {
    throw new HistoricalPaymentImportBlockedError(
      "Not every reviewed manifest row has an accounting disposition",
      {
        manifestPaymentRows: plan.manifestPaymentRows,
        rowsToImport: plan.rowsToImport,
        rowsAlreadyRecorded: plan.rowsAlreadyRecorded,
      },
    );
  }
  if (
    plan.amountToImportXof +
      plan.amountAlreadyRecordedXof +
      plan.excludedXof !==
    plan.sourceTotalXof
  ) {
    throw new HistoricalPaymentImportBlockedError(
      "Manifest accounting amounts do not reconcile to the workbook control total",
      {
        sourceTotalXof: plan.sourceTotalXof,
        amountToImportXof: plan.amountToImportXof,
        amountAlreadyRecordedXof: plan.amountAlreadyRecordedXof,
        excludedXof: plan.excludedXof,
      },
    );
  }
  const importablePayments = plan.payments.filter(
    (payment) => !payment.skippedAsExistingPaymentId,
  );
  const alreadyRecordedPayments = plan.payments.filter(
    (payment) => payment.skippedAsExistingPaymentId,
  );
  if (
    importablePayments.length !== plan.rowsToImport ||
    alreadyRecordedPayments.length !== plan.rowsAlreadyRecorded ||
    importablePayments.reduce((sum, payment) => sum + payment.amountXof, 0) !==
      plan.amountToImportXof ||
    alreadyRecordedPayments.reduce(
      (sum, payment) => sum + payment.amountXof,
      0,
    ) !== plan.amountAlreadyRecordedXof
  ) {
    throw new HistoricalPaymentImportBlockedError(
      "Planned payment rows do not reconcile to the batch counters",
      {},
    );
  }
}

export async function executeHistoricalPaymentImport(
  prisma: PrismaClient,
  manifest: HistoricalPaymentManifest,
  invocation: PaymentImportInvocation,
): Promise<HistoricalPaymentImportResult> {
  return prisma.$transaction(
    async (tx) => {
      const plan = await planHistoricalPaymentImport(tx, manifest, invocation);
      if (plan.alreadyImportedBatchId) {
        return {
          batchId: plan.alreadyImportedBatchId,
          alreadyImported: true,
          importedRows: 0,
          skippedRows: plan.rowsAlreadyRecorded,
          importedXof: 0,
        };
      }
      assertCleanPlan(plan);

      const batch = await tx.paymentImportBatch.create({
        data: {
          sourceFileName: manifest.sourceWorkbook.fileName,
          sourceSha256: manifest.sourceWorkbook.sha256,
          sourceExtractionSha256: plan.sourceExtractionSha256,
          manifestSha256: plan.manifestSha256,
          status: "pending",
          academicYear: manifest.academicYearLabel,
          sourceGroupCount: plan.sourceGroupCount,
          totalRows: manifest.rows.length,
          alreadyRecordedRows: plan.rowsAlreadyRecorded,
          excludedSourceGroups: plan.excludedSourceGroups,
          skippedRows: plan.rowsAlreadyRecorded,
          sourceTotalXof: BigInt(manifest.sourceTotalXof),
          alreadyRecordedXof: BigInt(plan.amountAlreadyRecordedXof),
          excludedXof: BigInt(plan.excludedXof),
          note: "Reviewed historical import; payer notifications suppressed",
          createdById: plan.actorId,
        },
      });

      const importable = plan.payments.filter(
        (payment) => !payment.skippedAsExistingPaymentId,
      );
      for (const planned of importable) {
        const row = planned.manifestRow;
        const paymentId = randomUUID();
        await tx.payment.create({
          data: {
            id: paymentId,
            invoiceId: planned.invoiceId,
            studentId: planned.studentId,
            amount: planned.amountXof,
            method: planned.method,
            status: "success",
            provider: "historical_import",
            providerRef: planned.providerRef,
            externalReferenceFingerprintSha256:
              externalReferenceFingerprintSha256(
                planned.method,
                row.externalReference,
              ),
            source: "historical_workbook",
            settledAt: historicalSettlementTimestamp(planned.settledOn),
            importBatchId: batch.id,
            importRowKey: planned.rowKey,
            importSheetName: row.sourceSheet,
            importRowNumber: Math.min(...row.sourceRowNumbers),
            ipnPayload: {
              sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
              sourceExtractionSha256: plan.sourceExtractionSha256,
              manifestSha256: plan.manifestSha256,
              sourceGroupKey: row.sourceGroupKey,
              allocationKey: row.allocationKey,
              sourceRows: row.sourceRowNumbers,
              sourceSettledOn: row.sourceSettledOn,
              settledOn: row.settledOn,
              dateCorrected: row.sourceSettledOn !== row.settledOn,
              sourceMethodSha256: sha256(row.sourceMethod),
              mappedMethod: row.method,
              externalReferenceSha256: row.externalReference
                ? sha256(
                    normalizeExternalReference(row.externalReference) ?? "",
                  )
                : null,
              notificationPolicy: "suppress",
            },
          },
        });
        if (planned.installmentAllocations.length > 0) {
          await tx.paymentAllocation.createMany({
            data: planned.installmentAllocations.map((allocation) => ({
              paymentId,
              installmentId: allocation.installmentId,
              amount: allocation.amountXof,
            })),
          });
        }
        for (const allocation of planned.installmentAllocations) {
          const installment = await tx.installment.findUniqueOrThrow({
            where: { id: allocation.installmentId },
          });
          const amountPaid = installment.amountPaid + allocation.amountXof;
          await tx.installment.update({
            where: { id: installment.id },
            data: {
              amountPaid,
              status: projectedInstallmentStatus({
                dueDate: installment.dueDate,
                amountDue: installment.amountDue,
                amountPaid,
              }),
            },
          });
        }
        if (planned.componentAllocations.length > 0) {
          await tx.paymentComponentAllocation.createMany({
            data: planned.componentAllocations.map((allocation) => ({
              paymentId,
              invoiceComponentId: allocation.invoiceComponentId,
              amountXof: allocation.amountXof,
            })),
          });
        }
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: planned.invoiceId },
        });
        const amountPaid = invoice.amountPaid + planned.amountXof;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid,
            revision: { increment: 1 },
            status: amountPaid >= invoice.totalAmount ? "paid" : "partial",
          },
        });
        await tx.auditLog.create({
          data: {
            entity: "Payment",
            entityId: paymentId,
            action: "historical-workbook-imported",
            actorId: plan.actorId,
            data: {
              importBatchId: batch.id,
              sourceSha256: manifest.sourceWorkbook.sha256,
              sourceExtractionSha256: plan.sourceExtractionSha256,
              manifestSha256: plan.manifestSha256,
              sourceRowKey: planned.rowKey,
              invoiceId: planned.invoiceId,
              amountXof: planned.amountXof,
              settledOn: planned.settledOn,
              method: planned.method,
              notificationPolicy: "suppress",
            },
          },
        });
      }

      const importedXof = importable.reduce(
        (sum, payment) => sum + payment.amountXof,
        0,
      );
      const completed = await tx.paymentImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "imported",
          importedRows: importable.length,
          importedXof: BigInt(importedXof),
          importedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "PaymentImportBatch",
          entityId: completed.id,
          action: "historical-payments-imported",
          actorId: plan.actorId,
          data: {
            sourceSha256: manifest.sourceWorkbook.sha256,
            sourceExtractionSha256: plan.sourceExtractionSha256,
            manifestSha256: plan.manifestSha256,
            academicYear: manifest.academicYearLabel,
            sourceGroupCount: manifest.sourceGroupCount,
            sourceTotalXof: manifest.sourceTotalXof,
            manifestPaymentRows: manifest.rows.length,
            importedRows: importable.length,
            importedXof,
            existingRowsSkipped: plan.rowsAlreadyRecorded,
            excludedSourceGroups: manifest.excludedGroups.length,
            notificationPolicy: "suppress",
          },
        },
      });
      return {
        batchId: completed.id,
        alreadyImported: false,
        importedRows: importable.length,
        skippedRows: completed.skippedRows,
        importedXof,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

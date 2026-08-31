import { createHash } from "node:crypto";
import { z } from "zod";
import { allocateProportionallyXof } from "./component-allocation.js";
import {
  PaymentBalanceImportManifestSchema,
  paymentBalanceManifestDigest,
  type PaymentBalanceIdentityDecision,
  type PaymentBalanceImportManifest,
  type PaymentBalanceImportRow,
} from "./payment-balance-import.manifest.js";

const MAX_XOF_TOTAL = Number.MAX_SAFE_INTEGER;
const IdSchema = z.string().trim().min(1).max(240);
const WholeXofSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_XOF_TOTAL)
  .refine(Number.isSafeInteger, "Expected a safe whole-XOF value");
const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");

const LiveInstallmentSchema = z
  .object({
    id: IdSchema,
    sequence: z.number().int().min(1),
    dueOn: DateOnlySchema,
    amountDueXof: WholeXofSchema,
    ledgerPaidXof: WholeXofSchema,
  })
  .strict();

const LiveComponentSchema = z
  .object({
    id: IdSchema,
    amountXof: WholeXofSchema,
    ledgerPaidXof: WholeXofSchema,
  })
  .strict();

const LivePaymentSchema = z
  .object({
    id: IdSchema,
    amountXof: WholeXofSchema,
    status: z.enum(["success", "refund_pending", "refunded"]),
    providerRef: z.string().trim().min(1).max(500),
    refundedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const LiveInvoiceSchema = z
  .object({
    id: IdSchema,
    number: z.string().trim().min(1).max(240).nullable(),
    revision: z.number().int().min(0),
    status: z.enum(["open", "partial", "paid", "void"]),
    packageType: z.literal("standard_full"),
    academicYearLabel: z.string().trim().min(4).max(64),
    totalAmountXof: WholeXofSchema,
    ledgerPaidXof: WholeXofSchema,
    installments: z.array(LiveInstallmentSchema).max(100),
    components: z.array(LiveComponentSchema).max(100),
    payments: z.array(LivePaymentSchema).max(10_000),
    inFlightProofSubmissionIds: z.array(IdSchema).max(10_000),
    inFlightPiSpiRequestIds: z.array(IdSchema).max(10_000),
  })
  .strict();

const LiveStudentSchema = z
  .object({
    id: IdSchema,
    studentNo: z.string().trim().min(2).max(64),
    recordStatus: z.enum(["pending_payment", "active", "archived"]),
    invoices: z.array(LiveInvoiceSchema).max(100),
  })
  .strict();

export const PaymentBalanceLiveSnapshotSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    students: z.array(LiveStudentSchema).max(50_000),
  })
  .strict();

export type PaymentBalanceLiveSnapshot = z.infer<
  typeof PaymentBalanceLiveSnapshotSchema
>;
export type PaymentBalanceLiveInvoice = z.infer<typeof LiveInvoiceSchema>;

export type PaymentBalanceHoldCode =
  | "reviewed_unmatched_student"
  | "reviewed_ambiguous_student"
  | "reviewed_duplicate_student_claim"
  | "live_student_not_found"
  | "live_student_claim_not_unique"
  | "student_archived"
  | "live_invoice_not_found"
  | "multiple_live_invoices"
  | "invoice_has_in_flight_payment"
  | "invoice_has_refund_activity"
  | "target_below_ledger"
  | "target_exceeds_invoice_total"
  | "invoice_installment_mismatch"
  | "invoice_component_mismatch";

interface PaymentBalancePlanRowBase {
  sourceRowKey: string;
  sourceTargetPaidXof: number;
  identityDecision: PaymentBalanceIdentityDecision;
}

export interface PaymentBalanceInstallmentAllocation {
  installmentId: string;
  amountXof: number;
}

export interface PaymentBalanceComponentAllocation {
  invoiceComponentId: string;
  amountXof: number;
}

export interface PaymentBalancePostableRow extends PaymentBalancePlanRowBase {
  disposition: "post_delta";
  studentId: string;
  studentNo: string;
  invoiceId: string;
  invoiceNumber: string | null;
  expectedInvoiceRevision: number;
  expectedLedgerPaidXof: number;
  deltaXof: number;
  installmentAllocations: PaymentBalanceInstallmentAllocation[];
  componentAllocations: PaymentBalanceComponentAllocation[];
}

export interface PaymentBalanceAlreadyReconciledRow extends PaymentBalancePlanRowBase {
  disposition: "already_reconciled";
  studentId: string;
  studentNo: string;
  invoiceId: string;
  invoiceNumber: string | null;
  expectedInvoiceRevision: number;
  expectedLedgerPaidXof: number;
}

export interface PaymentBalanceHeldRow extends PaymentBalancePlanRowBase {
  disposition: "held";
  code: PaymentBalanceHoldCode;
  message: string;
  /** True only for a hold explicitly reviewed and recorded in the manifest. */
  reviewedHold: boolean;
  details?: Record<string, unknown>;
}

export type PaymentBalancePlanRow =
  | PaymentBalancePostableRow
  | PaymentBalanceAlreadyReconciledRow
  | PaymentBalanceHeldRow;

export interface PaymentBalanceControlTotals {
  sourcePaidTotalXof: number;
  matchedPreExistingCashXof: number;
  postableDeltaXof: number;
  heldSourceTargetXof: number;
  accountedSourcePaidXof: number;
  reconciles: true;
  sourceRows: number;
  postableRows: number;
  alreadyReconciledRows: number;
  heldRows: number;
}

export interface PaymentBalanceImportPlan {
  sourceWorkbookSha256: string;
  trustedExtractionSha256: string;
  manifestSha256: string;
  /** Hash of the reviewed manifest plus every relevant live ledger value. */
  planSha256: string;
  capturedAt: string;
  rows: PaymentBalancePlanRow[];
  postableRows: PaymentBalancePostableRow[];
  alreadyReconciledRows: PaymentBalanceAlreadyReconciledRow[];
  heldRows: PaymentBalanceHeldRow[];
  controlTotals: PaymentBalanceControlTotals;
}

interface InvoiceReview {
  valid: boolean;
  code?: "invoice_installment_mismatch" | "invoice_component_mismatch";
  message?: string;
  details?: Record<string, unknown>;
}

interface RowPlanResult {
  row: PaymentBalancePlanRow;
  liveAnchor: unknown;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sumXof(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error("Payment balance plan exceeds safe whole-XOF controls");
  }
  return total;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedStudentNo(studentNo: string): string {
  return studentNo.normalize("NFKC").trim().toUpperCase();
}

function invoiceAnchor(invoice: PaymentBalanceLiveInvoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    revision: invoice.revision,
    status: invoice.status,
    packageType: invoice.packageType,
    academicYearLabel: invoice.academicYearLabel,
    totalAmountXof: invoice.totalAmountXof,
    ledgerPaidXof: invoice.ledgerPaidXof,
    installments: [...invoice.installments]
      .sort(
        (left, right) =>
          compareText(left.dueOn, right.dueOn) ||
          left.sequence - right.sequence ||
          compareText(left.id, right.id),
      )
      .map((installment) => ({ ...installment })),
    components: [...invoice.components]
      .sort((left, right) => compareText(left.id, right.id))
      .map((component) => ({ ...component })),
    payments: [...invoice.payments].sort((left, right) =>
      compareText(left.id, right.id),
    ),
    inFlightProofSubmissionIds: [...invoice.inFlightProofSubmissionIds].sort(
      compareText,
    ),
    inFlightPiSpiRequestIds: [...invoice.inFlightPiSpiRequestIds].sort(
      compareText,
    ),
  };
}

function reviewInvoice(invoice: PaymentBalanceLiveInvoice): InvoiceReview {
  const installmentIds = new Set(
    invoice.installments.map((installment) => installment.id),
  );
  const installmentSequences = new Set(
    invoice.installments.map((installment) => installment.sequence),
  );
  const installmentDueXof = sumXof(
    invoice.installments.map((installment) => installment.amountDueXof),
  );
  const installmentPaidXof = sumXof(
    invoice.installments.map((installment) => installment.ledgerPaidXof),
  );
  const installmentOutOfBounds = invoice.installments.some(
    (installment) => installment.ledgerPaidXof > installment.amountDueXof,
  );
  if (
    invoice.installments.length === 0 ||
    installmentIds.size !== invoice.installments.length ||
    installmentSequences.size !== invoice.installments.length ||
    installmentDueXof !== invoice.totalAmountXof ||
    installmentPaidXof !== invoice.ledgerPaidXof ||
    installmentOutOfBounds
  ) {
    return {
      valid: false,
      code: "invoice_installment_mismatch",
      message:
        "The live invoice installments do not reconcile to invoice total and paid cash",
      details: {
        invoiceId: invoice.id,
        invoiceTotalXof: invoice.totalAmountXof,
        invoiceLedgerPaidXof: invoice.ledgerPaidXof,
        installmentDueXof,
        installmentPaidXof,
      },
    };
  }

  const componentIds = new Set(
    invoice.components.map((component) => component.id),
  );
  const componentTotalXof = sumXof(
    invoice.components.map((component) => component.amountXof),
  );
  const componentPaidXof = sumXof(
    invoice.components.map((component) => component.ledgerPaidXof),
  );
  const componentOutOfBounds = invoice.components.some(
    (component) => component.ledgerPaidXof > component.amountXof,
  );
  if (
    invoice.components.length === 0 ||
    componentIds.size !== invoice.components.length ||
    componentTotalXof !== invoice.totalAmountXof ||
    componentPaidXof !== invoice.ledgerPaidXof ||
    componentOutOfBounds
  ) {
    return {
      valid: false,
      code: "invoice_component_mismatch",
      message:
        "The live invoice components do not reconcile to invoice total and paid cash",
      details: {
        invoiceId: invoice.id,
        invoiceTotalXof: invoice.totalAmountXof,
        invoiceLedgerPaidXof: invoice.ledgerPaidXof,
        componentTotalXof,
        componentPaidXof,
      },
    };
  }
  return { valid: true };
}

function held(
  source: PaymentBalanceImportRow,
  code: PaymentBalanceHoldCode,
  message: string,
  reviewedHold: boolean,
  details?: Record<string, unknown>,
): PaymentBalanceHeldRow {
  return {
    disposition: "held",
    sourceRowKey: source.sourceRowKey,
    sourceTargetPaidXof: source.amountPaidXof,
    identityDecision: source.identity,
    code,
    message,
    reviewedHold,
    ...(details ? { details } : {}),
  };
}

function reviewedIdentityHold(source: PaymentBalanceImportRow): RowPlanResult {
  switch (source.identity.decision) {
    case "hold_unmatched":
      return {
        row: held(
          source,
          "reviewed_unmatched_student",
          "The source row remains held by its reviewed unmatched-student decision",
          true,
        ),
        liveAnchor: { identityDisposition: source.identity.decision },
      };
    case "hold_ambiguous":
      return {
        row: held(
          source,
          "reviewed_ambiguous_student",
          "The source row remains held by its reviewed ambiguous-student decision",
          true,
          {
            candidateStudentNos: [...source.identity.candidateStudentNos].sort(
              compareText,
            ),
          },
        ),
        liveAnchor: { identityDisposition: source.identity.decision },
      };
    case "hold_duplicate_claim":
      return {
        row: held(
          source,
          "reviewed_duplicate_student_claim",
          "The source row remains held as a reviewed duplicate student claim",
          true,
          {
            claimedStudentNo: source.identity.claimedStudentNo,
            canonicalSourceRowKey: source.identity.canonicalSourceRowKey,
          },
        ),
        liveAnchor: { identityDisposition: source.identity.decision },
      };
    case "exact_match":
      throw new Error("Exact matches are not reviewed identity holds");
  }
}

function planInstallments(
  invoice: PaymentBalanceLiveInvoice,
  deltaXof: number,
): PaymentBalanceInstallmentAllocation[] {
  let remainingXof = deltaXof;
  const allocations: PaymentBalanceInstallmentAllocation[] = [];
  for (const installment of [...invoice.installments].sort(
    (left, right) =>
      compareText(left.dueOn, right.dueOn) ||
      left.sequence - right.sequence ||
      compareText(left.id, right.id),
  )) {
    if (remainingXof === 0) break;
    const availableXof = installment.amountDueXof - installment.ledgerPaidXof;
    const amountXof = Math.min(availableXof, remainingXof);
    if (amountXof <= 0) continue;
    allocations.push({ installmentId: installment.id, amountXof });
    remainingXof -= amountXof;
  }
  if (remainingXof !== 0) {
    throw new Error("Reconciled installments cannot absorb the postable delta");
  }
  return allocations;
}

function planExactMatch(
  source: PaymentBalanceImportRow,
  students: readonly z.infer<typeof LiveStudentSchema>[],
  academicYearLabel: string,
): RowPlanResult {
  if (source.identity.decision !== "exact_match") {
    return reviewedIdentityHold(source);
  }
  const studentNo = source.identity.studentNo;
  const matches = students
    .filter((student) => normalizedStudentNo(student.studentNo) === studentNo)
    .sort((left, right) => compareText(left.id, right.id));
  if (matches.length === 0) {
    return {
      row: held(
        source,
        "live_student_not_found",
        "The reviewed exact student number does not exist in the live snapshot",
        false,
        { studentNo },
      ),
      liveAnchor: { studentNo, matches: [] },
    };
  }
  if (matches.length !== 1) {
    return {
      row: held(
        source,
        "live_student_claim_not_unique",
        "The reviewed exact student number is not unique in the live snapshot",
        false,
        { studentNo, studentIds: matches.map((student) => student.id) },
      ),
      liveAnchor: {
        studentNo,
        matches: matches.map((student) => ({ id: student.id })),
      },
    };
  }

  const student = matches[0]!;
  if (student.recordStatus === "archived") {
    return {
      row: held(
        source,
        "student_archived",
        "The reviewed student record is archived",
        false,
        { studentId: student.id },
      ),
      liveAnchor: {
        student: {
          id: student.id,
          studentNo: normalizedStudentNo(student.studentNo),
          recordStatus: student.recordStatus,
        },
      },
    };
  }
  const liveInvoices = student.invoices
    .filter(
      (invoice) =>
        invoice.status !== "void" &&
        invoice.totalAmountXof > 0 &&
        invoice.packageType === "standard_full" &&
        invoice.academicYearLabel === academicYearLabel,
    )
    .sort((left, right) => compareText(left.id, right.id));
  const baseAnchor = {
    student: {
      id: student.id,
      studentNo: normalizedStudentNo(student.studentNo),
      recordStatus: student.recordStatus,
    },
    liveInvoices: liveInvoices.map(invoiceAnchor),
  };
  if (liveInvoices.length === 0) {
    return {
      row: held(
        source,
        "live_invoice_not_found",
        "The reviewed student does not have one live positive invoice",
        false,
        { studentId: student.id },
      ),
      liveAnchor: baseAnchor,
    };
  }
  if (liveInvoices.length !== 1) {
    return {
      row: held(
        source,
        "multiple_live_invoices",
        "The reviewed student has more than one live positive invoice",
        false,
        {
          studentId: student.id,
          invoiceIds: liveInvoices.map((invoice) => invoice.id),
        },
      ),
      liveAnchor: baseAnchor,
    };
  }

  const invoice = liveInvoices[0]!;
  const inFlightIds = [
    ...invoice.inFlightProofSubmissionIds,
    ...invoice.inFlightPiSpiRequestIds,
  ].sort(compareText);
  if (inFlightIds.length > 0) {
    return {
      row: held(
        source,
        "invoice_has_in_flight_payment",
        "The target invoice has an in-flight payment that could change the paid ledger",
        false,
        { invoiceId: invoice.id, inFlightIds },
      ),
      liveAnchor: baseAnchor,
    };
  }
  const refundPaymentIds = invoice.payments
    .filter((payment) => payment.status !== "success")
    .map((payment) => payment.id)
    .sort(compareText);
  if (refundPaymentIds.length > 0) {
    return {
      row: held(
        source,
        "invoice_has_refund_activity",
        "The target invoice contains refund activity that cannot be reconstructed from a paid-to-date snapshot",
        false,
        { invoiceId: invoice.id, refundPaymentIds },
      ),
      liveAnchor: baseAnchor,
    };
  }
  const invoiceReview = reviewInvoice(invoice);
  if (!invoiceReview.valid) {
    return {
      row: held(
        source,
        invoiceReview.code!,
        invoiceReview.message!,
        false,
        invoiceReview.details,
      ),
      liveAnchor: baseAnchor,
    };
  }
  if (source.amountPaidXof < invoice.ledgerPaidXof) {
    return {
      row: held(
        source,
        "target_below_ledger",
        "Workbook Amount Paid is below the live paid ledger; cash is never removed automatically",
        false,
        {
          invoiceId: invoice.id,
          targetPaidXof: source.amountPaidXof,
          ledgerPaidXof: invoice.ledgerPaidXof,
        },
      ),
      liveAnchor: baseAnchor,
    };
  }
  if (source.amountPaidXof > invoice.totalAmountXof) {
    return {
      row: held(
        source,
        "target_exceeds_invoice_total",
        "Workbook Amount Paid exceeds the live invoice total",
        false,
        {
          invoiceId: invoice.id,
          targetPaidXof: source.amountPaidXof,
          invoiceTotalXof: invoice.totalAmountXof,
        },
      ),
      liveAnchor: baseAnchor,
    };
  }

  const base = {
    sourceRowKey: source.sourceRowKey,
    sourceTargetPaidXof: source.amountPaidXof,
    identityDecision: source.identity,
    studentId: student.id,
    studentNo,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    expectedInvoiceRevision: invoice.revision,
    expectedLedgerPaidXof: invoice.ledgerPaidXof,
  };
  const deltaXof = source.amountPaidXof - invoice.ledgerPaidXof;
  if (deltaXof === 0) {
    return {
      row: { disposition: "already_reconciled", ...base },
      liveAnchor: baseAnchor,
    };
  }

  const installmentAllocations = planInstallments(invoice, deltaXof);
  const componentAllocations = allocateProportionallyXof(
    deltaXof,
    invoice.components.map((component) => ({
      id: component.id,
      availableXof: component.amountXof - component.ledgerPaidXof,
    })),
  ).map((allocation) => ({
    invoiceComponentId: allocation.id,
    amountXof: allocation.amountXof,
  }));
  return {
    row: {
      disposition: "post_delta",
      ...base,
      deltaXof,
      installmentAllocations,
      componentAllocations,
    },
    liveAnchor: baseAnchor,
  };
}

/**
 * Reconcile reviewed workbook Amount Paid targets against an immutable live snapshot.
 * This function performs no reads or writes and never resolves identity by name.
 */
export function planPaymentBalanceImport(
  manifestInput: PaymentBalanceImportManifest,
  snapshotInput: PaymentBalanceLiveSnapshot,
): PaymentBalanceImportPlan {
  const manifest = PaymentBalanceImportManifestSchema.parse(manifestInput);
  const snapshot = PaymentBalanceLiveSnapshotSchema.parse(snapshotInput);
  const manifestSha256 = paymentBalanceManifestDigest(manifest);
  const planned = [...manifest.rows]
    .sort((left, right) => compareText(left.sourceRowKey, right.sourceRowKey))
    .map((row) =>
      planExactMatch(row, snapshot.students, manifest.academicYearLabel),
    );
  const rows = planned.map((result) => result.row);
  const postableRows = rows.filter(
    (row): row is PaymentBalancePostableRow => row.disposition === "post_delta",
  );
  const alreadyReconciledRows = rows.filter(
    (row): row is PaymentBalanceAlreadyReconciledRow =>
      row.disposition === "already_reconciled",
  );
  const heldRows = rows.filter(
    (row): row is PaymentBalanceHeldRow => row.disposition === "held",
  );

  const matchedPreExistingCashXof = sumXof([
    ...postableRows.map((row) => row.expectedLedgerPaidXof),
    ...alreadyReconciledRows.map((row) => row.expectedLedgerPaidXof),
  ]);
  const postableDeltaXof = sumXof(postableRows.map((row) => row.deltaXof));
  const heldSourceTargetXof = sumXof(
    heldRows.map((row) => row.sourceTargetPaidXof),
  );
  const accountedSourcePaidXof = sumXof([
    matchedPreExistingCashXof,
    postableDeltaXof,
    heldSourceTargetXof,
  ]);
  if (accountedSourcePaidXof !== manifest.sourcePaidTotalXof) {
    throw new Error(
      "Payment balance plan failed its source Amount Paid control total",
    );
  }
  if (
    postableRows.length + alreadyReconciledRows.length + heldRows.length !==
    manifest.sourceRowCount
  ) {
    throw new Error("Payment balance plan failed its source row control total");
  }

  const planAnchor = {
    schemaVersion: 1,
    manifestSha256,
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: manifest.trustedExtraction.sha256,
    rows: planned.map((result) => ({
      disposition: result.row,
      liveState: result.liveAnchor,
    })),
  };
  const planSha256 = createHash("sha256")
    .update(canonicalJson(planAnchor))
    .digest("hex");

  return {
    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
    trustedExtractionSha256: manifest.trustedExtraction.sha256,
    manifestSha256,
    planSha256,
    capturedAt: snapshot.capturedAt,
    rows,
    postableRows,
    alreadyReconciledRows,
    heldRows,
    controlTotals: {
      sourcePaidTotalXof: manifest.sourcePaidTotalXof,
      matchedPreExistingCashXof,
      postableDeltaXof,
      heldSourceTargetXof,
      accountedSourcePaidXof,
      reconciles: true,
      sourceRows: manifest.sourceRowCount,
      postableRows: postableRows.length,
      alreadyReconciledRows: alreadyReconciledRows.length,
      heldRows: heldRows.length,
    },
  };
}

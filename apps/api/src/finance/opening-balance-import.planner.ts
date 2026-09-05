import {
  type OpeningBalanceManifest,
  type OpeningBalanceManifestRow,
  openingBalanceProviderRef,
} from "./opening-balance-import.manifest.js";

export type OpeningBalanceBlockerCode =
  | "identity_missing"
  | "identity_ambiguous"
  | "student_not_found"
  | "student_archived"
  | "no_live_invoice"
  | "no_payment_plan"
  | "exceeds_invoice_total"
  | "possible_duplicate"
  | "decision_targets_unknown_payment"
  | "decision_payment_claimed_twice";

export interface OpeningBalanceBlocker {
  code: OpeningBalanceBlockerCode;
  rowKey: string | null;
  subject: string;
  detail: string;
}

export interface ExistingPaymentSnapshot {
  id: string;
  amountXof: number;
  settledAt: string | null;
  method: string;
}

export interface OpeningBalanceInstallment {
  id: string;
  sequence: number;
  amountDue: number;
  amountPaid: number;
}

export interface OpeningBalanceInvoice {
  id: string;
  totalAmount: number;
  amountPaid: number;
  installments: readonly OpeningBalanceInstallment[];
}

export interface OpeningBalanceStudent {
  studentId: string;
  studentNo: string;
  recordStatus: "active" | "pending_payment" | "archived";
  invoice: OpeningBalanceInvoice | null;
  payments: readonly ExistingPaymentSnapshot[];
}

export interface PlannedAllocation {
  installmentId: string;
  sequence: number;
  amountXof: number;
}

export interface PlannedOpeningBalance {
  rowKey: string;
  studentNo: string;
  studentId: string;
  invoiceId: string;
  amountXof: number;
  providerRef: string;
  allocations: readonly PlannedAllocation[];
  /** Cash beyond what the installments can absorb; becomes an account credit. */
  unallocatedXof: number;
}

export interface OpeningBalancePlan {
  academicYearLabel: string;
  asOfDate: string;
  rowCount: number;
  postable: readonly PlannedOpeningBalance[];
  alreadyRecorded: readonly {
    rowKey: string;
    paymentId: string;
    amountXof: number;
  }[];
  blockers: readonly OpeningBalanceBlocker[];
  totals: {
    manifestTotalXof: number;
    postableXof: number;
    alreadyRecordedXof: number;
    blockedXof: number;
    studentsTouched: number;
  };
}

/**
 * Two undated, unreferenced payments for the same student and amount are
 * indistinguishable. Rather than guess, flag any ledger payment of the same amount
 * and make a human say whether it is this one.
 */
function duplicateCandidates(
  row: OpeningBalanceManifestRow,
  student: OpeningBalanceStudent,
): ExistingPaymentSnapshot[] {
  return student.payments.filter(
    (payment) => payment.amountXof === row.amountXof,
  );
}

/** Oldest installment first, filling each to its remaining capacity. */
export function allocateOldestFirst(
  amountXof: number,
  installments: readonly OpeningBalanceInstallment[],
  preferredSequence: number | null,
): { allocations: PlannedAllocation[]; unallocatedXof: number } {
  const ordered = [...installments].sort((a, b) => a.sequence - b.sequence);
  const preferred = preferredSequence
    ? ordered.filter(
        (installment) => installment.sequence === preferredSequence,
      )
    : [];
  const queue = [
    ...preferred,
    ...ordered.filter((installment) => !preferred.includes(installment)),
  ];
  const allocations: PlannedAllocation[] = [];
  let remaining = amountXof;
  for (const installment of queue) {
    if (remaining <= 0) break;
    const capacity = installment.amountDue - installment.amountPaid;
    if (capacity <= 0) continue;
    const take = Math.min(capacity, remaining);
    allocations.push({
      installmentId: installment.id,
      sequence: installment.sequence,
      amountXof: take,
    });
    remaining -= take;
  }
  return { allocations, unallocatedXof: remaining };
}

function planRow(
  row: OpeningBalanceManifestRow,
  manifest: OpeningBalanceManifest,
  byStudentNo: ReadonlyMap<string, OpeningBalanceStudent>,
  claimedPaymentIds: Set<string>,
):
  | { kind: "postable"; planned: PlannedOpeningBalance }
  | { kind: "already"; paymentId: string }
  | { kind: "blocked"; blockers: OpeningBalanceBlocker[] } {
  const blocked = (code: OpeningBalanceBlockerCode, detail: string) => ({
    kind: "blocked" as const,
    blockers: [
      { code, rowKey: row.rowKey, subject: row.sourceStudentName, detail },
    ],
  });

  if (row.identity.status === "missing") {
    return blocked(
      "identity_missing",
      "No student was matched to this payment",
    );
  }
  if (row.identity.status === "ambiguous") {
    return blocked(
      "identity_ambiguous",
      `Unresolved between ${row.identity.candidateStudentNos.join(", ")}`,
    );
  }
  const student = byStudentNo.get(row.identity.studentNo);
  if (!student) {
    return blocked(
      "student_not_found",
      `${row.identity.studentNo} is not in the SIS`,
    );
  }
  if (student.recordStatus === "archived") {
    return blocked("student_archived", `${student.studentNo} is archived`);
  }
  if (!student.invoice) {
    return blocked(
      "no_live_invoice",
      `${student.studentNo} has no live annual package`,
    );
  }
  if (student.invoice.installments.length === 0) {
    return blocked(
      "no_payment_plan",
      `${student.studentNo} has no installment plan`,
    );
  }

  const decision = row.existingPaymentDecision;
  if (decision?.decision === "already_recorded") {
    const known = student.payments.some(
      (payment) => payment.id === decision.paymentId,
    );
    if (!known) {
      return blocked(
        "decision_targets_unknown_payment",
        `Payment ${decision.paymentId} is not on ${student.studentNo}`,
      );
    }
    if (claimedPaymentIds.has(decision.paymentId)) {
      return blocked(
        "decision_payment_claimed_twice",
        `Payment ${decision.paymentId} is already claimed by another row`,
      );
    }
    claimedPaymentIds.add(decision.paymentId);
    return { kind: "already", paymentId: decision.paymentId };
  }

  const candidates = duplicateCandidates(row, student);
  if (candidates.length > 0 && !decision) {
    return blocked(
      "possible_duplicate",
      `The ledger already holds ${candidates.length} payment(s) of ${row.amountXof} XOF for ${student.studentNo} (${candidates
        .map((candidate) => candidate.id)
        .join(", ")}); record an existingPaymentDecision`,
    );
  }

  const headroom = student.invoice.totalAmount - student.invoice.amountPaid;
  if (row.amountXof > headroom) {
    return blocked(
      "exceeds_invoice_total",
      `Posting ${row.amountXof} XOF would take collected cash past the ${student.invoice.totalAmount} XOF package (${headroom} XOF of headroom)`,
    );
  }

  const { allocations, unallocatedXof } = allocateOldestFirst(
    row.amountXof,
    student.invoice.installments,
    row.installmentSequence,
  );
  return {
    kind: "postable",
    planned: {
      rowKey: row.rowKey,
      studentNo: student.studentNo,
      studentId: student.studentId,
      invoiceId: student.invoice.id,
      amountXof: row.amountXof,
      providerRef: openingBalanceProviderRef(
        manifest.sourceWorkbookSha256,
        row.rowKey,
      ),
      allocations,
      unallocatedXof,
    },
  };
}

export function planOpeningBalanceImport(
  manifest: OpeningBalanceManifest,
  students: readonly OpeningBalanceStudent[],
): OpeningBalancePlan {
  const byStudentNo = new Map(
    students.map((student) => [student.studentNo, student]),
  );
  const postable: PlannedOpeningBalance[] = [];
  const alreadyRecorded: {
    rowKey: string;
    paymentId: string;
    amountXof: number;
  }[] = [];
  const blockers: OpeningBalanceBlocker[] = [];
  const claimedPaymentIds = new Set<string>();
  const touched = new Set<string>();

  for (const row of manifest.rows) {
    const outcome = planRow(row, manifest, byStudentNo, claimedPaymentIds);
    if (outcome.kind === "postable") {
      postable.push(outcome.planned);
      touched.add(outcome.planned.studentNo);
      continue;
    }
    if (outcome.kind === "already") {
      alreadyRecorded.push({
        rowKey: row.rowKey,
        paymentId: outcome.paymentId,
        amountXof: row.amountXof,
      });
      continue;
    }
    blockers.push(...outcome.blockers);
  }

  const blockedKeys = new Set(blockers.map((blocker) => blocker.rowKey));
  return {
    academicYearLabel: manifest.academicYearLabel,
    asOfDate: manifest.asOfDate,
    rowCount: manifest.rows.length,
    postable,
    alreadyRecorded,
    blockers,
    totals: {
      manifestTotalXof: manifest.rows.reduce(
        (sum, row) => sum + row.amountXof,
        0,
      ),
      postableXof: postable.reduce(
        (sum, planned) => sum + planned.amountXof,
        0,
      ),
      alreadyRecordedXof: alreadyRecorded.reduce(
        (sum, row) => sum + row.amountXof,
        0,
      ),
      blockedXof: manifest.rows
        .filter((row) => blockedKeys.has(row.rowKey))
        .reduce((sum, row) => sum + row.amountXof, 0),
      studentsTouched: touched.size,
    },
  };
}

import { describe, expect, it, vi } from "vitest";
import {
  PaymentBalanceImportManifestSchema,
  paymentBalanceManifestDigest,
} from "./payment-balance-import.manifest.js";
import {
  planPaymentBalanceImport,
  type PaymentBalanceLiveInvoice,
  type PaymentBalanceLiveSnapshot,
} from "./payment-balance-import.planner.js";
import { planPaymentBalanceImportFromDatabase } from "./payment-balance-import.runner.js";
import {
  auditPaymentBalanceActivationEvidence,
  auditPaymentBalancePaymentEvidence,
} from "./payment-balance-import.audit.js";

const REVIEW = {
  reviewedBy: "Finance Review Team",
  reviewedAt: "2026-08-31T09:00:00.000Z",
  reason:
    "Finance reviewed the exact workbook row against institutional identity records.",
};

function sourceRow(
  sourceRowNumber: number,
  studentNo: string,
  amountPaidXof: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    sourceRowKey: `Students & Billing!${sourceRowNumber}`,
    sourceSheet: "Students & Billing",
    sourceRowNumber,
    sourceRecordSha256: sourceRowNumber.toString(16).padStart(64, "0"),
    sourceStudentClaim: `Reviewed Student ${sourceRowNumber}`,
    amountPaidXof,
    installmentDetail: {
      paidXof: amountPaidXof,
      sourceReconcilesClaim: "yes",
    },
    identity: {
      decision: "exact_match",
      studentNo,
      matchMethod: "exact_ordered",
      review: REVIEW,
    },
    ...overrides,
  };
}

function manifest(rows: ReturnType<typeof sourceRow>[]) {
  return PaymentBalanceImportManifestSchema.parse({
    schemaVersion: 1,
    importName: "Final paid-to-date workbook reconciliation",
    academicYearLabel: "2026–2027",
    sourceAsOfDate: "2026-08-29",
    currency: "XOF",
    sourceWorkbook: {
      fileName: "DAUST Students & Billing Final as of August 29 2026.xlsx",
      sha256: "a".repeat(64),
    },
    trustedExtraction: {
      fileName: "billing-trusted-extraction.json",
      sha256: "e".repeat(64),
    },
    sourceRowCount: rows.length,
    sourcePaidTotalXof: rows.reduce(
      (sum, row) => sum + Number(row.amountPaidXof),
      0,
    ),
    amountPaidAuthority: "workbook_amount_paid",
    rows,
    reviewNote:
      "Every workbook row has an exact identity decision or an explicit reviewed hold.",
  });
}

function invoice(
  id: string,
  ledgerPaidXof: number,
  overrides: Partial<PaymentBalanceLiveInvoice> = {},
): PaymentBalanceLiveInvoice {
  const totalAmountXof = overrides.totalAmountXof ?? 1_000;
  const firstDueXof = Math.floor(totalAmountXof / 2);
  const secondDueXof = totalAmountXof - firstDueXof;
  const firstPaidXof = Math.min(ledgerPaidXof, firstDueXof);
  const secondPaidXof = ledgerPaidXof - firstPaidXof;
  const firstComponentXof = Math.floor((totalAmountXof * 3) / 5);
  const secondComponentXof = totalAmountXof - firstComponentXof;
  const firstComponentPaidXof = Math.min(ledgerPaidXof, firstComponentXof);
  const secondComponentPaidXof = ledgerPaidXof - firstComponentPaidXof;
  return {
    id,
    number: `BILL-${id}`,
    revision: 4,
    status:
      ledgerPaidXof === 0
        ? "open"
        : ledgerPaidXof >= totalAmountXof
          ? "paid"
          : "partial",
    packageType: "standard_full",
    academicYearLabel: "2026–2027",
    totalAmountXof,
    ledgerPaidXof,
    installments: [
      {
        id: `${id}-installment-1`,
        sequence: 1,
        dueOn: "2026-08-25",
        amountDueXof: firstDueXof,
        ledgerPaidXof: firstPaidXof,
      },
      {
        id: `${id}-installment-2`,
        sequence: 2,
        dueOn: "2026-11-01",
        amountDueXof: secondDueXof,
        ledgerPaidXof: secondPaidXof,
      },
    ],
    components: [
      {
        id: `${id}-component-a`,
        amountXof: firstComponentXof,
        ledgerPaidXof: firstComponentPaidXof,
      },
      {
        id: `${id}-component-b`,
        amountXof: secondComponentXof,
        ledgerPaidXof: secondComponentPaidXof,
      },
    ],
    payments: [],
    inFlightProofSubmissionIds: [],
    inFlightPiSpiRequestIds: [],
    ...overrides,
  };
}

function snapshot(
  students: Array<
    Omit<PaymentBalanceLiveSnapshot["students"][number], "recordStatus"> & {
      recordStatus?: PaymentBalanceLiveSnapshot["students"][number]["recordStatus"];
    }
  >,
  capturedAt = "2026-08-31T10:00:00.000Z",
): PaymentBalanceLiveSnapshot {
  return {
    capturedAt,
    students: students.map((student) => ({
      ...student,
      recordStatus: student.recordStatus ?? "active",
    })),
  };
}

describe("payment balance source-of-truth manifest", () => {
  it("requires a real source-as-of calendar date separate from settlement", () => {
    const parsed = manifest([sourceRow(2, "S001", 500)]);
    expect(parsed.sourceAsOfDate).toBe("2026-08-29");
    expect(() =>
      PaymentBalanceImportManifestSchema.parse({
        ...parsed,
        sourceAsOfDate: "2026-02-30",
      }),
    ).toThrow(/valid calendar date/i);
  });

  it("accounts for every physical row, including zero targets and reviewed holds", () => {
    const parsed = manifest([
      sourceRow(2, "S001", 500),
      sourceRow(3, "S002", 0, {
        identity: {
          decision: "hold_unmatched",
          review: REVIEW,
        },
      }),
    ]);

    expect(parsed.sourceRowCount).toBe(2);
    expect(parsed.sourcePaidTotalXof).toBe(500);
    expect(parsed.rows[1]).toMatchObject({
      amountPaidXof: 0,
      identity: { decision: "hold_unmatched" },
    });
    expect(paymentBalanceManifestDigest(parsed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses Amount Paid for the reviewed row-159 +1,433 XOF discrepancy", () => {
    const reviewed = manifest([
      sourceRow(159, "S159", 4_066_933, {
        installmentDetail: {
          paidXof: 4_065_500,
          sourceReconcilesClaim: "yes",
          discrepancyReview: {
            decision: "accept_amount_paid_as_target",
            signedVarianceXof: 1_433,
            review: {
              ...REVIEW,
              reason:
                "Finance confirmed column Q Amount Paid is authoritative despite the incorrect Reconciles Yes cell.",
            },
          },
        },
      }),
    ]);
    expect(reviewed.rows[0]).toMatchObject({
      amountPaidXof: 4_066_933,
      installmentDetail: {
        paidXof: 4_065_500,
        sourceReconcilesClaim: "yes",
        discrepancyReview: {
          decision: "accept_amount_paid_as_target",
          signedVarianceXof: 1_433,
        },
      },
    });

    expect(() =>
      manifest([
        sourceRow(159, "S159", 4_066_933, {
          installmentDetail: {
            paidXof: 4_065_500,
            sourceReconcilesClaim: "yes",
          },
        }),
      ]),
    ).toThrow(/exact \+1,433 XOF variance/i);
  });

  it("requires duplicate student claims to be explicit holds tied to one canonical row", () => {
    expect(() =>
      manifest([sourceRow(2, "S001", 500), sourceRow(3, "S001", 200)]),
    ).toThrow(/duplicate claims must be held explicitly/i);

    expect(() =>
      manifest([
        sourceRow(2, "S001", 500),
        sourceRow(3, "S001", 200, {
          identity: {
            decision: "hold_duplicate_claim",
            claimedStudentNo: "S001",
            canonicalSourceRowKey: "Students & Billing!2",
            review: REVIEW,
          },
        }),
      ]),
    ).not.toThrow();
  });
});

describe("payment balance import planning", () => {
  it("rejects a suspended finance import actor before reading ledger state", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "suspended-actor",
      roles: ["admin"],
      status: "suspended",
    });

    await expect(
      planPaymentBalanceImportFromDatabase(
        { person: { findUnique } } as never,
        manifest([sourceRow(1, "S001", 0)]),
        { actorEmail: "suspended@example.edu" },
      ),
    ).rejects.toThrow(/active bursar or administrator/i);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("partitions postable, reconciled, and held targets under one exact control total", () => {
    const reviewedManifest = manifest([
      sourceRow(2, "S001", 500),
      sourceRow(3, "S002", 400),
      sourceRow(4, "S003", 50, {
        identity: {
          decision: "hold_ambiguous",
          candidateStudentNos: ["S003", "S004"],
          review: REVIEW,
        },
      }),
      sourceRow(5, "S005", 0, {
        identity: {
          decision: "hold_unmatched",
          review: REVIEW,
        },
      }),
    ]);
    const plan = planPaymentBalanceImport(
      reviewedManifest,
      snapshot([
        { id: "student-2", studentNo: "S002", invoices: [invoice("i2", 400)] },
        { id: "student-1", studentNo: "S001", invoices: [invoice("i1", 200)] },
      ]),
    );

    expect(plan.postableRows).toHaveLength(1);
    expect(plan.postableRows[0]).toMatchObject({
      sourceRowKey: "Students & Billing!2",
      expectedLedgerPaidXof: 200,
      deltaXof: 300,
    });
    expect(
      plan.postableRows[0]!.installmentAllocations.reduce(
        (sum, allocation) => sum + allocation.amountXof,
        0,
      ),
    ).toBe(300);
    expect(
      plan.postableRows[0]!.componentAllocations.reduce(
        (sum, allocation) => sum + allocation.amountXof,
        0,
      ),
    ).toBe(300);
    expect(plan.alreadyReconciledRows).toHaveLength(1);
    expect(plan.heldRows).toHaveLength(2);
    expect(plan.controlTotals).toEqual({
      sourcePaidTotalXof: 950,
      matchedPreExistingCashXof: 600,
      postableDeltaXof: 300,
      heldSourceTargetXof: 50,
      accountedSourcePaidXof: 950,
      reconciles: true,
      sourceRows: 4,
      postableRows: 1,
      alreadyReconciledRows: 1,
      heldRows: 2,
    });
  });

  it("preserves an exact reviewed hold even when a candidate now exists live", () => {
    const reviewedManifest = manifest([
      sourceRow(8, "IGNORED", 315, {
        identity: {
          decision: "hold_ambiguous",
          candidateStudentNos: ["S008", "S009"],
          review: {
            ...REVIEW,
            reason:
              "Finance retained both exact candidate records and did not authorize either identity.",
          },
        },
      }),
    ]);
    const plan = planPaymentBalanceImport(
      reviewedManifest,
      snapshot([
        { id: "student-8", studentNo: "S008", invoices: [invoice("i8", 0)] },
      ]),
    );

    expect(plan.postableRows).toEqual([]);
    expect(plan.heldRows).toEqual([
      expect.objectContaining({
        disposition: "held",
        sourceRowKey: "Students & Billing!8",
        sourceTargetPaidXof: 315,
        code: "reviewed_ambiguous_student",
        reviewedHold: true,
        identityDecision: reviewedManifest.rows[0]!.identity,
        details: { candidateStudentNos: ["S008", "S009"] },
      }),
    ]);
    expect(plan.controlTotals.heldSourceTargetXof).toBe(315);
    expect(plan.controlTotals.accountedSourcePaidXof).toBe(315);
  });

  it("holds regressions, overpayments, multiple invoices, and unreconciled ledgers", () => {
    const reviewedManifest = manifest([
      sourceRow(10, "S010", 100),
      sourceRow(11, "S011", 1_100),
      sourceRow(12, "S012", 300),
      sourceRow(13, "S013", 300),
    ]);
    const drifted = invoice("i13", 100);
    drifted.components[0]!.ledgerPaidXof -= 1;
    const plan = planPaymentBalanceImport(
      reviewedManifest,
      snapshot([
        {
          id: "student-10",
          studentNo: "S010",
          invoices: [invoice("i10", 200)],
        },
        { id: "student-11", studentNo: "S011", invoices: [invoice("i11", 0)] },
        {
          id: "student-12",
          studentNo: "S012",
          invoices: [invoice("i12-a", 0), invoice("i12-b", 0)],
        },
        { id: "student-13", studentNo: "S013", invoices: [drifted] },
      ]),
    );

    expect(plan.heldRows.map((row) => row.code)).toEqual([
      "target_below_ledger",
      "target_exceeds_invoice_total",
      "multiple_live_invoices",
      "invoice_component_mismatch",
    ]);
    expect(plan.postableRows).toEqual([]);
    expect(plan.controlTotals).toMatchObject({
      sourcePaidTotalXof: 1_800,
      matchedPreExistingCashXof: 0,
      postableDeltaXof: 0,
      heldSourceTargetXof: 1_800,
      accountedSourcePaidXof: 1_800,
      reconciles: true,
    });
  });

  it("holds invoices with in-flight or refund activity", () => {
    const reviewedManifest = manifest([
      sourceRow(14, "S014", 500),
      sourceRow(15, "S015", 500),
    ]);
    const inFlight = invoice("i14", 0, {
      inFlightProofSubmissionIds: ["proof-14"],
    });
    const refunded = invoice("i15", 0, {
      payments: [
        {
          id: "payment-15",
          amountXof: 200,
          status: "refunded",
          providerRef: "ref-15",
          refundedAt: "2026-08-30T12:00:00.000Z",
        },
      ],
    });
    const plan = planPaymentBalanceImport(
      reviewedManifest,
      snapshot([
        { id: "student-14", studentNo: "S014", invoices: [inFlight] },
        { id: "student-15", studentNo: "S015", invoices: [refunded] },
      ]),
    );

    expect(plan.heldRows.map((row) => row.code)).toEqual([
      "invoice_has_in_flight_payment",
      "invoice_has_refund_activity",
    ]);
    expect(plan.postableRows).toEqual([]);
    expect(plan.controlTotals.heldSourceTargetXof).toBe(1_000);
  });

  it("produces one exact deterministic live-state plan digest", () => {
    const reviewedManifest = manifest([sourceRow(20, "S020", 500)]);
    const firstInvoice = invoice("i20", 200);
    const first = planPaymentBalanceImport(
      reviewedManifest,
      snapshot([
        {
          id: "student-20",
          studentNo: "S020",
          invoices: [firstInvoice],
        },
      ]),
    );
    const reorderedInvoice = {
      ...firstInvoice,
      installments: [...firstInvoice.installments].reverse(),
      components: [...firstInvoice.components].reverse(),
    };
    const second = planPaymentBalanceImport(
      reviewedManifest,
      snapshot(
        [
          {
            id: "student-20",
            studentNo: "S020",
            invoices: [reorderedInvoice],
          },
        ],
        "2026-08-31T11:00:00.000Z",
      ),
    );

    expect(first.planSha256).toBe(second.planSha256);
    expect(first.planSha256).toBe(
      "87c5c25c6f0caad03a8487d11ac96d3368760373611ab082cadbb86512832f35",
    );

    const changedLedgerInvoice = invoice("i20", 201);
    const changed = planPaymentBalanceImport(
      reviewedManifest,
      snapshot([
        {
          id: "student-20",
          studentNo: "S020",
          invoices: [changedLedgerInvoice],
        },
      ]),
    );
    expect(changed.planSha256).not.toBe(first.planSha256);
  });
});

describe("payment balance activation post-audit", () => {
  it("accepts one sent marker and one durable pending-delivery audit", () => {
    expect(
      auditPaymentBalanceActivationEvidence({
        expectedActivations: 2,
        applicants: [
          {
            id: "applicant-sent",
            activatedByPaymentId: "payment-sent",
            studentInviteSentAt: new Date("2026-08-31T13:00:00.000Z"),
          },
          {
            id: "applicant-pending",
            activatedByPaymentId: "payment-pending",
            studentInviteSentAt: null,
          },
        ],
        auditLogs: [
          {
            entityId: "applicant-sent",
            action: "onboarding-activated",
            data: { paymentId: "payment-sent" },
          },
          {
            entityId: "applicant-pending",
            action: "onboarding-activated",
            data: { paymentId: "payment-pending" },
          },
          {
            entityId: "applicant-pending",
            action: "student-invite-delivery-pending",
            data: { studentId: "redacted-by-count-only-result" },
          },
        ],
      }),
    ).toEqual({
      activationAuditRows: 2,
      activationInvitesSent: 1,
      activationInvitesPending: 1,
    });
  });

  it("rejects an activation whose invite secret was neither delivered nor queued", () => {
    expect(() =>
      auditPaymentBalanceActivationEvidence({
        expectedActivations: 1,
        applicants: [
          {
            id: "applicant-missing-delivery",
            activatedByPaymentId: "payment-1",
            studentInviteSentAt: null,
          },
        ],
        auditLogs: [
          {
            entityId: "applicant-missing-delivery",
            action: "onboarding-activated",
            data: { paymentId: "payment-1" },
          },
        ],
      }),
    ).toThrow(/lacks invite delivery or pending audit evidence/i);
  });
});

describe("payment balance payment post-audit", () => {
  const importedRows = [
    { paymentId: "payment-1", sourceClaimSha256: "a".repeat(64) },
    { paymentId: "payment-2", sourceClaimSha256: "b".repeat(64) },
  ];

  it("requires exactly one batch/source-claim-bound audit per payment", () => {
    expect(
      auditPaymentBalancePaymentEvidence({
        batchId: "batch-1",
        importedRows,
        auditLogs: importedRows.map((row) => ({
          entityId: row.paymentId,
          data: {
            batchId: "batch-1",
            sourceClaimSha256: row.sourceClaimSha256,
          },
        })),
      }),
    ).toBe(2);
  });

  it("rejects a duplicate audit masking another payment's missing audit", () => {
    expect(() =>
      auditPaymentBalancePaymentEvidence({
        batchId: "batch-1",
        importedRows,
        auditLogs: [
          {
            entityId: "payment-1",
            data: {
              batchId: "batch-1",
              sourceClaimSha256: "a".repeat(64),
            },
          },
          {
            entityId: "payment-1",
            data: {
              batchId: "batch-1",
              sourceClaimSha256: "a".repeat(64),
            },
          },
        ],
      }),
    ).toThrow(/lacks one exact batch\/source-claim audit/i);
  });
});

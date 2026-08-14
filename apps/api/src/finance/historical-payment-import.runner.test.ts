import { describe, expect, it, vi } from "vitest";
import {
  HistoricalPaymentManifestSchema,
  historicalPaymentManifestDigest,
} from "./historical-payment-import.manifest.js";
import {
  HistoricalPaymentImportBlockedError,
  historicalPaymentDryRunExitCode,
  planHistoricalPaymentImport,
} from "./historical-payment-import.runner.js";

function manifestRow(overrides: Record<string, unknown> = {}) {
  return {
    sourceGroupKey: "REINSCRIPTIONS!D6",
    sourceSheet: "REINSCRIPTIONS",
    sourceRowNumbers: [6],
    sourceAmountXof: 315_000,
    allocationKey: "payment-1",
    sourceStudentName: "Test Student",
    identity: { status: "authoritative", studentNo: "DAUST-001" },
    sourceSettledOn: "2026-08-04",
    settledOn: "2026-08-04",
    amountXof: 315_000,
    sourceMethod: "WAVE B",
    method: "wave",
    status: "settled",
    reviewed: true,
    ...overrides,
  };
}

function manifest(rowOverrides: Record<string, unknown> = {}) {
  return HistoricalPaymentManifestSchema.parse({
    schemaVersion: 1,
    importName: "Reviewed historical payments",
    academicYearLabel: "2026–2027",
    currency: "XOF",
    allRowsSettled: true,
    notificationPolicy: "suppress",
    sourceWorkbook: {
      fileName: "payments.xlsx",
      sha256: "b".repeat(64),
    },
    sourceExtractionSha256: "e".repeat(64),
    sourceGroupCount: 1,
    sourceTotalXof: 315_000,
    rows: [manifestRow(rowOverrides)],
    excludedGroups: [],
    reviewNote:
      "Finance reviewed the complete source workbook against the SIS.",
  });
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-1",
    number: "BILL-2026-001",
    studentId: "student-1",
    status: "open",
    revision: 3,
    totalAmount: 4_285_000,
    amountPaid: 0,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    academicYearLabel: "2026–2027",
    term: { academicYear: { label: "2026–2027" } },
    plan: {
      installments: [
        {
          id: "installment-1",
          sequence: 1,
          dueDate: new Date("2026-08-25T00:00:00.000Z"),
          amountDue: 1_071_250,
          amountPaid: 0,
        },
        {
          id: "installment-2",
          sequence: 2,
          dueDate: new Date("2026-11-01T00:00:00.000Z"),
          amountDue: 1_071_250,
          amountPaid: 0,
        },
        {
          id: "installment-3",
          sequence: 3,
          dueDate: new Date("2027-01-01T00:00:00.000Z"),
          amountDue: 1_071_250,
          amountPaid: 0,
        },
        {
          id: "installment-4",
          sequence: 4,
          dueDate: new Date("2027-03-01T00:00:00.000Z"),
          amountDue: 1_071_250,
          amountPaid: 0,
        },
      ],
    },
    components: [
      {
        id: "component-tuition",
        kind: "tuition",
        costCenterCode: "9100",
        amountXof: 2_975_000,
        allocations: [],
      },
      {
        id: "component-housing",
        kind: "housing",
        costCenterCode: "3700",
        amountXof: 680_000,
        allocations: [],
      },
      {
        id: "component-cafeteria",
        kind: "cafeteria",
        costCenterCode: "3600",
        amountXof: 630_000,
        allocations: [],
      },
    ],
    payments: [],
    ...overrides,
  };
}

function existingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "2afba2e0-c43a-4870-845a-c7510faaf110",
    invoiceId: "invoice-1",
    studentId: "student-1",
    amount: 315_000,
    status: "success",
    settledAt: new Date("2026-08-04T12:00:00.000Z"),
    providerRef: "GATEWAY-EXISTING-1",
    ipnPayload: null,
    submission: null,
    ...overrides,
  };
}

function fakeDb(
  options: {
    invoices?: ReturnType<typeof invoice>[];
    existingPayments?: {
      id: string;
      studentId: string;
      invoiceId: string;
      amount: number;
      status: string;
      settledAt: Date | null;
      providerRef: string;
      ipnPayload: Record<string, unknown> | null;
      submission: { bankReference: string | null } | null;
    }[];
    providerConflicts?: { id: string; providerRef: string }[];
    existingBatch?: Record<string, unknown> | null;
    studentStatus?: string;
  } = {},
) {
  const paymentFindMany = vi.fn(
    async (args: { where?: { providerRef?: unknown } }) =>
      args.where?.providerRef
        ? (options.providerConflicts ?? [])
        : (options.existingPayments ?? []),
  );
  return {
    person: {
      findUnique: vi.fn(async () => ({ id: "actor-1", roles: ["bursar"] })),
    },
    paymentImportBatch: {
      findUnique: vi.fn(async () => options.existingBatch ?? null),
    },
    academicYear: {
      findUnique: vi.fn(async () => ({
        id: "year-1",
        label: "2026–2027",
        endsOn: new Date("2027-07-31T00:00:00.000Z"),
      })),
    },
    student: {
      findMany: vi.fn(async () => [
        {
          id: "student-1",
          studentNo: "DAUST-001",
          recordStatus: options.studentStatus ?? "active",
          person: { firstName: "Test", lastName: "Student" },
        },
      ]),
    },
    invoice: {
      findMany: vi.fn(async () => options.invoices ?? [invoice()]),
    },
    payment: { findMany: paymentFindMany },
    auditLog: {},
    installment: {},
    paymentAllocation: {},
    paymentComponentAllocation: {},
  } as never;
}

const invocation = {
  actorEmail: "finance@example.edu",
};

describe("historical payment import planning", () => {
  it("plans exact installment and proportional component allocations without writes", async () => {
    const db = fakeDb();
    const plan = await planHistoricalPaymentImport(db, manifest(), invocation);

    expect(plan.blockers).toEqual([]);
    expect(plan.rowsToImport).toBe(1);
    expect(plan.amountToImportXof).toBe(315_000);
    expect(plan.payments[0]!.invoiceId).toBe("invoice-1");
    expect(plan.payments[0]!.installmentAllocations).toEqual([
      { installmentId: "installment-1", amountXof: 315_000 },
    ]);
    expect(
      plan.payments[0]!.componentAllocations.reduce(
        (sum, allocation) => sum + allocation.amountXof,
        0,
      ),
    ).toBe(315_000);
    expect(plan.payments[0]!.componentAllocations).toHaveLength(3);
  });

  it("refuses candidate-only and unreviewed identities", async () => {
    const unresolvedManifest = manifest({
      identity: {
        status: "ambiguous",
        candidateStudentNos: ["DAUST-001", "DAUST-002"],
      },
      reviewed: false,
    });
    const plan = await planHistoricalPaymentImport(
      fakeDb({ invoices: [] }),
      unresolvedManifest,
      invocation,
    );
    expect(plan.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["row_not_reviewed", "identity_ambiguous"]),
    );
    expect(plan.rowsToImport).toBe(0);
  });

  it("blocks an implausible 2006 date instead of silently correcting it", async () => {
    const badDateManifest = manifest({
      sourceSettledOn: "2006-07-01",
      settledOn: "2006-07-01",
    });
    const plan = await planHistoricalPaymentImport(
      fakeDb(),
      badDateManifest,
      invocation,
    );
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "implausible_settlement_date" }),
      ]),
    );
  });

  it("blocks a possible existing payment until its exact ledger id is reviewed", async () => {
    const existing = existingPayment();
    const blocked = await planHistoricalPaymentImport(
      fakeDb({ existingPayments: [existing] }),
      manifest(),
      invocation,
    );
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "possible_existing_payment",
          details: { candidatePaymentIds: [existing.id] },
        }),
      ]),
    );

    const reviewed = await planHistoricalPaymentImport(
      fakeDb({ existingPayments: [existing] }),
      manifest({
        existingPaymentDecision: {
          decision: "already_recorded",
          paymentId: existing.id,
          reason:
            "Finance confirmed this workbook row is already in the ledger.",
        },
      }),
      invocation,
    );
    expect(reviewed.blockers).toEqual([]);
    expect(reviewed.rowsAlreadyRecorded).toBe(1);
    expect(reviewed.rowsToImport).toBe(0);
  });

  it("rejects a stale existing-payment review when the database candidates change", async () => {
    const reviewedPaymentId = "2afba2e0-c43a-4870-845a-c7510faaf110";
    const currentPaymentId = "53ff91c2-64f6-40e2-9baf-a204a3da41fa";
    const plan = await planHistoricalPaymentImport(
      fakeDb({
        existingPayments: [
          existingPayment({
            id: currentPaymentId,
          }),
        ],
      }),
      manifest({
        existingPaymentDecision: {
          decision: "already_recorded",
          paymentId: reviewedPaymentId,
          reason:
            "Finance previously reviewed an exact matching ledger payment.",
        },
      }),
      invocation,
    );
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "stale_existing_payment_decision" }),
      ]),
    );
  });

  it("fails closed when importing would create an unreviewed credit", async () => {
    const plan = await planHistoricalPaymentImport(
      fakeDb({
        invoices: [
          invoice({
            totalAmount: 100_000,
            components: [
              {
                id: "component-tuition",
                kind: "tuition",
                costCenterCode: "9100",
                amountXof: 100_000,
                allocations: [],
              },
            ],
            plan: {
              installments: [
                {
                  id: "installment-1",
                  sequence: 1,
                  dueDate: new Date("2026-08-25T00:00:00.000Z"),
                  amountDue: 100_000,
                  amountPaid: 0,
                },
              ],
            },
          }),
        ],
      }),
      manifest(),
      invocation,
    );
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "payment_exceeds_payable_balance" }),
      ]),
    );
  });

  it("does not leapfrog an older charge from another academic year", async () => {
    const plan = await planHistoricalPaymentImport(
      fakeDb({
        invoices: [
          invoice({
            id: "old-invoice",
            number: "BILL-2025-001",
            academicYearLabel: "2025–2026",
            term: { academicYear: { label: "2025–2026" } },
            createdAt: new Date("2025-07-01T00:00:00.000Z"),
          }),
          invoice(),
        ],
      }),
      manifest(),
      invocation,
    );
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "oldest_charge_wrong_year" }),
      ]),
    );
  });

  it("fails closed when installment or component cash drifts from the invoice ledger", async () => {
    const dueDrift = invoice();
    dueDrift.plan.installments[3]!.amountDue -= 1;
    const duePlan = await planHistoricalPaymentImport(
      fakeDb({ invoices: [dueDrift] }),
      manifest(),
      invocation,
    );
    expect(duePlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "installment_due_total_mismatch" }),
      ]),
    );

    const paidDrift = invoice({ amountPaid: 100_000 });
    const paidPlan = await planHistoricalPaymentImport(
      fakeDb({ invoices: [paidDrift] }),
      manifest(),
      invocation,
    );
    expect(paidPlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "installment_paid_total_mismatch" }),
      ]),
    );

    const componentDrift = invoice({ amountPaid: 100_000 });
    componentDrift.plan.installments[0]!.amountPaid = 100_000;
    const componentPlan = await planHistoricalPaymentImport(
      fakeDb({ invoices: [componentDrift] }),
      manifest(),
      invocation,
    );
    expect(componentPlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "component_paid_total_mismatch" }),
      ]),
    );
  });

  it("detects all settled-state duplicates across methods, a date window, and references", async () => {
    const refundPending = existingPayment({
      status: "refund_pending",
      settledAt: new Date("2026-09-04T12:00:00.000Z"),
    });
    const nearby = await planHistoricalPaymentImport(
      fakeDb({ existingPayments: [refundPending] }),
      manifest(),
      invocation,
    );
    expect(nearby.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "possible_existing_payment" }),
      ]),
    );

    const referenceMatch = existingPayment({
      providerRef: "BANK42",
      settledAt: new Date("2027-02-01T12:00:00.000Z"),
    });
    const byReference = await planHistoricalPaymentImport(
      fakeDb({ existingPayments: [referenceMatch] }),
      manifest({ externalReference: "BANK-42" }),
      invocation,
    );
    expect(byReference.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "possible_existing_payment" }),
      ]),
    );

    const wireReferenceMatch = existingPayment({
      providerRef: "WIRE-53ff91c2-64f6-40e2-9baf-a204a3da41fa",
      settledAt: new Date("2027-02-01T12:00:00.000Z"),
      submission: { bankReference: "CBAO-DEPOT-8821" },
    });
    const byReviewedWireReference = await planHistoricalPaymentImport(
      fakeDb({ existingPayments: [wireReferenceMatch] }),
      manifest({ externalReference: "cbao depot 8821", method: "wire" }),
      invocation,
    );
    expect(byReviewedWireReference.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "possible_existing_payment" }),
      ]),
    );

    const outsideWindow = await planHistoricalPaymentImport(
      fakeDb({
        existingPayments: [
          existingPayment({
            providerRef: "UNRELATED",
            settledAt: new Date("2027-02-01T12:00:00.000Z"),
          }),
        ],
      }),
      manifest(),
      invocation,
    );
    expect(outsideWindow.blockers).toEqual([]);

    const undated = await planHistoricalPaymentImport(
      fakeDb({
        existingPayments: [existingPayment({ settledAt: null })],
      }),
      manifest(),
      invocation,
    );
    expect(undated.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "possible_existing_payment" }),
      ]),
    );
  });

  it("blocks historical cash behind later settlements until the exact invoice state is reviewed", async () => {
    const laterPaymentId = "53ff91c2-64f6-40e2-9baf-a204a3da41fa";
    const target = invoice({
      payments: [
        {
          id: laterPaymentId,
          status: "success",
          settledAt: new Date("2026-10-01T12:00:00.000Z"),
          providerRef: "LATER-PAYMENT",
          ipnPayload: null,
        },
      ],
    });
    const blocked = await planHistoricalPaymentImport(
      fakeDb({ invoices: [target] }),
      manifest(),
      invocation,
    );
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "later_settled_payments_require_review",
        }),
      ]),
    );

    const reviewed = await planHistoricalPaymentImport(
      fakeDb({ invoices: [target] }),
      manifest({
        historicalOrderingReview: {
          decision: "apply_to_current_remaining_balance",
          invoiceId: "invoice-1",
          invoiceRevision: 3,
          laterPaymentIds: [laterPaymentId],
          reason:
            "Finance approved applying this older cash to the current remaining invoice balance.",
        },
      }),
      invocation,
    );
    expect(reviewed.blockers).toEqual([]);

    const stale = await planHistoricalPaymentImport(
      fakeDb({ invoices: [target] }),
      manifest({
        historicalOrderingReview: {
          decision: "apply_to_current_remaining_balance",
          invoiceId: "invoice-1",
          invoiceRevision: 2,
          laterPaymentIds: [laterPaymentId],
          reason:
            "Finance approved applying this older cash to the current remaining invoice balance.",
        },
      }),
      invocation,
    );
    expect(stale.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "stale_historical_ordering_review" }),
      ]),
    );

    const undatedInvoice = invoice({
      payments: [
        {
          id: laterPaymentId,
          status: "refunded",
          settledAt: null,
          providerRef: "UNDATED-PAYMENT",
          ipnPayload: null,
        },
      ],
    });
    const undated = await planHistoricalPaymentImport(
      fakeDb({ invoices: [undatedInvoice] }),
      manifest(),
      invocation,
    );
    expect(undated.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "settled_payments_missing_date" }),
      ]),
    );
  });

  it("treats an exact reviewed manifest as a no-op and rejects the same workbook with changed review content", async () => {
    const reviewed = manifest();
    const existingBatch = {
      id: "batch-1",
      status: "imported",
      manifestSha256: historicalPaymentManifestDigest(reviewed),
      sourceExtractionSha256: reviewed.sourceExtractionSha256,
      importedRows: 1,
      alreadyRecordedRows: 0,
      importedXof: 315_000n,
      alreadyRecordedXof: 0n,
      excludedXof: 0n,
    };
    const noOp = await planHistoricalPaymentImport(
      fakeDb({ existingBatch }),
      reviewed,
      invocation,
    );
    expect(noOp.alreadyImportedBatchId).toBe("batch-1");

    const changed = HistoricalPaymentManifestSchema.parse({
      ...reviewed,
      reviewNote:
        "Finance changed the reviewed manifest after the first import.",
    });
    await expect(
      planHistoricalPaymentImport(
        fakeDb({ existingBatch }),
        changed,
        invocation,
      ),
    ).rejects.toBeInstanceOf(HistoricalPaymentImportBlockedError);
  });

  it("returns a nonzero dry-run status for blockers without printing workbook PII", async () => {
    const sourceStudentName = "Sensitive Workbook Person";
    const plan = await planHistoricalPaymentImport(
      fakeDb(),
      manifest({ sourceStudentName }),
      invocation,
    );
    expect(plan.warnings).toHaveLength(1);
    expect(JSON.stringify(plan.warnings)).not.toContain(sourceStudentName);
    expect(JSON.stringify(plan.warnings)).not.toContain("DAUST-001");
    expect(historicalPaymentDryRunExitCode(plan)).toBe(0);
    expect(
      historicalPaymentDryRunExitCode({
        blockers: [{ code: "blocked", message: "blocked" }],
      }),
    ).toBe(2);
  });

  it("blocks archived students and source-row ownership conflicts", async () => {
    const archived = await planHistoricalPaymentImport(
      fakeDb({ studentStatus: "archived" }),
      manifest(),
      invocation,
    );
    expect(archived.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "student_not_active" }),
      ]),
    );

    const firstPlan = await planHistoricalPaymentImport(
      fakeDb(),
      manifest(),
      invocation,
    );
    const conflict = await planHistoricalPaymentImport(
      fakeDb({
        providerConflicts: [
          {
            id: "existing-source-row",
            providerRef: firstPlan.payments[0]!.providerRef,
          },
        ],
      }),
      manifest(),
      invocation,
    );
    expect(conflict.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "source_row_already_owned" }),
      ]),
    );
  });
});

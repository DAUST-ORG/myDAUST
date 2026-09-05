import { describe, expect, it } from "vitest";
import {
  OpeningBalanceManifestSchema,
  openingBalanceProviderRef,
} from "./opening-balance-import.manifest.js";
import {
  allocateOldestFirst,
  planOpeningBalanceImport,
  type OpeningBalanceStudent,
} from "./opening-balance-import.planner.js";

const WORKBOOK_SHA = "b".repeat(64);
const PAY_1 = "11111111-1111-4111-8111-111111111111";

function row(overrides: Record<string, unknown> = {}) {
  return {
    rowKey: "r1",
    sourceRowNumber: 20,
    sourceStudentName: "Abdou Aziz Bèye",
    identity: { status: "authoritative", studentNo: "F202601AAB" },
    amountXof: 1_073_750,
    installmentSequence: 1,
    ...overrides,
  };
}

function manifest(rows: Record<string, unknown>[]) {
  return OpeningBalanceManifestSchema.parse({
    version: 1,
    academicYearLabel: "2026–2027",
    sourceFileName: "billing.xlsx",
    sourceWorkbookSha256: WORKBOOK_SHA,
    asOfDate: "2026-08-29",
    preparedBy: "bursar@daust.edu.sn",
    acknowledgement: {
      noSettlementDates: true,
      noPaymentMethods: true,
      noExternalReferences: true,
    },
    reconstructionNote:
      "The finance workbook records collected amounts but carries no settlement dates, methods or references.",
    declaredRowCount: rows.length,
    declaredTotalXof: rows.reduce((sum, r) => sum + (r.amountXof as number), 0),
    rows,
  });
}

function student(
  overrides: Partial<OpeningBalanceStudent> = {},
): OpeningBalanceStudent {
  return {
    studentId: "student-1",
    studentNo: "F202601AAB",
    recordStatus: "active",
    payments: [],
    invoice: {
      id: "invoice-1",
      totalAmount: 4_295_000,
      amountPaid: 0,
      installments: [1, 2, 3, 4].map((sequence) => ({
        id: `inst-${sequence}`,
        sequence,
        amountDue: 1_073_750,
        amountPaid: 0,
      })),
    },
    ...overrides,
  };
}

describe("opening-balance manifest", () => {
  it("requires the operator to acknowledge every missing field", () => {
    expect(() =>
      OpeningBalanceManifestSchema.parse({
        version: 1,
        academicYearLabel: "2026–2027",
        sourceFileName: "billing.xlsx",
        sourceWorkbookSha256: WORKBOOK_SHA,
        asOfDate: "2026-08-29",
        preparedBy: "bursar@daust.edu.sn",
        acknowledgement: { noSettlementDates: true, noPaymentMethods: true },
        reconstructionNote: "x".repeat(50),
        declaredRowCount: 1,
        declaredTotalXof: 1_073_750,
        rows: [row()],
      }),
    ).toThrow();
  });

  it("demands a substantive reconstruction note", () => {
    expect(() =>
      OpeningBalanceManifestSchema.parse({
        version: 1,
        academicYearLabel: "2026–2027",
        sourceFileName: "billing.xlsx",
        sourceWorkbookSha256: WORKBOOK_SHA,
        asOfDate: "2026-08-29",
        preparedBy: "bursar@daust.edu.sn",
        acknowledgement: {
          noSettlementDates: true,
          noPaymentMethods: true,
          noExternalReferences: true,
        },
        reconstructionNote: "too short",
        declaredRowCount: 1,
        declaredTotalXof: 1_073_750,
        rows: [row()],
      }),
    ).toThrow();
  });

  it("rejects a declared total that disagrees with the rows", () => {
    expect(() => manifest([row(), row({ rowKey: "r1" })])).toThrow(
      /Duplicate rowKey/,
    );
  });

  it("derives a deterministic, recognisable provider reference", () => {
    const ref = openingBalanceProviderRef(WORKBOOK_SHA, "r1");
    expect(ref).toMatch(/^OPENBAL-[0-9a-f]{24}$/);
    expect(openingBalanceProviderRef(WORKBOOK_SHA, "r1")).toBe(ref);
    expect(openingBalanceProviderRef(WORKBOOK_SHA, "r2")).not.toBe(ref);
  });
});

describe("allocation", () => {
  it("fills the named installment first, then the oldest remaining", () => {
    const installments = [1, 2, 3, 4].map((sequence) => ({
      id: `i${sequence}`,
      sequence,
      amountDue: 1_000,
      amountPaid: 0,
    }));
    const { allocations, unallocatedXof } = allocateOldestFirst(
      2_500,
      installments,
      3,
    );
    expect(allocations.map((a) => [a.sequence, a.amountXof])).toEqual([
      [3, 1_000],
      [1, 1_000],
      [2, 500],
    ]);
    expect(unallocatedXof).toBe(0);
  });

  it("reports cash the installments cannot absorb", () => {
    const installments = [
      { id: "i1", sequence: 1, amountDue: 1_000, amountPaid: 900 },
    ];
    const { allocations, unallocatedXof } = allocateOldestFirst(
      500,
      installments,
      null,
    );
    expect(allocations).toEqual([
      { installmentId: "i1", sequence: 1, amountXof: 100 },
    ]);
    expect(unallocatedXof).toBe(400);
  });
});

describe("opening-balance planner", () => {
  it("plans a clean payment against the named installment", () => {
    const plan = planOpeningBalanceImport(manifest([row()]), [student()]);
    expect(plan.blockers).toHaveLength(0);
    expect(plan.postable).toHaveLength(1);
    expect(plan.postable[0]?.allocations[0]).toMatchObject({
      sequence: 1,
      amountXof: 1_073_750,
    });
    expect(plan.totals.postableXof).toBe(1_073_750);
  });

  it("refuses an undated payment that matches cash already in the ledger", () => {
    const plan = planOpeningBalanceImport(manifest([row()]), [
      student({
        payments: [
          { id: PAY_1, amountXof: 1_073_750, settledAt: null, method: "wave" },
        ],
      }),
    ]);
    expect(plan.blockers.map((b) => b.code)).toEqual(["possible_duplicate"]);
  });

  it("accepts a duplicate once a human records the decision", () => {
    const plan = planOpeningBalanceImport(
      manifest([
        row({
          existingPaymentDecision: {
            decision: "confirmed_distinct",
            paymentIds: [PAY_1],
            reason:
              "Two separate deposits of the same amount, confirmed with the bursar",
          },
        }),
      ]),
      [
        student({
          payments: [
            {
              id: PAY_1,
              amountXof: 1_073_750,
              settledAt: null,
              method: "wave",
            },
          ],
        }),
      ],
    );
    expect(plan.blockers).toHaveLength(0);
    expect(plan.postable).toHaveLength(1);
  });

  it("posts nothing for a row already recorded in the ledger", () => {
    const plan = planOpeningBalanceImport(
      manifest([
        row({
          existingPaymentDecision: {
            decision: "already_recorded",
            paymentId: PAY_1,
            reason: "Same deposit already captured through the Wave rail",
          },
        }),
      ]),
      [
        student({
          payments: [
            {
              id: PAY_1,
              amountXof: 1_073_750,
              settledAt: null,
              method: "wave",
            },
          ],
        }),
      ],
    );
    expect(plan.postable).toHaveLength(0);
    expect(plan.alreadyRecorded).toEqual([
      { rowKey: "r1", paymentId: PAY_1, amountXof: 1_073_750 },
    ]);
  });

  it("refuses to let two rows claim the same existing payment", () => {
    const decision = {
      decision: "already_recorded",
      paymentId: PAY_1,
      reason: "Same deposit already captured through the Wave rail",
    };
    const plan = planOpeningBalanceImport(
      manifest([
        row({ existingPaymentDecision: decision }),
        row({ rowKey: "r2", existingPaymentDecision: decision }),
      ]),
      [
        student({
          payments: [
            {
              id: PAY_1,
              amountXof: 1_073_750,
              settledAt: null,
              method: "wave",
            },
          ],
        }),
      ],
    );
    expect(plan.blockers.map((b) => b.code)).toContain(
      "decision_payment_claimed_twice",
    );
  });

  it("refuses a decision pointing at a payment the student does not hold", () => {
    const plan = planOpeningBalanceImport(
      manifest([
        row({
          existingPaymentDecision: {
            decision: "already_recorded",
            paymentId: "00000000-0000-4000-8000-000000000000",
            reason: "Believed to be the same deposit as an existing record",
          },
        }),
      ]),
      [student()],
    );
    expect(plan.blockers.map((b) => b.code)).toEqual([
      "decision_targets_unknown_payment",
    ]);
  });

  it("refuses cash that would exceed the package", () => {
    const plan = planOpeningBalanceImport(
      manifest([row({ amountXof: 5_000_000 })]),
      [student()],
    );
    expect(plan.blockers.map((b) => b.code)).toEqual(["exceeds_invoice_total"]);
  });

  it("blocks an unmatched student rather than guessing", () => {
    const plan = planOpeningBalanceImport(
      manifest([row({ identity: { status: "missing" } })]),
      [student()],
    );
    expect(plan.blockers.map((b) => b.code)).toEqual(["identity_missing"]);
    expect(plan.totals.blockedXof).toBe(1_073_750);
  });

  it("blocks a student with no live package", () => {
    const plan = planOpeningBalanceImport(manifest([row()]), [
      student({ invoice: null }),
    ]);
    expect(plan.blockers.map((b) => b.code)).toEqual(["no_live_invoice"]);
  });
});

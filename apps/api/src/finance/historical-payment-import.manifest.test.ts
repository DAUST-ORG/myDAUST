import { describe, expect, it } from "vitest";
import {
  HistoricalPaymentManifestSchema,
  historicalPaymentManifestDigest,
  historicalPaymentProviderRef,
  historicalPaymentSourceKey,
  historicalSettlementTimestamp,
  normalizePaymentIdentityName,
} from "./historical-payment-import.manifest.js";

const WORKBOOK_SHA = "a".repeat(64);

function row(overrides: Record<string, unknown> = {}) {
  return {
    sourceGroupKey: "REINSCRIPTIONS!D6",
    sourceSheet: "REINSCRIPTIONS",
    sourceRowNumbers: [6],
    sourceAmountXof: 315_000,
    allocationKey: "payment-1",
    sourceStudentName: "Mbéye Test",
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

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    importName: "Reviewed 2026 registration payments",
    academicYearLabel: "2026–2027",
    currency: "XOF",
    allRowsSettled: true,
    notificationPolicy: "suppress",
    sourceWorkbook: {
      fileName: "payments.xlsx",
      sha256: WORKBOOK_SHA,
    },
    sourceExtractionSha256: "e".repeat(64),
    sourceGroupCount: 1,
    sourceTotalXof: 315_000,
    rows: [row()],
    excludedGroups: [],
    reviewNote: "Finance reviewed every identity, amount, date and method.",
    ...overrides,
  };
}

describe("historical payment import manifest", () => {
  it("accepts an explicit, fully reviewed payment", () => {
    const parsed = HistoricalPaymentManifestSchema.parse(manifest());
    expect(parsed.rows[0]).toMatchObject({
      amountXof: 315_000,
      identity: { status: "authoritative", studentNo: "DAUST-001" },
      method: "wave",
    });
  });

  it("preserves cheque as a truthful accounting method", () => {
    const parsed = HistoricalPaymentManifestSchema.parse(
      manifest({
        rows: [
          row({
            sourceMethod: "CHEQUE N° 12345",
            method: "cheque",
            externalReference: "12345",
          }),
        ],
      }),
    );
    expect(parsed.rows[0]!.method).toBe("cheque");
  });

  it("requires a reason for a corrected workbook date", () => {
    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          rows: [
            row({
              sourceSettledOn: "2006-07-01",
              settledOn: "2026-07-01",
            }),
          ],
        }),
      ),
    ).toThrow(/corrected settlement date requires a review reason/i);

    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          rows: [
            row({
              sourceSettledOn: "2006-07-01",
              settledOn: "2026-07-01",
              dateCorrectionReason:
                "Finance verified the original bank record and corrected the year.",
            }),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("requires merged amounts to reconcile and carry an explicit split review", () => {
    const splitRows = [
      row({
        sourceGroupKey: "INSCRIPTIONS!D17,D18",
        sourceSheet: "INSCRIPTIONS",
        sourceRowNumbers: [17, 18],
        sourceAmountXof: 1_000_000,
        allocationKey: "student-a",
        sourceStudentName: "Student A",
        identity: { status: "authoritative", studentNo: "DAUST-A" },
        amountXof: 600_000,
        splitResolution: {
          reason:
            "Finance confirmed the split using the supporting receipt ledger.",
        },
      }),
      row({
        sourceGroupKey: "INSCRIPTIONS!D17,D18",
        sourceSheet: "INSCRIPTIONS",
        sourceRowNumbers: [17, 18],
        sourceAmountXof: 1_000_000,
        allocationKey: "student-b",
        sourceStudentName: "Student B",
        identity: { status: "authoritative", studentNo: "DAUST-B" },
        amountXof: 400_000,
        splitResolution: {
          reason:
            "Finance confirmed the split using the supporting receipt ledger.",
        },
      }),
    ];
    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          sourceTotalXof: 1_000_000,
          rows: splitRows,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          sourceTotalXof: 999_999,
          rows: splitRows.map((payment, index) =>
            index === 1 ? { ...payment, amountXof: 399_999 } : payment,
          ),
        }),
      ),
    ).toThrow(/allocates 999999 XOF.*contains 1000000 XOF/i);
  });

  it("blocks duplicate-looking workbook rows until Finance confirms they are distinct", () => {
    const duplicate = row({
      sourceGroupKey: "REINSCRIPTIONS!D7",
      sourceRowNumbers: [7],
      allocationKey: "payment-2",
    });
    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          sourceGroupCount: 2,
          sourceTotalXof: 630_000,
          rows: [row(), duplicate],
        }),
      ),
    ).toThrow(/duplicate-looking payments require/i);

    const duplicateResolution = {
      decision: "confirmed_distinct",
      reason:
        "Finance compared the two distinct deposit records and retained both.",
    };
    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          sourceGroupCount: 2,
          sourceTotalXof: 630_000,
          rows: [
            row({ duplicateResolution }),
            { ...duplicate, duplicateResolution },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("reconciles excluded duplicate groups to the immutable workbook control total", () => {
    const parsed = HistoricalPaymentManifestSchema.parse(
      manifest({
        sourceGroupCount: 2,
        sourceTotalXof: 630_000,
        excludedGroups: [
          {
            sourceGroupKey: "REINSCRIPTIONS!D7",
            sourceSheet: "REINSCRIPTIONS",
            sourceRowNumbers: [7],
            sourceAmountXof: 315_000,
            sourceStudentNames: ["Mbéye Test"],
            sourceSettledOn: "2026-08-04",
            sourceMethod: "WAVE B",
            disposition: "duplicate",
            reason:
              "Finance confirmed this row duplicates the immediately preceding payment.",
          },
        ],
      }),
    );
    expect(parsed.excludedGroups).toHaveLength(1);
  });

  it("does not allow one workbook name to map to multiple students", () => {
    expect(() =>
      HistoricalPaymentManifestSchema.parse(
        manifest({
          sourceGroupCount: 2,
          sourceTotalXof: 630_000,
          rows: [
            row(),
            row({
              sourceGroupKey: "REINSCRIPTIONS!D7",
              sourceRowNumbers: [7],
              allocationKey: "payment-2",
              settledOn: "2026-08-05",
              sourceSettledOn: "2026-08-05",
              identity: {
                status: "authoritative",
                studentNo: "DAUST-002",
              },
            }),
          ],
        }),
      ),
    ).toThrow(/one workbook name maps to multiple student numbers/i);
  });

  it("derives stable source and provider keys from the exact workbook row", () => {
    const parsed = HistoricalPaymentManifestSchema.parse(manifest());
    const sourceKey = historicalPaymentSourceKey(parsed, parsed.rows[0]!);
    expect(sourceKey).toMatch(/^[a-f0-9]{64}$/);
    expect(historicalPaymentSourceKey(parsed, parsed.rows[0]!)).toBe(sourceKey);
    expect(historicalPaymentProviderRef(sourceKey)).toBe(`HIST-${sourceKey}`);
  });

  it("derives a canonical manifest digest that changes with reviewed decisions", () => {
    const parsed = HistoricalPaymentManifestSchema.parse(manifest());
    const digest = historicalPaymentManifestDigest(parsed);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    const changed = HistoricalPaymentManifestSchema.parse({
      ...parsed,
      reviewNote: "Finance completed a second distinct manifest review pass.",
    });
    expect(historicalPaymentManifestDigest(changed)).not.toBe(digest);
  });

  it("normalizes accents without treating names as authoritative identifiers", () => {
    expect(normalizePaymentIdentityName("  Mbéye   Test-Sène ")).toBe(
      "MBEYE TEST SENE",
    );
  });

  it("stores historical dates at a stable Dakar-safe timestamp", () => {
    expect(historicalSettlementTimestamp("2026-08-04").toISOString()).toBe(
      "2026-08-04T12:00:00.000Z",
    );
  });
});

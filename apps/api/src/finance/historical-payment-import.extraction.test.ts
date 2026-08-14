import { describe, expect, it } from "vitest";
import {
  HistoricalPaymentExtractionMismatchError,
  TrustedHistoricalPaymentExtractionSchema,
  trustedHistoricalPaymentExtractionDigest,
  verifyHistoricalPaymentManifestExtraction,
} from "./historical-payment-import.extraction.js";
import { HistoricalPaymentManifestSchema } from "./historical-payment-import.manifest.js";

function extractionGroup(overrides: Record<string, unknown> = {}) {
  return {
    sourceSheet: "REINSCRIPTIONS",
    sourceRowNumbers: [6],
    sourceAmountXof: 315_000,
    sourceSettledOn: "2026-08-04",
    sourceMethod: "WAVE B",
    sourceStudentNames: ["Test Student"],
    ...overrides,
  };
}

function extraction(overrides: Record<string, unknown> = {}) {
  return TrustedHistoricalPaymentExtractionSchema.parse({
    schemaVersion: 1,
    extractor: { name: "trusted-xlsx-extractor", version: "1.0.0" },
    sourceWorkbookSha256: "a".repeat(64),
    sourceGroupCount: 1,
    sourceTotalXof: 315_000,
    sourceGroups: [extractionGroup()],
    ...overrides,
  });
}

function manifest(source = extraction()) {
  return HistoricalPaymentManifestSchema.parse({
    schemaVersion: 1,
    importName: "Trusted extraction verification",
    academicYearLabel: "2026–2027",
    currency: "XOF",
    allRowsSettled: true,
    notificationPolicy: "suppress",
    sourceWorkbook: {
      fileName: "payments.xlsx",
      sha256: source.sourceWorkbookSha256,
    },
    sourceExtractionSha256: trustedHistoricalPaymentExtractionDigest(source),
    sourceGroupCount: 1,
    sourceTotalXof: 315_000,
    rows: [
      {
        sourceGroupKey: "REINSCRIPTIONS!D6",
        sourceSheet: "REINSCRIPTIONS",
        sourceRowNumbers: [6],
        sourceAmountXof: 315_000,
        allocationKey: "student-payment",
        sourceStudentName: "Test Student",
        identity: { status: "authoritative", studentNo: "DAUST-001" },
        sourceSettledOn: "2026-08-04",
        settledOn: "2026-08-04",
        amountXof: 315_000,
        sourceMethod: "WAVE B",
        method: "wave",
        status: "settled",
        reviewed: true,
      },
    ],
    excludedGroups: [],
    reviewNote: "Finance reviewed the extracted physical workbook cells.",
  });
}

describe("trusted historical-payment extraction", () => {
  it("binds the reviewed manifest to physical workbook coordinates and values", () => {
    const source = extraction();
    expect(() =>
      verifyHistoricalPaymentManifestExtraction(manifest(source), source),
    ).not.toThrow();
    expect(trustedHistoricalPaymentExtractionDigest(source)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("rejects altered workbook evidence even when the workbook hash is reused", () => {
    const reviewedSource = extraction();
    const alteredSource = extraction({
      sourceGroups: [
        extractionGroup({
          sourceSettledOn: "2026-08-05",
          sourceMethod: "OM B",
          sourceStudentNames: ["Different Student"],
        }),
      ],
    });
    expect(() =>
      verifyHistoricalPaymentManifestExtraction(
        manifest(reviewedSource),
        alteredSource,
      ),
    ).toThrow(HistoricalPaymentExtractionMismatchError);
  });

  it("rejects duplicate physical coordinates in the trusted extraction", () => {
    expect(() =>
      TrustedHistoricalPaymentExtractionSchema.parse({
        schemaVersion: 1,
        extractor: { name: "trusted-xlsx-extractor", version: "1.0.0" },
        sourceWorkbookSha256: "a".repeat(64),
        sourceGroupCount: 2,
        sourceTotalXof: 630_000,
        sourceGroups: [extractionGroup(), extractionGroup()],
      }),
    ).toThrow(/appears more than once/i);
  });

  it("faithfully permits a blank raw method while requiring a reviewed mapped method", () => {
    const source = extraction({
      sourceGroups: [extractionGroup({ sourceMethod: "" })],
    });
    const reviewed = HistoricalPaymentManifestSchema.parse({
      ...manifest(extraction()),
      sourceExtractionSha256: trustedHistoricalPaymentExtractionDigest(source),
      rows: [
        {
          ...manifest(extraction()).rows[0],
          sourceMethod: "",
          method: "wire",
        },
      ],
    });
    expect(() =>
      verifyHistoricalPaymentManifestExtraction(reviewed, source),
    ).not.toThrow();
  });
});

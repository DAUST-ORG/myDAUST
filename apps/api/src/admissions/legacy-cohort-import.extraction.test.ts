import { describe, expect, it } from "vitest";
import {
  LegacyCohortExtractionMismatchError,
  TrustedLegacyCohortExtractionSchema,
  trustedLegacyCohortExtractionDigest,
  verifyLegacyCohortManifestExtraction,
} from "./legacy-cohort-import.extraction.js";
import { LegacyCohortManifestSchema } from "./legacy-cohort-import.manifest.js";

const WORKBOOK_SHA = "a".repeat(64);
const FINGERPRINT = "f".repeat(64);
const REASON =
  "Reviewed against the original source workbook and signed reconciliation.";

function extraction(overrides: Record<string, unknown> = {}) {
  return TrustedLegacyCohortExtractionSchema.parse({
    schemaVersion: 1,
    extractor: { name: "legacy-cohort-extractor", version: "1" },
    sourceWorkbookSha256: WORKBOOK_SHA,
    sourceRowCount: 1,
    sourcePaidTotalXof: 500_000,
    rows: [
      {
        sourceSheet: "PAID",
        sourceRowNumber: 2,
        rowFingerprintSha256: FINGERPRINT,
        sourceLabel: "paid",
        sourceLegacyStudentNo: "F202600001",
        paymentAmountXof: 500_000,
      },
    ],
    ...overrides,
  });
}

function manifestFor(
  trusted = extraction(),
  personOverrides: Record<string, unknown> = {},
) {
  return LegacyCohortManifestSchema.parse({
    schemaVersion: 1,
    importName: "Reviewed Fall 2026 legacy cohort",
    sourceWorkbook: {
      fileName: "New_Students_Fall_2026 - SN.xlsx",
      sha256: WORKBOOK_SHA,
    },
    sourceExtractionSha256: trustedLegacyCohortExtractionDigest(trusted),
    sourceRowCount: 1,
    sourcePaidTotalXof: 500_000,
    academicYear: {
      id: "11111111-1111-4111-8111-111111111111",
      label: "2026-2027",
    },
    currency: "XOF",
    notificationPolicy: "suppress_all",
    guardians: [
      {
        guardianKey: "guardian-001",
        firstName: "Reviewed",
        lastName: "Parent",
        phone: "+221700000001",
        address: null,
        email: {
          sourceEmail: "parent-001@example.test",
          finalEmail: "parent-001@example.test",
          disposition: "use_source",
        },
        identityDecision: {
          disposition: "create_new",
          reviewed: true,
          reason: REASON,
        },
      },
    ],
    people: [
      {
        personKey: "person-001",
        legacyStudentNo: "F202600001",
        legacyIdDecision: { disposition: "use_source" },
        groupingReview: { reviewed: true, reason: REASON },
        applicant: {
          firstName: "Reviewed",
          lastName: "Student",
          dateOfBirth: "2006-03-12",
          programCode: "BSCS",
          studentEmail: {
            sourceEmail: "student-001@example.test",
            finalEmail: "student-001@example.test",
            disposition: "use_source",
          },
        },
        guardianKeys: ["guardian-001"],
        sources: [
          {
            sourceSheet: "PAID",
            sourceRowNumber: 2,
            rowFingerprintSha256: FINGERPRINT,
            disposition: { kind: "cash", paymentKey: "payment-001" },
          },
        ],
        payments: [
          {
            paymentKey: "payment-001",
            sourceCoordinates: [{ sourceSheet: "PAID", sourceRowNumber: 2 }],
            amountXof: 500_000,
            evidence: {
              status: "reviewed_legacy_gap",
              settledOn: "2026-08-01",
              dateAccuracy: "administrative_estimate",
              method: "legacy_unknown",
              unknownFields: ["settlement_date", "method", "reference"],
              deterministicReferenceConsent: true,
              reason: REASON,
            },
            reviewed: true,
          },
        ],
        ...personOverrides,
      },
    ],
    reviewNote: REASON,
  });
}

function expectMismatch(action: () => void, pattern: RegExp): void {
  try {
    action();
    throw new Error("Expected extraction verification to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(LegacyCohortExtractionMismatchError);
    expect(
      (error as LegacyCohortExtractionMismatchError).issues.join("\n"),
    ).toMatch(pattern);
  }
}

describe("legacy cohort extraction binding", () => {
  it("accepts an exact reviewed workbook extraction", () => {
    const trusted = extraction();
    expect(() =>
      verifyLegacyCohortManifestExtraction(manifestFor(trusted), trusted),
    ).not.toThrow();
  });

  it("rejects source fingerprint and extraction digest drift", () => {
    const trusted = extraction();
    const manifest = manifestFor(trusted);
    const changed = extraction({
      rows: [
        {
          ...trusted.rows[0],
          rowFingerprintSha256: "e".repeat(64),
        },
      ],
    });

    expect(() =>
      verifyLegacyCohortManifestExtraction(manifest, changed),
    ).toThrow(LegacyCohortExtractionMismatchError);
  });

  it("requires a reviewed F-ID assignment when source identity is missing", () => {
    const trusted = extraction({
      rows: [
        {
          ...extraction().rows[0],
          sourceLegacyStudentNo: null,
        },
      ],
    });
    const manifest = manifestFor(trusted);

    expectMismatch(
      () => verifyLegacyCohortManifestExtraction(manifest, trusted),
      /use_source legacy ID/,
    );

    const reviewed = manifestFor(trusted, {
      legacyIdDecision: {
        disposition: "reviewed_assignment",
        reason: REASON,
      },
    });
    expect(() =>
      verifyLegacyCohortManifestExtraction(reviewed, trusted),
    ).not.toThrow();
  });

  it("blocks changed payment amounts without a reviewed reason", () => {
    const trusted = extraction();
    const base = manifestFor(trusted);
    const changed = manifestFor(trusted, {
      payments: [
        {
          ...base.people[0]!.payments[0],
          amountXof: 450_000,
        },
      ],
    });

    expectMismatch(
      () => verifyLegacyCohortManifestExtraction(changed, trusted),
      /amountReviewReason/,
    );
  });

  it("never permits an unpaid row to post cash", () => {
    expect(() =>
      extraction({
        sourcePaidTotalXof: 0,
        rows: [
          {
            ...extraction().rows[0],
            sourceLabel: "unpaid",
            paymentAmountXof: null,
          },
        ],
      }),
    ).not.toThrow();
    const trusted = extraction({
      sourcePaidTotalXof: 0,
      rows: [
        {
          ...extraction().rows[0],
          sourceLabel: "unpaid",
          paymentAmountXof: null,
        },
      ],
    });
    const manifest = manifestFor(trusted, {
      payments: [
        {
          ...manifestFor(extraction()).people[0]!.payments[0],
          amountReviewReason: REASON,
        },
      ],
    });

    expectMismatch(
      () => verifyLegacyCohortManifestExtraction(manifest, trusted),
      /unpaid source row cannot post cash/,
    );
  });
});

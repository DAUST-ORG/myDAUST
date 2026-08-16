import { describe, expect, it } from "vitest";
import {
  LegacyCohortManifestSchema,
  legacyCohortManifestDigest,
} from "./legacy-cohort-import.manifest.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const REVIEW_REASON =
  "Reviewed against the preserved legacy workbook and signed reconciliation.";

function sourceRow(row = 2) {
  return {
    sourceSheet: "UNPAID",
    sourceRowNumber: row,
    rowFingerprintSha256: row === 2 ? SHA_C : "d".repeat(64),
    disposition: { kind: "no_cash" as const, reason: REVIEW_REASON },
  };
}

function guardian(overrides: Record<string, unknown> = {}) {
  return {
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
      reason: REVIEW_REASON,
    },
    ...overrides,
  };
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    personKey: "person-001",
    legacyStudentNo: "F202600001",
    legacyIdDecision: { disposition: "use_source" },
    groupingReview: { reviewed: true, reason: REVIEW_REASON },
    applicant: {
      firstName: "Reviewed",
      lastName: "Student",
      dateOfBirth: "2006-03-12",
      programCode: "BSCS",
      phone: "+221700000002",
      gender: null,
      nationality: "SN",
      city: "Dakar",
      term: "Fall 2026",
      studentEmail: {
        sourceEmail: "student-001@example.test",
        finalEmail: "student-001@example.test",
        disposition: "use_source",
      },
    },
    guardianKeys: ["guardian-001"],
    sources: [sourceRow()],
    payments: [],
    ...overrides,
  };
}

function rawManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    importName: "Reviewed Fall 2026 legacy cohort",
    sourceWorkbook: {
      fileName: "New_Students_Fall_2026 - SN.xlsx",
      sha256: SHA_A,
    },
    sourceExtractionSha256: SHA_B,
    sourceRowCount: 1,
    sourcePaidTotalXof: 0,
    academicYear: {
      id: "11111111-1111-4111-8111-111111111111",
      label: "2026-2027",
    },
    currency: "XOF",
    notificationPolicy: "suppress_all",
    guardians: [guardian()],
    people: [person()],
    reviewNote: REVIEW_REASON,
    ...overrides,
  };
}

describe("LegacyCohortManifestSchema", () => {
  it("accepts explicit F-IDs, nullable guardian addresses, and no payments", () => {
    const manifest = LegacyCohortManifestSchema.parse(rawManifest());

    expect(manifest.people[0]?.legacyStudentNo).toBe("F202600001");
    expect(manifest.guardians[0]?.address).toBeNull();
    expect(manifest.notificationPolicy).toBe("suppress_all");
  });

  it("rejects any legacy cohort policy that could send automatic email", () => {
    expect(() =>
      LegacyCohortManifestSchema.parse(
        rawManifest({
          notificationPolicy: "suppress_except_post_commit_activation_invite",
        }),
      ),
    ).toThrow();
  });

  it("rejects duplicate permanent F-IDs across person groups", () => {
    const second = person({
      personKey: "person-002",
      sources: [sourceRow(3)],
      applicant: {
        ...(person().applicant as Record<string, unknown>),
        firstName: "Second",
        studentEmail: {
          sourceEmail: "student-002@example.test",
          finalEmail: "student-002@example.test",
          disposition: "use_source",
        },
      },
    });

    expect(() =>
      LegacyCohortManifestSchema.parse(
        rawManifest({ sourceRowCount: 2, people: [person(), second] }),
      ),
    ).toThrow(/only one person group/);
  });

  it("requires truthful method, reference, and date uncertainty", () => {
    const cashSource = {
      ...sourceRow(),
      disposition: { kind: "cash", paymentKey: "payment-001" },
    };
    const reviewedGap = {
      paymentKey: "payment-001",
      sourceCoordinates: [{ sourceSheet: "UNPAID", sourceRowNumber: 2 }],
      amountXof: 500_000,
      amountReviewReason: REVIEW_REASON,
      evidence: {
        status: "reviewed_legacy_gap",
        settledOn: "2026-08-01",
        dateAccuracy: "administrative_estimate",
        method: "legacy_unknown",
        unknownFields: ["settlement_date", "method", "reference"],
        deterministicReferenceConsent: true,
        reason: REVIEW_REASON,
      },
      reviewed: true,
    };
    const valid = LegacyCohortManifestSchema.parse(
      rawManifest({
        sourcePaidTotalXof: 500_000,
        people: [person({ sources: [cashSource], payments: [reviewedGap] })],
      }),
    );
    expect(valid.people[0]?.payments[0]?.evidence.method).toBe(
      "legacy_unknown",
    );

    expect(() =>
      LegacyCohortManifestSchema.parse(
        rawManifest({
          sourcePaidTotalXof: 500_000,
          people: [
            person({
              sources: [cashSource],
              payments: [
                {
                  ...reviewedGap,
                  evidence: {
                    ...reviewedGap.evidence,
                    method: "wire",
                  },
                },
              ],
            }),
          ],
        }),
      ),
    ).toThrow(/legacy_unknown/);
  });

  it("rejects cross-person duplicate links and unreferenced guardians", () => {
    const secondGuardian = guardian({
      guardianKey: "guardian-002",
      email: {
        sourceEmail: "parent-002@example.test",
        finalEmail: "parent-002@example.test",
        disposition: "use_source",
      },
    });
    const second = person({
      personKey: "person-002",
      legacyStudentNo: "F202600002",
      guardianKeys: ["guardian-001"],
      sources: [
        {
          ...sourceRow(3),
          disposition: {
            kind: "duplicate",
            canonicalSource: {
              sourceSheet: "UNPAID",
              sourceRowNumber: 2,
            },
            reason: REVIEW_REASON,
          },
        },
      ],
      applicant: {
        ...(person().applicant as Record<string, unknown>),
        firstName: "Second",
        studentEmail: {
          sourceEmail: "student-002@example.test",
          finalEmail: "student-002@example.test",
          disposition: "use_source",
        },
      },
    });

    expect(() =>
      LegacyCohortManifestSchema.parse(
        rawManifest({
          sourceRowCount: 2,
          guardians: [guardian(), secondGuardian],
          people: [person(), second],
        }),
      ),
    ).toThrow(/cannot cross reviewed person groups|must be linked/);
  });

  it("requires explicit distinct-cash review for duplicate unreferenced signatures", () => {
    const sources = [2, 3].map((row, index) => ({
      sourceSheet: "PAID",
      sourceRowNumber: row,
      rowFingerprintSha256: index === 0 ? SHA_C : "d".repeat(64),
      disposition: {
        kind: "cash",
        paymentKey: `payment-00${index + 1}`,
      },
    }));
    const payment = (index: number) => ({
      paymentKey: `payment-00${index + 1}`,
      sourceCoordinates: [{ sourceSheet: "PAID", sourceRowNumber: index + 2 }],
      amountXof: 500_000,
      evidence: {
        status: "reviewed_legacy_gap",
        settledOn: "2026-08-01",
        dateAccuracy: "administrative_estimate",
        method: "legacy_unknown",
        unknownFields: ["settlement_date", "method", "reference"],
        deterministicReferenceConsent: true,
        reason: REVIEW_REASON,
      },
      reviewed: true,
    });

    expect(() =>
      LegacyCohortManifestSchema.parse(
        rawManifest({
          sourceRowCount: 2,
          sourcePaidTotalXof: 1_000_000,
          people: [
            person({
              sources,
              payments: [payment(0), payment(1)],
            }),
          ],
        }),
      ),
    ).toThrow(/confirmed distinct/);

    const reviewed = LegacyCohortManifestSchema.parse(
      rawManifest({
        sourceRowCount: 2,
        sourcePaidTotalXof: 1_000_000,
        people: [
          person({
            sources,
            payments: [0, 1].map((index) => ({
              ...payment(index),
              sameSignatureReview: {
                decision: "confirmed_distinct",
                reason: REVIEW_REASON,
              },
            })),
          }),
        ],
      }),
    );
    expect(reviewed.people[0]?.payments).toHaveLength(2);
  });

  it("canonicalizes punctuation when checking documented payment references", () => {
    const sources = [2, 3].map((row, index) => ({
      sourceSheet: "PAID",
      sourceRowNumber: row,
      rowFingerprintSha256: index === 0 ? SHA_C : "d".repeat(64),
      disposition: {
        kind: "cash" as const,
        paymentKey: `payment-00${index + 1}`,
      },
    }));
    const payment = (index: number, externalReference: string) => ({
      paymentKey: `payment-00${index + 1}`,
      sourceCoordinates: [{ sourceSheet: "PAID", sourceRowNumber: index + 2 }],
      amountXof: 500_000,
      evidence: {
        status: "documented" as const,
        settledOn: "2026-08-01",
        dateAccuracy: "exact" as const,
        method: "wire" as const,
        externalReference,
      },
      reviewed: true,
    });

    expect(() =>
      LegacyCohortManifestSchema.parse(
        rawManifest({
          sourceRowCount: 2,
          sourcePaidTotalXof: 1_000_000,
          people: [
            person({
              sources,
              payments: [payment(0, "BANK-42"), payment(1, "bank42")],
            }),
          ],
        }),
      ),
    ).toThrow(/already assigned/);
  });

  it("produces a stable digest independent of JSON property ordering", () => {
    const manifest = LegacyCohortManifestSchema.parse(rawManifest());
    const reordered = LegacyCohortManifestSchema.parse({
      reviewNote: manifest.reviewNote,
      people: manifest.people,
      guardians: manifest.guardians,
      notificationPolicy: manifest.notificationPolicy,
      currency: manifest.currency,
      academicYear: manifest.academicYear,
      sourcePaidTotalXof: manifest.sourcePaidTotalXof,
      sourceRowCount: manifest.sourceRowCount,
      sourceExtractionSha256: manifest.sourceExtractionSha256,
      sourceWorkbook: manifest.sourceWorkbook,
      importName: manifest.importName,
      schemaVersion: manifest.schemaVersion,
    });

    expect(legacyCohortManifestDigest(reordered)).toBe(
      legacyCohortManifestDigest(manifest),
    );
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256 } from "./workbook-cutover-attestation.service.js";
import {
  assessWorkbookCutoverReviewerAttestations,
  type WorkbookCutoverReviewerAttestationEvidence,
} from "./workbook-cutover.runner.js";

const MANIFEST_SHA = "a".repeat(64);
const REVIEWER_EMAIL = "reviewer@daust.org";
const BINDINGS = [{ reviewedBy: REVIEWER_EMAIL, personId: "person-1" }];

function evidence(
  overrides: Partial<WorkbookCutoverReviewerAttestationEvidence> = {},
): WorkbookCutoverReviewerAttestationEvidence {
  return {
    id: "attestation-1",
    manifestSha256: MANIFEST_SHA,
    reviewerId: "person-1",
    reviewerEmailNormalized: REVIEWER_EMAIL,
    authorizedRoles: ["registrar"],
    statementSha256: WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
    attestedAt: new Date("2026-09-01T12:00:00.000Z"),
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    ...overrides,
  };
}

function assess(rows: WorkbookCutoverReviewerAttestationEvidence[]) {
  return assessWorkbookCutoverReviewerAttestations({
    manifestSha256: MANIFEST_SHA,
    reviewerBindings: BINDINGS,
    evidence: rows,
  });
}

describe("workbook cutover reviewer-attestation assessment", () => {
  it("accepts one active exact-digest identity binding and redacts email from plan state", () => {
    const result = assess([evidence()]);
    expect(result.blockers).toEqual([]);
    expect(result.states).toEqual([
      expect.objectContaining({
        id: "attestation-1",
        manifestSha256: MANIFEST_SHA,
        reviewerId: "person-1",
        reviewerEmailSha256: createHash("sha256")
          .update(REVIEWER_EMAIL)
          .digest("hex"),
        revokedAt: null,
      }),
    ]);
    expect(JSON.stringify(result.states)).not.toContain(REVIEWER_EMAIL);
  });

  it("reports a non-PII missing code when no exact attestation exists", () => {
    const result = assess([]);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: "reviewer_attestation_missing",
        sourceKey: null,
      }),
    ]);
    expect(JSON.stringify(result.blockers)).not.toContain(REVIEWER_EMAIL);
    expect(JSON.stringify(result.blockers)).not.toContain("person-1");
  });

  it("does not accept an attestation for a stale manifest digest", () => {
    const result = assess([evidence({ manifestSha256: "b".repeat(64) })]);
    expect(result.states).toEqual([]);
    expect(result.blockers.map((blocker) => blocker.code)).toEqual([
      "reviewer_attestation_missing",
    ]);
  });

  it("does not accept an exact-digest attestation made by a different Person", () => {
    const result = assess([
      evidence({ id: "attacker-attestation", reviewerId: "person-2" }),
    ]);
    expect(result.states).toEqual([]);
    expect(result.blockers.map((blocker) => blocker.code)).toEqual([
      "reviewer_attestation_missing",
    ]);
  });

  it.each([
    [
      "revoked evidence",
      evidence({
        revokedAt: new Date("2026-09-01T13:00:00.000Z"),
        revokedById: "person-1",
        revocationReason: "decisions_changed",
      }),
      "reviewer_attestation_revoked",
    ],
    [
      "email identity drift",
      evidence({ reviewerEmailNormalized: "someone-else@daust.org" }),
      "reviewer_attestation_identity_drift",
    ],
    [
      "unauthorized role evidence",
      evidence({ authorizedRoles: ["faculty"] }),
      "reviewer_attestation_identity_drift",
    ],
    [
      "superseded statement",
      evidence({ statementSha256: "c".repeat(64) }),
      "reviewer_attestation_statement_stale",
    ],
  ])("blocks %s", (_label, row, expectedCode) => {
    expect(assess([row]).blockers.map((blocker) => blocker.code)).toEqual([
      expectedCode,
    ]);
  });
});

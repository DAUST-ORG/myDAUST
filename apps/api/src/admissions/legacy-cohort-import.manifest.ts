import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeExternalReference } from "../finance/historical-payment-import.manifest.js";

const MAX_ROWS = 25_000;
const Sha256Schema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/, "Expected a SHA-256 hex digest")
  .transform((value) => value.toLowerCase());

export const LegacyCohortDateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");

const SourceCoordinateSchema = z
  .object({
    sourceSheet: z.string().trim().min(1).max(120),
    sourceRowNumber: z.number().int().min(2).max(10_000_000),
  })
  .strict();

export function legacyCohortCoordinate(input: {
  sourceSheet: string;
  sourceRowNumber: number;
}): string {
  return `${input.sourceSheet.trim()}!${input.sourceRowNumber}`;
}

const ReviewedReasonSchema = z.string().trim().min(20).max(1_000);

const EmailDecisionSchema = z
  .object({
    sourceEmail: z.string().trim().email().nullable(),
    finalEmail: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    disposition: z.enum(["use_source", "reviewed_replacement"]),
    reason: ReviewedReasonSchema.optional(),
  })
  .strict()
  .superRefine((decision, ctx) => {
    const source = decision.sourceEmail?.trim().toLowerCase() ?? null;
    if (
      decision.disposition === "use_source" &&
      source !== decision.finalEmail
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["finalEmail"],
        message:
          "use_source requires the final email to equal the source email",
      });
    }
    if (
      decision.disposition === "reviewed_replacement" &&
      (!decision.reason || source === decision.finalEmail)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message:
          "A reviewed replacement requires a different email and a review reason",
      });
    }
  });

const UnavailableGuardianEmailDecisionSchema = z
  .object({
    sourceEmail: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase())
      .nullable(),
    finalEmail: z.null(),
    disposition: z.literal("unavailable"),
    reason: ReviewedReasonSchema,
  })
  .strict();

const GuardianEmailDecisionSchema = z.union([
  EmailDecisionSchema,
  UnavailableGuardianEmailDecisionSchema,
]);

const SourceDispositionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("cash"),
      paymentKey: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      kind: z.literal("duplicate"),
      canonicalSource: SourceCoordinateSchema,
      reason: ReviewedReasonSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("no_cash"),
      reason: ReviewedReasonSchema,
    })
    .strict(),
]);

const ManifestSourceRowSchema = SourceCoordinateSchema.extend({
  rowFingerprintSha256: Sha256Schema,
  disposition: SourceDispositionSchema,
}).strict();

const ExcludedSourceSchema = SourceCoordinateSchema.extend({
  rowFingerprintSha256: Sha256Schema,
  holdCodes: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]{2,79}$/, "Expected a stable hold code"),
    )
    .min(1)
    .max(20),
  reason: ReviewedReasonSchema,
  reviewed: z.literal(true),
})
  .strict()
  .superRefine((source, ctx) => {
    if (new Set(source.holdCodes).size !== source.holdCodes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["holdCodes"],
        message: "Excluded-source hold codes must be unique",
      });
    }
  });

const ReviewedArtifactSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    sha256: Sha256Schema,
  })
  .strict();

const ExclusionReviewSchema = z
  .object({
    reviewWorkbook: ReviewedArtifactSchema,
    holdNotes: ReviewedArtifactSchema,
  })
  .strict();

const KnownPaymentMethodSchema = z.enum([
  "wave",
  "orange_money",
  "card",
  "wire",
  "cheque",
  "pi_spi",
]);

const DocumentedPaymentEvidenceSchema = z
  .object({
    status: z.literal("documented"),
    settledOn: LegacyCohortDateOnlySchema,
    dateAccuracy: z.literal("exact"),
    method: KnownPaymentMethodSchema,
    externalReference: z.string().trim().min(1).max(240),
  })
  .strict();

const LegacyGapPaymentEvidenceSchema = z
  .object({
    status: z.literal("reviewed_legacy_gap"),
    settledOn: LegacyCohortDateOnlySchema,
    dateAccuracy: z.enum(["exact", "administrative_estimate"]),
    method: z.enum([
      "wave",
      "orange_money",
      "card",
      "wire",
      "cheque",
      "pi_spi",
      "legacy_unknown",
    ]),
    externalReference: z.string().trim().min(1).max(240).optional(),
    unknownFields: z
      .array(z.enum(["settlement_date", "method", "reference"]))
      .min(1)
      .max(3),
    deterministicReferenceConsent: z.literal(true),
    reason: ReviewedReasonSchema,
  })
  .strict()
  .superRefine((evidence, ctx) => {
    const unknown = new Set(evidence.unknownFields);
    if (
      (unknown.has("method") && evidence.method !== "legacy_unknown") ||
      (!unknown.has("method") && evidence.method === "legacy_unknown")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["method"],
        message:
          "legacy_unknown must be used exactly when the original method is unknown",
      });
    }
    if (
      (unknown.has("reference") && evidence.externalReference) ||
      (!unknown.has("reference") && !evidence.externalReference)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["externalReference"],
        message:
          "Reference evidence must be present unless reference is explicitly unknown",
      });
    }
    if (
      (unknown.has("settlement_date") &&
        evidence.dateAccuracy !== "administrative_estimate") ||
      (!unknown.has("settlement_date") && evidence.dateAccuracy !== "exact")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["dateAccuracy"],
        message:
          "An unknown settlement date requires an administrative estimate",
      });
    }
    if (
      new Set(evidence.unknownFields).size !== evidence.unknownFields.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["unknownFields"],
        message: "Unknown fields must be unique",
      });
    }
  });

const PaymentSchema = z
  .object({
    paymentKey: z.string().trim().min(1).max(120),
    sourceCoordinates: z.array(SourceCoordinateSchema).min(1).max(50),
    amountXof: z.number().int().positive().max(2_147_483_647),
    amountReviewReason: ReviewedReasonSchema.optional(),
    sameSignatureReview: z
      .object({
        decision: z.literal("confirmed_distinct"),
        reason: ReviewedReasonSchema,
      })
      .strict()
      .optional(),
    evidence: z.union([
      DocumentedPaymentEvidenceSchema,
      LegacyGapPaymentEvidenceSchema,
    ]),
    reviewed: z.literal(true),
  })
  .strict();

const LegacyIdDecisionSchema = z.discriminatedUnion("disposition", [
  z.object({ disposition: z.literal("use_source") }).strict(),
  z
    .object({
      disposition: z.literal("reviewed_assignment"),
      reason: ReviewedReasonSchema,
    })
    .strict(),
]);

// Source F-IDs use the academic year followed by an unpadded sequence/day and
// normalized name initials (for example F2026001AML or F20254ABN). The longer
// digits-only branch is retained for explicitly reserved legacy identifiers.
const LEGACY_COHORT_STUDENT_NUMBER = /^F20\d{2}(?:\d{5,}|\d+[A-Z]+)$/;

export const LegacyCohortStudentNumberSchema = z
  .string()
  .trim()
  .regex(
    LEGACY_COHORT_STUDENT_NUMBER,
    "Expected an uppercase permanent legacy F-ID",
  );

export function isLegacyCohortStudentNumber(value: string): boolean {
  return LEGACY_COHORT_STUDENT_NUMBER.test(value);
}

const PersonGroupSchema = z
  .object({
    personKey: z.string().trim().min(1).max(120),
    legacyStudentNo: LegacyCohortStudentNumberSchema,
    legacyIdDecision: LegacyIdDecisionSchema,
    groupingReview: z
      .object({ reviewed: z.literal(true), reason: ReviewedReasonSchema })
      .strict(),
    applicant: z
      .object({
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().min(1).max(120),
        dateOfBirth: LegacyCohortDateOnlySchema,
        programCode: z.string().trim().min(1).max(40).nullable(),
        phone: z.string().trim().max(40).nullable().optional(),
        gender: z.string().trim().max(40).nullable().optional(),
        nationality: z.string().trim().max(80).nullable().optional(),
        city: z.string().trim().max(120).nullable().optional(),
        term: z.string().trim().max(120).nullable().optional(),
        studentEmail: EmailDecisionSchema,
      })
      .strict(),
    guardianKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
    sources: z.array(ManifestSourceRowSchema).min(1).max(100),
    payments: z.array(PaymentSchema).max(100).default([]),
  })
  .strict();

const GuardianSchema = z
  .object({
    guardianKey: z.string().trim().min(1).max(120),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(3).max(40),
    address: z.string().trim().min(3).max(500).nullable(),
    email: GuardianEmailDecisionSchema,
    identityDecision: z.discriminatedUnion("disposition", [
      z
        .object({
          disposition: z.literal("create_new"),
          reviewed: z.literal(true),
          reason: ReviewedReasonSchema,
        })
        .strict(),
      z
        .object({
          disposition: z.literal("link_existing_parent"),
          personId: z.string().uuid(),
          reviewed: z.literal(true),
          reason: ReviewedReasonSchema,
        })
        .strict(),
    ]),
  })
  .strict();

export const LegacyCohortManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    importName: z.string().trim().min(3).max(200),
    sourceWorkbook: z
      .object({
        fileName: z.string().trim().min(1).max(255),
        sha256: Sha256Schema,
      })
      .strict(),
    sourceExtractionSha256: Sha256Schema,
    sourceRowCount: z.number().int().positive().max(MAX_ROWS),
    sourcePaidTotalXof: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    academicYear: z
      .object({
        id: z.string().uuid(),
        label: z.string().trim().min(4).max(40),
      })
      .strict(),
    currency: z.literal("XOF"),
    notificationPolicy: z.literal("suppress_all"),
    guardians: z.array(GuardianSchema).min(1).max(MAX_ROWS),
    people: z.array(PersonGroupSchema).min(1).max(MAX_ROWS),
    excludedSources: z.array(ExcludedSourceSchema).max(MAX_ROWS).default([]),
    exclusionReview: ExclusionReviewSchema.optional(),
    reviewNote: ReviewedReasonSchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const yearMatch = manifest.academicYear.label.match(
      /(?:^|\D)(20\d{2})(?:\D|$)/,
    );
    const year = yearMatch?.[1] ?? null;
    const personKeys = new Set<string>();
    const studentNos = new Set<string>();
    const sourceOwners = new Map<string, string>();
    const sourceByCoordinate = new Map<
      string,
      z.infer<typeof ManifestSourceRowSchema>
    >();
    const excludedCoordinates = new Set<string>();
    const excludedFingerprints = new Set<string>();
    const guardianKeys = new Set<string>();
    const referencedGuardianKeys = new Set<string>();
    const finalEmails = new Map<string, string>();
    const externalReferenceOwners = new Map<string, string>();

    for (const [index, guardian] of manifest.guardians.entries()) {
      if (guardianKeys.has(guardian.guardianKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["guardians", index, "guardianKey"],
          message: "Guardian keys must be unique",
        });
      }
      guardianKeys.add(guardian.guardianKey);
      if (guardian.email.finalEmail) {
        const owner = finalEmails.get(guardian.email.finalEmail);
        if (owner) {
          ctx.addIssue({
            code: "custom",
            path: ["guardians", index, "email", "finalEmail"],
            message:
              "Final email is already assigned to another reviewed record",
          });
        }
        finalEmails.set(
          guardian.email.finalEmail,
          `guardian ${guardian.guardianKey}`,
        );
      }
    }

    for (const [personIndex, person] of manifest.people.entries()) {
      if (personKeys.has(person.personKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["people", personIndex, "personKey"],
          message: "Person keys must be unique",
        });
      }
      personKeys.add(person.personKey);
      if (studentNos.has(person.legacyStudentNo)) {
        ctx.addIssue({
          code: "custom",
          path: ["people", personIndex, "legacyStudentNo"],
          message:
            "A permanent legacy Student ID may belong to only one person group",
        });
      }
      studentNos.add(person.legacyStudentNo);
      if (year && !person.legacyStudentNo.startsWith(`F${year}`)) {
        ctx.addIssue({
          code: "custom",
          path: ["people", personIndex, "legacyStudentNo"],
          message: `Legacy Student ID must begin with F${year}`,
        });
      }
      const emailOwner = finalEmails.get(
        person.applicant.studentEmail.finalEmail,
      );
      if (emailOwner) {
        ctx.addIssue({
          code: "custom",
          path: [
            "people",
            personIndex,
            "applicant",
            "studentEmail",
            "finalEmail",
          ],
          message: "Final email is already assigned to another reviewed record",
        });
      }
      finalEmails.set(
        person.applicant.studentEmail.finalEmail,
        `person ${person.personKey}`,
      );

      if (new Set(person.guardianKeys).size !== person.guardianKeys.length) {
        ctx.addIssue({
          code: "custom",
          path: ["people", personIndex, "guardianKeys"],
          message: "Guardian links must be unique",
        });
      }
      for (const guardianKey of person.guardianKeys) {
        referencedGuardianKeys.add(guardianKey);
        if (!guardianKeys.has(guardianKey)) {
          ctx.addIssue({
            code: "custom",
            path: ["people", personIndex, "guardianKeys"],
            message: "Guardian key does not exist in the guardians list",
          });
        }
      }

      const payments = new Map(
        person.payments.map((payment) => [payment.paymentKey, payment]),
      );
      const paymentSignatureIndexes = new Map<string, number[]>();
      if (payments.size !== person.payments.length) {
        ctx.addIssue({
          code: "custom",
          path: ["people", personIndex, "payments"],
          message: "Payment keys must be unique within one person group",
        });
      }
      const cashOwners = new Map<string, string>();
      for (const [sourceIndex, source] of person.sources.entries()) {
        const coordinate = legacyCohortCoordinate(source);
        const owner = sourceOwners.get(coordinate);
        if (owner) {
          ctx.addIssue({
            code: "custom",
            path: ["people", personIndex, "sources", sourceIndex],
            message: "Source row is already assigned to another person group",
          });
        }
        sourceOwners.set(coordinate, person.personKey);
        sourceByCoordinate.set(coordinate, source);
        if (source.disposition.kind === "cash") {
          if (!payments.has(source.disposition.paymentKey)) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "sources",
                sourceIndex,
                "disposition",
              ],
              message: "Source row references an unknown payment key",
            });
          }
          cashOwners.set(coordinate, source.disposition.paymentKey);
        }
        if (
          source.disposition.kind === "duplicate" &&
          legacyCohortCoordinate(source.disposition.canonicalSource) ===
            coordinate
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "people",
              personIndex,
              "sources",
              sourceIndex,
              "disposition",
            ],
            message: "A duplicate row cannot reference itself",
          });
        }
      }
      for (const [paymentIndex, payment] of person.payments.entries()) {
        const externalReference = normalizeExternalReference(
          payment.evidence.externalReference,
        );
        if (externalReference) {
          if (payment.sameSignatureReview) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "payments",
                paymentIndex,
                "sameSignatureReview",
              ],
              message:
                "A referenced payment cannot retain a no-reference duplicate review",
            });
          }
          const owner = externalReferenceOwners.get(externalReference);
          if (owner) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "payments",
                paymentIndex,
                "evidence",
                "externalReference",
              ],
              message:
                "Payment reference is already assigned to another payment",
            });
          }
          externalReferenceOwners.set(
            externalReference,
            `${person.personKey}/${payment.paymentKey}`,
          );
        } else {
          const signature = [
            payment.amountXof,
            payment.evidence.settledOn,
            payment.evidence.method,
          ].join(":");
          const indexes = paymentSignatureIndexes.get(signature) ?? [];
          indexes.push(paymentIndex);
          paymentSignatureIndexes.set(signature, indexes);
        }
        const coordinates = payment.sourceCoordinates.map(
          legacyCohortCoordinate,
        );
        if (new Set(coordinates).size !== coordinates.length) {
          ctx.addIssue({
            code: "custom",
            path: [
              "people",
              personIndex,
              "payments",
              paymentIndex,
              "sourceCoordinates",
            ],
            message: "Payment source coordinates must be unique",
          });
        }
        for (const coordinate of coordinates) {
          if (cashOwners.get(coordinate) !== payment.paymentKey) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "payments",
                paymentIndex,
                "sourceCoordinates",
              ],
              message: `${coordinate} is not assigned as cash for this payment`,
            });
          }
        }
        const assigned = [...cashOwners.values()].filter(
          (paymentKey) => paymentKey === payment.paymentKey,
        ).length;
        if (assigned !== coordinates.length) {
          ctx.addIssue({
            code: "custom",
            path: ["people", personIndex, "payments", paymentIndex],
            message:
              "Every cash source for the payment must be listed exactly once",
          });
        }
      }
      for (const indexes of paymentSignatureIndexes.values()) {
        if (indexes.length === 1) {
          const paymentIndex = indexes[0]!;
          if (person.payments[paymentIndex]?.sameSignatureReview) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "payments",
                paymentIndex,
                "sameSignatureReview",
              ],
              message:
                "Duplicate review is stale because no other unreferenced payment has the same signature",
            });
          }
          continue;
        }
        for (const paymentIndex of indexes) {
          if (!person.payments[paymentIndex]?.sameSignatureReview) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "payments",
                paymentIndex,
                "sameSignatureReview",
              ],
              message:
                "Same-day, same-method, same-amount cash without references must be grouped, marked duplicate, or confirmed distinct",
            });
          }
        }
      }
    }

    for (const [excludedIndex, source] of manifest.excludedSources.entries()) {
      const coordinate = legacyCohortCoordinate(source);
      if (sourceOwners.has(coordinate) || excludedCoordinates.has(coordinate)) {
        ctx.addIssue({
          code: "custom",
          path: ["excludedSources", excludedIndex],
          message:
            "An excluded source coordinate cannot overlap an included or excluded row",
        });
      }
      excludedCoordinates.add(coordinate);
      if (excludedFingerprints.has(source.rowFingerprintSha256)) {
        ctx.addIssue({
          code: "custom",
          path: ["excludedSources", excludedIndex, "rowFingerprintSha256"],
          message: "Excluded-source fingerprints must be unique",
        });
      }
      excludedFingerprints.add(source.rowFingerprintSha256);
    }

    if (manifest.excludedSources.length > 0 && !manifest.exclusionReview) {
      ctx.addIssue({
        code: "custom",
        path: ["exclusionReview"],
        message:
          "Reviewed exclusions require immutable review-workbook and hold-notes provenance",
      });
    }
    if (manifest.excludedSources.length === 0 && manifest.exclusionReview) {
      ctx.addIssue({
        code: "custom",
        path: ["exclusionReview"],
        message: "Exclusion provenance is stale when no source rows are held",
      });
    }

    const representedSourceRows = sourceOwners.size + excludedCoordinates.size;
    if (representedSourceRows !== manifest.sourceRowCount) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceRowCount"],
        message: `Manifest represents ${representedSourceRows} unique included/excluded rows, expected ${manifest.sourceRowCount}`,
      });
    }

    for (const [guardianIndex, guardian] of manifest.guardians.entries()) {
      if (!referencedGuardianKeys.has(guardian.guardianKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["guardians", guardianIndex, "guardianKey"],
          message: "Every reviewed guardian must be linked to a person group",
        });
      }
    }

    for (const [personIndex, person] of manifest.people.entries()) {
      for (const [sourceIndex, source] of person.sources.entries()) {
        if (source.disposition.kind === "duplicate") {
          const canonicalCoordinate = legacyCohortCoordinate(
            source.disposition.canonicalSource,
          );
          const canonicalOwner = sourceOwners.get(canonicalCoordinate);
          const canonical = sourceByCoordinate.get(canonicalCoordinate);
          if (!canonicalOwner || !canonical) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "sources",
                sourceIndex,
                "disposition",
              ],
              message: "Duplicate disposition references an unknown source row",
            });
          } else if (canonicalOwner !== person.personKey) {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "sources",
                sourceIndex,
                "disposition",
              ],
              message:
                "A duplicate disposition cannot cross reviewed person groups",
            });
          } else if (canonical.disposition.kind === "duplicate") {
            ctx.addIssue({
              code: "custom",
              path: [
                "people",
                personIndex,
                "sources",
                sourceIndex,
                "disposition",
              ],
              message:
                "A duplicate disposition must point directly to a canonical non-duplicate row",
            });
          }
        }
      }
    }
  });

export type LegacyCohortManifest = z.infer<typeof LegacyCohortManifestSchema>;
export type LegacyCohortPerson = LegacyCohortManifest["people"][number];
export type LegacyCohortPayment = LegacyCohortPerson["payments"][number];

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

export function parseLegacyCohortManifest(bytes: Buffer): LegacyCohortManifest {
  return LegacyCohortManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

export function legacyCohortManifestDigest(
  manifest: LegacyCohortManifest,
): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function legacyCohortPersonDigest(person: LegacyCohortPerson): string {
  return createHash("sha256").update(canonicalJson(person)).digest("hex");
}

export function legacyCohortProviderRef(
  manifestSha256: string,
  personKey: string,
  paymentKey: string,
): string {
  const digest = createHash("sha256")
    .update(`${manifestSha256}\u0000${personKey}\u0000${paymentKey}`)
    .digest("hex");
  return `LEGACY-COHORT-${digest}`;
}

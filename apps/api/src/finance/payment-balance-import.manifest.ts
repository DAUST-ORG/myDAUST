import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_SOURCE_ROWS = 25_000;
const MAX_XOF_TOTAL = Number.MAX_SAFE_INTEGER;

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Expected a valid calendar date");

const Sha256Schema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/, "Expected a SHA-256 hex digest")
  .transform((value) => value.toLowerCase());

const StudentNumberSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^[A-Z0-9][A-Z0-9._-]*$/,
    "Student numbers must use canonical uppercase letters, numbers, dots, underscores, or hyphens",
  );

const WholeXofSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_XOF_TOTAL)
  .refine(Number.isSafeInteger, "Expected a safe whole-XOF value");

const ReviewSchema = z
  .object({
    reviewedBy: z.string().trim().min(3).max(240),
    reviewedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(1_000),
  })
  .strict();

const exactMatchSchema = z
  .object({
    decision: z.literal("exact_match"),
    studentNo: StudentNumberSchema,
    matchMethod: z.enum([
      "exact_ordered",
      "accent_folded_ordered",
      "exact_token_set",
      "prior_reviewed_live_verified",
    ]),
    review: ReviewSchema,
  })
  .strict();

const holdUnmatchedSchema = z
  .object({
    decision: z.literal("hold_unmatched"),
    review: ReviewSchema,
  })
  .strict();

const holdAmbiguousSchema = z
  .object({
    decision: z.literal("hold_ambiguous"),
    candidateStudentNos: z.array(StudentNumberSchema).min(2).max(50),
    review: ReviewSchema,
  })
  .strict();

const holdDuplicateClaimSchema = z
  .object({
    decision: z.literal("hold_duplicate_claim"),
    claimedStudentNo: StudentNumberSchema,
    canonicalSourceRowKey: z.string().trim().min(3).max(240),
    review: ReviewSchema,
  })
  .strict();

const identityDecisionSchema = z.discriminatedUnion("decision", [
  exactMatchSchema,
  holdUnmatchedSchema,
  holdAmbiguousSchema,
  holdDuplicateClaimSchema,
]);

const installmentDetailSchema = z
  .object({
    paidXof: WholeXofSchema,
    sourceReconcilesClaim: z.enum(["yes", "no", "blank"]),
    discrepancyReview: z
      .object({
        decision: z.literal("accept_amount_paid_as_target"),
        signedVarianceXof: z.literal(1_433),
        review: ReviewSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const sourceRowSchema = z
  .object({
    sourceRowKey: z.string().trim().min(3).max(240),
    sourceSheet: z.string().trim().min(1).max(120),
    sourceRowNumber: z.number().int().min(1).max(10_000_000),
    sourceRecordSha256: Sha256Schema,
    // Blank workbook identity cells still need a physical row and explicit hold.
    sourceStudentClaim: z.string().trim().max(240),
    /** The workbook's Amount Paid cell. This is always the reconciliation target. */
    amountPaidXof: WholeXofSchema,
    installmentDetail: installmentDetailSchema.optional(),
    identity: identityDecisionSchema,
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();

export function paymentBalanceSourceRowKey(
  sheet: string,
  rowNumber: number,
): string {
  return `${sheet.trim()}!${rowNumber}`;
}

export const PaymentBalanceImportManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    importName: z.string().trim().min(3).max(200),
    academicYearLabel: z.string().trim().min(4).max(64),
    /**
     * Date through which the aggregate source balance is authoritative. This
     * is an accounting-recognition date, never an invented cash-settlement
     * timestamp for any individual payment.
     */
    sourceAsOfDate: DateOnlySchema,
    currency: z.literal("XOF"),
    sourceWorkbook: z
      .object({
        fileName: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .refine((name) => name.toLowerCase().endsWith(".xlsx"), {
            message: "Source workbook must be an .xlsx file",
          }),
        sha256: Sha256Schema,
      })
      .strict(),
    trustedExtraction: z
      .object({
        fileName: z.string().trim().min(1).max(255),
        sha256: Sha256Schema,
      })
      .strict(),
    sourceRowCount: z.number().int().min(1).max(MAX_SOURCE_ROWS),
    sourcePaidTotalXof: WholeXofSchema,
    amountPaidAuthority: z.literal("workbook_amount_paid"),
    rows: z.array(sourceRowSchema).min(1).max(MAX_SOURCE_ROWS),
    reviewNote: z.string().trim().min(10).max(2_000),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.rows.length !== manifest.sourceRowCount) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceRowCount"],
        message: `Manifest contains ${manifest.rows.length} rows, expected ${manifest.sourceRowCount}`,
      });
    }

    const sourceTotal = manifest.rows.reduce(
      (sum, row) => sum + row.amountPaidXof,
      0,
    );
    if (
      !Number.isSafeInteger(sourceTotal) ||
      sourceTotal !== manifest.sourcePaidTotalXof
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sourcePaidTotalXof"],
        message: `Manifest Amount Paid rows total ${sourceTotal} XOF, expected ${manifest.sourcePaidTotalXof} XOF`,
      });
    }

    const rowsByKey = new Map<string, (typeof manifest.rows)[number]>();
    const exactStudentOwners = new Map<string, string>();
    for (const [index, row] of manifest.rows.entries()) {
      const canonicalKey = paymentBalanceSourceRowKey(
        row.sourceSheet,
        row.sourceRowNumber,
      );
      if (row.sourceRowKey !== canonicalKey) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceRowKey"],
          message: `Source row key must be the canonical physical coordinate ${canonicalKey}`,
        });
      }
      if (rowsByKey.has(row.sourceRowKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceRowKey"],
          message: `Source row ${row.sourceRowKey} is listed more than once`,
        });
      }
      rowsByKey.set(row.sourceRowKey, row);

      if (row.identity.decision === "exact_match") {
        const owner = exactStudentOwners.get(row.identity.studentNo);
        if (owner) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "identity", "studentNo"],
            message: `Student ${row.identity.studentNo} is exactly matched by both ${owner} and ${row.sourceRowKey}; duplicate claims must be held explicitly`,
          });
        } else {
          exactStudentOwners.set(row.identity.studentNo, row.sourceRowKey);
        }
      }

      if (row.identity.decision === "hold_ambiguous") {
        if (
          new Set(row.identity.candidateStudentNos).size !==
          row.identity.candidateStudentNos.length
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "identity", "candidateStudentNos"],
            message: "Ambiguous identity candidates must be unique",
          });
        }
      }

      const detail = row.installmentDetail;
      if (!detail) continue;
      const signedVarianceXof = row.amountPaidXof - detail.paidXof;
      if (signedVarianceXof === 0 && detail.discrepancyReview) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "installmentDetail", "discrepancyReview"],
          message:
            "A discrepancy review is valid only when installment detail differs from Amount Paid",
        });
      } else if (
        signedVarianceXof !== 0 &&
        (signedVarianceXof !== 1_433 || !detail.discrepancyReview)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "installmentDetail"],
          message:
            "Installment detail must equal Amount Paid unless the exact +1,433 XOF variance has an accept_amount_paid_as_target review",
        });
      }
    }

    for (const [index, row] of manifest.rows.entries()) {
      if (row.identity.decision !== "hold_duplicate_claim") continue;
      if (row.identity.canonicalSourceRowKey === row.sourceRowKey) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "identity", "canonicalSourceRowKey"],
          message: "A duplicate claim cannot point to itself",
        });
        continue;
      }
      const canonical = rowsByKey.get(row.identity.canonicalSourceRowKey);
      if (
        !canonical ||
        canonical.identity.decision !== "exact_match" ||
        canonical.identity.studentNo !== row.identity.claimedStudentNo
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "identity", "canonicalSourceRowKey"],
          message:
            "A duplicate claim must point to the exact-matched canonical row for the same student number",
        });
      }
    }
  });

export type PaymentBalanceImportManifest = z.infer<
  typeof PaymentBalanceImportManifestSchema
>;
export type PaymentBalanceImportRow =
  PaymentBalanceImportManifest["rows"][number];
export type PaymentBalanceIdentityDecision =
  PaymentBalanceImportRow["identity"];

export function parsePaymentBalanceImportManifest(
  bytes: Buffer,
): PaymentBalanceImportManifest {
  return PaymentBalanceImportManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

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

export function paymentBalanceManifestDigest(
  manifest: PaymentBalanceImportManifest,
): string {
  const normalized = {
    ...manifest,
    rows: [...manifest.rows].sort((left, right) =>
      left.sourceRowKey < right.sourceRowKey
        ? -1
        : left.sourceRowKey > right.sourceRowKey
          ? 1
          : 0,
    ),
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

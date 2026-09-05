import { createHash } from "node:crypto";
import { z } from "zod";
import { HOUSING_KEY_BY_TIER } from "./student-billing-import.catalog.js";

const MAX_MANIFEST_ROWS = 5_000;
const MAX_AMOUNT_XOF = 100_000_000;

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
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Student numbers may contain only letters, numbers, dots, underscores, and hyphens",
  );

const ReasonSchema = z.string().trim().min(10).max(500);
const AmountSchema = z.number().int().min(0).max(MAX_AMOUNT_XOF);

/**
 * Identity is a reviewed decision, never a guess. "create" is the only status
 * that admits a student who is not already in the SIS, and it carries its own
 * reason so an operator has signed off on the fact that no existing record matched.
 */
const identitySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("authoritative"),
      studentNo: StudentNumberSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("create"),
      studentNo: StudentNumberSchema,
      reason: ReasonSchema,
    })
    .strict(),
  z.object({ status: z.literal("missing") }).strict(),
  z
    .object({
      status: z.literal("ambiguous"),
      candidateStudentNos: z.array(StudentNumberSchema).min(1).max(20),
    })
    .strict(),
]);

/**
 * An award names a scholarship in the catalog. A fixed-rate award takes its rate
 * from there; a per-student award (3FPT, social help) supplies one here. The
 * planner rejects the wrong combination, so a rate can never silently disagree
 * with the catalog.
 */
const awardSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(
        /^[a-z][a-z0-9_]{0,39}$/,
        "Scholarship keys are lowercase snake_case",
      ),
    pctBps: z.number().int().min(1).max(10_000).optional(),
    flatXof: z.number().int().min(1).max(MAX_AMOUNT_XOF).optional(),
    reason: ReasonSchema,
  })
  .strict()
  .refine(
    (value) => value.pctBps === undefined || value.flatXof === undefined,
    "An award carries at most one of pctBps or flatXof",
  );

const housingSchema = z
  .object({
    tier: z.enum(Object.keys(HOUSING_KEY_BY_TIER) as [string, ...string[]]),
    annualOverrideXof: AmountSchema.optional(),
    overrideReason: ReasonSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.annualOverrideXof === undefined ||
      value.overrideReason !== undefined,
    "A negotiated housing amount requires overrideReason",
  );

/**
 * `manualTotalReason` is the escape hatch for rows the rules cannot reproduce —
 * chiefly the hand-rounded 3FPT figures. It is deliberately awkward: without it
 * the planner blocks on any recomputation mismatch, so accepting an underivable
 * number is always a recorded decision rather than a silent tolerance.
 */
const rowSchema = z
  .object({
    rowNumber: z.number().int().min(1).max(1_000_000),
    sheetName: z.string().trim().min(1).max(200),
    identity: identitySchema,
    housing: housingSchema,
    cafeteria: z.boolean(),
    insurance: z.boolean(),
    caution: z.boolean(),
    awards: z.array(awardSchema).max(10),
    totalBilledXof: AmountSchema,
    manualTotalReason: ReasonSchema.optional(),
  })
  .strict();

export const StudentBillingManifestSchema = z
  .object({
    version: z.literal(1),
    academicYearLabel: z.string().trim().min(4).max(40),
    sourceWorkbookSha256: Sha256Schema,
    preparedBy: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    preparedOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    /** Control totals the operator asserts before the planner recomputes them. */
    declaredRowCount: z.number().int().min(1).max(MAX_MANIFEST_ROWS),
    declaredBilledTotalXof: z.number().int().min(0),
    rows: z.array(rowSchema).min(1).max(MAX_MANIFEST_ROWS),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.rows.length !== manifest.declaredRowCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `declaredRowCount ${manifest.declaredRowCount} does not match ${manifest.rows.length} rows`,
      });
    }
    const billed = manifest.rows.reduce(
      (sum, row) => sum + row.totalBilledXof,
      0,
    );
    if (billed !== manifest.declaredBilledTotalXof) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `declaredBilledTotalXof ${manifest.declaredBilledTotalXof} does not match the row sum ${billed}`,
      });
    }
    const seenRows = new Set<number>();
    for (const row of manifest.rows) {
      if (seenRows.has(row.rowNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate rowNumber ${row.rowNumber}`,
        });
      }
      seenRows.add(row.rowNumber);
    }
    const seenStudentNos = new Set<string>();
    for (const row of manifest.rows) {
      const { identity } = row;
      if (identity.status !== "authoritative" && identity.status !== "create")
        continue;
      if (seenStudentNos.has(identity.studentNo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Student ${identity.studentNo} appears on more than one row`,
        });
      }
      seenStudentNos.add(identity.studentNo);
    }
  });

export type StudentBillingManifest = z.infer<
  typeof StudentBillingManifestSchema
>;
export type StudentBillingManifestRow = StudentBillingManifest["rows"][number];

export function parseStudentBillingManifest(bytes: Buffer): {
  manifest: StudentBillingManifest;
  manifestSha256: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(
      `Billing manifest is not valid JSON: ${(error as Error).message}`,
    );
  }
  const manifest = StudentBillingManifestSchema.parse(parsed);
  const manifestSha256 = createHash("sha256").update(bytes).digest("hex");
  return { manifest, manifestSha256 };
}

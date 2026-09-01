import { createHash } from "node:crypto";
import { z } from "zod";
import {
  paymentBalanceSourceRowKey,
  type PaymentBalanceImportManifest,
} from "./payment-balance-import.manifest.js";

const WholeXofSchema = z.number().int().nonnegative().safe();

const TrustedPaymentBalanceRowSchema = z
  .object({
    sourceSheet: z.string().trim().min(1),
    sourceRowNumber: z.number().int().positive(),
    sourceStudentName: z.string().trim().min(1),
    normalizedStudentName: z.string().trim().min(1),
    category: z.string().trim().min(1),
    fullTuitionAndBoardXof: WholeXofSchema,
    amountBilledXof: WholeXofSchema,
    installmentDueXof: z.array(WholeXofSchema).length(4),
    installmentPaidXof: z.array(WholeXofSchema).length(4),
    amountPaidXof: WholeXofSchema,
    note: z.string().nullable(),
    cafeteria: z.boolean(),
    housing: z.boolean(),
    caution: z.boolean(),
    insurance: z.boolean(),
    scholarshipOnTuition: z.number().finite().min(0).max(1).nullable(),
    reconciles: z.string().nullable(),
  })
  .strict();

export const TrustedPaymentBalanceExtractionSchema = z
  .object({
    version: z.literal(1),
    sourceFileName: z.string().trim().min(1),
    sourceWorkbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sheetName: z.string().trim().min(1),
    headerRowNumber: z.number().int().positive(),
    firstDataRowNumber: z.number().int().positive(),
    lastDataRowNumber: z.number().int().positive(),
    controlTotals: z
      .object({
        rowCount: z.number().int().positive(),
        positivePaymentRows: z.number().int().nonnegative(),
        zeroPaymentRows: z.number().int().nonnegative(),
        amountBilledXof: WholeXofSchema,
        amountPaidXof: WholeXofSchema,
        installmentPaidXof: WholeXofSchema,
      })
      .strict(),
    qualityFindings: z.array(z.record(z.string(), z.unknown())),
    rows: z.array(TrustedPaymentBalanceRowSchema).min(1).max(25_000),
  })
  .strict();

export type TrustedPaymentBalanceExtraction = z.infer<
  typeof TrustedPaymentBalanceExtractionSchema
>;
export type TrustedPaymentBalanceRow = z.infer<
  typeof TrustedPaymentBalanceRowSchema
>;

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

export function paymentBalanceExtractionRowDigest(
  row: TrustedPaymentBalanceRow,
): string {
  return createHash("sha256").update(canonicalJson(row)).digest("hex");
}

export function parseTrustedPaymentBalanceExtraction(
  bytes: Buffer,
): TrustedPaymentBalanceExtraction {
  return TrustedPaymentBalanceExtractionSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

function reconcilesClaim(value: string | null): "yes" | "no" | "blank" {
  if (value === null || value.trim() === "") return "blank";
  return value.trim().toLowerCase() === "yes" ? "yes" : "no";
}

export class PaymentBalanceExtractionMismatchError extends Error {
  constructor(readonly issues: string[]) {
    super("Reviewed paid-to-date manifest does not match trusted extraction");
    this.name = "PaymentBalanceExtractionMismatchError";
  }
}

export function verifyPaymentBalanceManifestExtraction(
  manifest: PaymentBalanceImportManifest,
  extraction: TrustedPaymentBalanceExtraction,
): void {
  const issues: string[] = [];
  if (manifest.sourceWorkbook.fileName !== extraction.sourceFileName) {
    issues.push("source_file_name_mismatch");
  }
  if (manifest.sourceWorkbook.sha256 !== extraction.sourceWorkbookSha256) {
    issues.push("source_workbook_sha256_mismatch");
  }
  if (
    manifest.sourceRowCount !== extraction.controlTotals.rowCount ||
    manifest.rows.length !== extraction.rows.length
  ) {
    issues.push("source_row_count_mismatch");
  }
  if (manifest.sourcePaidTotalXof !== extraction.controlTotals.amountPaidXof) {
    issues.push("source_paid_total_mismatch");
  }

  const extractionByKey = new Map(
    extraction.rows.map((row) => [
      paymentBalanceSourceRowKey(row.sourceSheet, row.sourceRowNumber),
      row,
    ]),
  );
  if (extractionByKey.size !== extraction.rows.length) {
    issues.push("duplicate_extraction_coordinate");
  }
  for (const manifestRow of manifest.rows) {
    const source = extractionByKey.get(manifestRow.sourceRowKey);
    if (!source) {
      issues.push(`missing_extraction_row:${manifestRow.sourceRowKey}`);
      continue;
    }
    const installmentPaidXof = source.installmentPaidXof.reduce(
      (sum, amount) => sum + amount,
      0,
    );
    if (
      manifestRow.sourceSheet !== source.sourceSheet ||
      manifestRow.sourceRowNumber !== source.sourceRowNumber ||
      manifestRow.sourceStudentClaim !== source.sourceStudentName ||
      manifestRow.amountPaidXof !== source.amountPaidXof ||
      manifestRow.sourceRecordSha256 !==
        paymentBalanceExtractionRowDigest(source) ||
      !manifestRow.installmentDetail ||
      manifestRow.installmentDetail.paidXof !== installmentPaidXof ||
      manifestRow.installmentDetail.sourceReconcilesClaim !==
        reconcilesClaim(source.reconciles)
    ) {
      issues.push(`extraction_row_mismatch:${manifestRow.sourceRowKey}`);
    }
  }
  if (issues.length > 0) {
    throw new PaymentBalanceExtractionMismatchError(issues.slice(0, 500));
  }
}

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  HistoricalPaymentDateOnlySchema,
  type HistoricalPaymentManifest,
  canonicalPaymentSourceGroupKey,
  normalizePaymentIdentityName,
} from "./historical-payment-import.manifest.js";

const MAX_SOURCE_GROUPS = 25_000;

const extractionGroupSchema = z
  .object({
    sourceSheet: z.string().trim().min(1).max(120),
    sourceRowNumbers: z
      .array(z.number().int().min(1).max(10_000_000))
      .min(1)
      .max(20),
    sourceAmountXof: z.number().int().positive().max(2_147_483_647),
    sourceSettledOn: HistoricalPaymentDateOnlySchema,
    sourceMethod: z.string().trim().max(240),
    sourceStudentNames: z
      .array(z.string().trim().min(1).max(240))
      .min(1)
      .max(20),
  })
  .strict();

export const TrustedHistoricalPaymentExtractionSchema = z
  .object({
    schemaVersion: z.literal(1),
    extractor: z
      .object({
        name: z.string().trim().min(3).max(120),
        version: z.string().trim().min(1).max(40),
      })
      .strict(),
    sourceWorkbookSha256: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/)
      .transform((value) => value.toLowerCase()),
    sourceGroupCount: z.number().int().positive().max(MAX_SOURCE_GROUPS),
    sourceTotalXof: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sourceGroups: z.array(extractionGroupSchema).min(1).max(MAX_SOURCE_GROUPS),
  })
  .strict()
  .superRefine((extraction, ctx) => {
    const coordinates = new Set<string>();
    for (const [index, group] of extraction.sourceGroups.entries()) {
      if (
        new Set(group.sourceRowNumbers).size !== group.sourceRowNumbers.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceGroups", index, "sourceRowNumbers"],
          message: "Source row numbers must be unique",
        });
      }
      const key = canonicalPaymentSourceGroupKey(
        group.sourceSheet,
        group.sourceRowNumbers,
      );
      if (coordinates.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceGroups", index, "sourceRowNumbers"],
          message: `Physical source ${key} appears more than once`,
        });
      }
      coordinates.add(key);
    }
    if (extraction.sourceGroups.length !== extraction.sourceGroupCount) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceGroupCount"],
        message: `Extraction contains ${extraction.sourceGroups.length} groups, expected ${extraction.sourceGroupCount}`,
      });
    }
    const total = extraction.sourceGroups.reduce(
      (sum, group) => sum + group.sourceAmountXof,
      0,
    );
    if (total !== extraction.sourceTotalXof) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceTotalXof"],
        message: `Extraction contains ${total} XOF, expected ${extraction.sourceTotalXof} XOF`,
      });
    }
  });

export type TrustedHistoricalPaymentExtraction = z.infer<
  typeof TrustedHistoricalPaymentExtractionSchema
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

export function parseTrustedHistoricalPaymentExtraction(
  bytes: Buffer,
): TrustedHistoricalPaymentExtraction {
  return TrustedHistoricalPaymentExtractionSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

export function trustedHistoricalPaymentExtractionDigest(
  extraction: TrustedHistoricalPaymentExtraction,
): string {
  const normalized = {
    ...extraction,
    sourceGroups: [...extraction.sourceGroups].sort((left, right) =>
      canonicalPaymentSourceGroupKey(
        left.sourceSheet,
        left.sourceRowNumbers,
      ).localeCompare(
        canonicalPaymentSourceGroupKey(
          right.sourceSheet,
          right.sourceRowNumbers,
        ),
      ),
    ),
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

export class HistoricalPaymentExtractionMismatchError extends Error {
  constructor(readonly issues: string[]) {
    super("Reviewed manifest does not match the trusted workbook extraction");
    this.name = "HistoricalPaymentExtractionMismatchError";
  }
}

function normalizedNames(names: readonly string[]): string[] {
  return names.map(normalizePaymentIdentityName).sort();
}

export function verifyHistoricalPaymentManifestExtraction(
  manifest: HistoricalPaymentManifest,
  extraction: TrustedHistoricalPaymentExtraction,
): void {
  const issues: string[] = [];
  const extractionDigest = trustedHistoricalPaymentExtractionDigest(extraction);
  if (manifest.sourceExtractionSha256 !== extractionDigest) {
    issues.push("source extraction SHA-256 differs from the reviewed manifest");
  }
  if (manifest.sourceWorkbook.sha256 !== extraction.sourceWorkbookSha256) {
    issues.push("workbook SHA-256 differs between manifest and extraction");
  }
  if (
    manifest.sourceGroupCount !== extraction.sourceGroupCount ||
    manifest.sourceTotalXof !== extraction.sourceTotalXof
  ) {
    issues.push("workbook group-count or XOF control total differs");
  }

  const extractedByCoordinate = new Map(
    extraction.sourceGroups.map((group) => [
      canonicalPaymentSourceGroupKey(group.sourceSheet, group.sourceRowNumbers),
      group,
    ]),
  );
  const represented = new Set<string>();
  const includedByCoordinate = new Map<
    string,
    HistoricalPaymentManifest["rows"]
  >();
  for (const row of manifest.rows) {
    const key = canonicalPaymentSourceGroupKey(
      row.sourceSheet,
      row.sourceRowNumbers,
    );
    const rows = includedByCoordinate.get(key) ?? [];
    rows.push(row);
    includedByCoordinate.set(key, rows);
  }
  for (const [key, rows] of includedByCoordinate) {
    const source = extractedByCoordinate.get(key);
    represented.add(key);
    if (!source) {
      issues.push(
        `${key}: source coordinates are absent from trusted extraction`,
      );
      continue;
    }
    const first = rows[0]!;
    if (
      first.sourceAmountXof !== source.sourceAmountXof ||
      first.sourceSettledOn !== source.sourceSettledOn ||
      first.sourceMethod !== source.sourceMethod
    ) {
      issues.push(`${key}: amount, source date or source method differs`);
    }
    const manifestNames = normalizedNames(
      rows.map((row) => row.sourceStudentName),
    );
    const sourceNames = normalizedNames(source.sourceStudentNames);
    if (
      manifestNames.length !== sourceNames.length ||
      manifestNames.some((name, index) => name !== sourceNames[index])
    ) {
      issues.push(`${key}: source student-name set differs`);
    }
  }

  for (const excluded of manifest.excludedGroups) {
    const key = canonicalPaymentSourceGroupKey(
      excluded.sourceSheet,
      excluded.sourceRowNumbers,
    );
    if (represented.has(key)) {
      issues.push(`${key}: source coordinates are both included and excluded`);
      continue;
    }
    represented.add(key);
    const source = extractedByCoordinate.get(key);
    if (!source) {
      issues.push(
        `${key}: excluded coordinates are absent from trusted extraction`,
      );
      continue;
    }
    if (
      excluded.sourceAmountXof !== source.sourceAmountXof ||
      excluded.sourceSettledOn !== source.sourceSettledOn ||
      excluded.sourceMethod !== source.sourceMethod
    ) {
      issues.push(`${key}: excluded source metadata differs`);
    }
    const manifestNames = normalizedNames(excluded.sourceStudentNames);
    const sourceNames = normalizedNames(source.sourceStudentNames);
    if (
      manifestNames.length !== sourceNames.length ||
      manifestNames.some((name, index) => name !== sourceNames[index])
    ) {
      issues.push(`${key}: excluded source student-name set differs`);
    }
  }

  for (const key of extractedByCoordinate.keys()) {
    if (!represented.has(key)) {
      issues.push(`${key}: trusted source group has no manifest disposition`);
    }
  }
  if (issues.length > 0) {
    throw new HistoricalPaymentExtractionMismatchError(issues.slice(0, 200));
  }
}

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type LegacyCohortManifest,
  legacyCohortCoordinate,
} from "./legacy-cohort-import.manifest.js";

const Sha256Schema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/)
  .transform((value) => value.toLowerCase());

const ExtractedRowSchema = z
  .object({
    sourceSheet: z.string().trim().min(1).max(120),
    sourceRowNumber: z.number().int().min(2).max(10_000_000),
    rowFingerprintSha256: Sha256Schema,
    sourceLabel: z.enum(["paid", "unpaid"]),
    sourceLegacyStudentNo: z.string().trim().max(64).nullable(),
    paymentAmountXof: z.number().int().positive().max(2_147_483_647).nullable(),
  })
  .strict();

export const TrustedLegacyCohortExtractionSchema = z
  .object({
    schemaVersion: z.literal(1),
    extractor: z
      .object({
        name: z.string().trim().min(3).max(120),
        version: z.string().trim().min(1).max(40),
      })
      .strict(),
    sourceWorkbookSha256: Sha256Schema,
    sourceRowCount: z.number().int().positive().max(25_000),
    sourcePaidTotalXof: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    rows: z.array(ExtractedRowSchema).min(1).max(25_000),
  })
  .strict()
  .superRefine((extraction, ctx) => {
    const coordinates = new Set<string>();
    const fingerprints = new Set<string>();
    for (const [index, row] of extraction.rows.entries()) {
      const coordinate = legacyCohortCoordinate(row);
      if (coordinates.has(coordinate)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: `Duplicate physical source coordinate ${coordinate}`,
        });
      }
      coordinates.add(coordinate);
      if (fingerprints.has(row.rowFingerprintSha256)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "rowFingerprintSha256"],
          message: "Row fingerprints must include coordinates and be unique",
        });
      }
      fingerprints.add(row.rowFingerprintSha256);
      if (row.sourceLabel === "unpaid" && row.paymentAmountXof !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "paymentAmountXof"],
          message: "An unpaid source row cannot contain a payment amount",
        });
      }
    }
    if (coordinates.size !== extraction.sourceRowCount) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceRowCount"],
        message: `Extraction contains ${coordinates.size} rows, expected ${extraction.sourceRowCount}`,
      });
    }
    const paidTotal = extraction.rows.reduce(
      (sum, row) => sum + (row.paymentAmountXof ?? 0),
      0,
    );
    if (paidTotal !== extraction.sourcePaidTotalXof) {
      ctx.addIssue({
        code: "custom",
        path: ["sourcePaidTotalXof"],
        message: `Extraction contains ${paidTotal} XOF, expected ${extraction.sourcePaidTotalXof} XOF`,
      });
    }
  });

export type TrustedLegacyCohortExtraction = z.infer<
  typeof TrustedLegacyCohortExtractionSchema
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

export function parseTrustedLegacyCohortExtraction(
  bytes: Buffer,
): TrustedLegacyCohortExtraction {
  return TrustedLegacyCohortExtractionSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

export function trustedLegacyCohortExtractionDigest(
  extraction: TrustedLegacyCohortExtraction,
): string {
  const normalized = {
    ...extraction,
    rows: [...extraction.rows].sort((left, right) =>
      legacyCohortCoordinate(left).localeCompare(legacyCohortCoordinate(right)),
    ),
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

export class LegacyCohortExtractionMismatchError extends Error {
  constructor(readonly issues: string[]) {
    super("Reviewed cohort manifest does not match the trusted extraction");
    this.name = "LegacyCohortExtractionMismatchError";
  }
}

export function verifyLegacyCohortManifestExtraction(
  manifest: LegacyCohortManifest,
  extraction: TrustedLegacyCohortExtraction,
): void {
  const issues: string[] = [];
  const extractionDigest = trustedLegacyCohortExtractionDigest(extraction);
  if (manifest.sourceExtractionSha256 !== extractionDigest) {
    issues.push("source extraction SHA-256 differs from the reviewed manifest");
  }
  if (manifest.sourceWorkbook.sha256 !== extraction.sourceWorkbookSha256) {
    issues.push("workbook SHA-256 differs between manifest and extraction");
  }
  if (
    manifest.sourceRowCount !== extraction.sourceRowCount ||
    manifest.sourcePaidTotalXof !== extraction.sourcePaidTotalXof
  ) {
    issues.push("source row-count or paid-XOF control total differs");
  }

  const extractedByCoordinate = new Map(
    extraction.rows.map((row) => [legacyCohortCoordinate(row), row]),
  );
  const represented = new Map<
    string,
    {
      personKey: string;
      legacyStudentNo: string;
      source: LegacyCohortManifest["people"][number]["sources"][number];
    }
  >();
  for (const person of manifest.people) {
    for (const source of person.sources) {
      const coordinate = legacyCohortCoordinate(source);
      const extracted = extractedByCoordinate.get(coordinate);
      represented.set(coordinate, {
        personKey: person.personKey,
        legacyStudentNo: person.legacyStudentNo,
        source,
      });
      if (!extracted) {
        issues.push(
          `${coordinate}: source coordinate is absent from extraction`,
        );
        continue;
      }
      if (source.rowFingerprintSha256 !== extracted.rowFingerprintSha256) {
        issues.push(`${coordinate}: row fingerprint differs from extraction`);
      }
      if (
        person.legacyIdDecision.disposition === "use_source" &&
        (!extracted.sourceLegacyStudentNo ||
          extracted.sourceLegacyStudentNo.trim().toUpperCase() !==
            person.legacyStudentNo)
      ) {
        issues.push(
          `${coordinate}: use_source legacy ID does not match the extracted F-ID`,
        );
      }
      if (
        extracted.sourceLabel === "unpaid" &&
        source.disposition.kind === "cash"
      ) {
        issues.push(`${coordinate}: an unpaid source row cannot post cash`);
      }
      if (
        extracted.sourceLabel === "paid" &&
        extracted.paymentAmountXof !== null &&
        source.disposition.kind === "no_cash"
      ) {
        // Explicitly allowed, but never silent: the schema already requires a
        // substantial reason and the durable row records the disposition.
      }
    }
  }
  const excludedByCoordinate = new Map(
    manifest.excludedSources.map((source) => [
      legacyCohortCoordinate(source),
      source,
    ]),
  );
  for (const [coordinate, excluded] of excludedByCoordinate) {
    const extracted = extractedByCoordinate.get(coordinate);
    if (!extracted) {
      issues.push(
        `${coordinate}: excluded coordinate is absent from extraction`,
      );
      continue;
    }
    if (excluded.rowFingerprintSha256 !== extracted.rowFingerprintSha256) {
      issues.push(
        `${coordinate}: excluded row fingerprint differs from extraction`,
      );
    }
    if (represented.has(coordinate)) {
      issues.push(`${coordinate}: source row is both included and excluded`);
    }
  }
  for (const coordinate of extractedByCoordinate.keys()) {
    if (!represented.has(coordinate) && !excludedByCoordinate.has(coordinate)) {
      issues.push(
        `${coordinate}: trusted source row has no included or excluded manifest disposition`,
      );
    }
  }

  const includedRawLegacyIds = new Set<string>();
  for (const coordinate of represented.keys()) {
    const raw = extractedByCoordinate
      .get(coordinate)
      ?.sourceLegacyStudentNo?.trim()
      .toUpperCase();
    if (raw) includedRawLegacyIds.add(raw);
  }
  for (const coordinate of excludedByCoordinate.keys()) {
    const raw = extractedByCoordinate
      .get(coordinate)
      ?.sourceLegacyStudentNo?.trim()
      .toUpperCase();
    if (raw && includedRawLegacyIds.has(raw)) {
      issues.push(
        `${coordinate}: an excluded source F-ID cannot remain on an included person group`,
      );
    }
  }

  const rawLegacyOwners = new Map<string, Set<string>>();
  for (const [coordinate, representedRow] of represented) {
    const raw = extractedByCoordinate
      .get(coordinate)
      ?.sourceLegacyStudentNo?.trim()
      .toUpperCase();
    if (!raw) continue;
    const owners = rawLegacyOwners.get(raw) ?? new Set<string>();
    owners.add(representedRow.personKey);
    rawLegacyOwners.set(raw, owners);
  }
  for (const owners of rawLegacyOwners.values()) {
    if (owners.size <= 1) continue;
    for (const personKey of owners) {
      const person = manifest.people.find(
        (row) => row.personKey === personKey,
      )!;
      if (person.legacyIdDecision.disposition !== "reviewed_assignment") {
        issues.push(
          "A cross-person source F-ID conflict requires reviewed_assignment for every affected group",
        );
      }
    }
  }

  for (const person of manifest.people) {
    const sources = new Map(
      person.sources.map((source) => [legacyCohortCoordinate(source), source]),
    );
    for (const payment of person.payments) {
      const extractedAmounts = payment.sourceCoordinates.map((coordinate) => {
        const key = legacyCohortCoordinate(coordinate);
        if (sources.get(key)?.disposition.kind !== "cash") {
          issues.push(`${key}: payment source is not dispositioned as cash`);
        }
        return extractedByCoordinate.get(key)?.paymentAmountXof ?? null;
      });
      const allKnown = extractedAmounts.every(
        (amount): amount is number => amount !== null,
      );
      const extractedTotal = allKnown
        ? extractedAmounts.reduce((sum, amount) => sum + amount, 0)
        : null;
      if (
        (extractedTotal === null || extractedTotal !== payment.amountXof) &&
        !payment.amountReviewReason
      ) {
        issues.push(
          `${payment.sourceCoordinates.map(legacyCohortCoordinate).join(", ")}: changed or missing source amount requires amountReviewReason`,
        );
      }
      if (
        extractedTotal !== null &&
        extractedTotal === payment.amountXof &&
        payment.amountReviewReason
      ) {
        issues.push(
          `${payment.sourceCoordinates.map(legacyCohortCoordinate).join(", ")}: stale amountReviewReason without an amount difference`,
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new LegacyCohortExtractionMismatchError(issues.slice(0, 300));
  }
}

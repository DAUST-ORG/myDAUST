import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_IMPORT_ROWS = 25_000;
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

export const HistoricalPaymentDateOnlySchema = z
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

const SourceRowsSchema = z
  .array(z.number().int().min(1).max(10_000_000))
  .min(1)
  .max(20);

const authoritativeIdentitySchema = z
  .object({
    status: z.literal("authoritative"),
    studentNo: StudentNumberSchema,
  })
  .strict();

const missingIdentitySchema = z
  .object({ status: z.literal("missing") })
  .strict();

const ambiguousIdentitySchema = z
  .object({
    status: z.literal("ambiguous"),
    candidateStudentNos: z.array(StudentNumberSchema).min(1).max(20),
  })
  .strict();

const identitySchema = z.discriminatedUnion("status", [
  authoritativeIdentitySchema,
  missingIdentitySchema,
  ambiguousIdentitySchema,
]);

const existingPaymentDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("already_recorded"),
      paymentId: z.string().uuid(),
      reason: z.string().trim().min(10).max(500),
    })
    .strict(),
  z
    .object({
      decision: z.literal("confirmed_distinct"),
      paymentIds: z.array(z.string().uuid()).min(1).max(50),
      reason: z.string().trim().min(10).max(500),
    })
    .strict(),
]);

const historicalOrderingReviewSchema = z
  .object({
    decision: z.literal("apply_to_current_remaining_balance"),
    invoiceId: z.string().trim().min(1).max(120),
    invoiceRevision: z.number().int().min(0),
    laterPaymentIds: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

const sourceCoordinatesSchema = z.object({
  sourceGroupKey: z.string().trim().min(1).max(240),
  sourceSheet: z.string().trim().min(1).max(120),
  sourceRowNumbers: SourceRowsSchema,
  sourceAmountXof: z.number().int().positive().max(2_147_483_647),
});

const paymentRowSchema = sourceCoordinatesSchema
  .extend({
    allocationKey: z.string().trim().min(1).max(120),
    sourceStudentName: z.string().trim().min(1).max(240),
    identity: identitySchema,
    sourceSettledOn: HistoricalPaymentDateOnlySchema,
    settledOn: HistoricalPaymentDateOnlySchema,
    dateCorrectionReason: z.string().trim().min(10).max(500).optional(),
    amountXof: z.number().int().positive().max(2_147_483_647),
    sourceMethod: z.string().trim().max(240),
    method: z.enum([
      "wave",
      "orange_money",
      "card",
      "wire",
      "cheque",
      "pi_spi",
    ]),
    externalReference: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(
        /[A-Za-z0-9]/,
        "External references must contain a letter or number",
      )
      .optional(),
    status: z.literal("settled"),
    reviewed: z.boolean(),
    duplicateResolution: z
      .object({
        decision: z.literal("confirmed_distinct"),
        reason: z.string().trim().min(10).max(500),
      })
      .strict()
      .optional(),
    splitResolution: z
      .object({ reason: z.string().trim().min(10).max(500) })
      .strict()
      .optional(),
    existingPaymentDecision: existingPaymentDecisionSchema.optional(),
    historicalOrderingReview: historicalOrderingReviewSchema.optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();

const excludedGroupSchema = sourceCoordinatesSchema
  .extend({
    sourceStudentNames: z
      .array(z.string().trim().min(1).max(240))
      .min(1)
      .max(20),
    sourceSettledOn: HistoricalPaymentDateOnlySchema,
    sourceMethod: z.string().trim().max(240),
    disposition: z.enum(["duplicate", "other"]),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export function canonicalPaymentSourceGroupKey(
  sheet: string,
  rowNumbers: readonly number[],
): string {
  const rows = [...new Set(rowNumbers)].sort((a, b) => a - b);
  return `${sheet.trim()}!${rows.map((row) => `D${row}`).join(",")}`;
}

export const HistoricalPaymentManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    importName: z.string().trim().min(3).max(200),
    academicYearLabel: z.string().trim().min(4).max(40),
    currency: z.literal("XOF"),
    allRowsSettled: z.literal(true),
    notificationPolicy: z.literal("suppress"),
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
    sourceExtractionSha256: Sha256Schema,
    sourceGroupCount: z.number().int().positive().max(MAX_IMPORT_ROWS),
    sourceTotalXof: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    rows: z.array(paymentRowSchema).min(1).max(MAX_IMPORT_ROWS),
    excludedGroups: z
      .array(excludedGroupSchema)
      .max(MAX_IMPORT_ROWS)
      .default([]),
    reviewNote: z.string().trim().min(10).max(2_000),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const groupMetadata = new Map<
      string,
      {
        sheet: string;
        rows: string;
        sourceAmountXof: number;
        sourceSettledOn: string;
        settledOn: string;
        sourceMethod: string;
        method: string;
        allocatedXof: number;
      }
    >();
    const allocationKeys = new Set<string>();
    const coordinateOwners = new Map<string, string>();
    const nameMappings = new Map<string, Set<string>>();

    for (const [index, row] of manifest.rows.entries()) {
      const key = `${row.sourceGroupKey}:${row.allocationKey}`;
      if (allocationKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "allocationKey"],
          message: `Duplicate source allocation key ${key}`,
        });
      }
      allocationKeys.add(key);
      if (new Set(row.sourceRowNumbers).size !== row.sourceRowNumbers.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceRowNumbers"],
          message: "Source row numbers must be unique",
        });
      }
      const canonicalKey = canonicalPaymentSourceGroupKey(
        row.sourceSheet,
        row.sourceRowNumbers,
      );
      if (row.sourceGroupKey !== canonicalKey) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceGroupKey"],
          message: `Source group key must be the canonical physical coordinate ${canonicalKey}`,
        });
      }
      const coordinateOwner = coordinateOwners.get(canonicalKey);
      if (coordinateOwner && coordinateOwner !== row.sourceGroupKey) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceGroupKey"],
          message: `Physical source ${canonicalKey} is assigned to multiple groups`,
        });
      }
      coordinateOwners.set(canonicalKey, row.sourceGroupKey);

      if (row.sourceSettledOn !== row.settledOn && !row.dateCorrectionReason) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "dateCorrectionReason"],
          message: "A corrected settlement date requires a review reason",
        });
      }
      if (row.sourceSettledOn === row.settledOn && row.dateCorrectionReason) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "dateCorrectionReason"],
          message:
            "A date-correction reason is valid only when the date changed",
        });
      }
      if (row.method === "cheque" && !row.externalReference) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "externalReference"],
          message: "Cheque imports require the cheque/reference number",
        });
      }

      const rowsKey = [...row.sourceRowNumbers].sort((a, b) => a - b).join(",");
      const existing = groupMetadata.get(row.sourceGroupKey);
      if (
        existing &&
        (existing.sheet !== row.sourceSheet ||
          existing.rows !== rowsKey ||
          existing.sourceAmountXof !== row.sourceAmountXof ||
          existing.sourceSettledOn !== row.sourceSettledOn ||
          existing.settledOn !== row.settledOn ||
          existing.sourceMethod !== row.sourceMethod ||
          existing.method !== row.method)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceGroupKey"],
          message:
            "Allocations sharing a source group must use identical source metadata",
        });
      } else if (existing) {
        existing.allocatedXof += row.amountXof;
      } else {
        groupMetadata.set(row.sourceGroupKey, {
          sheet: row.sourceSheet,
          rows: rowsKey,
          sourceAmountXof: row.sourceAmountXof,
          sourceSettledOn: row.sourceSettledOn,
          settledOn: row.settledOn,
          sourceMethod: row.sourceMethod,
          method: row.method,
          allocatedXof: row.amountXof,
        });
      }

      if (row.identity.status === "authoritative") {
        const normalizedName = normalizePaymentIdentityName(
          row.sourceStudentName,
        );
        const mappings = nameMappings.get(normalizedName) ?? new Set<string>();
        mappings.add(row.identity.studentNo);
        nameMappings.set(normalizedName, mappings);
      }
    }

    for (const [key, metadata] of groupMetadata) {
      if (metadata.allocatedXof !== metadata.sourceAmountXof) {
        ctx.addIssue({
          code: "custom",
          path: ["rows"],
          message: `Source group ${key} allocates ${metadata.allocatedXof} XOF but the workbook cell contains ${metadata.sourceAmountXof} XOF`,
        });
      }
    }

    const rowsByGroup = new Map<string, number[]>();
    for (const [index, row] of manifest.rows.entries()) {
      const indexes = rowsByGroup.get(row.sourceGroupKey) ?? [];
      indexes.push(index);
      rowsByGroup.set(row.sourceGroupKey, indexes);
    }
    for (const indexes of rowsByGroup.values()) {
      if (indexes.length < 2) continue;
      for (const index of indexes) {
        if (!manifest.rows[index]!.splitResolution) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "splitResolution"],
            message:
              "An amount split across students requires an explicit review reason",
          });
        }
      }
    }

    for (const studentNos of nameMappings.values()) {
      if (studentNos.size > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["rows"],
          message: "One workbook name maps to multiple student numbers",
        });
      }
    }

    const duplicateFingerprints = new Map<string, number[]>();
    for (const [index, row] of manifest.rows.entries()) {
      const identity =
        row.identity.status === "authoritative"
          ? row.identity.studentNo
          : normalizePaymentIdentityName(row.sourceStudentName);
      const fingerprint = JSON.stringify([
        identity,
        row.settledOn,
        row.amountXof,
        normalizeExternalReference(row.externalReference),
      ]);
      const indexes = duplicateFingerprints.get(fingerprint) ?? [];
      indexes.push(index);
      duplicateFingerprints.set(fingerprint, indexes);
    }
    for (const indexes of duplicateFingerprints.values()) {
      const groupKeys = new Set(
        indexes.map((index) => manifest.rows[index]!.sourceGroupKey),
      );
      if (groupKeys.size < 2) continue;
      for (const index of indexes) {
        if (!manifest.rows[index]!.duplicateResolution) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", index, "duplicateResolution"],
            message:
              "Duplicate-looking payments require confirmed-distinct review",
          });
        }
      }
    }

    const excludedKeys = new Set<string>();
    for (const [index, excluded] of manifest.excludedGroups.entries()) {
      if (
        new Set(excluded.sourceRowNumbers).size !==
        excluded.sourceRowNumbers.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["excludedGroups", index, "sourceRowNumbers"],
          message: "Source row numbers must be unique",
        });
      }
      const canonicalKey = canonicalPaymentSourceGroupKey(
        excluded.sourceSheet,
        excluded.sourceRowNumbers,
      );
      if (excluded.sourceGroupKey !== canonicalKey) {
        ctx.addIssue({
          code: "custom",
          path: ["excludedGroups", index, "sourceGroupKey"],
          message: `Source group key must be the canonical physical coordinate ${canonicalKey}`,
        });
      }
      if (
        groupMetadata.has(excluded.sourceGroupKey) ||
        excludedKeys.has(excluded.sourceGroupKey) ||
        coordinateOwners.has(canonicalKey)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["excludedGroups", index, "sourceGroupKey"],
          message: `Physical source ${canonicalKey} is listed more than once`,
        });
      }
      excludedKeys.add(excluded.sourceGroupKey);
      coordinateOwners.set(canonicalKey, excluded.sourceGroupKey);
    }

    const allGroups = [
      ...groupMetadata.values(),
      ...manifest.excludedGroups.map((group) => ({
        sourceAmountXof: group.sourceAmountXof,
      })),
    ];
    if (allGroups.length !== manifest.sourceGroupCount) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceGroupCount"],
        message: `Manifest accounts for ${allGroups.length} groups, expected ${manifest.sourceGroupCount}`,
      });
    }
    const accountedTotal = allGroups.reduce(
      (sum, group) => sum + group.sourceAmountXof,
      0,
    );
    if (accountedTotal !== manifest.sourceTotalXof) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceTotalXof"],
        message: `Manifest accounts for ${accountedTotal} XOF, expected ${manifest.sourceTotalXof} XOF`,
      });
    }
  });

export type HistoricalPaymentManifest = z.infer<
  typeof HistoricalPaymentManifestSchema
>;
export type HistoricalPaymentManifestRow =
  HistoricalPaymentManifest["rows"][number];

export function parseHistoricalPaymentManifest(
  bytes: Buffer,
): HistoricalPaymentManifest {
  return HistoricalPaymentManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

export function normalizePaymentIdentityName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeExternalReference(
  value: string | null | undefined,
): string | null {
  const normalized = value?.toUpperCase().replace(/[^A-Z0-9]+/g, "") ?? "";
  return normalized || null;
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

export function historicalPaymentManifestDigest(
  manifest: HistoricalPaymentManifest,
): string {
  const normalized = {
    ...manifest,
    rows: [...manifest.rows].sort(
      (left, right) =>
        left.sourceGroupKey.localeCompare(right.sourceGroupKey) ||
        left.allocationKey.localeCompare(right.allocationKey),
    ),
    excludedGroups: [...manifest.excludedGroups].sort((left, right) =>
      left.sourceGroupKey.localeCompare(right.sourceGroupKey),
    ),
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

export function historicalPaymentSourceKey(
  manifest: HistoricalPaymentManifest,
  row: HistoricalPaymentManifestRow,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        manifest.sourceWorkbook.sha256,
        row.sourceGroupKey,
        row.allocationKey,
      ]),
    )
    .digest("hex");
}

export function historicalPaymentProviderRef(sourceKey: string): string {
  return `HIST-${sourceKey}`;
}

/** Noon UTC is safely inside the Dakar calendar day (Dakar is UTC year-round). */
export function historicalSettlementTimestamp(dateOnly: string): Date {
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

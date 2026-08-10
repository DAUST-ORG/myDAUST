import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_MANIFEST_ROWS = 25_000;
const IMPORT_PREFIX = "transcript-imports/";

export const StudentNumberSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Student numbers may contain only letters, numbers, dots, underscores, and hyphens",
  );

export const TranscriptImportObjectKeySchema = z
  .string()
  .trim()
  .min(IMPORT_PREFIX.length + 1)
  .max(1_024)
  .refine((key) => key.startsWith(IMPORT_PREFIX), {
    message: `Object keys must start with ${IMPORT_PREFIX}`,
  })
  .refine(
    (key) =>
      !key.endsWith("/") &&
      !key.includes("//") &&
      !key.split("/").some((part) => part === "." || part === ".."),
    { message: "Object key contains an unsafe path segment" },
  );

const authoritativeIdentitySchema = z
  .object({
    status: z.literal("authoritative"),
    studentNo: StudentNumberSchema,
  })
  .strict();

const missingIdentitySchema = z
  .object({
    status: z.literal("missing"),
  })
  .strict();

const ambiguousIdentitySchema = z
  .object({
    status: z.literal("ambiguous"),
    candidateStudentNos: z.array(StudentNumberSchema).min(2).max(20),
  })
  .strict();

const rowIdentitySchema = z.discriminatedUnion("status", [
  authoritativeIdentitySchema,
  missingIdentitySchema,
  ambiguousIdentitySchema,
]);

const manifestRowSchema = z
  .object({
    sourceRowNumber: z.number().int().min(2).max(10_000_000),
    sourceStudentName: z.string().trim().min(1).max(240),
    identity: rowIdentitySchema,
    courseCode: z.string().trim().max(64),
    courseTitle: z.string().trim().min(1).max(500),
    credits: z.number().int().min(0).max(40),
    academicYear: z.string().trim().min(9).max(20),
    semester: z.string().trim().min(3).max(40),
    grade: z.string().trim().max(12),
    requirementCategory: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .optional(),
  })
  .strict();

const archivedProfileSchema = z
  .object({
    studentNo: StudentNumberSchema,
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(160),
    authorized: z.literal(true),
    authorizationReference: z.string().trim().min(3).max(500),
  })
  .strict();

export const HistoricalTranscriptManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    importName: z.string().trim().min(3).max(200),
    sourceWorkbook: z
      .object({
        objectKey: TranscriptImportObjectKeySchema,
        fileName: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .refine((name) => name.toLowerCase().endsWith(".xlsx"), {
            message: "Source workbook must be an .xlsx file",
          }),
        worksheet: z.string().trim().min(1).max(120),
        sha256: z
          .string()
          .trim()
          .regex(/^[a-fA-F0-9]{64}$/, "Expected a SHA-256 hex digest")
          .transform((value) => value.toLowerCase()),
      })
      .strict(),
    archivedProfiles: z.array(archivedProfileSchema).max(10_000).default([]),
    rows: z.array(manifestRowSchema).min(1).max(MAX_MANIFEST_ROWS),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const sourceRows = new Set<number>();
    for (const [index, row] of manifest.rows.entries()) {
      if (sourceRows.has(row.sourceRowNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "sourceRowNumber"],
          message: `Duplicate source row number ${row.sourceRowNumber}`,
        });
      }
      sourceRows.add(row.sourceRowNumber);
      if (
        row.identity.status === "ambiguous" &&
        new Set(row.identity.candidateStudentNos).size !==
          row.identity.candidateStudentNos.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "identity", "candidateStudentNos"],
          message: "Candidate student numbers must be unique",
        });
      }
    }

    const authorizedStudentNos = new Set<string>();
    for (const [index, profile] of manifest.archivedProfiles.entries()) {
      if (authorizedStudentNos.has(profile.studentNo)) {
        ctx.addIssue({
          code: "custom",
          path: ["archivedProfiles", index, "studentNo"],
          message: `Duplicate archived-profile authorization for ${profile.studentNo}`,
        });
      }
      authorizedStudentNos.add(profile.studentNo);
    }

    const referencedStudentNos = new Set(
      manifest.rows.flatMap((row) =>
        row.identity.status === "authoritative" ? [row.identity.studentNo] : [],
      ),
    );
    for (const [index, profile] of manifest.archivedProfiles.entries()) {
      if (!referencedStudentNos.has(profile.studentNo)) {
        ctx.addIssue({
          code: "custom",
          path: ["archivedProfiles", index, "studentNo"],
          message:
            "Archived-profile authorization is not referenced by any row",
        });
      }
    }

    const nameMappings = new Map<string, Set<string>>();
    for (const row of manifest.rows) {
      if (row.identity.status !== "authoritative") continue;
      const name = normalizeIdentityName(row.sourceStudentName);
      const mappings = nameMappings.get(name) ?? new Set<string>();
      mappings.add(row.identity.studentNo);
      nameMappings.set(name, mappings);
    }
    for (const [name, mappings] of nameMappings) {
      if (mappings.size > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["rows"],
          message: `One source student name maps to multiple student numbers (${name})`,
        });
      }
    }
  });

export type HistoricalTranscriptManifest = z.infer<
  typeof HistoricalTranscriptManifestSchema
>;
export type HistoricalManifestRow =
  HistoricalTranscriptManifest["rows"][number];
export type ArchivedProfileAuthorization =
  HistoricalTranscriptManifest["archivedProfiles"][number];

export const HISTORICAL_GRADE_POLICY = {
  "A+": {
    gradePoints: 4,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  A: {
    gradePoints: 4,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "A-": {
    gradePoints: 3.7,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "B+": {
    gradePoints: 3.3,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  B: {
    gradePoints: 3,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "B-": {
    gradePoints: 2.7,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "C+": {
    gradePoints: 2.3,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  C: {
    gradePoints: 2,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "C-": {
    gradePoints: 1.7,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "D+": {
    gradePoints: 1.3,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  D: {
    gradePoints: 1,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  "D-": {
    gradePoints: 0.7,
    countsTowardGpa: true,
    countsTowardCredits: true,
  },
  F: {
    gradePoints: 0,
    countsTowardGpa: true,
    countsTowardCredits: false,
  },
  I: {
    gradePoints: null,
    countsTowardGpa: false,
    countsTowardCredits: false,
  },
  P: {
    gradePoints: null,
    countsTowardGpa: false,
    countsTowardCredits: true,
  },
} as const;

export type HistoricalGrade = keyof typeof HISTORICAL_GRADE_POLICY;

export interface ParsedHistoricalTerm {
  academicYear: string;
  semester: "Fall" | "Spring" | "Summer";
  label: string;
  sortKey: string;
}

export interface IdentityBlocker {
  sourceRowNumber: number;
  status: "missing" | "ambiguous";
  candidateCount: number;
}

export interface PreparedHistoricalRow {
  importRowNumber: number;
  studentNo: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  grade: HistoricalGrade;
  gradePoints: number | null;
  countsTowardGpa: boolean;
  countsTowardCredits: boolean;
  earnedCredits: number;
  termLabel: string;
  termSortKey: string;
  requirementCategory: string | null;
  sourceKey: string;
}

export interface PreparedHistoricalImport {
  rows: PreparedHistoricalRow[];
  identityBlockers: IdentityBlocker[];
  duplicateSourceRows: number[];
}

export function parseHistoricalTranscriptManifest(
  input: string | Buffer,
): HistoricalTranscriptManifest {
  const decoded = typeof input === "string" ? input : input.toString("utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(decoded);
  } catch {
    throw new Error("Transcript manifest is not valid JSON");
  }
  return HistoricalTranscriptManifestSchema.parse(raw);
}

export function normalizeIdentityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cleanSnapshot(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function courseLookupKey(value: string): string {
  return cleanSnapshot(value).toUpperCase();
}

export function normalizeHistoricalGrade(value: string): HistoricalGrade {
  const normalized = cleanSnapshot(value).toUpperCase() || "I";
  if (!(normalized in HISTORICAL_GRADE_POLICY)) {
    throw new Error(`Unsupported historical grade "${normalized}"`);
  }
  return normalized as HistoricalGrade;
}

export function parseHistoricalTerm(
  academicYearInput: string,
  semesterInput: string,
): ParsedHistoricalTerm {
  const academicYear = cleanSnapshot(academicYearInput);
  const yearMatch = academicYear.match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/);
  if (!yearMatch) {
    throw new Error(`Unsupported academic year "${academicYear}"`);
  }
  const startYear = Number(yearMatch[1]);
  const endYear = Number(yearMatch[2]);
  if (endYear !== startYear + 1) {
    throw new Error(
      `Academic year must contain consecutive years: "${academicYear}"`,
    );
  }

  const normalizedSemester = cleanSnapshot(semesterInput).toLowerCase();
  const semester =
    normalizedSemester === "fall" || normalizedSemester === "fall semester"
      ? "Fall"
      : normalizedSemester === "spring" ||
          normalizedSemester === "spring semester"
        ? "Spring"
        : normalizedSemester === "summer" ||
            normalizedSemester === "summer semester" ||
            normalizedSemester === "summer term"
          ? "Summer"
          : null;
  if (!semester) {
    throw new Error(`Unsupported semester "${cleanSnapshot(semesterInput)}"`);
  }

  const year = semester === "Fall" ? startYear : endYear;
  const month =
    semester === "Spring" ? "01" : semester === "Summer" ? "06" : "09";
  const label = `${semester} ${year}`;
  return {
    academicYear: `${startYear}-${endYear}`,
    semester,
    label,
    sortKey: `${year}-${month}-01:${label}`,
  };
}

function exactContentSourceKey(
  row: Omit<PreparedHistoricalRow, "sourceKey">,
): string {
  const canonical = JSON.stringify({
    version: 1,
    studentNo: row.studentNo,
    courseCode: row.courseCode,
    courseTitle: row.courseTitle,
    credits: row.credits,
    grade: row.grade,
    termLabel: row.termLabel,
    requirementCategory: row.requirementCategory,
  });
  return `legacy:v1:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function prepareHistoricalImport(
  manifest: HistoricalTranscriptManifest,
): PreparedHistoricalImport {
  const rows: PreparedHistoricalRow[] = [];
  const identityBlockers: IdentityBlocker[] = [];
  const duplicateSourceRows: number[] = [];
  const sourceKeys = new Set<string>();

  for (const row of manifest.rows) {
    if (row.identity.status !== "authoritative") {
      identityBlockers.push({
        sourceRowNumber: row.sourceRowNumber,
        status: row.identity.status,
        candidateCount:
          row.identity.status === "ambiguous"
            ? row.identity.candidateStudentNos.length
            : 0,
      });
      continue;
    }

    const grade = normalizeHistoricalGrade(row.grade);
    const policy = HISTORICAL_GRADE_POLICY[grade];
    const term = parseHistoricalTerm(row.academicYear, row.semester);
    const withoutSourceKey: Omit<PreparedHistoricalRow, "sourceKey"> = {
      importRowNumber: row.sourceRowNumber,
      studentNo: row.identity.studentNo,
      courseCode: cleanSnapshot(row.courseCode),
      courseTitle: cleanSnapshot(row.courseTitle),
      credits: row.credits,
      grade,
      gradePoints: policy.gradePoints,
      countsTowardGpa: policy.countsTowardGpa,
      countsTowardCredits: policy.countsTowardCredits,
      earnedCredits: policy.countsTowardCredits ? row.credits : 0,
      termLabel: term.label,
      termSortKey: term.sortKey,
      requirementCategory: row.requirementCategory
        ? cleanSnapshot(row.requirementCategory)
        : null,
    };
    const sourceKey = exactContentSourceKey(withoutSourceKey);
    if (sourceKeys.has(sourceKey)) {
      duplicateSourceRows.push(row.sourceRowNumber);
      continue;
    }
    sourceKeys.add(sourceKey);
    rows.push({ ...withoutSourceKey, sourceKey });
  }

  return { rows, identityBlockers, duplicateSourceRows };
}

export function archivedProfileEmail(studentNo: string): string {
  const digest = createHash("sha256")
    .update(studentNo.trim().toUpperCase())
    .digest("hex")
    .slice(0, 32);
  return `historical.${digest}@archive.invalid`;
}

import { describe, expect, it } from "vitest";
import {
  HISTORICAL_GRADE_POLICY,
  HistoricalTranscriptManifestSchema,
  archivedProfileEmail,
  normalizeHistoricalGrade,
  parseHistoricalTerm,
  prepareHistoricalImport,
} from "./historical-import.manifest.js";

function manifest(
  rows: Array<Record<string, unknown>>,
  archivedProfiles: Array<Record<string, unknown>> = [],
) {
  return HistoricalTranscriptManifestSchema.parse({
    schemaVersion: 1,
    importName: "Historical transcript test",
    sourceWorkbook: {
      objectKey: "transcript-imports/test/source.xlsx",
      fileName: "source.xlsx",
      worksheet: "Grades",
      sha256: "a".repeat(64),
    },
    archivedProfiles,
    rows,
  });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    sourceRowNumber: 2,
    sourceStudentName: "Aissatou Diallo",
    identity: { status: "authoritative", studentNo: "F202601AD" },
    courseCode: "CS 1231",
    courseTitle: "Programming I",
    credits: 6,
    academicYear: "2025 - 2026",
    semester: "Fall Semester",
    grade: "A",
    ...overrides,
  };
}

describe("historical grade normalization and policy", () => {
  it("normalizes blank grades to incomplete", () => {
    expect(normalizeHistoricalGrade("   ")).toBe("I");
    expect(HISTORICAL_GRADE_POLICY.I).toEqual({
      gradePoints: null,
      countsTowardGpa: false,
      countsTowardCredits: false,
    });
  });

  it("implements the conventional grade-point and credit policy", () => {
    expect(
      Object.fromEntries(
        Object.entries(HISTORICAL_GRADE_POLICY).map(([grade, policy]) => [
          grade,
          policy.gradePoints,
        ]),
      ),
    ).toEqual({
      "A+": 4,
      A: 4,
      "A-": 3.7,
      "B+": 3.3,
      B: 3,
      "B-": 2.7,
      "C+": 2.3,
      C: 2,
      "C-": 1.7,
      "D+": 1.3,
      D: 1,
      "D-": 0.7,
      F: 0,
      I: null,
      P: null,
    });
    expect(HISTORICAL_GRADE_POLICY.F).toMatchObject({
      countsTowardGpa: true,
      countsTowardCredits: false,
    });
    expect(HISTORICAL_GRADE_POLICY.P).toMatchObject({
      countsTowardGpa: false,
      countsTowardCredits: true,
    });
    expect(() => normalizeHistoricalGrade("W")).toThrow(
      'Unsupported historical grade "W"',
    );
  });
});

describe("historical term parsing", () => {
  it("uses the starting year for fall and the ending year for spring", () => {
    expect(parseHistoricalTerm("2025 - 2026", "Fall Semester")).toEqual({
      academicYear: "2025-2026",
      semester: "Fall",
      label: "Fall 2025",
      sortKey: "2025-09-01:Fall 2025",
    });
    expect(parseHistoricalTerm("2025–2026", "Spring Semester")).toEqual({
      academicYear: "2025-2026",
      semester: "Spring",
      label: "Spring 2026",
      sortKey: "2026-01-01:Spring 2026",
    });
  });

  it("accepts the workbook's Summer Term label", () => {
    expect(parseHistoricalTerm("2025/2026", "Summer Term")).toEqual({
      academicYear: "2025-2026",
      semester: "Summer",
      label: "Summer 2026",
      sortKey: "2026-06-01:Summer 2026",
    });
  });

  it("rejects malformed years and unknown semesters", () => {
    expect(() => parseHistoricalTerm("2025-2027", "Fall Semester")).toThrow(
      "consecutive years",
    );
    expect(() => parseHistoricalTerm("2025-2026", "Winter")).toThrow(
      'Unsupported semester "Winter"',
    );
  });
});

describe("historical exact-content deduplication", () => {
  it("keeps the first exact-content row and records later source rows as duplicates", () => {
    const prepared = prepareHistoricalImport(
      manifest([row(), row({ sourceRowNumber: 19 })]),
    );
    expect(prepared.rows).toHaveLength(1);
    expect(prepared.rows[0].importRowNumber).toBe(2);
    expect(prepared.duplicateSourceRows).toEqual([19]);
  });

  it("retains differing grades in the same course and term as separate attempts", () => {
    const prepared = prepareHistoricalImport(
      manifest([row(), row({ sourceRowNumber: 19, grade: "B+" })]),
    );
    expect(prepared.rows).toHaveLength(2);
    expect(prepared.rows.map((entry) => entry.grade)).toEqual(["A", "B+"]);
    expect(new Set(prepared.rows.map((entry) => entry.sourceKey))).toHaveLength(
      2,
    );
    expect(prepared.duplicateSourceRows).toEqual([]);
  });

  it("derives earned credits from the grade policy", () => {
    const prepared = prepareHistoricalImport(
      manifest([
        row({ grade: "" }),
        row({ sourceRowNumber: 3, grade: "P", courseCode: "HSS 1000" }),
        row({ sourceRowNumber: 4, grade: "F", courseCode: "MATH 1000" }),
      ]),
    );
    expect(
      prepared.rows.map(({ grade, earnedCredits, countsTowardGpa }) => ({
        grade,
        earnedCredits,
        countsTowardGpa,
      })),
    ).toEqual([
      { grade: "I", earnedCredits: 0, countsTowardGpa: false },
      { grade: "P", earnedCredits: 6, countsTowardGpa: false },
      { grade: "F", earnedCredits: 0, countsTowardGpa: true },
    ]);
  });
});

describe("historical identity safeguards", () => {
  it("keeps missing and ambiguous mappings as explicit blockers", () => {
    const prepared = prepareHistoricalImport(
      manifest([
        row({ sourceRowNumber: 2, identity: { status: "missing" } }),
        row({
          sourceRowNumber: 3,
          identity: {
            status: "ambiguous",
            candidateStudentNos: ["F202601AD", "F202602AD"],
          },
        }),
      ]),
    );
    expect(prepared.rows).toEqual([]);
    expect(prepared.identityBlockers).toEqual([
      { sourceRowNumber: 2, status: "missing", candidateCount: 0 },
      { sourceRowNumber: 3, status: "ambiguous", candidateCount: 2 },
    ]);
  });

  it("requires explicit archived-profile authorization and generates a non-routable email", () => {
    const parsed = manifest(
      [row({ identity: { status: "authoritative", studentNo: "HIST-001" } })],
      [
        {
          studentNo: "HIST-001",
          firstName: "Historical",
          lastName: "Student",
          authorized: true,
          authorizationReference: "Registrar approval 2026-08-10",
        },
      ],
    );
    expect(parsed.archivedProfiles).toHaveLength(1);
    expect(archivedProfileEmail("HIST-001")).toMatch(
      /^historical\.[a-f0-9]{32}@archive\.invalid$/,
    );
    expect(archivedProfileEmail("hist-001")).toBe(
      archivedProfileEmail("HIST-001"),
    );
  });

  it("rejects unknown manifest properties", () => {
    expect(() => manifest([row({ guessedStudentNo: "F202601AD" })])).toThrow();
  });
});

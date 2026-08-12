/** A student identity snapshot used by every transcript surface. */
export interface TranscriptStudentIdentity {
  id: string;
  studentNo: string;
  name: string;
  email: string;
  program: {
    code: string;
    name: string;
    degree: string | null;
  } | null;
}

/** One immutable row from the canonical transcript ledger. */
export interface TranscriptViewEntry {
  id: string;
  courseId: string | null;
  termId: string | null;
  courseCode: string;
  title: string;
  term: string;
  termSortKey: string | null;
  grade: string;
  credits: number;
  earnedCredits: number;
  points: number | null;
  countsTowardGpa: boolean;
  countsTowardCredits: boolean;
  requirementCategory: string | null;
  source: "legacy_import" | "approved_enrollment" | "manual";
}

/** Reconciled totals for either a semester or the full academic record. */
export interface TranscriptTotals {
  /** All transcript credits attempted, including non-GPA work. */
  attemptedCredits: number;
  /** GPA-bearing credits used as the denominator for GPA. */
  gpaCredits: number;
  /** Credit earned, with repeated attempts for the same course counted once. */
  earnedCredits: number;
  qualityPoints: number;
  /** Null truthfully represents a record with no GPA-bearing work. */
  gpa: number | null;
}

export interface TranscriptSemester extends TranscriptTotals {
  termId: string | null;
  label: string;
  sortKey: string | null;
  entries: TranscriptViewEntry[];
}

/** Canonical read model shared by student, parent, registrar and PDF views. */
export interface TranscriptView {
  student: TranscriptStudentIdentity;
  totals: TranscriptTotals;
  /** Ordered from the earliest semester to the most recent. */
  semesters: TranscriptSemester[];
}

export type TranscriptPdfGeneratorKind = "student" | "staff";

export interface TranscriptPdfGeneration {
  generationId: string;
  generatedAt: string;
  generatedAtDakar: string;
  generator: {
    personId: string;
    name: string;
    email: string;
    role: string;
    kind: TranscriptPdfGeneratorKind;
  };
}

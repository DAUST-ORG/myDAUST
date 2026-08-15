import type {
  AcademicStanding,
  AcademicProgress,
  InProgressCourse,
  TranscriptSemester,
  TranscriptStudentIdentity,
  TranscriptTotals,
  TranscriptView,
  TranscriptViewEntry,
} from "@mydaust/shared";

export type TranscriptLedgerRow = TranscriptViewEntry;

function courseIdentity(row: TranscriptLedgerRow): string {
  return (
    row.courseId ?? row.courseCode.trim().toUpperCase().replace(/\s+/g, " ")
  );
}

function roundedGpa(qualityPoints: number, gpaCredits: number): number | null {
  if (gpaCredits === 0) return null;
  return Math.round((qualityPoints / gpaCredits) * 100) / 100;
}

/**
 * Transcript totals intentionally distinguish all attempted credit from the
 * narrower GPA denominator. Earned credit is awarded once per course even
 * when the ledger contains retakes.
 */
export function transcriptTotals(
  entries: TranscriptLedgerRow[],
): TranscriptTotals {
  let attemptedCredits = 0;
  let gpaCredits = 0;
  let qualityPoints = 0;
  const earnedByCourse = new Map<string, number>();

  for (const entry of entries) {
    attemptedCredits += entry.credits;
    if (entry.countsTowardGpa && entry.points !== null) {
      gpaCredits += entry.credits;
      qualityPoints += entry.points * entry.credits;
    }
    if (entry.countsTowardCredits && entry.earnedCredits > 0) {
      const key = courseIdentity(entry);
      earnedByCourse.set(
        key,
        Math.max(earnedByCourse.get(key) ?? 0, entry.earnedCredits),
      );
    }
  }

  return {
    attemptedCredits,
    gpaCredits,
    earnedCredits: [...earnedByCourse.values()].reduce(
      (total, credits) => total + credits,
      0,
    ),
    qualityPoints,
    gpa: roundedGpa(qualityPoints, gpaCredits),
  };
}

function compareSemesters(a: TranscriptSemester, b: TranscriptSemester) {
  if (a.sortKey && b.sortKey) return a.sortKey.localeCompare(b.sortKey);
  if (a.sortKey) return -1;
  if (b.sortKey) return 1;
  return a.label.localeCompare(b.label);
}

/** Build the canonical, serializable transcript read model from one ledger snapshot. */
export function buildTranscriptView(
  student: TranscriptStudentIdentity,
  rows: TranscriptLedgerRow[],
  extras?: {
    academicProgress?: AcademicProgress;
    academicStanding?: AcademicStanding;
    inProgressCourses?: InProgressCourse[];
  },
): TranscriptView {
  const entries = [...rows].sort(
    (a, b) =>
      a.courseCode.localeCompare(b.courseCode) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
  const grouped = new Map<string, TranscriptLedgerRow[]>();
  for (const entry of entries) {
    const key =
      entry.termId ??
      entry.termSortKey ??
      entry.term.trim().toUpperCase().replace(/\s+/g, " ");
    const semester = grouped.get(key);
    if (semester) semester.push(entry);
    else grouped.set(key, [entry]);
  }

  const semesters = [...grouped.values()]
    .map((semesterEntries): TranscriptSemester => {
      const first = semesterEntries[0]!;
      return {
        termId: first.termId,
        label: first.term,
        sortKey: first.termSortKey,
        entries: semesterEntries,
        ...transcriptTotals(semesterEntries),
      };
    })
    .sort(compareSemesters);

  const totals = transcriptTotals(entries);
  return {
    student,
    totals,
    academicProgress: extras?.academicProgress ?? {
      earnedCredits: totals.earnedCredits,
      requiredCredits: null,
      inProgressCredits: 0,
      level: null,
      maximumLevel: null,
      catalog: null,
    },
    academicStanding: extras?.academicStanding ?? {
      code: "not_yet_graded",
      label: "Not yet graded",
      tone: "neutral",
      source: "computed",
      catalog: null,
      override: null,
    },
    inProgressCourses: extras?.inProgressCourses ?? [],
    semesters,
  };
}

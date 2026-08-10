export interface TranscriptCalculationRow {
  courseId?: string | null;
  courseCode: string;
  credits: number;
  earnedCredits: number;
  gradePoints: number | null;
  countsTowardGpa: boolean;
  countsTowardCredits: boolean;
}

export interface TranscriptSummary {
  gpa: number;
  attemptedCredits: number;
  completedCredits: number;
  qualityPoints: number;
}

function courseIdentity(row: TranscriptCalculationRow): string {
  return (
    row.courseId ?? row.courseCode.trim().toUpperCase().replace(/\s+/g, " ")
  );
}

/**
 * GPA counts every attempt selected by policy. Earned credit is awarded once
 * per linked/snapshot course, using the largest credit-bearing attempt.
 */
export function summarizeTranscriptRows(
  rows: TranscriptCalculationRow[],
): TranscriptSummary {
  let attemptedCredits = 0;
  let qualityPoints = 0;
  const earnedByCourse = new Map<string, number>();

  for (const row of rows) {
    if (row.countsTowardGpa && row.gradePoints !== null) {
      attemptedCredits += row.credits;
      qualityPoints += row.gradePoints * row.credits;
    }
    if (row.countsTowardCredits && row.earnedCredits > 0) {
      const key = courseIdentity(row);
      earnedByCourse.set(
        key,
        Math.max(earnedByCourse.get(key) ?? 0, row.earnedCredits),
      );
    }
  }

  const completedCredits = [...earnedByCourse.values()].reduce(
    (sum, credits) => sum + credits,
    0,
  );
  return {
    gpa:
      attemptedCredits === 0
        ? 0
        : Math.round((qualityPoints / attemptedCredits) * 100) / 100,
    attemptedCredits,
    completedCredits,
    qualityPoints,
  };
}

/**
 * Best published grade points for each credit-bearing catalog course. A null
 * value means the course was passed for credit without a numeric GPA value.
 */
export function bestPointsByCourse(
  rows: TranscriptCalculationRow[],
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const row of rows) {
    if (!row.courseId || !row.countsTowardCredits) {
      continue;
    }
    const previous = result.get(row.courseId);
    if (
      !result.has(row.courseId) ||
      (row.gradePoints !== null &&
        (previous === null ||
          previous === undefined ||
          row.gradePoints > previous))
    ) {
      result.set(row.courseId, row.gradePoints);
    }
  }
  return result;
}

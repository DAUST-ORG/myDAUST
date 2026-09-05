/**
 * Shared by the administrative drop endpoint and by the registrar roster, so
 * the UI disables Remove for exactly the rows the server would refuse.
 *
 * Lives apart from AcademicsService because the roster service also needs it
 * and already imports enrollment-gates, which imports AcademicsService back.
 */
export interface DropCandidate {
  grade: string | null;
  transcriptEntry: { id: string } | null;
  _count: { submissions: number };
}

/** Why this enrollment cannot be dropped, or null when removing it is safe. */
export function gradedWorkBlockingDrop(
  enrollment: DropCandidate,
): string | null {
  if (enrollment.grade) {
    return `This enrollment carries the grade ${enrollment.grade}. Clear the grade before removing the student.`;
  }
  if (enrollment.transcriptEntry) {
    return "This enrollment is already on the student's transcript. Void that entry before removing the student.";
  }
  if (enrollment._count.submissions > 0) {
    const count = enrollment._count.submissions;
    return `This student has ${count} graded submission${count === 1 ? "" : "s"} in the course. Removing them would hide that work.`;
  }
  return null;
}

/** The include clause every caller needs for gradedWorkBlockingDrop to be accurate. */
export const DROP_GUARD_INCLUDE = {
  transcriptEntry: { select: { id: true } },
  _count: { select: { submissions: { where: { status: "graded" } } } },
} as const;

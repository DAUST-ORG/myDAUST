/**
 * Whether an instructor may see a section's evaluation results.
 *
 * Pure and exported on purpose: this is the rule the whole feature turns on, and it must
 * be testable without a database, since the database-backed suites never run in CI.
 */
export interface ReleaseInput {
  /** The director has released this round to faculty. */
  releasedToFaculty: boolean;
  responseCount: number;
  minResponses: number;
  /** GradeSubmission.status for the section, or null when nothing was submitted. */
  gradeSubmissionStatus: string | null;
  kind: "midterm" | "final";
}

export type ReleaseVerdict =
  | { visible: true }
  | { visible: false; reason: "not_released" | "too_few_responses" | "grades_not_approved" };

export function canFacultySeeResults(input: ReleaseInput): ReleaseVerdict {
  if (!input.releasedToFaculty) return { visible: false, reason: "not_released" };
  if (input.responseCount < input.minResponses) {
    return { visible: false, reason: "too_few_responses" };
  }
  // The final round is gated on approved grades: it removes the retaliation channel and,
  // equally, the appearance of one. The midterm round is not, because its entire value is
  // that a professor can still change something this term — gating it on approval would
  // surface it after the term ended and make it a second final evaluation.
  if (input.kind === "final" && input.gradeSubmissionStatus !== "approved") {
    return { visible: false, reason: "grades_not_approved" };
  }
  return { visible: true };
}

/** The dates a section actually runs, given the director's bounds and any instructor override. */
export function effectiveWindow(
  bounds: { boundsOpenAt: Date; boundsCloseAt: Date },
  schedule: { opensAt: Date; closesAt: Date } | null,
): { opensAt: Date; closesAt: Date } {
  if (!schedule) return { opensAt: bounds.boundsOpenAt, closesAt: bounds.boundsCloseAt };
  // Clamp rather than trust: the API validates on write, but a row predating a bounds
  // change must never widen the round.
  const opensAt = schedule.opensAt < bounds.boundsOpenAt ? bounds.boundsOpenAt : schedule.opensAt;
  const closesAt = schedule.closesAt > bounds.boundsCloseAt ? bounds.boundsCloseAt : schedule.closesAt;
  return { opensAt, closesAt };
}

export function isOpen(
  status: string,
  window: { opensAt: Date; closesAt: Date },
  now: Date,
): boolean {
  // Openness is computed, never stored — a window that passes its close date closes
  // itself with no scheduled job.
  return status === "open" && now >= window.opensAt && now <= window.closesAt;
}

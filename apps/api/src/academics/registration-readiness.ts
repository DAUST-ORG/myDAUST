import { MAX_ACADEMIC_CATALOG_PLAN_YEARS } from "@mydaust/shared";
import {
  normalizeRegistrationSemester,
  type RegistrationConfigurationRead,
} from "./registration-configuration.js";
import type {
  RecommendationAvailability,
  RecommendationStatus,
} from "./course-recommendations.js";
import type { CurriculumMapComparison } from "./curriculum-map-readiness.js";

export type RegistrationReadinessSeverity = "blocker" | "warning" | "info";

export interface RegistrationReadinessCheck {
  code:
    | "configuration_absent"
    | "configuration_invalid"
    | "registration_closed"
    | "target_term_unavailable"
    | "target_term_unmapped"
    | "recommendations_disabled"
    | "student_context_not_ready"
    | "unlinked_transcript_entries"
    | "no_target_sections"
    | "duplicate_curriculum_entries"
    | "duplicate_curriculum_course_codes"
    | "invalid_curriculum_positions"
    | "curriculum_year_beyond_configured_plan"
    | "malformed_curriculum_snapshot"
    | "unknown_curriculum_course_ids"
    | "curriculum_course_code_mismatch"
    | "curriculum_credit_total_mismatch"
    | "curriculum_map_mismatch"
    | "planned_course_not_offered"
    | "audit_state_changed"
    | "student_audit_failed";
  severity: RegistrationReadinessSeverity;
  count: number;
  message: string;
}

export interface RegistrationReadinessStudentResult {
  registrationOpen: boolean;
  recommendationStatus: RecommendationStatus;
  recommendationCount: number;
  recommendationAvailabilities: RecommendationAvailability[];
  unofferedRecommendationCount: number;
}

export interface ApprovedCurriculumCreditRevisionSource {
  academicYearId: string;
  revision: number;
  approvedAt: Date | null;
  programConfigurations: unknown;
}

export function inspectApprovedCurriculumCreditIntegrity(
  revisions: ApprovedCurriculumCreditRevisionSource[],
  courses: { id: string; code: string; credits: number }[],
) {
  const latestByYear = new Map<
    string,
    ApprovedCurriculumCreditRevisionSource
  >();
  for (const revision of [...revisions].sort(
    (left, right) =>
      (right.approvedAt?.getTime() ?? 0) - (left.approvedAt?.getTime() ?? 0) ||
      right.revision - left.revision,
  )) {
    if (!latestByYear.has(revision.academicYearId)) {
      latestByYear.set(revision.academicYearId, revision);
    }
  }
  const courseById = new Map(courses.map((course) => [course.id, course]));
  let approvedProgramCount = 0;
  let unknownCurriculumCourseIdCount = 0;
  let curriculumCourseCodeMismatchCount = 0;
  let curriculumCreditTotalMismatchCount = 0;
  for (const revision of latestByYear.values()) {
    if (!Array.isArray(revision.programConfigurations)) continue;
    for (const value of revision.programConfigurations) {
      if (!value || typeof value !== "object") continue;
      const program = value as {
        curriculum?: unknown;
        requirements?: unknown;
      };
      if (!Array.isArray(program.curriculum)) continue;
      approvedProgramCount += 1;
      let curriculumCredits = 0;
      for (const value of program.curriculum) {
        if (!value || typeof value !== "object") continue;
        const entry = value as { courseId?: unknown; courseCode?: unknown };
        if (typeof entry.courseId !== "string") continue;
        const course = courseById.get(entry.courseId);
        if (!course) {
          unknownCurriculumCourseIdCount += 1;
          continue;
        }
        curriculumCredits += course.credits;
        if (
          typeof entry.courseCode !== "string" ||
          entry.courseCode.trim().toLocaleUpperCase() !==
            course.code.trim().toLocaleUpperCase()
        ) {
          curriculumCourseCodeMismatchCount += 1;
        }
      }
      const requirementCredits = Array.isArray(program.requirements)
        ? program.requirements.reduce<number | null>((sum, value) => {
            if (sum === null || !value || typeof value !== "object") {
              return null;
            }
            const requiredCredits = (value as { requiredCredits?: unknown })
              .requiredCredits;
            return typeof requiredCredits === "number" &&
              Number.isInteger(requiredCredits) &&
              requiredCredits >= 1
              ? sum + requiredCredits
              : null;
          }, 0)
        : null;
      if (
        requirementCredits === null ||
        curriculumCredits !== requirementCredits
      ) {
        curriculumCreditTotalMismatchCount += 1;
      }
    }
  }
  return {
    approvedProgramCount,
    unknownCurriculumCourseIdCount,
    curriculumCourseCodeMismatchCount,
    curriculumCreditTotalMismatchCount,
  };
}

export interface RegistrationReadinessSummaryInput {
  configuration: RegistrationConfigurationRead;
  targetTermAvailable: boolean;
  targetTermExists: boolean;
  targetTermMapped: boolean;
  targetSectionCount: number;
  activeStudentCount: number;
  auditedStudents: RegistrationReadinessStudentResult[];
  failedStudentCount: number;
  unlinkedTranscriptEntryCount: number;
  activeStudentUnlinkedTranscriptEntryCount: number;
  duplicateCurriculumEntryCount: number;
  duplicateCurriculumCourseCodeCount: number;
  invalidCurriculumPositionCount: number;
  malformedCurriculumSnapshotCount: number;
  curriculumYearBeyondConfiguredPlanCount: number;
  unknownCurriculumCourseIdCount: number;
  curriculumCourseCodeMismatchCount: number;
  curriculumCreditTotalMismatchCount: number;
  curriculumMapComparisons: CurriculumMapComparison[];
  runStateStable?: boolean;
}

export interface RegistrationReadinessRunState {
  configuration: RegistrationConfigurationRead;
  targetTerm: {
    id: string;
    name: string;
    status: string | null;
    semester: string | null;
    academicYearId: string | null;
    startDate: Date;
    endDate: Date;
    addDeadline: Date | null;
    dropDeadline: Date | null;
  } | null;
  targetSectionCount: number;
  approvedRevisions: { id: string; updatedAt: Date }[];
}

export function registrationReadinessRunStateChanged(
  before: RegistrationReadinessRunState,
  after: RegistrationReadinessRunState,
) {
  const canonical = (state: RegistrationReadinessRunState) =>
    JSON.stringify({
      configuration: state.configuration,
      targetTerm: state.targetTerm,
      targetSectionCount: state.targetSectionCount,
      approvedRevisions: [...state.approvedRevisions]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((revision) => ({
          id: revision.id,
          updatedAt: revision.updatedAt.toISOString(),
        })),
    });
  return canonical(before) !== canonical(after);
}

export function inspectApprovedCurriculumSnapshots(
  revisions: { defaultLevels?: unknown; programConfigurations: unknown }[],
) {
  let duplicateCurriculumEntryCount = 0;
  let duplicateCurriculumCourseCodeCount = 0;
  let invalidCurriculumPositionCount = 0;
  let malformedCurriculumSnapshotCount = 0;
  let curriculumYearBeyondConfiguredPlanCount = 0;
  for (const revision of revisions) {
    const defaultLevelCount = Array.isArray(revision.defaultLevels)
      ? revision.defaultLevels.length
      : null;
    if (defaultLevelCount === null) {
      malformedCurriculumSnapshotCount += 1;
    }
    if (!Array.isArray(revision.programConfigurations)) {
      malformedCurriculumSnapshotCount += 1;
      continue;
    }
    for (const value of revision.programConfigurations) {
      if (!value || typeof value !== "object") {
        malformedCurriculumSnapshotCount += 1;
        continue;
      }
      const program = value as {
        programId?: unknown;
        progressionMode?: unknown;
        customLevels?: unknown;
        curriculum?: unknown;
      };
      if (typeof program.programId !== "string" || !program.programId.trim()) {
        malformedCurriculumSnapshotCount += 1;
      }
      const raw = program.curriculum;
      if (!Array.isArray(raw)) {
        malformedCurriculumSnapshotCount += 1;
        continue;
      }
      const courseIds = new Set<string>();
      const courseCodes = new Set<string>();
      const positions: number[] = [];
      const effectiveLevelCount =
        program.progressionMode === "custom"
          ? Array.isArray(program.customLevels)
            ? program.customLevels.length
            : null
          : defaultLevelCount;
      if (
        program.progressionMode === "custom" &&
        effectiveLevelCount === null
      ) {
        malformedCurriculumSnapshotCount += 1;
      }
      const configuredPlanYears =
        effectiveLevelCount === null
          ? null
          : Math.ceil(effectiveLevelCount / 2);
      for (const entry of raw) {
        if (!entry || typeof entry !== "object") {
          malformedCurriculumSnapshotCount += 1;
          continue;
        }
        const curriculumEntry = entry as {
          courseId?: unknown;
          courseCode?: unknown;
          yearIndex?: unknown;
          semester?: unknown;
          position?: unknown;
        };
        if (
          configuredPlanYears !== null &&
          typeof curriculumEntry.yearIndex === "number" &&
          Number.isInteger(curriculumEntry.yearIndex) &&
          curriculumEntry.yearIndex > configuredPlanYears
        ) {
          curriculumYearBeyondConfiguredPlanCount += 1;
        }
        if (
          typeof curriculumEntry.courseId !== "string" ||
          !curriculumEntry.courseId.trim() ||
          typeof curriculumEntry.courseCode !== "string" ||
          !curriculumEntry.courseCode.trim() ||
          typeof curriculumEntry.yearIndex !== "number" ||
          !Number.isInteger(curriculumEntry.yearIndex) ||
          curriculumEntry.yearIndex < 1 ||
          curriculumEntry.yearIndex > MAX_ACADEMIC_CATALOG_PLAN_YEARS ||
          typeof curriculumEntry.semester !== "string" ||
          !normalizeRegistrationSemester(curriculumEntry.semester) ||
          typeof curriculumEntry.position !== "number" ||
          !Number.isInteger(curriculumEntry.position) ||
          curriculumEntry.position < 0
        ) {
          malformedCurriculumSnapshotCount += 1;
          continue;
        }
        const courseId = curriculumEntry.courseId;
        if (courseIds.has(courseId)) duplicateCurriculumEntryCount += 1;
        courseIds.add(courseId);
        const courseCode = curriculumEntry.courseCode
          .trim()
          .toLocaleUpperCase();
        if (courseCodes.has(courseCode)) {
          duplicateCurriculumCourseCodeCount += 1;
        }
        courseCodes.add(courseCode);
        positions.push(curriculumEntry.position);
      }
      positions.sort((left, right) => left - right);
      invalidCurriculumPositionCount += positions.filter(
        (position, index) => position !== index,
      ).length;
    }
  }
  return {
    approvedRevisionCount: revisions.length,
    duplicateCurriculumEntryCount,
    duplicateCurriculumCourseCodeCount,
    invalidCurriculumPositionCount,
    malformedCurriculumSnapshotCount,
    curriculumYearBeyondConfiguredPlanCount,
  };
}

function counts<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (result, value) => {
      result[value] = (result[value] ?? 0) + 1;
      return result;
    },
    {} as Record<T, number>,
  );
}

export function summarizeRegistrationReadiness(
  input: RegistrationReadinessSummaryInput,
) {
  const checks: RegistrationReadinessCheck[] = [];
  if (input.runStateStable === false) {
    checks.push({
      code: "audit_state_changed",
      severity: "blocker",
      count: 1,
      message:
        "Registration configuration, target-term offerings, or approved catalog revisions changed during the audit; rerun against a stable state.",
    });
  }
  if (input.configuration.state === "absent") {
    checks.push({
      code: "configuration_absent",
      severity: "blocker",
      count: 1,
      message:
        "No registration configuration is saved; the legacy term fallback remains active and recommendations remain disabled.",
    });
  } else if (input.configuration.state === "invalid") {
    checks.push({
      code: "configuration_invalid",
      severity: "blocker",
      count: 1,
      message: "The saved registration configuration JSON is invalid.",
    });
  } else if (input.configuration.termId === null) {
    checks.push({
      code: "registration_closed",
      severity: "warning",
      count: 1,
      message: "Student self-service registration is explicitly closed.",
    });
  } else if (!input.targetTermAvailable) {
    checks.push({
      code: "target_term_unavailable",
      severity: "blocker",
      count: 1,
      message:
        "The designated registration term cannot be resolved or is closed.",
    });
  }
  if (
    input.configuration.state === "valid" &&
    input.configuration.termId !== null &&
    input.targetTermExists &&
    !input.targetTermMapped
  ) {
    checks.push({
      code: "target_term_unmapped",
      severity: "blocker",
      count: 1,
      message:
        "The designated term needs an academic year and a Fall, Spring, or Summer semester mapping.",
    });
  }

  if (
    input.configuration.state !== "valid" ||
    !input.configuration.recommendationsEnabled
  ) {
    checks.push({
      code: "recommendations_disabled",
      severity: "warning",
      count: 1,
      message:
        "Course recommendations are not enabled in a valid configuration.",
    });
  }
  if (input.duplicateCurriculumEntryCount > 0) {
    checks.push({
      code: "duplicate_curriculum_entries",
      severity: "blocker",
      count: input.duplicateCurriculumEntryCount,
      message:
        "Approved catalog snapshots contain duplicate course ids within a program curriculum.",
    });
  }
  if (input.duplicateCurriculumCourseCodeCount > 0) {
    checks.push({
      code: "duplicate_curriculum_course_codes",
      severity: "blocker",
      count: input.duplicateCurriculumCourseCodeCount,
      message:
        "Approved catalog snapshots contain duplicate canonical course codes within a program curriculum.",
    });
  }
  if (input.invalidCurriculumPositionCount > 0) {
    checks.push({
      code: "invalid_curriculum_positions",
      severity: "blocker",
      count: input.invalidCurriculumPositionCount,
      message:
        "Approved catalog curriculum positions are not globally contiguous from zero.",
    });
  }
  if (input.curriculumYearBeyondConfiguredPlanCount > 0) {
    checks.push({
      code: "curriculum_year_beyond_configured_plan",
      severity: "blocker",
      count: input.curriculumYearBeyondConfiguredPlanCount,
      message:
        "Approved curriculum entries extend beyond the configured progression-plan length.",
    });
  }
  if (input.malformedCurriculumSnapshotCount > 0) {
    checks.push({
      code: "malformed_curriculum_snapshot",
      severity: "blocker",
      count: input.malformedCurriculumSnapshotCount,
      message:
        "Approved catalog snapshots contain malformed program or curriculum data.",
    });
  }
  if (input.unknownCurriculumCourseIdCount > 0) {
    checks.push({
      code: "unknown_curriculum_course_ids",
      severity: "blocker",
      count: input.unknownCurriculumCourseIdCount,
      message:
        "Approved curriculum snapshots reference course ids that do not exist in the live catalog.",
    });
  }
  if (input.curriculumCourseCodeMismatchCount > 0) {
    checks.push({
      code: "curriculum_course_code_mismatch",
      severity: "blocker",
      count: input.curriculumCourseCodeMismatchCount,
      message:
        "Approved curriculum course codes do not match their referenced live course ids.",
    });
  }
  if (input.curriculumCreditTotalMismatchCount > 0) {
    checks.push({
      code: "curriculum_credit_total_mismatch",
      severity: "blocker",
      count: input.curriculumCreditTotalMismatchCount,
      message:
        "Current course credits no longer reconcile to approved program requirement totals.",
    });
  }
  const curriculumMapMismatchCount = input.curriculumMapComparisons.filter(
    (comparison) => !comparison.matches,
  ).length;
  if (curriculumMapMismatchCount > 0) {
    checks.push({
      code: "curriculum_map_mismatch",
      severity: "blocker",
      count: curriculumMapMismatchCount,
      message:
        "Approved curriculum snapshot counts or checksums do not match the relational official maps.",
    });
  }

  if (
    input.configuration.state === "valid" &&
    input.configuration.termId !== null &&
    input.targetSectionCount === 0
  ) {
    checks.push({
      code: "no_target_sections",
      severity: "blocker",
      count: 1,
      message: "The designated term has no sections to register into.",
    });
  }

  const contextStatuses = input.auditedStudents.map(
    (student) => student.recommendationStatus,
  );
  const statusCounts = counts(contextStatuses);
  const notReadyCount = contextStatuses.filter(
    (status) => status !== "ready" && status !== "disabled",
  ).length;
  if (notReadyCount > 0) {
    checks.push({
      code: "student_context_not_ready",
      severity: "blocker",
      count: notReadyCount,
      message:
        "One or more active students lack the approved program, catalog, curriculum, semester, or plan position needed for recommendations.",
    });
  }
  if (input.unlinkedTranscriptEntryCount > 0) {
    checks.push({
      code: "unlinked_transcript_entries",
      severity: "blocker",
      count: input.unlinkedTranscriptEntryCount,
      message:
        "Official non-void transcript entries without a linked course cannot be used for prerequisite or completion decisions.",
    });
  }
  if (input.failedStudentCount > 0) {
    checks.push({
      code: "student_audit_failed",
      severity: "blocker",
      count: input.failedStudentCount,
      message:
        "One or more active student registration catalogs could not be evaluated.",
    });
  }

  const unofferedRecommendationCount = input.auditedStudents.reduce(
    (sum, student) => sum + student.unofferedRecommendationCount,
    0,
  );
  if (unofferedRecommendationCount > 0) {
    checks.push({
      code: "planned_course_not_offered",
      severity: "blocker",
      count: unofferedRecommendationCount,
      message:
        "One or more scheduled or prerequisite recommendations have no section in the designated term.",
    });
  }

  const recommendationAvailabilities = input.auditedStudents.flatMap(
    (student) => student.recommendationAvailabilities,
  );
  const blockerCount = checks.filter(
    (check) => check.severity === "blocker",
  ).length;
  return {
    ready: blockerCount === 0,
    blockerCount,
    warningCount: checks.filter((check) => check.severity === "warning").length,
    activeStudentCount: input.activeStudentCount,
    auditedStudentCount: input.auditedStudents.length,
    failedStudentCount: input.failedStudentCount,
    studentsWithOpenRegistration: input.auditedStudents.filter(
      (student) => student.registrationOpen,
    ).length,
    studentsWithRecommendations: input.auditedStudents.filter(
      (student) => student.recommendationCount > 0,
    ).length,
    recommendationCount: input.auditedStudents.reduce(
      (sum, student) => sum + student.recommendationCount,
      0,
    ),
    recommendationStatusCounts: statusCounts,
    recommendationAvailabilityCounts: counts(recommendationAvailabilities),
    unlinkedTranscriptEntryCount: input.unlinkedTranscriptEntryCount,
    activeStudentUnlinkedTranscriptEntryCount:
      input.activeStudentUnlinkedTranscriptEntryCount,
    duplicateCurriculumEntryCount: input.duplicateCurriculumEntryCount,
    duplicateCurriculumCourseCodeCount:
      input.duplicateCurriculumCourseCodeCount,
    invalidCurriculumPositionCount: input.invalidCurriculumPositionCount,
    curriculumYearBeyondConfiguredPlanCount:
      input.curriculumYearBeyondConfiguredPlanCount,
    malformedCurriculumSnapshotCount: input.malformedCurriculumSnapshotCount,
    unknownCurriculumCourseIdCount: input.unknownCurriculumCourseIdCount,
    curriculumCourseCodeMismatchCount: input.curriculumCourseCodeMismatchCount,
    curriculumCreditTotalMismatchCount:
      input.curriculumCreditTotalMismatchCount,
    curriculumMapComparisonCount: input.curriculumMapComparisons.length,
    curriculumMapMismatchCount,
    unofferedRecommendationCount,
    targetSectionCount: input.targetSectionCount,
    checks,
  };
}

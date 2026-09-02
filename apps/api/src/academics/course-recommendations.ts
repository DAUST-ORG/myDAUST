import type { RegistrationSemester } from "./registration-configuration.js";

export type RecommendationStatus =
  | "disabled"
  | "ready"
  | "missing_program"
  | "missing_catalog_year"
  | "missing_approved_catalog"
  | "missing_curriculum"
  | "unmapped_term"
  | "missing_plan_position";

export type RecommendationBasis =
  | "student_year_level"
  | "catalog_chronology"
  | "earliest_incomplete_same_semester";

export type RecommendationKind = "scheduled" | "catch_up" | "prerequisite";
export type RecommendationReadiness = "ready" | "conditional" | "blocked";
export type RecommendationAvailability =
  "available" | "blocked" | "not_offered";

export interface ApprovedCurriculumEntry {
  courseId: string;
  courseCode: string;
  yearIndex: number;
  semester: RegistrationSemester;
  position: number;
}

export interface RecommendationCourseSource {
  id: string;
  code: string;
  title: string;
  credits: number;
  prerequisites: {
    courseId: string;
    courseCode: string;
    minGrade: string | null;
  }[];
  corequisites: { courseId: string; courseCode: string }[];
}

export interface RecommendationSectionSource {
  sectionId: string;
  courseId: string;
  blockedReason: string | null;
}

export interface InProgressCourseSource {
  courseId: string;
  termStartDate: Date;
  termEndDate: Date;
}

export interface RegistrationRecommendation {
  courseId: string;
  courseCode: string;
  title: string;
  credits: number;
  kind: RecommendationKind;
  rank: number;
  plannedYearIndex: number | null;
  plannedSemester: RegistrationSemester | null;
  reason: string;
  unlocks: string[];
  readiness: RecommendationReadiness;
  prerequisites: {
    courseId: string;
    courseCode: string;
    minGrade: string | null;
    status: "satisfied" | "in_progress" | "missing";
  }[];
  corequisites: {
    courseId: string;
    courseCode: string;
    status: "satisfied" | "enrolled" | "recommended" | "missing";
  }[];
  sectionIds: string[];
  availableSectionIds: string[];
  availability: RecommendationAvailability;
}

type CorequisiteState =
  RegistrationRecommendation["corequisites"][number]["status"];

interface Candidate {
  courseId: string;
  kind: RecommendationKind;
  plan: ApprovedCurriculumEntry | null;
  unlocks: Set<string>;
  requiredMinGrade: string | null;
  dependencyDepth: number;
}

export interface DeriveCourseRecommendationsInput {
  semester: RegistrationSemester;
  targetYearIndex: number;
  targetTermStart: Date;
  registrationOpen: boolean;
  curriculum: ApprovedCurriculumEntry[];
  courses: RecommendationCourseSource[];
  sections: RecommendationSectionSource[];
  targetEnrolledCourseIds: ReadonlySet<string>;
  inProgressCourses: InProgressCourseSource[];
  /** Uses the same official-transcript/minimum-grade policy as enroll(). */
  satisfies: (courseId: string, minGrade: string | null) => boolean;
}

const SEMESTER_INDEX: Record<RegistrationSemester, number> = {
  Fall: 0,
  Spring: 1,
  Summer: 2,
};

function slotIndex(yearIndex: number, semester: RegistrationSemester): number {
  return (yearIndex - 1) * 3 + SEMESTER_INDEX[semester];
}

function strongerMinimumGrade(
  current: string | null,
  incoming: string | null,
): string | null {
  if (!current) return incoming;
  if (!incoming) return current;
  const points: Record<string, number> = {
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
  };
  const currentPoints = points[current.toUpperCase()];
  const incomingPoints = points[incoming.toUpperCase()];
  if (currentPoints === undefined) return incoming;
  if (incomingPoints === undefined) return current;
  return incomingPoints > currentPoints ? incoming : current;
}

export function deriveCourseRecommendations(
  input: DeriveCourseRecommendationsInput,
): RegistrationRecommendation[] {
  const courses = new Map(input.courses.map((course) => [course.id, course]));
  const firstPlanByCourse = new Map<string, ApprovedCurriculumEntry>();
  const orderedPlan = [...input.curriculum].sort(
    (left, right) =>
      slotIndex(left.yearIndex, left.semester) -
        slotIndex(right.yearIndex, right.semester) ||
      left.position - right.position ||
      left.courseCode.localeCompare(right.courseCode),
  );
  for (const entry of orderedPlan) {
    if (!firstPlanByCourse.has(entry.courseId)) {
      firstPlanByCourse.set(entry.courseId, entry);
    }
  }

  const inProgress = new Set(
    input.inProgressCourses
      .filter(
        (course) =>
          course.termStartDate.getTime() <= input.targetTermStart.getTime(),
      )
      .map((course) => course.courseId),
  );
  const candidates = new Map<string, Candidate>();
  const targetSlot = slotIndex(input.targetYearIndex, input.semester);
  const offeredCourseIds = new Set(
    input.sections.map((section) => section.courseId),
  );

  const addCandidate = (
    courseId: string,
    kind: RecommendationKind,
    plan: ApprovedCurriculumEntry | null,
    unlockCode?: string,
    minGrade: string | null = null,
    depth = 0,
  ) => {
    if (input.targetEnrolledCourseIds.has(courseId) || !courses.has(courseId)) {
      return;
    }
    const existing = candidates.get(courseId);
    const kindRank: Record<RecommendationKind, number> = {
      prerequisite: 0,
      catch_up: 1,
      scheduled: 2,
    };
    if (existing) {
      if (kindRank[kind] < kindRank[existing.kind]) existing.kind = kind;
      if (unlockCode) existing.unlocks.add(unlockCode);
      existing.requiredMinGrade = strongerMinimumGrade(
        existing.requiredMinGrade,
        minGrade,
      );
      existing.dependencyDepth = Math.max(existing.dependencyDepth, depth);
      return;
    }
    candidates.set(courseId, {
      courseId,
      kind,
      plan,
      unlocks: new Set(unlockCode ? [unlockCode] : []),
      requiredMinGrade: minGrade,
      dependencyDepth: depth,
    });
  };

  for (const entry of orderedPlan) {
    const index = slotIndex(entry.yearIndex, entry.semester);
    if (index > targetSlot) continue;
    if (input.satisfies(entry.courseId, null)) continue;
    if (index === targetSlot) {
      addCandidate(entry.courseId, "scheduled", entry);
    } else if (offeredCourseIds.has(entry.courseId)) {
      addCandidate(entry.courseId, "catch_up", entry);
    }
  }

  const plannedCandidates = [...candidates.values()];
  const visitPrerequisite = (
    prerequisite: RecommendationCourseSource["prerequisites"][number],
    unlockCode: string,
    path: Set<string>,
    depth: number,
  ) => {
    if (input.satisfies(prerequisite.courseId, prerequisite.minGrade)) return;
    if (inProgress.has(prerequisite.courseId)) return;
    if (path.has(prerequisite.courseId)) return;
    const prerequisitePlan = firstPlanByCourse.get(prerequisite.courseId);
    if (
      prerequisitePlan &&
      slotIndex(prerequisitePlan.yearIndex, prerequisitePlan.semester) >
        targetSlot
    ) {
      return;
    }
    const course = courses.get(prerequisite.courseId);
    if (!course) return;
    const nextPath = new Set(path).add(prerequisite.courseId);
    const unmet = course.prerequisites.filter(
      (required) =>
        !input.satisfies(required.courseId, required.minGrade) &&
        !inProgress.has(required.courseId),
    );
    if (unmet.length === 0) {
      addCandidate(
        course.id,
        "prerequisite",
        prerequisitePlan ?? null,
        unlockCode,
        prerequisite.minGrade,
        depth,
      );
      return;
    }
    for (const required of unmet) {
      visitPrerequisite(required, unlockCode, nextPath, depth + 1);
    }
  };

  for (const candidate of plannedCandidates) {
    const course = courses.get(candidate.courseId);
    if (!course) continue;
    for (const prerequisite of course.prerequisites) {
      visitPrerequisite(prerequisite, course.code, new Set([course.id]), 1);
    }
  }

  const sectionsByCourse = new Map<string, RecommendationSectionSource[]>();
  for (const section of input.sections) {
    const rows = sectionsByCourse.get(section.courseId) ?? [];
    rows.push(section);
    sectionsByCourse.set(section.courseId, rows);
  }

  const kindRank: Record<RecommendationKind, number> = {
    prerequisite: 0,
    catch_up: 1,
    scheduled: 2,
  };
  const sorted = [...candidates.values()].sort((left, right) => {
    const kind = kindRank[left.kind] - kindRank[right.kind];
    if (kind !== 0) return kind;
    if (left.kind === "prerequisite") {
      const depth = right.dependencyDepth - left.dependencyDepth;
      if (depth !== 0) return depth;
    }
    const leftPlan = left.plan;
    const rightPlan = right.plan;
    const planOrder =
      (leftPlan
        ? slotIndex(leftPlan.yearIndex, leftPlan.semester) * 1_000 +
          leftPlan.position
        : Number.MAX_SAFE_INTEGER) -
      (rightPlan
        ? slotIndex(rightPlan.yearIndex, rightPlan.semester) * 1_000 +
          rightPlan.position
        : Number.MAX_SAFE_INTEGER);
    if (planOrder !== 0) return planOrder;
    return (courses.get(left.courseId)?.code ?? left.courseId).localeCompare(
      courses.get(right.courseId)?.code ?? right.courseId,
    );
  });

  const corequisiteClosure = (rootCourseId: string) => {
    const result: Array<
      RecommendationCourseSource["corequisites"][number] & {
        status: CorequisiteState;
      }
    > = [];
    const visited = new Set([rootCourseId]);
    const visit = (courseId: string) => {
      const source = courses.get(courseId);
      if (!source) return;
      const corequisites = [...source.corequisites].sort(
        (left, right) =>
          left.courseCode.localeCompare(right.courseCode) ||
          left.courseId.localeCompare(right.courseId),
      );
      for (const corequisite of corequisites) {
        if (visited.has(corequisite.courseId)) continue;
        visited.add(corequisite.courseId);
        const status: CorequisiteState = input.satisfies(
          corequisite.courseId,
          null,
        )
          ? "satisfied"
          : input.targetEnrolledCourseIds.has(corequisite.courseId)
            ? "enrolled"
            : offeredCourseIds.has(corequisite.courseId)
              ? "recommended"
              : "missing";
        result.push({ ...corequisite, status });
        if (status !== "satisfied" && status !== "enrolled") {
          visit(corequisite.courseId);
        }
      }
    };
    visit(rootCourseId);
    return result;
  };

  return sorted.map((candidate, index) => {
    const course = courses.get(candidate.courseId)!;
    const prerequisites = course.prerequisites.map((prerequisite) => ({
      ...prerequisite,
      status: input.satisfies(prerequisite.courseId, prerequisite.minGrade)
        ? ("satisfied" as const)
        : inProgress.has(prerequisite.courseId)
          ? ("in_progress" as const)
          : ("missing" as const),
    }));
    const corequisites = corequisiteClosure(course.id);
    const blocked =
      prerequisites.some((prerequisite) => prerequisite.status === "missing") ||
      corequisites.some((corequisite) => corequisite.status === "missing");
    const conditional =
      !blocked &&
      prerequisites.some(
        (prerequisite) => prerequisite.status === "in_progress",
      );
    const readiness: RecommendationReadiness = blocked
      ? "blocked"
      : conditional
        ? "conditional"
        : "ready";
    const sections = sectionsByCourse.get(course.id) ?? [];
    const sectionIds = sections.map((section) => section.sectionId);
    const availableSectionIds =
      input.registrationOpen && readiness === "ready"
        ? sections
            .filter(
              (section) =>
                section.blockedReason === null ||
                section.blockedReason.startsWith(
                  "Must be taken with (or after) ",
                ),
            )
            .map((section) => section.sectionId)
        : [];
    const availability: RecommendationAvailability =
      sectionIds.length === 0
        ? "not_offered"
        : availableSectionIds.length > 0
          ? "available"
          : "blocked";
    const plannedYearIndex = candidate.plan?.yearIndex ?? null;
    const plannedSemester = candidate.plan?.semester ?? null;
    const unlocks = [...candidate.unlocks].sort();
    const reason =
      candidate.kind === "scheduled"
        ? `Year ${plannedYearIndex} ${plannedSemester} plan`
        : candidate.kind === "catch_up"
          ? `Carried forward from Year ${plannedYearIndex} ${plannedSemester}`
          : input.satisfies(course.id, null) && candidate.requiredMinGrade
            ? `Retake with at least ${candidate.requiredMinGrade} to unlock ${unlocks.join(", ")}`
            : `Complete to unlock ${unlocks.join(", ")}`;
    return {
      courseId: course.id,
      courseCode: course.code,
      title: course.title,
      credits: course.credits,
      kind: candidate.kind,
      rank: index + 1,
      plannedYearIndex,
      plannedSemester,
      reason,
      unlocks,
      readiness,
      prerequisites,
      corequisites,
      sectionIds,
      availableSectionIds,
      availability,
    };
  });
}

export function earliestIncompleteSameSemester(
  curriculum: ApprovedCurriculumEntry[],
  semester: RegistrationSemester,
  completedCourseIds: ReadonlySet<string>,
  targetEnrolledCourseIds: ReadonlySet<string>,
): number | null {
  const years = curriculum
    .filter(
      (entry) =>
        entry.semester === semester &&
        !completedCourseIds.has(entry.courseId) &&
        !targetEnrolledCourseIds.has(entry.courseId),
    )
    .map((entry) => entry.yearIndex)
    .sort((left, right) => left - right);
  return years[0] ?? null;
}

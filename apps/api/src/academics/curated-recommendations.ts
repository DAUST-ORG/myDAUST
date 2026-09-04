import type {
  RecommendationAvailability,
  RegistrationRecommendation,
} from "./course-recommendations.js";

export interface CuratedRecommendationData {
  termName: string;
  students: Record<string, { level: string; courses: readonly string[] }>;
}

/** The subset of the term's section DTO this needs. */
export interface CuratedSectionSource {
  sectionId: string;
  courseId: string;
  courseCode: string;
  title: string;
  credits: number;
  blockedReason: string | null;
}

export interface CuratedCourseSource {
  id: string;
  code: string;
  title: string;
  credits: number;
}

/** The course codes curated for a student, so the caller can fetch just those. */
export function curatedCourseCodesFor(options: {
  studentNo: string | null | undefined;
  termName: string;
  data: CuratedRecommendationData;
}): string[] {
  const { studentNo, termName, data } = options;
  if (!studentNo || data.termName !== termName) return [];
  return [...(data.students[studentNo]?.courses ?? [])];
}

/**
 * Builds recommendation rows from the academic office's curated Fall 2026 plan.
 *
 * These deliberately reuse `RegistrationRecommendation` so the student
 * registration page renders them through the panel it already has — including
 * the section pickers and the not-offered card — with no portal layout work.
 *
 * A curated course with no section in the target term is still returned, marked
 * `not_offered`: it is a real part of the student's plan, and dropping it would
 * hide both the course and the fact that its section is missing.
 */
export function buildCuratedRecommendations(options: {
  studentNo: string | null | undefined;
  termName: string;
  data: CuratedRecommendationData;
  courses: readonly CuratedCourseSource[];
  sections: readonly CuratedSectionSource[];
  enrolledCourseIds: ReadonlySet<string>;
}): RegistrationRecommendation[] {
  const { studentNo, termName, data, courses, sections, enrolledCourseIds } =
    options;
  if (!studentNo) return [];
  if (data.termName !== termName) return [];

  const entry = data.students[studentNo];
  if (!entry) return [];

  const courseByCode = new Map(courses.map((course) => [course.code, course]));
  const sectionsByCourseId = new Map<string, CuratedSectionSource[]>();
  for (const section of sections) {
    sectionsByCourseId.set(section.courseId, [
      ...(sectionsByCourseId.get(section.courseId) ?? []),
      section,
    ]);
  }

  const recommendations: RegistrationRecommendation[] = [];
  for (const code of entry.courses) {
    const course = courseByCode.get(code);
    // A code that no longer exists in the catalog is skipped rather than
    // rendered as a blank card; the builder already blocks on unknown codes.
    if (!course) continue;
    // Already enrolled for this term: recommending it again is noise.
    if (enrolledCourseIds.has(course.id)) continue;

    const courseSections = sectionsByCourseId.get(course.id) ?? [];
    const openSections = courseSections.filter(
      (section) => section.blockedReason === null,
    );
    const availability: RecommendationAvailability =
      courseSections.length === 0
        ? "not_offered"
        : openSections.length === 0
          ? "blocked"
          : "available";

    recommendations.push({
      courseId: course.id,
      courseCode: course.code,
      title: course.title,
      credits: course.credits,
      kind: "curated",
      rank: recommendations.length + 1,
      plannedYearIndex: null,
      plannedSemester: null,
      reason: entry.level
        ? `Academic office plan for ${termName} · ${entry.level}`
        : `Academic office plan for ${termName}`,
      unlocks: [],
      // Curated rows carry no derived prerequisite analysis: the academic
      // office already accounted for each student's history when writing the
      // plan, so re-deriving readiness here would contradict it.
      readiness: "ready",
      prerequisites: [],
      corequisites: [],
      sectionIds: courseSections.map((section) => section.sectionId),
      availableSectionIds: openSections.map((section) => section.sectionId),
      availability,
    });
  }
  return recommendations;
}

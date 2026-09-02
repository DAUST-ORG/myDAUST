export interface RegistrationPlanSection {
  sectionId: string;
  courseId: string;
}

export interface RegistrationPlanDependency {
  courseId: string;
  corequisiteCourseIds: readonly string[];
}

/**
 * Order selected section IDs so any selected corequisite is submitted before
 * its dependent course. Unrelated selections keep their plan order. Cycles are
 * cut at the active edge, which makes the result deterministic and guarantees
 * every selected section is returned at most once.
 */
export function orderRegistrationPlanSectionIds(
  selectedSections: readonly RegistrationPlanSection[],
  dependencies: readonly RegistrationPlanDependency[],
): string[] {
  const sectionById = new Map(
    selectedSections.map((section) => [section.sectionId, section]),
  );
  const firstSectionByCourse = new Map<string, RegistrationPlanSection>();
  for (const section of selectedSections) {
    if (!firstSectionByCourse.has(section.courseId)) {
      firstSectionByCourse.set(section.courseId, section);
    }
  }

  const corequisitesByCourse = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const corequisites = corequisitesByCourse.get(dependency.courseId) ?? [];
    for (const courseId of dependency.corequisiteCourseIds) {
      if (!corequisites.includes(courseId)) corequisites.push(courseId);
    }
    corequisitesByCourse.set(dependency.courseId, corequisites);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (sectionId: string) => {
    if (visited.has(sectionId) || visiting.has(sectionId)) return;
    const section = sectionById.get(sectionId);
    if (!section) return;

    visiting.add(sectionId);
    for (const corequisiteCourseId of corequisitesByCourse.get(
      section.courseId,
    ) ?? []) {
      const corequisite = firstSectionByCourse.get(corequisiteCourseId);
      if (corequisite) visit(corequisite.sectionId);
    }
    visiting.delete(sectionId);
    visited.add(sectionId);
    ordered.push(sectionId);
  };

  for (const section of selectedSections) visit(section.sectionId);
  return ordered;
}

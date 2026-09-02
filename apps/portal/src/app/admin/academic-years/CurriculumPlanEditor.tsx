"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Plus,
  Trash2,
} from "lucide-react";
import {
  MAX_ACADEMIC_CATALOG_PLAN_YEARS as MAX_PLAN_YEARS,
  type AcademicCatalogCurriculumEntry,
  type AcademicCatalogLevel,
  type AcademicCatalogProgram,
  type AcademicCatalogSemester,
} from "@mydaust/shared";
import { Badge, Button, IconButton } from "@/components/ui";
import styles from "./curriculum-plan.module.css";

export interface CatalogCourseReference {
  id: string;
  code: string;
  title: string;
  credits: number;
}

const SEMESTERS: AcademicCatalogSemester[] = ["Fall", "Spring", "Summer"];
const SEMESTER_ORDER = new Map(
  SEMESTERS.map((semester, index) => [semester, index]),
);

function canonicalizeCurriculum(
  entries: AcademicCatalogCurriculumEntry[],
): AcademicCatalogCurriculumEntry[] {
  return [...entries]
    .sort(
      (left, right) =>
        left.yearIndex - right.yearIndex ||
        (SEMESTER_ORDER.get(left.semester) ?? 0) -
          (SEMESTER_ORDER.get(right.semester) ?? 0) ||
        left.position - right.position,
    )
    .map((entry, position) => ({ ...entry, position }));
}

export function curriculumCreditTotal(
  program: AcademicCatalogProgram,
  courses: CatalogCourseReference[],
) {
  const byId = new Map(courses.map((course) => [course.id, course]));
  return program.curriculum.reduce(
    (sum, entry) => sum + (byId.get(entry.courseId)?.credits ?? 0),
    0,
  );
}

export function curriculumErrors(
  program: AcademicCatalogProgram,
  courses: CatalogCourseReference[],
  progressionLevels?: AcademicCatalogLevel[],
): string[] {
  const errors: string[] = [];
  const byId = new Map(courses.map((course) => [course.id, course]));
  const ids = new Set<string>();
  const codes = new Set<string>();

  program.curriculum.forEach((entry, index) => {
    const course = byId.get(entry.courseId);
    if (!course) {
      errors.push(
        `${entry.courseCode || "Course"} is no longer in the course catalog.`,
      );
    } else if (course.code !== entry.courseCode) {
      errors.push(
        `${entry.courseCode} does not match its catalog course (${course.code}).`,
      );
    }
    if (ids.has(entry.courseId) || codes.has(entry.courseCode.toUpperCase())) {
      errors.push(`${entry.courseCode} appears more than once in this plan.`);
    }
    ids.add(entry.courseId);
    codes.add(entry.courseCode.toUpperCase());
    if (entry.position !== index) {
      errors.push(
        "Course order needs to be normalized before this draft can be saved.",
      );
    }
    if (!SEMESTER_ORDER.has(entry.semester)) {
      errors.push(
        `${entry.courseCode} has an invalid semester (${String(entry.semester)}); use Fall, Spring or Summer.`,
      );
    }
    if (entry.yearIndex < 1 || entry.yearIndex > MAX_PLAN_YEARS) {
      errors.push(`${entry.courseCode} has an invalid study year.`);
    } else if (
      progressionLevels &&
      entry.yearIndex > Math.max(1, Math.ceil(progressionLevels.length / 2))
    ) {
      errors.push(
        `${entry.courseCode} is assigned beyond this programme's configured progression years.`,
      );
    }
  });

  const plannedCredits = program.curriculum.reduce(
    (sum, entry) => sum + (byId.get(entry.courseId)?.credits ?? 0),
    0,
  );
  const requirementCredits = program.requirements.reduce(
    (sum, requirement) => sum + requirement.requiredCredits,
    0,
  );
  if (plannedCredits !== requirementCredits) {
    errors.push(
      `Planned courses total ${plannedCredits} credits, but degree requirements total ${requirementCredits}.`,
    );
  }

  return [...new Set(errors)];
}

export function CurriculumPlanEditor({
  program,
  courses,
  progressionLevels,
  onChange,
}: {
  program: AcademicCatalogProgram;
  courses: CatalogCourseReference[];
  progressionLevels: AcademicCatalogLevel[];
  onChange: (program: AcademicCatalogProgram) => void;
}) {
  const entryYearCount = Math.max(
    1,
    ...program.curriculum.map((entry) => entry.yearIndex),
  );
  const progressionYearCount = Math.ceil(progressionLevels.length / 2);
  const configuredYearCount = Math.min(
    MAX_PLAN_YEARS,
    Math.max(1, progressionYearCount, entryYearCount),
  );
  const [visibleYearCount, setVisibleYearCount] = useState(configuredYearCount);
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const canonicalCurriculum = useMemo(
    () => canonicalizeCurriculum(program.curriculum),
    [program.curriculum],
  );
  const usedCourseIds = useMemo(
    () => new Set(program.curriculum.map((entry) => entry.courseId)),
    [program.curriculum],
  );
  const availableCourses = useMemo(
    () => courses.filter((course) => !usedCourseIds.has(course.id)),
    [courses, usedCourseIds],
  );
  const errors = useMemo(
    () => curriculumErrors(program, courses, progressionLevels),
    [courses, program, progressionLevels],
  );
  const plannedCredits = useMemo(
    () => curriculumCreditTotal(program, courses),
    [courses, program],
  );
  const requirementCredits = program.requirements.reduce(
    (sum, requirement) => sum + requirement.requiredCredits,
    0,
  );
  const renderedYearCount = Math.max(visibleYearCount, configuredYearCount);
  const unplacedEntries = canonicalCurriculum.filter(
    (entry) =>
      !SEMESTER_ORDER.has(entry.semester) ||
      entry.yearIndex < 1 ||
      entry.yearIndex > MAX_PLAN_YEARS,
  );

  function commit(entries: AcademicCatalogCurriculumEntry[]) {
    onChange({ ...program, curriculum: canonicalizeCurriculum(entries) });
  }

  function addCourse(
    courseId: string,
    yearIndex: number,
    semester: AcademicCatalogSemester,
  ) {
    const course = courseById.get(courseId);
    if (!course || usedCourseIds.has(course.id)) return;
    commit([
      ...program.curriculum,
      {
        courseId: course.id,
        courseCode: course.code,
        yearIndex,
        semester,
        position: program.curriculum.length,
      },
    ]);
  }

  function removeCourse(entry: AcademicCatalogCurriculumEntry) {
    commit(
      program.curriculum.filter(
        (candidate) => candidate.courseId !== entry.courseId,
      ),
    );
  }

  function moveCourse(
    entry: AcademicCatalogCurriculumEntry,
    direction: -1 | 1,
  ) {
    const group = canonicalCurriculum.filter(
      (candidate) =>
        candidate.yearIndex === entry.yearIndex &&
        candidate.semester === entry.semester,
    );
    const currentIndex = group.findIndex(
      (candidate) => candidate.courseId === entry.courseId,
    );
    const swapWith = group[currentIndex + direction];
    if (!swapWith) return;
    commit(
      canonicalCurriculum.map((candidate) => ({
        ...candidate,
        position:
          candidate.courseId === entry.courseId
            ? swapWith.position
            : candidate.courseId === swapWith.courseId
              ? group[currentIndex]!.position
              : candidate.position,
      })),
    );
  }

  return (
    <section
      className={styles.plan}
      aria-label={`${program.programName} course plan`}
    >
      <header className={styles.planHeader}>
        <div>
          <span className={styles.kicker}>Recommended course source</span>
          <h4>Programme course plan</h4>
          <p>
            Place each catalog course in its intended study year and semester.
            Approved entries drive student recommendations.
          </p>
        </div>
        <div className={styles.totals} aria-label="Course plan totals">
          <strong>{plannedCredits} credits planned</strong>
          <small>
            {program.curriculum.length}{" "}
            {program.curriculum.length === 1 ? "course" : "courses"}
            {requirementCredits > 0
              ? ` · ${requirementCredits} degree credits required`
              : ""}
          </small>
        </div>
      </header>

      {program.curriculum.length === 0 && (
        <div className={styles.emptyNotice} role="status">
          <BookOpen size={17} aria-hidden="true" />
          <span>
            No courses are planned yet. Student recommendations will remain
            unavailable for this programme until an approved plan exists.
          </span>
        </div>
      )}

      {errors.length > 0 && (
        <div className={styles.validation} role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>Resolve before saving</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            {errors.includes(
              "Course order needs to be normalized before this draft can be saved.",
            ) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => commit(program.curriculum)}
              >
                Normalize course order
              </Button>
            )}
          </div>
        </div>
      )}

      {unplacedEntries.length > 0 && (
        <div
          className={styles.unplaced}
          role="group"
          aria-label="Unplaced courses"
        >
          <strong>Unplaced legacy entries</strong>
          <p>
            These entries use an unsupported year or semester. Remove and add
            them back to a valid plan slot.
          </p>
          <ul>
            {unplacedEntries.map((entry) => (
              <li key={`${entry.courseId}-${entry.position}`}>
                <span>
                  <strong>{entry.courseCode}</strong>
                  <small>
                    Year {entry.yearIndex} · {String(entry.semester)}
                  </small>
                </span>
                <IconButton
                  label={`Remove invalid ${entry.courseCode} entry`}
                  tone="danger"
                  onClick={() => removeCourse(entry)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.years}>
        {Array.from({ length: renderedYearCount }, (_, index) => index + 1).map(
          (yearIndex) => {
            const yearEntries = program.curriculum.filter(
              (entry) => entry.yearIndex === yearIndex,
            );
            const yearCredits = yearEntries.reduce(
              (sum, entry) =>
                sum + (courseById.get(entry.courseId)?.credits ?? 0),
              0,
            );
            return (
              <section className={styles.year} key={yearIndex}>
                <header className={styles.yearHeader}>
                  <div>
                    <span>Study year</span>
                    <h5>{String(yearIndex).padStart(2, "0")}</h5>
                  </div>
                  <strong>{yearCredits} credits</strong>
                </header>
                <div className={styles.semesters}>
                  {SEMESTERS.map((semester) => {
                    const entries = canonicalCurriculum.filter(
                      (entry) =>
                        entry.yearIndex === yearIndex &&
                        entry.semester === semester,
                    );
                    const semesterCredits = entries.reduce(
                      (sum, entry) =>
                        sum + (courseById.get(entry.courseId)?.credits ?? 0),
                      0,
                    );
                    return (
                      <div className={styles.semester} key={semester}>
                        <div className={styles.semesterHeader}>
                          <Badge
                            tone={
                              semester === "Fall"
                                ? "warning"
                                : semester === "Spring"
                                  ? "teal"
                                  : "neutral"
                            }
                          >
                            {semester}
                          </Badge>
                          <span>{semesterCredits} cr</span>
                        </div>
                        <ol className={styles.courseList}>
                          {entries.map((entry, index) => {
                            const course = courseById.get(entry.courseId);
                            return (
                              <li key={`${entry.courseId}-${entry.position}`}>
                                <span className={styles.order}>
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className={styles.courseCopy}>
                                  <strong>
                                    {course?.code ?? entry.courseCode}
                                  </strong>
                                  <small>
                                    {course?.title ?? "Course unavailable"}
                                  </small>
                                </span>
                                <span className={styles.courseCredits}>
                                  {course?.credits ?? "—"} cr
                                </span>
                                <span className={styles.courseActions}>
                                  <IconButton
                                    label={`Move ${entry.courseCode} up`}
                                    disabled={index === 0}
                                    onClick={() => moveCourse(entry, -1)}
                                  >
                                    <ArrowUp size={14} />
                                  </IconButton>
                                  <IconButton
                                    label={`Move ${entry.courseCode} down`}
                                    disabled={index === entries.length - 1}
                                    onClick={() => moveCourse(entry, 1)}
                                  >
                                    <ArrowDown size={14} />
                                  </IconButton>
                                  <IconButton
                                    label={`Remove ${entry.courseCode}`}
                                    tone="danger"
                                    onClick={() => removeCourse(entry)}
                                  >
                                    <Trash2 size={14} />
                                  </IconButton>
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                        <label className={styles.coursePicker}>
                          <span className={styles.visuallyHidden}>
                            Add a {semester} course to study year {yearIndex}
                          </span>
                          <Plus size={14} aria-hidden="true" />
                          <select
                            value=""
                            disabled={availableCourses.length === 0}
                            aria-label={`Add a ${semester} course to study year ${yearIndex}`}
                            onChange={(event) => {
                              addCourse(
                                event.target.value,
                                yearIndex,
                                semester,
                              );
                              event.target.value = "";
                            }}
                          >
                            <option value="">Add course…</option>
                            {availableCourses.map((course) => (
                              <option key={course.id} value={course.id}>
                                {course.code} · {course.title} ({course.credits}{" "}
                                cr)
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          },
        )}
      </div>

      <div className={styles.yearActions}>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          disabled={renderedYearCount >= MAX_PLAN_YEARS}
          onClick={() => setVisibleYearCount(renderedYearCount + 1)}
        >
          Add study year
        </Button>
        {renderedYearCount > configuredYearCount && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setVisibleYearCount(renderedYearCount - 1)}
          >
            Remove empty year {renderedYearCount}
          </Button>
        )}
      </div>
    </section>
  );
}

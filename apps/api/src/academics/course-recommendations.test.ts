import { describe, expect, it } from "vitest";
import {
  deriveCourseRecommendations,
  earliestIncompleteSameSemester,
  type ApprovedCurriculumEntry,
  type RecommendationCourseSource,
} from "./course-recommendations.js";

const targetStart = new Date("2027-01-10T00:00:00.000Z");

function course(
  id: string,
  prerequisites: RecommendationCourseSource["prerequisites"] = [],
  corequisites: RecommendationCourseSource["corequisites"] = [],
): RecommendationCourseSource {
  return {
    id,
    code: id.toUpperCase(),
    title: `Course ${id}`,
    credits: 3,
    prerequisites,
    corequisites,
  };
}

function entry(
  courseId: string,
  yearIndex: number,
  semester: "Fall" | "Spring" | "Summer",
  position: number,
): ApprovedCurriculumEntry {
  return {
    courseId,
    courseCode: courseId.toUpperCase(),
    yearIndex,
    semester,
    position,
  };
}

describe("deriveCourseRecommendations", () => {
  it("orders catch-up before the target slot and excludes passed, enrolled, and future courses", () => {
    const best = new Map<string, number | null>([["done", 3]]);
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 2,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [
        entry("done", 1, "Fall", 0),
        entry("catch", 1, "Spring", 1),
        entry("enrolled", 2, "Spring", 2),
        entry("scheduled", 2, "Spring", 3),
        entry("future", 3, "Fall", 4),
      ],
      courses: ["done", "catch", "enrolled", "scheduled", "future"].map((id) =>
        course(id),
      ),
      sections: [
        { sectionId: "section-catch", courseId: "catch", blockedReason: null },
        {
          sectionId: "section-scheduled",
          courseId: "scheduled",
          blockedReason: null,
        },
      ],
      targetEnrolledCourseIds: new Set(["enrolled"]),
      inProgressCourses: [],
      satisfies: (courseId) => best.has(courseId),
    });

    expect(recommendations.map((row) => [row.courseId, row.kind])).toEqual([
      ["catch", "catch_up"],
      ["scheduled", "scheduled"],
    ]);
    expect(recommendations.map((row) => row.rank)).toEqual([1, 2]);
    expect(recommendations[1]).toMatchObject({
      availability: "available",
      availableSectionIds: ["section-scheduled"],
    });
  });

  it("omits an unfinished earlier-plan course when the target term does not offer it", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 2,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [
        entry("unoffered-catch-up", 1, "Fall", 0),
        entry("scheduled", 2, "Spring", 1),
      ],
      courses: [course("unoffered-catch-up"), course("scheduled")],
      sections: [],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations.map((row) => row.courseId)).toEqual(["scheduled"]);
  });

  it("walks to the nearest actionable prerequisite and keeps the planned course blocked", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 2,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [entry("advanced", 2, "Spring", 0)],
      courses: [
        course("foundation"),
        course("middle", [
          {
            courseId: "foundation",
            courseCode: "FOUNDATION",
            minGrade: null,
          },
        ]),
        course("advanced", [
          { courseId: "middle", courseCode: "MIDDLE", minGrade: "C" },
        ]),
      ],
      sections: [
        {
          sectionId: "foundation-section",
          courseId: "foundation",
          blockedReason: null,
        },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations.map((row) => [row.courseId, row.kind])).toEqual([
      ["foundation", "prerequisite"],
      ["advanced", "scheduled"],
    ]);
    expect(recommendations[0]).toMatchObject({
      readiness: "ready",
      unlocks: ["ADVANCED"],
      availability: "available",
    });
    expect(recommendations[1]).toMatchObject({
      readiness: "blocked",
      prerequisites: [{ courseId: "middle", status: "missing" }],
    });
  });

  it("does not pull a prerequisite forward from a future approved-plan slot", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Fall",
      targetYearIndex: 1,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [
        entry("advanced", 1, "Fall", 0),
        entry("future-prerequisite", 2, "Fall", 1),
      ],
      courses: [
        course("future-prerequisite"),
        course("advanced", [
          {
            courseId: "future-prerequisite",
            courseCode: "FUTURE-PREREQUISITE",
            minGrade: null,
          },
        ]),
      ],
      sections: [
        {
          sectionId: "advanced-section",
          courseId: "advanced",
          blockedReason: "Needs FUTURE-PREREQUISITE",
        },
        {
          sectionId: "future-section",
          courseId: "future-prerequisite",
          blockedReason: null,
        },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations.map((row) => row.courseId)).toEqual(["advanced"]);
    expect(recommendations[0]).toMatchObject({
      readiness: "blocked",
      availability: "blocked",
      prerequisites: [{ courseId: "future-prerequisite", status: "missing" }],
    });
  });

  it("recommends a retake when a pass is below the dependent course minimum grade", () => {
    const points = new Map<string, number | null>([["prereq", 2]]);
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 2,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [entry("advanced", 2, "Spring", 0)],
      courses: [
        course("prereq"),
        course("advanced", [
          { courseId: "prereq", courseCode: "PREREQ", minGrade: "B" },
        ]),
      ],
      sections: [
        { sectionId: "retake", courseId: "prereq", blockedReason: null },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: (courseId, minGrade) => {
        if (!points.has(courseId)) return false;
        return minGrade === null || (points.get(courseId) ?? -1) >= 3;
      },
    });

    expect(recommendations[0]).toMatchObject({
      courseId: "prereq",
      kind: "prerequisite",
      reason: "Retake with at least B to unlock ADVANCED",
    });
  });

  it("marks in-progress prerequisites and co-recommended corequisites conditional", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 1,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [
        entry("dependent", 1, "Spring", 0),
        entry("lab", 1, "Spring", 1),
      ],
      courses: [
        course(
          "dependent",
          [{ courseId: "intro", courseCode: "INTRO", minGrade: null }],
          [{ courseId: "lab", courseCode: "LAB" }],
        ),
        course("intro"),
        course("lab"),
      ],
      sections: [
        {
          sectionId: "dependent-section",
          courseId: "dependent",
          blockedReason: "Needs INTRO",
        },
        { sectionId: "lab-section", courseId: "lab", blockedReason: null },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [
        {
          courseId: "intro",
          termStartDate: new Date("2026-09-01T00:00:00Z"),
          termEndDate: new Date("2027-01-01T00:00:00Z"),
        },
      ],
      satisfies: () => false,
    });

    expect(
      recommendations.find((row) => row.courseId === "dependent"),
    ).toMatchObject({
      readiness: "conditional",
      prerequisites: [{ status: "in_progress" }],
      corequisites: [{ status: "recommended" }],
      availableSectionIds: [],
      availability: "blocked",
    });
  });

  it("treats an overlapping earlier-started prerequisite as in progress", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 1,
      targetTermStart: new Date("2027-01-15T00:00:00Z"),
      registrationOpen: true,
      curriculum: [entry("dependent", 1, "Spring", 0)],
      courses: [
        course("dependent", [
          { courseId: "intro", courseCode: "INTRO", minGrade: null },
        ]),
        course("intro"),
      ],
      sections: [
        {
          sectionId: "dependent-section",
          courseId: "dependent",
          blockedReason: "Needs INTRO",
        },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [
        {
          courseId: "intro",
          termStartDate: new Date("2027-01-01T00:00:00Z"),
          termEndDate: new Date("2027-02-01T00:00:00Z"),
        },
      ],
      satisfies: () => false,
    });

    expect(
      recommendations.find((row) => row.courseId === "dependent"),
    ).toMatchObject({
      readiness: "conditional",
      prerequisites: [{ courseId: "intro", status: "in_progress" }],
    });
    expect(recommendations.some((row) => row.courseId === "intro")).toBe(false);
  });

  it("does not treat a genuinely future prerequisite enrollment as in progress", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Spring",
      targetYearIndex: 1,
      targetTermStart: new Date("2027-01-15T00:00:00Z"),
      registrationOpen: true,
      curriculum: [entry("dependent", 1, "Spring", 0)],
      courses: [
        course("dependent", [
          { courseId: "intro", courseCode: "INTRO", minGrade: null },
        ]),
        course("intro"),
      ],
      sections: [
        {
          sectionId: "dependent-section",
          courseId: "dependent",
          blockedReason: "Needs INTRO",
        },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [
        {
          courseId: "intro",
          termStartDate: new Date("2027-02-01T00:00:00Z"),
          termEndDate: new Date("2027-05-01T00:00:00Z"),
        },
      ],
      satisfies: () => false,
    });

    expect(
      recommendations.find((row) => row.courseId === "dependent"),
    ).toMatchObject({
      readiness: "blocked",
      prerequisites: [{ courseId: "intro", status: "missing" }],
    });
  });

  it("keeps an offered corequisite bundle ready and exposes its dependent section", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Fall",
      targetYearIndex: 1,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [entry("lecture", 1, "Fall", 0)],
      courses: [
        course("lecture", [], [{ courseId: "lab", courseCode: "LAB" }]),
        course("lab"),
      ],
      sections: [
        {
          sectionId: "lecture-section",
          courseId: "lecture",
          blockedReason: "Must be taken with (or after) LAB",
        },
        { sectionId: "lab-section", courseId: "lab", blockedReason: null },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations[0]).toMatchObject({
      courseId: "lecture",
      readiness: "ready",
      corequisites: [{ courseId: "lab", status: "recommended" }],
      availableSectionIds: ["lecture-section"],
      availability: "available",
    });
  });

  it("expands transitive corequisites and surfaces an unoffered leaf as blocking", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Fall",
      targetYearIndex: 1,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [entry("lecture", 1, "Fall", 0)],
      courses: [
        course("lecture", [], [{ courseId: "lab", courseCode: "LAB" }]),
        course("lab", [], [{ courseId: "workshop", courseCode: "WORKSHOP" }]),
        course("workshop"),
      ],
      sections: [
        {
          sectionId: "lecture-section",
          courseId: "lecture",
          blockedReason: "Must be taken with (or after) LAB",
        },
        { sectionId: "lab-section", courseId: "lab", blockedReason: null },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations[0]).toMatchObject({
      readiness: "blocked",
      corequisites: [
        { courseId: "lab", status: "recommended" },
        { courseId: "workshop", status: "missing" },
      ],
      availableSectionIds: [],
      availability: "blocked",
    });
  });

  it("cuts reciprocal corequisite cycles while keeping the offered pair ready", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Fall",
      targetYearIndex: 1,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [entry("lecture", 1, "Fall", 0)],
      courses: [
        course("lecture", [], [{ courseId: "lab", courseCode: "LAB" }]),
        course("lab", [], [{ courseId: "lecture", courseCode: "LECTURE" }]),
      ],
      sections: [
        {
          sectionId: "lecture-section",
          courseId: "lecture",
          blockedReason: "Must be taken with (or after) LAB",
        },
        { sectionId: "lab-section", courseId: "lab", blockedReason: null },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations[0]).toMatchObject({
      readiness: "ready",
      corequisites: [{ courseId: "lab", status: "recommended" }],
      availableSectionIds: ["lecture-section"],
    });
  });

  it("deduplicates repeated curriculum entries and keeps a stable section list", () => {
    const recommendations = deriveCourseRecommendations({
      semester: "Fall",
      targetYearIndex: 1,
      targetTermStart: targetStart,
      registrationOpen: true,
      curriculum: [entry("same", 1, "Fall", 0), entry("same", 1, "Fall", 1)],
      courses: [course("same")],
      sections: [
        { sectionId: "a", courseId: "same", blockedReason: "Section is full" },
        { sectionId: "b", courseId: "same", blockedReason: null },
      ],
      targetEnrolledCourseIds: new Set(),
      inProgressCourses: [],
      satisfies: () => false,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      sectionIds: ["a", "b"],
      availableSectionIds: ["b"],
    });
  });
});

describe("earliestIncompleteSameSemester", () => {
  it("falls back to the earliest unfinished year for the requested season", () => {
    expect(
      earliestIncompleteSameSemester(
        [
          entry("done", 1, "Fall", 0),
          entry("next", 2, "Fall", 1),
          entry("spring", 1, "Spring", 2),
        ],
        "Fall",
        new Set(["done"]),
        new Set(),
      ),
    ).toBe(2);
  });
});

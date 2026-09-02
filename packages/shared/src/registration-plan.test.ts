import { describe, expect, it } from "vitest";
import { orderRegistrationPlanSectionIds } from "./registration-plan.js";

describe("orderRegistrationPlanSectionIds", () => {
  it("places selected corequisites before their dependents, including transitively", () => {
    expect(
      orderRegistrationPlanSectionIds(
        [
          { sectionId: "writing-section", courseId: "writing" },
          { sectionId: "lecture-section", courseId: "lecture" },
          { sectionId: "lab-section", courseId: "lab" },
          { sectionId: "foundation-section", courseId: "foundation" },
        ],
        [
          { courseId: "lecture", corequisiteCourseIds: ["lab"] },
          { courseId: "lab", corequisiteCourseIds: ["foundation"] },
        ],
      ),
    ).toEqual([
      "writing-section",
      "foundation-section",
      "lab-section",
      "lecture-section",
    ]);
  });

  it("keeps unrelated selections stable and ignores unselected corequisites", () => {
    expect(
      orderRegistrationPlanSectionIds(
        [
          { sectionId: "first-section", courseId: "first" },
          { sectionId: "second-section", courseId: "second" },
          { sectionId: "third-section", courseId: "third" },
        ],
        [{ courseId: "second", corequisiteCourseIds: ["not-selected"] }],
      ),
    ).toEqual(["first-section", "second-section", "third-section"]);
  });

  it("terminates cycles and returns each selected section once", () => {
    const ordered = orderRegistrationPlanSectionIds(
      [
        { sectionId: "a-section", courseId: "a" },
        { sectionId: "b-section", courseId: "b" },
        { sectionId: "other-section", courseId: "other" },
      ],
      [
        { courseId: "a", corequisiteCourseIds: ["b"] },
        { courseId: "b", corequisiteCourseIds: ["a"] },
      ],
    );

    expect(ordered).toEqual(["b-section", "a-section", "other-section"]);
    expect(new Set(ordered).size).toBe(3);
  });
});

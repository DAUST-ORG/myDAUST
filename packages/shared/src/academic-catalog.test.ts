import { describe, expect, it } from "vitest";
import {
  AcademicCatalogDraftInput,
  DEFAULT_ACADEMIC_STANDING_RULES,
  DEFAULT_NOT_YET_GRADED_STANDING,
  deriveAcademicStanding,
  deriveAcademicLevel,
} from "./academic-catalog.js";

const levels = [
  { code: "S1", name: "Semester 1", creditCeiling: 30 },
  { code: "S2", name: "Semester 2", creditCeiling: 60 },
  { code: "S3", name: "Semester 3", creditCeiling: 90 },
  { code: "S4", name: "Semester 4", creditCeiling: 120 },
  { code: "S5", name: "Semester 5", creditCeiling: 150 },
];
const engineeringLevels = Array.from({ length: 10 }, (_, index) => ({
  code: `S${index + 1}`,
  name: `Semester ${index + 1}`,
  creditCeiling: (index + 1) * 30,
}));

describe("academic progression", () => {
  it.each([
    [0, "S1"],
    [1, "S1"],
    [30, "S1"],
    [31, "S2"],
    [60, "S2"],
    [61, "S3"],
    [120, "S4"],
    [132, "S5"],
  ])("places %i earned credits in %s", (earned, expected) => {
    expect(deriveAcademicLevel(levels, earned, 132).level?.code).toBe(expected);
  });

  it("caps extra earned credit at the programme's final level", () => {
    expect(deriveAcademicLevel(levels, 220, 132).level?.code).toBe("S5");
  });

  it.each([
    [132, "S5"],
    [204, "S7"],
    [271, "S10"],
    [300, "S10"],
    [340, "S10"],
  ])(
    "uses the ten-band engineering progression for %i credits",
    (earned, expected) => {
      expect(
        deriveAcademicLevel(engineeringLevels, earned, 300).level?.code,
      ).toBe(expected);
    },
  );

  it("rejects duplicate levels and ranges that do not cover requirements", () => {
    const result = AcademicCatalogDraftInput.safeParse({
      yearLabel: "2026–2027",
      startsOn: "2026-08-01",
      endsOn: "2027-07-31",
      defaultLevels: [levels[0], levels[0]],
      programs: [
        {
          programId: "9f86312f-37af-43e9-89d3-249d39b8a961",
          programCode: "BSCS",
          programName: "Computer Science",
          progressionMode: "default",
          customLevels: [],
          requirements: [{ category: "Core", requiredCredits: 132 }],
        },
      ],
      reason: "Test invalid catalog",
      activateYear: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("academic standing", () => {
  it.each([
    [0, "academic_probation"],
    [1.99, "academic_probation"],
    [2, "good_standing"],
    [3.69, "good_standing"],
    [3.7, "deans_list"],
  ])("uses the highest threshold matching GPA %s", (gpa, expected) => {
    expect(
      deriveAcademicStanding(
        [...DEFAULT_ACADEMIC_STANDING_RULES],
        DEFAULT_NOT_YET_GRADED_STANDING,
        gpa,
        true,
      ).code,
    ).toBe(expected);
  });

  it("keeps a student with no GPA-bearing coursework separate from a graded failure", () => {
    expect(
      deriveAcademicStanding(
        [...DEFAULT_ACADEMIC_STANDING_RULES],
        DEFAULT_NOT_YET_GRADED_STANDING,
        null,
        false,
      ).code,
    ).toBe("not_yet_graded");
    expect(
      deriveAcademicStanding(
        [...DEFAULT_ACADEMIC_STANDING_RULES],
        DEFAULT_NOT_YET_GRADED_STANDING,
        0,
        true,
      ).code,
    ).toBe("academic_probation");
  });
});

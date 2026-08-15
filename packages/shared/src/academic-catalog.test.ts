import { describe, expect, it } from "vitest";
import {
  AcademicCatalogDraftInput,
  deriveAcademicLevel,
} from "./academic-catalog.js";

const levels = [
  { code: "S1", name: "Semester 1", creditCeiling: 30 },
  { code: "S2", name: "Semester 2", creditCeiling: 60 },
  { code: "S3", name: "Semester 3", creditCeiling: 90 },
  { code: "S4", name: "Semester 4", creditCeiling: 120 },
  { code: "S5", name: "Semester 5", creditCeiling: 150 },
];

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

import { describe, expect, it } from "vitest";
import {
  courseCodeForLabel,
  isEmptyCourseCell,
  isGroupHeaderRow,
} from "./curated-recommendations.catalog.js";
import { parseRosterHtml } from "./curated-recommendations.parser.js";
import {
  buildCuratedRecommendations,
  curatedCourseCodesFor,
  type CuratedRecommendationData,
} from "./curated-recommendations.js";

describe("curated recommendation label mapping", () => {
  it("folds the source's spelling variants onto one course", () => {
    // The roster is hand-maintained, so the same course arrives under several
    // spellings. Each group must land on a single code or a student's plan
    // silently loses a course.
    expect(
      ["Program I", "Prog 1", "Prog I"].map(courseCodeForLabel),
    ).toEqual(["CS 1231", "CS 1231", "CS 1231"]);
    expect(["Calculus III", "Calc3", "Calc 3"].map(courseCodeForLabel)).toEqual(
      ["MATH 2311", "MATH 2311", "MATH 2311"],
    );
    expect(
      ["Web Dev", "Web Dev  (2)", "Web Development"].map(courseCodeForLabel),
    ).toEqual(["CS 2433", "CS 2433", "CS 2433"]);
  });

  it("survives the wrapped-cell newlines the spreadsheet emits", () => {
    expect(courseCodeForLabel("Mechanics of\nMaterials")).toBe("ME 1511");
    expect(courseCodeForLabel("Cybersecurity\n&\nCryptography")).toBe("CS 4713");
    expect(courseCodeForLabel("CAD & \nTech. \nDrawing")).toBe("ME 1512");
    expect(courseCodeForLabel("Communi-\ncation \nNetworks")).toBe("EE 4813");
  });

  it("tolerates the source's typo and uncertainty markers", () => {
    expect(courseCodeForLabel("Network\nAdministartion")).toBe("CS 4223");
    expect(courseCodeForLabel("Electromagnetism\n??")).toBe("EE 3511");
  });

  it("distinguishes the roman/arabic sequence numbers", () => {
    expect(courseCodeForLabel("Engl Comp I")).toBe("HSS 1141");
    expect(courseCodeForLabel("Engl Comp 1")).toBe("HSS 1141");
    expect(courseCodeForLabel("Engl Comp II")).toBe("HSS 2341");
    expect(courseCodeForLabel("English \nComp 2")).toBe("HSS 2341");
  });

  it("returns null for an unknown label instead of guessing", () => {
    expect(courseCodeForLabel("Underwater Basket Weaving")).toBeNull();
  });

  it("recognises the group separator rows mixed into the table", () => {
    for (const header of ["S1", "S4", "S9", "IEP", "S1_Repeats", "S1 Repeats"]) {
      expect(isGroupHeaderRow(header), header).toBe(true);
    }
    expect(isGroupHeaderRow("Rama Thalia Cabral")).toBe(false);
  });

  it("treats the source's empty-slot spellings as empty", () => {
    for (const empty of ["None", "none", "", "  ", "NA"]) {
      expect(isEmptyCourseCell(empty), JSON.stringify(empty)).toBe(true);
    }
    expect(isEmptyCourseCell("Calculus II")).toBe(false);
  });
});

function rosterHtml(headers: string[], columns: unknown[][]): string {
  const container = `<table><thead><tr>${headers
    .map((header) => `<th>${header}</th>`)
    .join("")}</tr></thead></table>`;
  return `<html><script type="application/json" data-for="x">${JSON.stringify({
    x: { data: columns, container },
  })}</script></html>`;
}

describe("roster parser", () => {
  const headers = [
    " ",
    "Student",
    "Sp26",
    "F26",
    "Course_1",
    "Course_2",
  ];

  it("reads the column-oriented payload and drops header rows", () => {
    const parsed = parseRosterHtml(
      rosterHtml(headers, [
        ["1", "2", "3"],
        ["Rama Thalia Cabral", "S2", "Pape Djibril THIAM"],
        ["S1", "", "S1"],
        ["S1", "S2", "S1"],
        ["Calculus II", "None", "Physics I"],
        ["None", "None", "Chem 101"],
      ]),
    );
    expect(parsed.groupHeaderRows).toBe(1);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      student: "Rama Thalia Cabral",
      nextLevel: "S1",
      courseLabels: ["Calculus II"],
    });
    expect(parsed.rows[1]?.courseLabels).toEqual(["Physics I", "Chem 101"]);
    expect(parsed.unmappedLabels).toEqual([]);
  });

  it("reports unmapped labels rather than dropping them silently", () => {
    const parsed = parseRosterHtml(
      rosterHtml(headers, [
        ["1"],
        ["Rama Thalia Cabral"],
        ["S1"],
        ["S2"],
        ["Underwater Basket Weaving"],
        ["None"],
      ]),
    );
    expect(parsed.unmappedLabels).toEqual([
      { label: "Underwater Basket Weaving", occurrences: 1 },
    ]);
  });

  it("refuses a payload whose headers do not line up with its columns", () => {
    expect(() => parseRosterHtml(rosterHtml(["Student"], [["a"], ["b"]]))).toThrow(
      /header count/,
    );
    expect(() => parseRosterHtml("<html>no payload</html>")).toThrow(
      /no application\/json/,
    );
  });
});

describe("buildCuratedRecommendations", () => {
  const data: CuratedRecommendationData = {
    termName: "Fall 2026",
    students: {
      "S-1": { level: "S2", courses: ["MATH 1211", "ENGR 1261"] },
    },
  };
  const courses = [
    { id: "c-math", code: "MATH 1211", title: "Calculus II", credits: 4 },
    { id: "c-engr", code: "ENGR 1261", title: "Design Project II", credits: 2 },
  ];
  const sections = [
    {
      sectionId: "sec-math",
      courseId: "c-math",
      courseCode: "MATH 1211",
      title: "Calculus II",
      credits: 4,
      blockedReason: null,
    },
  ];
  const build = (overrides: Partial<Parameters<typeof buildCuratedRecommendations>[0]> = {}) =>
    buildCuratedRecommendations({
      studentNo: "S-1",
      termName: "Fall 2026",
      data,
      courses,
      sections,
      enrolledCourseIds: new Set<string>(),
      ...overrides,
    });

  it("ranks in roster column order and reuses the derived row shape", () => {
    const rows = build();
    expect(rows.map((row) => [row.courseCode, row.rank, row.kind])).toEqual([
      ["MATH 1211", 1, "curated"],
      ["ENGR 1261", 2, "curated"],
    ]);
    expect(rows[0]?.reason).toContain("Fall 2026");
    expect(rows[0]?.reason).toContain("S2");
  });

  it("marks a course with no section in the term as not offered", () => {
    // Design Project II has no Fall 2026 section. It is still part of the plan,
    // so it is surfaced rather than dropped — the portal renders these through
    // its existing not-offered card.
    const engr = build().find((row) => row.courseCode === "ENGR 1261");
    expect(engr?.availability).toBe("not_offered");
    expect(engr?.sectionIds).toEqual([]);
    expect(engr?.availableSectionIds).toEqual([]);
  });

  it("marks a course whose only section is blocked as blocked", () => {
    const rows = build({
      sections: [{ ...sections[0]!, blockedReason: "Section is closed" }],
    });
    const math = rows.find((row) => row.courseCode === "MATH 1211");
    expect(math?.availability).toBe("blocked");
    expect(math?.sectionIds).toEqual(["sec-math"]);
    expect(math?.availableSectionIds).toEqual([]);
  });

  it("omits a course the student is already enrolled in this term", () => {
    const rows = build({ enrolledCourseIds: new Set(["c-math"]) });
    expect(rows.map((row) => row.courseCode)).toEqual(["ENGR 1261"]);
    expect(rows[0]?.rank).toBe(1);
  });

  it("returns nothing for an unknown student, a missing number, or another term", () => {
    expect(build({ studentNo: "S-404" })).toEqual([]);
    expect(build({ studentNo: null })).toEqual([]);
    expect(build({ termName: "Spring 2027" })).toEqual([]);
  });

  it("skips a code that is no longer in the catalog", () => {
    const rows = build({ courses: [courses[0]!] });
    expect(rows.map((row) => row.courseCode)).toEqual(["MATH 1211"]);
  });

  it("exposes only the codes a student needs, so callers query narrowly", () => {
    expect(
      curatedCourseCodesFor({ studentNo: "S-1", termName: "Fall 2026", data }),
    ).toEqual(["MATH 1211", "ENGR 1261"]);
    expect(
      curatedCourseCodesFor({ studentNo: "S-1", termName: "Spring 2027", data }),
    ).toEqual([]);
  });
});

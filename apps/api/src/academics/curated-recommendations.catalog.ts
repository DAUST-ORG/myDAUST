import { normalizeGuardianImportName } from "@mydaust/shared";

/**
 * The academic office publishes the Fall 2026 plan as an HTML table of display
 * labels, not course codes: "Program I", "Design Proj 2", "Engl Comp II". The
 * same course appears under several spellings, with embedded newlines from the
 * source spreadsheet's wrapped cells ("Mechanics of\nMaterials"), abbreviations
 * ("Calc 3", "Diff. Equ"), typos ("Network\nAdministartion") and one explicit
 * uncertainty marker ("Electromagnetism\n??").
 *
 * Every label is mapped explicitly rather than fuzzily: a mis-mapped label puts
 * the wrong course on a student's plan, which is the same class of defect the
 * guardian import refuses fuzzy matching to avoid.
 */
const LABEL_TO_COURSE_CODE: Record<string, string> = {
  // Mathematics
  "calculus i": "MATH 1111",
  "calculus ii": "MATH 1211",
  "calculus iii": "MATH 2311",
  calc3: "MATH 2311",
  "calc 3": "MATH 2311",
  "linear algebra": "MATH 1241",
  linear: "MATH 1241",
  "diff equation": "MATH 2361",
  "diff equ": "MATH 2361",
  "proba stats": "MATH 2412",
  // Sciences
  "physics i": "PHYS 1121",
  "physics ii": "PHYS 1221",
  "physics 2": "PHYS 1221",
  "chem 101": "CHEM 1151",
  // Humanities
  "engl comp i": "HSS 1141",
  "engl comp 1": "HSS 1141",
  "engl comp ii": "HSS 2341",
  "english comp 2": "HSS 2341",
  // Computer science
  "program i": "CS 1231",
  "prog 1": "CS 1231",
  "prog i": "CS 1231",
  "object oriented prog": "CS 2321",
  "object oriented progr": "CS 2321",
  "object oriented programming": "CS 2321",
  "web dev": "CS 2433",
  "web dev 2": "CS 2433",
  "web development": "CS 2433",
  "database management": "CS 2434",
  database: "CS 2434",
  "data mining visual": "CS 3542",
  "data mining visualiz": "CS 3542",
  "operating systems": "CS 3613",
  "mobile app dev": "CS 3624",
  "mobile dev": "CS 3624",
  "deep learning neural net": "CS 4212",
  "network adm": "CS 4223",
  "network administartion": "CS 4223",
  "cybersecurity cryptography": "CS 4713",
  cybersecurity: "CS 4713",
  "natural language processing": "CS 4714",
  "computer vision image processing": "CS 4814",
  "computer vision img proc": "CS 4814",
  // Electrical engineering
  "circuit analysis": "EE 2331",
  circuit: "EE 2331",
  "asic fpga design": "EE 3512",
  "control system": "EE 3513",
  "electronics i": "EE 3514",
  electromagnetism: "EE 3511",
  "electroma gnetism": "EE 3511",
  "power system": "EE 3615",
  "communi cation networks": "EE 4813",
  // Mechanical engineering
  "eng statics": "ME 1421",
  statics: "ME 1421",
  "mechanics of materials": "ME 1511",
  cad: "ME 1512",
  "cad tech drawing": "ME 1512",
  "fluid mechanics": "ME 1521",
  "eng dynamics orbital mech": "ME 1531",
  "elements of mechanical design": "ME 1612",
  "fund of automation": "ME 1622",
  "intro to eng simulation": "ME 2712",
  "photovoltaic fundamental system": "ME 2821",
  "solar thermal systems": "ME 2822",
  "thermal power system design": "ME 2922",
  "system design control": "ME 2931",
  "hydraulic pneumatic syst": "ME2999",
  // Cross-disciplinary project sequence
  "design proj 1": "ENGR 1161",
  "design proj 2": "ENGR 1261",
  "design proj 3": "ENGR 2351",
  "design proj 4": "ENGR 2441",
  "engr proj 1": "ENGR 3521",
};

/** Rows in the roster that are group separators, not people. */
const GROUP_HEADER_LABELS = new Set([
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "iep",
  "s1 repeats",
]);

/** Cell values the source uses for "no course in this slot". */
const EMPTY_CELLS = new Set(["", "none", "na"]);

export function normalizeCourseLabel(value: string): string {
  return normalizeGuardianImportName(value);
}

export function isGroupHeaderRow(studentCell: string): boolean {
  return GROUP_HEADER_LABELS.has(normalizeGuardianImportName(studentCell));
}

export function isEmptyCourseCell(value: string): boolean {
  return EMPTY_CELLS.has(normalizeGuardianImportName(value));
}

/** Resolves a roster label to a course code, or null when unmapped. */
export function courseCodeForLabel(label: string): string | null {
  return LABEL_TO_COURSE_CODE[normalizeCourseLabel(label)] ?? null;
}

export function mappedCourseCodes(): string[] {
  return [...new Set(Object.values(LABEL_TO_COURSE_CODE))].sort();
}

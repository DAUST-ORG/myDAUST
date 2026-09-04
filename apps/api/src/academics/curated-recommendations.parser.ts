import {
  courseCodeForLabel,
  isEmptyCourseCell,
  isGroupHeaderRow,
} from "./curated-recommendations.catalog.js";

export interface RosterRow {
  student: string;
  currentLevel: string;
  nextLevel: string;
  /** Roster labels in column order; the order is the recommendation ranking. */
  courseLabels: string[];
}

export interface ParsedRoster {
  rows: RosterRow[];
  groupHeaderRows: number;
  unmappedLabels: { label: string; occurrences: number }[];
}

const COURSE_COLUMN_PREFIX = "course_";

/**
 * The roster is an R htmlwidgets DataTable. The payload is a single
 * `application/json` script whose `x.data` is COLUMN-oriented (an array of
 * columns, each an array of row values) and whose `x.container` is the table
 * skeleton carrying the header names. Neither is documented, so both are
 * validated rather than trusted.
 */
export function parseRosterHtml(html: string): ParsedRoster {
  const payload = html.match(
    /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!payload?.[1]) {
    throw new Error("Roster HTML contains no application/json payload");
  }

  const parsed = JSON.parse(payload[1]) as {
    x?: { data?: unknown; container?: unknown };
  };
  const columns = parsed.x?.data;
  const container = parsed.x?.container;
  if (!Array.isArray(columns) || typeof container !== "string") {
    throw new Error("Roster payload is missing x.data or x.container");
  }

  const headers = [...container.matchAll(/<th>([\s\S]*?)<\/th>/g)].map(
    (match) => (match[1] ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
  );
  if (headers.length !== columns.length) {
    throw new Error(
      `Roster header count ${headers.length} does not match column count ${columns.length}`,
    );
  }

  const indexOf = (name: string) => headers.indexOf(name);
  const studentIndex = indexOf("student");
  const currentIndex = indexOf("sp26");
  const nextIndex = indexOf("f26");
  if (studentIndex < 0 || currentIndex < 0 || nextIndex < 0) {
    throw new Error(
      `Roster is missing a required column; saw: ${headers.join(", ")}`,
    );
  }
  const courseIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header.startsWith(COURSE_COLUMN_PREFIX))
    .sort((left, right) => left.header.localeCompare(right.header))
    .map(({ index }) => index);
  if (courseIndexes.length === 0) {
    throw new Error("Roster has no Course_N columns");
  }

  const cell = (column: number, row: number) =>
    String((columns[column] as unknown[])[row] ?? "").trim();
  const rowCount = (columns[studentIndex] as unknown[]).length;

  const rows: RosterRow[] = [];
  const unmapped = new Map<string, number>();
  let groupHeaderRows = 0;

  for (let row = 0; row < rowCount; row += 1) {
    const student = cell(studentIndex, row);
    if (!student || isGroupHeaderRow(student)) {
      groupHeaderRows += 1;
      continue;
    }
    const courseLabels: string[] = [];
    for (const column of courseIndexes) {
      const label = cell(column, row);
      if (isEmptyCourseCell(label)) continue;
      courseLabels.push(label);
      if (!courseCodeForLabel(label)) {
        unmapped.set(label, (unmapped.get(label) ?? 0) + 1);
      }
    }
    rows.push({
      student,
      currentLevel: cell(currentIndex, row),
      nextLevel: cell(nextIndex, row),
      courseLabels,
    });
  }

  return {
    rows,
    groupHeaderRows,
    unmappedLabels: [...unmapped.entries()]
      .map(([label, occurrences]) => ({ label, occurrences }))
      .sort((left, right) => right.occurrences - left.occurrences),
  };
}

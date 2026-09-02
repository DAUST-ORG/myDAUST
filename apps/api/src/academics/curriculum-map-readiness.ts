import { createHash } from "node:crypto";
import { MAX_ACADEMIC_CATALOG_PLAN_YEARS } from "@mydaust/shared";
import { normalizeRegistrationSemester } from "./registration-configuration.js";

interface CurriculumMapEntry {
  courseId: string;
  courseCode: string;
  yearIndex: number;
  semester: string;
  position: number;
}

export interface ApprovedCurriculumRevisionSource {
  academicYearId: string;
  revision: number;
  approvedAt: Date | null;
  programConfigurations: unknown;
}

export interface RelationalCurriculumSource {
  academicYearId: string;
  programId: string;
  entries: {
    courseId: string;
    yearIndex: number;
    semester: string;
    position: number;
    course: { code: string };
  }[];
}

export interface CurriculumMapComparison {
  academicYearId: string;
  programId: string;
  approvedRevision: number;
  snapshot: {
    present: boolean;
    valid: boolean;
    count: number;
    sha256: string | null;
  };
  relational: {
    present: boolean;
    valid: boolean;
    count: number;
    sha256: string | null;
  };
  matches: boolean;
}

function canonicalEntries(entries: CurriculumMapEntry[]) {
  return [...entries]
    .sort(
      (left, right) =>
        left.position - right.position ||
        left.yearIndex - right.yearIndex ||
        left.semester.localeCompare(right.semester) ||
        left.courseId.localeCompare(right.courseId) ||
        left.courseCode.localeCompare(right.courseCode),
    )
    .map((entry) => [
      entry.position,
      entry.courseId,
      entry.courseCode,
      entry.yearIndex,
      entry.semester,
    ]);
}

export function curriculumMapSha256(entries: CurriculumMapEntry[]) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalEntries(entries)), "utf8")
    .digest("hex");
}

function snapshotEntries(raw: unknown): {
  present: boolean;
  valid: boolean;
  entries: CurriculumMapEntry[];
} {
  if (!Array.isArray(raw)) return { present: false, valid: false, entries: [] };
  const entries: CurriculumMapEntry[] = [];
  let valid = true;
  const courseIds = new Set<string>();
  const courseCodes = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object") {
      valid = false;
      continue;
    }
    const entry = value as Record<string, unknown>;
    const semester =
      typeof entry.semester === "string"
        ? normalizeRegistrationSemester(entry.semester)
        : null;
    if (
      typeof entry.courseId !== "string" ||
      !entry.courseId.trim() ||
      typeof entry.courseCode !== "string" ||
      !entry.courseCode.trim() ||
      typeof entry.yearIndex !== "number" ||
      !Number.isInteger(entry.yearIndex) ||
      entry.yearIndex < 1 ||
      entry.yearIndex > MAX_ACADEMIC_CATALOG_PLAN_YEARS ||
      !semester ||
      typeof entry.position !== "number" ||
      !Number.isInteger(entry.position) ||
      entry.position < 0
    ) {
      valid = false;
      continue;
    }
    if (courseIds.has(entry.courseId)) valid = false;
    courseIds.add(entry.courseId);
    const courseCode = entry.courseCode.trim().toLocaleUpperCase();
    if (courseCodes.has(courseCode)) valid = false;
    courseCodes.add(courseCode);
    entries.push({
      courseId: entry.courseId,
      courseCode: entry.courseCode,
      yearIndex: entry.yearIndex,
      semester,
      position: entry.position,
    });
  }
  const positions = entries
    .map((entry) => entry.position)
    .sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index)) valid = false;
  return { present: true, valid, entries };
}

function relationalEntries(source: RelationalCurriculumSource) {
  const entries: CurriculumMapEntry[] = [];
  const courseIds = new Set<string>();
  const courseCodes = new Set<string>();
  let valid = true;
  for (const entry of source.entries) {
    const semester = normalizeRegistrationSemester(entry.semester);
    if (
      !entry.courseId.trim() ||
      !entry.course.code.trim() ||
      !Number.isInteger(entry.yearIndex) ||
      entry.yearIndex < 1 ||
      entry.yearIndex > MAX_ACADEMIC_CATALOG_PLAN_YEARS ||
      !semester ||
      !Number.isInteger(entry.position) ||
      entry.position < 0
    ) {
      valid = false;
      continue;
    }
    if (courseIds.has(entry.courseId)) valid = false;
    courseIds.add(entry.courseId);
    const courseCode = entry.course.code.trim().toLocaleUpperCase();
    if (courseCodes.has(courseCode)) valid = false;
    courseCodes.add(courseCode);
    entries.push({
      courseId: entry.courseId,
      courseCode: entry.course.code,
      yearIndex: entry.yearIndex,
      semester,
      position: entry.position,
    });
  }
  const positions = entries
    .map((entry) => entry.position)
    .sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index)) valid = false;
  return { valid, entries };
}

/**
 * Compare the relational official map to the effective approved snapshot for
 * every program/year pair. Inputs and outputs contain institutional ids only,
 * never student data.
 */
export function compareApprovedCurriculumMaps(
  revisions: ApprovedCurriculumRevisionSource[],
  relationalCurricula: RelationalCurriculumSource[],
): CurriculumMapComparison[] {
  const effectiveByYear = new Map<string, ApprovedCurriculumRevisionSource>();
  const orderedRevisions = [...revisions].sort(
    (left, right) =>
      (right.approvedAt?.getTime() ?? 0) - (left.approvedAt?.getTime() ?? 0) ||
      right.revision - left.revision,
  );
  for (const revision of orderedRevisions) {
    if (!effectiveByYear.has(revision.academicYearId)) {
      effectiveByYear.set(revision.academicYearId, revision);
    }
  }

  const relationalByKey = new Map(
    relationalCurricula.map((curriculum) => [
      `${curriculum.academicYearId}:${curriculum.programId}`,
      curriculum,
    ]),
  );
  const snapshotByKey = new Map<
    string,
    {
      revision: ApprovedCurriculumRevisionSource;
      parsed: ReturnType<typeof snapshotEntries>;
    }
  >();

  for (const revision of effectiveByYear.values()) {
    if (!Array.isArray(revision.programConfigurations)) continue;
    for (const value of revision.programConfigurations) {
      if (!value || typeof value !== "object") continue;
      const program = value as { programId?: unknown; curriculum?: unknown };
      if (typeof program.programId !== "string" || !program.programId.trim()) {
        continue;
      }
      snapshotByKey.set(`${revision.academicYearId}:${program.programId}`, {
        revision,
        parsed: snapshotEntries(program.curriculum),
      });
    }
  }

  const keys = new Set(snapshotByKey.keys());
  for (const curriculum of relationalCurricula) {
    if (effectiveByYear.has(curriculum.academicYearId)) {
      keys.add(`${curriculum.academicYearId}:${curriculum.programId}`);
    }
  }

  return [...keys].sort().map((key): CurriculumMapComparison => {
    const [academicYearId = "", programId = ""] = key.split(":", 2);
    const snapshot = snapshotByKey.get(key);
    const relational = relationalByKey.get(key);
    const revision = snapshot?.revision ?? effectiveByYear.get(academicYearId)!;
    const relationalParsed = relational
      ? relationalEntries(relational)
      : { valid: false, entries: [] };
    const snapshotHash =
      snapshot?.parsed.present && snapshot.parsed.valid
        ? curriculumMapSha256(snapshot.parsed.entries)
        : null;
    const relationalHash =
      relational && relationalParsed.valid
        ? curriculumMapSha256(relationalParsed.entries)
        : null;
    return {
      academicYearId,
      programId,
      approvedRevision: revision.revision,
      snapshot: {
        present: snapshot?.parsed.present ?? false,
        valid: snapshot?.parsed.valid ?? false,
        count: snapshot?.parsed.entries.length ?? 0,
        sha256: snapshotHash,
      },
      relational: {
        present: relational !== undefined,
        valid: relationalParsed.valid,
        count: relationalParsed.entries.length,
        sha256: relationalHash,
      },
      matches:
        snapshot?.parsed.present === true &&
        snapshot.parsed.valid &&
        relational !== undefined &&
        relationalParsed.valid &&
        snapshot.parsed.entries.length === relationalParsed.entries.length &&
        snapshotHash === relationalHash,
    };
  });
}

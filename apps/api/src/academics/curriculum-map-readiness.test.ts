import { describe, expect, it } from "vitest";
import {
  compareApprovedCurriculumMaps,
  curriculumMapSha256,
} from "./curriculum-map-readiness.js";

const approvedAt = new Date("2026-08-01T00:00:00.000Z");
const entry = {
  courseId: "course-1",
  courseCode: "CSC 101",
  yearIndex: 1,
  semester: "Fall",
  position: 0,
};

describe("curriculum map readiness", () => {
  it("produces the same checksum independent of input query order", () => {
    const second = {
      courseId: "course-2",
      courseCode: "CSC 102",
      yearIndex: 1,
      semester: "Spring",
      position: 1,
    };
    expect(curriculumMapSha256([entry, second])).toBe(
      curriculumMapSha256([second, entry]),
    );
  });

  it("matches an approved snapshot to its relational official map", () => {
    const result = compareApprovedCurriculumMaps(
      [
        {
          academicYearId: "year-1",
          revision: 3,
          approvedAt,
          programConfigurations: [
            { programId: "program-1", curriculum: [entry] },
          ],
        },
      ],
      [
        {
          academicYearId: "year-1",
          programId: "program-1",
          entries: [
            {
              courseId: entry.courseId,
              yearIndex: entry.yearIndex,
              semester: entry.semester,
              position: entry.position,
              course: { code: entry.courseCode },
            },
          ],
        },
      ],
    );

    expect(result).toEqual([
      {
        academicYearId: "year-1",
        programId: "program-1",
        approvedRevision: 3,
        snapshot: {
          present: true,
          valid: true,
          count: 1,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        relational: {
          present: true,
          valid: true,
          count: 1,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        matches: true,
      },
    ]);
    expect(result[0]?.snapshot.sha256).toBe(result[0]?.relational.sha256);
  });

  it("never treats a legacy approved snapshot with no curriculum as equal", () => {
    const result = compareApprovedCurriculumMaps(
      [
        {
          academicYearId: "year-1",
          revision: 1,
          approvedAt,
          programConfigurations: [{ programId: "program-1" }],
        },
      ],
      [
        {
          academicYearId: "year-1",
          programId: "program-1",
          entries: [],
        },
      ],
    );

    expect(result[0]).toMatchObject({
      snapshot: { present: false, valid: false, count: 0, sha256: null },
      relational: { present: true, valid: true, count: 0 },
      matches: false,
    });
  });

  it("reports count/hash drift and uses only the latest approved revision", () => {
    const result = compareApprovedCurriculumMaps(
      [
        {
          academicYearId: "year-1",
          revision: 1,
          approvedAt: new Date("2026-01-01T00:00:00.000Z"),
          programConfigurations: [{ programId: "program-1", curriculum: [] }],
        },
        {
          academicYearId: "year-1",
          revision: 2,
          approvedAt,
          programConfigurations: [
            { programId: "program-1", curriculum: [entry] },
          ],
        },
      ],
      [
        {
          academicYearId: "year-1",
          programId: "program-1",
          entries: [],
        },
      ],
    );

    expect(result[0]).toMatchObject({
      approvedRevision: 2,
      snapshot: { count: 1 },
      relational: { count: 0 },
      matches: false,
    });
    expect(result[0]?.snapshot.sha256).not.toBe(result[0]?.relational.sha256);
  });

  it("treats a null approval timestamp as older than a dated approval", () => {
    const result = compareApprovedCurriculumMaps(
      [
        {
          academicYearId: "year-1",
          revision: 99,
          approvedAt: null,
          programConfigurations: [{ programId: "program-1", curriculum: [] }],
        },
        {
          academicYearId: "year-1",
          revision: 2,
          approvedAt,
          programConfigurations: [
            { programId: "program-1", curriculum: [entry] },
          ],
        },
      ],
      [],
    );

    expect(result[0]).toMatchObject({
      approvedRevision: 2,
      snapshot: { count: 1 },
    });
  });

  it("marks duplicate codes, non-contiguous positions, and out-of-range years invalid", () => {
    const result = compareApprovedCurriculumMaps(
      [
        {
          academicYearId: "year-1",
          revision: 3,
          approvedAt,
          programConfigurations: [
            {
              programId: "program-1",
              curriculum: [
                entry,
                {
                  ...entry,
                  courseId: "course-2",
                  courseCode: "csc 101",
                  position: 2,
                },
                {
                  ...entry,
                  courseId: "course-3",
                  courseCode: "CSC 103",
                  yearIndex: 9,
                  position: 3,
                },
              ],
            },
          ],
        },
      ],
      [
        {
          academicYearId: "year-1",
          programId: "program-1",
          entries: [
            {
              courseId: "course-1",
              yearIndex: 1,
              semester: "Fall",
              position: 0,
              course: { code: "CSC 101" },
            },
            {
              courseId: "course-2",
              yearIndex: 1,
              semester: "Spring",
              position: 1,
              course: { code: "csc 101" },
            },
          ],
        },
      ],
    );

    expect(result[0]).toMatchObject({
      snapshot: { valid: false, sha256: null },
      relational: { valid: false, sha256: null },
      matches: false,
    });
  });
});

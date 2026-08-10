import { describe, expect, it } from "vitest";
import {
  bestPointsByCourse,
  summarizeTranscriptRows,
  type TranscriptCalculationRow,
} from "./transcript-calculation.js";

const row = (
  overrides: Partial<TranscriptCalculationRow>,
): TranscriptCalculationRow => ({
  courseId: "course-1",
  courseCode: "CS 1000",
  credits: 6,
  earnedCredits: 6,
  gradePoints: 4,
  countsTowardGpa: true,
  countsTowardCredits: true,
  ...overrides,
});

describe("summarizeTranscriptRows", () => {
  it("counts every retake in GPA but awards course credit once", () => {
    expect(
      summarizeTranscriptRows([
        row({ gradePoints: 0, earnedCredits: 0 }),
        row({ gradePoints: 4 }),
      ]),
    ).toEqual({
      gpa: 2,
      attemptedCredits: 12,
      completedCredits: 6,
      qualityPoints: 24,
    });
  });

  it("excludes incomplete marks and gives pass marks credit without GPA", () => {
    const summary = summarizeTranscriptRows([
      row({
        courseId: "incomplete",
        courseCode: "CS 2000",
        gradePoints: null,
        earnedCredits: 0,
        countsTowardGpa: false,
        countsTowardCredits: false,
      }),
      row({
        courseId: "pass",
        courseCode: "CS 3000",
        gradePoints: null,
        countsTowardGpa: false,
      }),
    ]);
    expect(summary).toEqual({
      gpa: 0,
      attemptedCredits: 0,
      completedCredits: 6,
      qualityPoints: 0,
    });
  });

  it("applies the standard I/P/F policy to GPA and earned credits", () => {
    expect(
      summarizeTranscriptRows([
        row({
          courseId: "incomplete",
          courseCode: "CS 2000",
          gradePoints: null,
          earnedCredits: 0,
          countsTowardGpa: false,
          countsTowardCredits: false,
        }),
        row({
          courseId: "pass",
          courseCode: "CS 3000",
          gradePoints: null,
          countsTowardGpa: false,
          countsTowardCredits: true,
        }),
        row({
          courseId: "fail",
          courseCode: "CS 4000",
          gradePoints: 0,
          earnedCredits: 0,
          countsTowardGpa: true,
          countsTowardCredits: false,
        }),
      ]),
    ).toEqual({
      gpa: 0,
      attemptedCredits: 6,
      completedCredits: 6,
      qualityPoints: 0,
    });
  });
});

describe("bestPointsByCourse", () => {
  it("uses the strongest credit-bearing linked attempt", () => {
    const result = bestPointsByCourse([
      row({ gradePoints: 2 }),
      row({ gradePoints: 3.7 }),
      row({ courseId: null, gradePoints: 4 }),
    ]);
    expect(result.get("course-1")).toBe(3.7);
    expect(result.size).toBe(1);
  });

  it("retains a credit-bearing pass without inventing numeric grade points", () => {
    const result = bestPointsByCourse([
      row({
        courseId: "pass-course",
        gradePoints: null,
        countsTowardGpa: false,
        countsTowardCredits: true,
      }),
    ]);
    expect(result.has("pass-course")).toBe(true);
    expect(result.get("pass-course")).toBeNull();
  });
});

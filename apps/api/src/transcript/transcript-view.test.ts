import { describe, expect, it } from "vitest";
import type { TranscriptStudentIdentity } from "@mydaust/shared";
import {
  buildTranscriptView,
  type TranscriptLedgerRow,
} from "./transcript-view.js";

const student: TranscriptStudentIdentity = {
  id: "student-1",
  studentNo: "DAUST-001",
  name: "Aissatou Diallo",
  email: "aissatou@daust.edu",
  program: { code: "BSCS", name: "Computer Science", degree: "B.Sc." },
};

function row(
  id: string,
  overrides: Partial<TranscriptLedgerRow>,
): TranscriptLedgerRow {
  return {
    id,
    courseId: `course-${id}`,
    termId: "term-fall",
    courseCode: "CS 1000",
    title: "Computing",
    term: "Fall 2025",
    termSortKey: "2025-08-20:Fall 2025",
    grade: "A",
    credits: 6,
    earnedCredits: 6,
    points: 4,
    countsTowardGpa: true,
    countsTowardCredits: true,
    requirementCategory: "Computer Science",
    source: "approved_enrollment",
    ...overrides,
  };
}

describe("buildTranscriptView", () => {
  it("groups A/F/I/P work, counts retakes once for earned credit and orders semesters", () => {
    const view = buildTranscriptView(student, [
      row("fail-retake", {
        courseId: "course-cs1000",
        termId: "term-spring",
        term: "Spring 2026",
        termSortKey: "2026-01-10:Spring 2026",
        grade: "F",
        points: 0,
        earnedCredits: 0,
        countsTowardCredits: false,
      }),
      row("pass", {
        courseId: "course-humanities",
        courseCode: "HSS 1000",
        termId: "term-fall",
        grade: "P",
        credits: 3,
        earnedCredits: 3,
        points: null,
        countsTowardGpa: false,
      }),
      row("incomplete", {
        courseId: "course-math",
        courseCode: "MATH 2000",
        termId: "term-spring",
        term: "Spring 2026",
        termSortKey: "2026-01-10:Spring 2026",
        grade: "I",
        credits: 4,
        earnedCredits: 0,
        points: null,
        countsTowardGpa: false,
        countsTowardCredits: false,
      }),
      row("first-attempt", {
        courseId: "course-cs1000",
      }),
    ]);

    expect(view.semesters.map((semester) => semester.label)).toEqual([
      "Fall 2025",
      "Spring 2026",
    ]);
    expect(view.semesters[0]).toMatchObject({
      attemptedCredits: 9,
      gpaCredits: 6,
      earnedCredits: 9,
      qualityPoints: 24,
      gpa: 4,
    });
    expect(view.semesters[1]).toMatchObject({
      attemptedCredits: 10,
      gpaCredits: 6,
      earnedCredits: 0,
      qualityPoints: 0,
      gpa: 0,
    });
    expect(view.totals).toEqual({
      attemptedCredits: 19,
      gpaCredits: 12,
      earnedCredits: 9,
      qualityPoints: 24,
      gpa: 2,
    });
  });

  it("returns null instead of 0.00 for a non-GPA semester", () => {
    const view = buildTranscriptView(student, [
      row("pass", {
        termId: "term-summer",
        term: "Summer 2026",
        termSortKey: "2026-06-01:Summer 2026",
        grade: "P",
        points: null,
        countsTowardGpa: false,
      }),
      row("incomplete", {
        termId: "term-summer",
        term: "Summer 2026",
        termSortKey: "2026-06-01:Summer 2026",
        grade: "I",
        points: null,
        earnedCredits: 0,
        countsTowardGpa: false,
        countsTowardCredits: false,
      }),
    ]);

    expect(view.semesters[0]?.gpa).toBeNull();
    expect(view.totals.gpa).toBeNull();
  });

  it("rounds GPA to two decimals using ledger quality points", () => {
    const view = buildTranscriptView(student, [
      row("a", { credits: 3, earnedCredits: 3, points: 4 }),
      row("b", {
        courseId: "course-b",
        courseCode: "CS 2000",
        credits: 6,
        earnedCredits: 6,
        points: 3.5,
        grade: "B+",
      }),
    ]);

    expect(view.totals.gpa).toBe(3.67);
  });
});

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type {
  TranscriptPdfGeneration,
  TranscriptView,
  TranscriptViewEntry,
} from "@mydaust/shared";
import {
  paginateTranscript,
  renderTranscriptPdf,
  transcriptWatermark,
  UnsupportedTranscriptCharacterError,
} from "./transcript-pdf.js";

function entry(index: number): TranscriptViewEntry {
  return {
    id: `entry-${index}`,
    courseId: `course-${index}`,
    termId: "term-1",
    courseCode: `CS ${1000 + index}`,
    title: `Representative course title ${index}`,
    term: "Fall 2026",
    termSortKey: "2026-08-20:Fall 2026",
    grade: index % 8 === 0 ? "I" : "A",
    credits: 6,
    earnedCredits: index % 8 === 0 ? 0 : 6,
    points: index % 8 === 0 ? null : 4,
    countsTowardGpa: index % 8 !== 0,
    countsTowardCredits: index % 8 !== 0,
    requirementCategory: "Computer Science",
    source: "approved_enrollment",
  };
}

function view(count = 42): TranscriptView {
  const entries = Array.from({ length: count }, (_, index) => entry(index));
  return {
    student: {
      id: "student-1",
      studentNo: "DAUST-001",
      name: "Aissatou Diallo",
      email: "aissatou@daust.edu",
      program: {
        code: "BSCS",
        name: "Computer Science",
        degree: "B.Sc.",
      },
    },
    totals: {
      attemptedCredits: count * 6,
      gpaCredits: (count - Math.ceil(count / 8)) * 6,
      earnedCredits: (count - Math.ceil(count / 8)) * 6,
      qualityPoints: (count - Math.ceil(count / 8)) * 24,
      gpa: 4,
    },
    academicProgress: {
      earnedCredits: (count - Math.ceil(count / 8)) * 6,
      requiredCredits: 132,
      inProgressCredits: 6,
      level: {
        code: "S5",
        name: "Semester 5",
        minimumCredits: 121,
        creditCeiling: 150,
      },
      maximumLevel: {
        code: "S5",
        name: "Semester 5",
        minimumCredits: 121,
        creditCeiling: 150,
      },
      catalog: {
        academicYearId: "year-1",
        label: "2026–2027",
        revision: 1,
        fallback: false,
      },
    },
    academicStanding: {
      code: "deans_list",
      label: "Dean's List",
      tone: "honor",
      source: "computed",
      catalog: {
        academicYearId: "year-1",
        label: "2026–2027",
        revision: 1,
        fallback: false,
      },
      override: null,
    },
    inProgressCourses: [
      {
        enrollmentId: "enrollment-current",
        courseCode: "CS 4999",
        title: "Capstone in progress",
        credits: 6,
        term: "Fall 2026",
        sectionCode: "A",
      },
    ],
    semesters: [
      {
        termId: "term-1",
        label: "Fall 2026",
        sortKey: "2026-08-20:Fall 2026",
        attemptedCredits: count * 6,
        gpaCredits: (count - Math.ceil(count / 8)) * 6,
        earnedCredits: (count - Math.ceil(count / 8)) * 6,
        qualityPoints: (count - Math.ceil(count / 8)) * 24,
        gpa: 4,
        entries,
      },
    ],
  };
}

function generation(kind: "student" | "staff"): TranscriptPdfGeneration {
  return {
    generationId: "976b8434-5e3f-4c4e-b3ab-b83136e4483f",
    generatedAt: "2026-08-11T09:30:00.000Z",
    generatedAtDakar: "11 Aug 2026, 09:30:00 GMT",
    generator: {
      personId: "person-1",
      name: kind === "student" ? "Aissatou Diallo" : "Registrar User",
      email: kind === "student" ? "aissatou@daust.edu" : "registrar@daust.edu",
      role: kind === "student" ? "student" : "registrar",
      kind,
    },
  };
}

describe("transcript PDF", () => {
  it("paginates long records and plans the student watermark on every page", () => {
    const pages = paginateTranscript(view(), generation("student"));

    expect(pages.length).toBeGreaterThan(1);
    expect(
      pages.every(
        (page) => page.watermark === "UNOFFICIAL · STUDENT-GENERATED",
      ),
    ).toBe(true);
    expect(
      pages.flatMap((page) => page.fragments).flatMap((part) => part.entries),
    ).toHaveLength(42);
  });

  it("renders a valid multi-page document with stable provenance metadata", async () => {
    const unicodeView = view();
    unicodeView.student.name = "Aïssatou Bâ ŋ Ł";
    unicodeView.semesters[0]!.entries[0]!.title =
      "Systèmes numériques et réseaux";
    const rendered = await renderTranscriptPdf(
      unicodeView,
      generation("staff"),
    );
    const parsed = await PDFDocument.load(rendered.bytes);

    expect(parsed.getPageCount()).toBe(rendered.pageCount);
    expect(rendered.pageCount).toBeGreaterThan(1);
    expect(rendered.watermark).toBe("UNOFFICIAL · STAFF-GENERATED");
    expect(parsed.getTitle()).toBe("Unofficial transcript - DAUST-001");
    expect(parsed.getSubject()).toContain("UNOFFICIAL · STAFF-GENERATED");
    expect(parsed.getCreator()).toBe("myDAUST");
  });

  it("fails explicitly instead of silently replacing an unsupported script", async () => {
    const unsupported = view(1);
    unsupported.student.name = "محمد ديوب";

    await expect(
      renderTranscriptPdf(unsupported, generation("student")),
    ).rejects.toBeInstanceOf(UnsupportedTranscriptCharacterError);
  });

  it("uses actor-specific watermarks", () => {
    expect(transcriptWatermark("student")).toContain("STUDENT-GENERATED");
    expect(transcriptWatermark("staff")).toContain("STAFF-GENERATED");
  });
});

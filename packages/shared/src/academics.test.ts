import { describe, expect, it } from "vitest";
import { MarkAttendanceInput, SubmitAssignmentInput, SubmitGradesInput } from "./academics.js";

describe("SubmitAssignmentInput", () => {
  it("rejects an empty submission (neither text nor file)", () => {
    expect(SubmitAssignmentInput.safeParse({}).success).toBe(false);
    expect(SubmitAssignmentInput.safeParse({ text: "   " }).success).toBe(false);
  });

  it("accepts text-only and file-only submissions", () => {
    expect(SubmitAssignmentInput.safeParse({ text: "my answer" }).success).toBe(true);
    expect(SubmitAssignmentInput.safeParse({ fileUrl: "/uploads/x.pdf", fileName: "x.pdf" }).success).toBe(true);
  });
});

describe("SubmitGradesInput", () => {
  it("rejects grades outside the letter scale", () => {
    const bad = { grades: [{ enrollmentId: "0b7f4e9e-1111-4111-8111-000000000001", grade: "Z" }] };
    expect(SubmitGradesInput.safeParse(bad).success).toBe(false);
  });

  it("defaults finalize to false", () => {
    const parsed = SubmitGradesInput.parse({
      grades: [{ enrollmentId: "0b7f4e9e-1111-4111-8111-000000000001", grade: "A-" }],
    });
    expect(parsed.finalize).toBe(false);
  });
});

describe("MarkAttendanceInput", () => {
  it("rejects a malformed date and an unknown status", () => {
    expect(MarkAttendanceInput.safeParse({ date: "not-a-date", records: [] }).success).toBe(false);
    expect(
      MarkAttendanceInput.safeParse({
        date: "2026-09-08",
        records: [{ enrollmentId: "0b7f4e9e-1111-4111-8111-000000000001", status: "vanished" }],
      }).success,
    ).toBe(false);
  });
});

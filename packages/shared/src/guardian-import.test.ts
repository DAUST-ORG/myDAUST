import { describe, expect, it } from "vitest";
import { planGuardianImport } from "./guardian-import.js";

const students = [
  { id: "s1", studentNo: "F001", name: "Mame Yacine Cissé" },
  { id: "s2", studentNo: "F002", name: "Abdallah Ndiaye" },
];

describe("planGuardianImport", () => {
  it("matches names exactly after case and accent normalization", () => {
    const plan = planGuardianImport(
      [
        {
          rowNumber: 2,
          name: "Fatou Cisse",
          phone: "+221770000000",
          email: "FATOU@EXAMPLE.COM",
          address: "Dakar",
          studentName: "mame yacine cisse",
        },
      ],
      students,
    );

    expect(plan.guardians).toHaveLength(1);
    expect(plan.guardians[0]).toMatchObject({
      email: "fatou@example.com",
      students: [{ id: "s1", studentNo: "F001" }],
    });
    expect(plan.issues).toEqual([]);
  });

  it("collapses a repeated guardian email into one account with several children", () => {
    const plan = planGuardianImport(
      [
        {
          rowNumber: 2,
          name: "Parent One",
          phone: "77 000 00 00",
          email: "parent@example.com",
          address: "Dakar",
          studentName: "Mame Yacine Cissé",
        },
        {
          rowNumber: 3,
          name: "Parent One",
          phone: "77 000 00 00",
          email: "parent@example.com",
          address: "Dakar",
          studentName: "Abdallah Ndiaye",
        },
      ],
      students,
    );

    expect(plan.guardians).toHaveLength(1);
    expect(plan.guardians[0]!.students.map((student) => student.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(plan.plannedLinks).toBe(2);
  });

  it("does not guess when a student is missing or ambiguous", () => {
    const plan = planGuardianImport(
      [
        {
          rowNumber: 2,
          name: "Parent One",
          phone: "",
          email: "one@example.com",
          address: "",
          studentName: "Unknown Student",
        },
        {
          rowNumber: 3,
          name: "Parent Two",
          phone: "",
          email: "two@example.com",
          address: "",
          studentName: "Abdallah Ndiaye",
        },
      ],
      [...students, { id: "s3", studentNo: "F003", name: "Abdallah Ndiaye" }],
    );

    expect(plan.guardians).toEqual([]);
    expect(plan.issues.map((issue) => issue.code)).toEqual([
      "student_not_found",
      "ambiguous_student",
    ]);
  });
});

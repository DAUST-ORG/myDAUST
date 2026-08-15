import { describe, expect, it } from "vitest";
import { classifyAcceptedApplicant } from "./accepted-applicant-reconciliation.js";

const dob = new Date("2005-04-03T00:00:00.000Z");
const candidate = {
  studentId: "student-1",
  studentNo: "S202631AD",
  recordStatus: "active" as const,
  personEmail: "student@mydaust.com",
  personalEmail: "applicant@example.com",
  dateOfBirth: dob,
  programCode: "BSCE",
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    applicantId: "applicant-1",
    name: "Awa Diop",
    email: "Applicant@Example.com",
    dateOfBirth: dob,
    programCode: "BSCE",
    linkedStudentId: null,
    onboardingStatus: "not_started" as const,
    candidates: [candidate],
    ...overrides,
  };
}

describe("classifyAcceptedApplicant", () => {
  it("proposes only an exact email and date-of-birth candidate", () => {
    expect(classifyAcceptedApplicant(input())).toMatchObject({
      disposition: "exact_candidate",
      candidateStudentId: "student-1",
      candidateStudentNo: "S202631AD",
    });
  });

  it("blocks missing identity evidence and conflicting dates", () => {
    expect(
      classifyAcceptedApplicant(input({ dateOfBirth: null })),
    ).toMatchObject({ disposition: "blocked_missing_date_of_birth" });
    expect(
      classifyAcceptedApplicant(
        input({
          candidates: [
            { ...candidate, dateOfBirth: new Date("2004-04-03T00:00:00Z") },
          ],
        }),
      ),
    ).toMatchObject({ disposition: "identity_conflict" });
  });

  it("never guesses when the email matches more than one student", () => {
    expect(
      classifyAcceptedApplicant(
        input({
          candidates: [
            candidate,
            { ...candidate, studentId: "student-2", studentNo: "S202632AD" },
          ],
        }),
      ),
    ).toMatchObject({ disposition: "ambiguous", candidateStudentId: null });
  });
});

export type AcceptedApplicantReviewCandidate = {
  studentId: string;
  studentNo: string;
  recordStatus: "pending_payment" | "active" | "archived";
  personEmail: string;
  personalEmail: string | null;
  dateOfBirth: Date | null;
  programCode: string | null;
};

export type AcceptedApplicantReviewInput = {
  applicantId: string;
  name: string;
  email: string;
  dateOfBirth: Date | null;
  programCode: string | null;
  linkedStudentId: string | null;
  onboardingStatus:
    "not_started" | "payment_pending" | "enrolled" | "cancelled";
  candidates: AcceptedApplicantReviewCandidate[];
};

export type AcceptedApplicantReviewResult = {
  applicantId: string;
  name: string;
  email: string;
  disposition:
    | "already_linked"
    | "exact_candidate"
    | "blocked_missing_date_of_birth"
    | "unmatched"
    | "ambiguous"
    | "identity_conflict";
  candidateStudentNo: string | null;
  candidateStudentId: string | null;
  reasons: string[];
};

function normalizedEmail(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Classify one accepted applicant without fuzzy identity inference. This helper
 * is intentionally read-only: a human must review the report before any legacy
 * record is linked or provisioned through the normal acceptance workflow.
 */
export function classifyAcceptedApplicant(
  input: AcceptedApplicantReviewInput,
): AcceptedApplicantReviewResult {
  const base = {
    applicantId: input.applicantId,
    name: input.name,
    email: input.email,
  };
  if (input.linkedStudentId) {
    return {
      ...base,
      disposition: "already_linked",
      candidateStudentId: input.linkedStudentId,
      candidateStudentNo: null,
      reasons: [`Onboarding status is ${input.onboardingStatus}.`],
    };
  }
  if (!input.dateOfBirth) {
    return {
      ...base,
      disposition: "blocked_missing_date_of_birth",
      candidateStudentId: null,
      candidateStudentNo: null,
      reasons: [
        "The applicant has no date of birth, which is required for payment lookup and exact identity review.",
      ],
    };
  }

  const applicantEmail = normalizedEmail(input.email);
  const emailMatches = input.candidates.filter((candidate) => {
    const emails = [
      normalizedEmail(candidate.personEmail),
      normalizedEmail(candidate.personalEmail),
    ];
    return applicantEmail !== null && emails.includes(applicantEmail);
  });
  if (emailMatches.length === 0) {
    return {
      ...base,
      disposition: "unmatched",
      candidateStudentId: null,
      candidateStudentNo: null,
      reasons: ["No Student record has the same login or personal email."],
    };
  }
  if (emailMatches.length > 1) {
    return {
      ...base,
      disposition: "ambiguous",
      candidateStudentId: null,
      candidateStudentNo: null,
      reasons: [
        `The email matches ${emailMatches.length} Student records; no candidate was selected.`,
      ],
    };
  }

  const candidate = emailMatches[0]!;
  const conflicts: string[] = [];
  if (
    !candidate.dateOfBirth ||
    dateOnly(candidate.dateOfBirth) !== dateOnly(input.dateOfBirth)
  ) {
    conflicts.push("The Student date of birth is missing or does not match.");
  }
  if (
    input.programCode &&
    candidate.programCode &&
    input.programCode !== candidate.programCode
  ) {
    conflicts.push(
      `Program mismatch: applicant ${input.programCode}, Student ${candidate.programCode}.`,
    );
  }
  if (conflicts.length > 0) {
    return {
      ...base,
      disposition: "identity_conflict",
      candidateStudentId: candidate.studentId,
      candidateStudentNo: candidate.studentNo,
      reasons: conflicts,
    };
  }

  return {
    ...base,
    disposition: "exact_candidate",
    candidateStudentId: candidate.studentId,
    candidateStudentNo: candidate.studentNo,
    reasons: [
      "Login/personal email and date of birth match exactly.",
      input.programCode && candidate.programCode
        ? "Program code also matches."
        : "Program comparison was unavailable and must be reviewed.",
      `Student record status is ${candidate.recordStatus}.`,
    ],
  };
}

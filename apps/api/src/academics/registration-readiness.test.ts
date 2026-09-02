import { describe, expect, it } from "vitest";
import {
  inspectApprovedCurriculumCreditIntegrity,
  inspectApprovedCurriculumSnapshots,
  registrationReadinessRunStateChanged,
  summarizeRegistrationReadiness,
} from "./registration-readiness.js";

describe("summarizeRegistrationReadiness", () => {
  it("blocks a mixed-state audit and tells the operator to rerun", () => {
    const result = summarizeRegistrationReadiness({
      configuration: {
        state: "valid",
        mode: "configured",
        termId: "term-1",
        recommendationsEnabled: true,
      },
      targetTermAvailable: true,
      targetTermExists: true,
      targetTermMapped: true,
      targetSectionCount: 1,
      activeStudentCount: 0,
      auditedStudents: [],
      failedStudentCount: 0,
      unlinkedTranscriptEntryCount: 0,
      activeStudentUnlinkedTranscriptEntryCount: 0,
      duplicateCurriculumEntryCount: 0,
      duplicateCurriculumCourseCodeCount: 0,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 0,
      curriculumYearBeyondConfiguredPlanCount: 0,
      unknownCurriculumCourseIdCount: 0,
      curriculumCourseCodeMismatchCount: 0,
      curriculumCreditTotalMismatchCount: 0,
      curriculumMapComparisons: [],
      runStateStable: false,
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual([
      expect.objectContaining({ code: "audit_state_changed" }),
    ]);
  });

  it("fails readiness when the setting is absent even though legacy reads still work", () => {
    const result = summarizeRegistrationReadiness({
      configuration: {
        state: "absent",
        mode: "legacy",
        termId: null,
        recommendationsEnabled: false,
      },
      targetTermAvailable: true,
      targetTermExists: true,
      targetTermMapped: true,
      targetSectionCount: 4,
      activeStudentCount: 1,
      auditedStudents: [
        {
          registrationOpen: true,
          recommendationStatus: "disabled",
          recommendationCount: 0,
          recommendationAvailabilities: [],
          unofferedRecommendationCount: 0,
        },
      ],
      failedStudentCount: 0,
      unlinkedTranscriptEntryCount: 0,
      activeStudentUnlinkedTranscriptEntryCount: 0,
      duplicateCurriculumEntryCount: 0,
      duplicateCurriculumCourseCodeCount: 0,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 0,
      curriculumYearBeyondConfiguredPlanCount: 0,
      unknownCurriculumCourseIdCount: 0,
      curriculumCourseCodeMismatchCount: 0,
      curriculumCreditTotalMismatchCount: 0,
      curriculumMapComparisons: [],
    });

    expect(result.ready).toBe(false);
    expect(result.checks.map((check) => check.code)).toEqual([
      "configuration_absent",
      "recommendations_disabled",
    ]);
  });

  it("allows an intentional closure without describing it as corrupt data", () => {
    const result = summarizeRegistrationReadiness({
      configuration: {
        state: "valid",
        mode: "configured",
        termId: null,
        recommendationsEnabled: false,
      },
      targetTermAvailable: false,
      targetTermExists: false,
      targetTermMapped: false,
      targetSectionCount: 0,
      activeStudentCount: 0,
      auditedStudents: [],
      failedStudentCount: 0,
      unlinkedTranscriptEntryCount: 0,
      activeStudentUnlinkedTranscriptEntryCount: 0,
      duplicateCurriculumEntryCount: 0,
      duplicateCurriculumCourseCodeCount: 0,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 0,
      curriculumYearBeyondConfiguredPlanCount: 0,
      unknownCurriculumCourseIdCount: 0,
      curriculumCourseCodeMismatchCount: 0,
      curriculumCreditTotalMismatchCount: 0,
      curriculumMapComparisons: [],
    });

    expect(result.ready).toBe(true);
    expect(result.checks).toEqual([
      expect.objectContaining({
        code: "registration_closed",
        severity: "warning",
      }),
      expect.objectContaining({
        code: "recommendations_disabled",
        severity: "warning",
      }),
    ]);
  });

  it("checks target-term mapping even when there are no active students", () => {
    const result = summarizeRegistrationReadiness({
      configuration: {
        state: "valid",
        mode: "configured",
        termId: "11111111-1111-4111-8111-111111111111",
        recommendationsEnabled: false,
      },
      targetTermAvailable: true,
      targetTermExists: true,
      targetTermMapped: false,
      targetSectionCount: 1,
      activeStudentCount: 0,
      auditedStudents: [],
      failedStudentCount: 0,
      unlinkedTranscriptEntryCount: 0,
      activeStudentUnlinkedTranscriptEntryCount: 0,
      duplicateCurriculumEntryCount: 0,
      duplicateCurriculumCourseCodeCount: 0,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 0,
      curriculumYearBeyondConfiguredPlanCount: 0,
      unknownCurriculumCourseIdCount: 0,
      curriculumCourseCodeMismatchCount: 0,
      curriculumCreditTotalMismatchCount: 0,
      curriculumMapComparisons: [],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "target_term_unmapped",
          severity: "blocker",
        }),
      ]),
    );
  });

  it("blocks on every non-void unlinked transcript row, not only active students", () => {
    const result = summarizeRegistrationReadiness({
      configuration: {
        state: "valid",
        mode: "configured",
        termId: null,
        recommendationsEnabled: false,
      },
      targetTermAvailable: false,
      targetTermExists: false,
      targetTermMapped: false,
      targetSectionCount: 0,
      activeStudentCount: 0,
      auditedStudents: [],
      failedStudentCount: 0,
      unlinkedTranscriptEntryCount: 2,
      activeStudentUnlinkedTranscriptEntryCount: 0,
      duplicateCurriculumEntryCount: 0,
      duplicateCurriculumCourseCodeCount: 0,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 0,
      curriculumYearBeyondConfiguredPlanCount: 0,
      unknownCurriculumCourseIdCount: 0,
      curriculumCourseCodeMismatchCount: 0,
      curriculumCreditTotalMismatchCount: 0,
      curriculumMapComparisons: [],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unlinked_transcript_entries",
          count: 2,
        }),
      ]),
    );
  });

  it("aggregates non-ready contexts, unavailable advice, and transcript blockers", () => {
    const result = summarizeRegistrationReadiness({
      configuration: {
        state: "valid",
        mode: "configured",
        termId: "11111111-1111-4111-8111-111111111111",
        recommendationsEnabled: true,
      },
      targetTermAvailable: true,
      targetTermExists: true,
      targetTermMapped: true,
      targetSectionCount: 2,
      activeStudentCount: 2,
      auditedStudents: [
        {
          registrationOpen: true,
          recommendationStatus: "ready",
          recommendationCount: 2,
          recommendationAvailabilities: ["available", "not_offered"],
          unofferedRecommendationCount: 1,
        },
        {
          registrationOpen: true,
          recommendationStatus: "missing_curriculum",
          recommendationCount: 0,
          recommendationAvailabilities: [],
          unofferedRecommendationCount: 0,
        },
      ],
      failedStudentCount: 0,
      unlinkedTranscriptEntryCount: 3,
      activeStudentUnlinkedTranscriptEntryCount: 2,
      duplicateCurriculumEntryCount: 0,
      duplicateCurriculumCourseCodeCount: 0,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 0,
      curriculumYearBeyondConfiguredPlanCount: 0,
      unknownCurriculumCourseIdCount: 0,
      curriculumCourseCodeMismatchCount: 0,
      curriculumCreditTotalMismatchCount: 0,
      curriculumMapComparisons: [
        {
          academicYearId: "year-1",
          programId: "program-1",
          approvedRevision: 2,
          snapshot: {
            present: true,
            valid: true,
            count: 1,
            sha256: "snapshot",
          },
          relational: {
            present: true,
            valid: true,
            count: 0,
            sha256: "relational",
          },
          matches: false,
        },
      ],
    });

    expect(result).toMatchObject({
      ready: false,
      activeStudentCount: 2,
      recommendationCount: 2,
      recommendationStatusCounts: { ready: 1, missing_curriculum: 1 },
      recommendationAvailabilityCounts: { available: 1, not_offered: 1 },
    });
    expect(result.checks.map((check) => check.code)).toEqual([
      "curriculum_map_mismatch",
      "student_context_not_ready",
      "unlinked_transcript_entries",
      "planned_course_not_offered",
    ]);
  });
});

describe("registrationReadinessRunStateChanged", () => {
  const runState = () => ({
    configuration: {
      state: "valid" as const,
      mode: "configured" as const,
      termId: "term-1",
      recommendationsEnabled: true,
    },
    targetTerm: {
      id: "term-1",
      name: "Fall 2029",
      status: "planning",
      semester: "Fall",
      academicYearId: "year-1",
      startDate: new Date("2029-09-01T00:00:00.000Z"),
      endDate: new Date("2029-12-20T00:00:00.000Z"),
      addDeadline: null,
      dropDeadline: null,
    },
    targetSectionCount: 2,
    approvedRevisions: [
      { id: "revision-1", updatedAt: new Date("2029-05-01T00:00:00.000Z") },
    ],
  });

  it("ignores revision ordering but detects configuration or version drift", () => {
    const before = runState();
    expect(registrationReadinessRunStateChanged(before, runState())).toBe(
      false,
    );
    expect(
      registrationReadinessRunStateChanged(before, {
        ...runState(),
        targetSectionCount: 3,
      }),
    ).toBe(true);
    expect(
      registrationReadinessRunStateChanged(before, {
        ...runState(),
        approvedRevisions: [
          {
            id: "revision-1",
            updatedAt: new Date("2029-05-02T00:00:00.000Z"),
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("inspectApprovedCurriculumSnapshots", () => {
  it("counts duplicate course ids and malformed approved snapshot data without exposing rows", () => {
    expect(
      inspectApprovedCurriculumSnapshots([
        {
          defaultLevels: [{}, {}, {}, {}],
          programConfigurations: [
            {
              programId: "program-1",
              curriculum: [
                {
                  courseId: "course-1",
                  courseCode: "CSC 101",
                  yearIndex: 1,
                  semester: "Fall",
                  position: 0,
                },
                {
                  courseId: "course-1",
                  courseCode: "CSC 101",
                  yearIndex: 1,
                  semester: "Fall",
                  position: 1,
                },
                { courseCode: "MISSING-ID" },
              ],
            },
          ],
        },
        {
          defaultLevels: [{}, {}, {}, {}],
          programConfigurations: "not-an-array",
        },
      ]),
    ).toEqual({
      approvedRevisionCount: 2,
      duplicateCurriculumEntryCount: 1,
      duplicateCurriculumCourseCodeCount: 1,
      invalidCurriculumPositionCount: 0,
      malformedCurriculumSnapshotCount: 2,
      curriculumYearBeyondConfiguredPlanCount: 0,
    });
  });

  it("separately detects configured-plan overflow within the global maximum", () => {
    expect(
      inspectApprovedCurriculumSnapshots([
        {
          defaultLevels: [{}, {}],
          programConfigurations: [
            { programId: "legacy-program" },
            {
              programId: "program-2",
              curriculum: [
                {
                  courseId: "course-2",
                  courseCode: "CSC 999",
                  yearIndex: 2,
                  semester: "Fall",
                  position: 0,
                },
              ],
            },
          ],
        },
      ]),
    ).toMatchObject({
      malformedCurriculumSnapshotCount: 1,
      curriculumYearBeyondConfiguredPlanCount: 1,
    });
  });
});

describe("inspectApprovedCurriculumCreditIntegrity", () => {
  it("reports unknown ids, code drift, and requirement-total drift without row data", () => {
    const result = inspectApprovedCurriculumCreditIntegrity(
      [
        {
          academicYearId: "year-1",
          revision: 2,
          approvedAt: new Date("2026-08-01T00:00:00.000Z"),
          programConfigurations: [
            {
              programId: "program-1",
              requirements: [{ category: "Degree", requiredCredits: 3 }],
              curriculum: [{ courseId: "course-1", courseCode: "OLD 101" }],
            },
            {
              programId: "program-2",
              requirements: [{ category: "Degree", requiredCredits: 3 }],
              curriculum: [
                { courseId: "missing-course", courseCode: "CSC 102" },
              ],
            },
          ],
        },
      ],
      [{ id: "course-1", code: "CSC 101", credits: 4 }],
    );

    expect(result).toEqual({
      approvedProgramCount: 2,
      unknownCurriculumCourseIdCount: 1,
      curriculumCourseCodeMismatchCount: 1,
      curriculumCreditTotalMismatchCount: 2,
    });
  });

  it("treats malformed requirement totals as a credit-integrity mismatch", () => {
    expect(
      inspectApprovedCurriculumCreditIntegrity(
        [
          {
            academicYearId: "year-1",
            revision: 1,
            approvedAt: null,
            programConfigurations: [
              {
                programId: "program-1",
                requirements: [{ category: "Degree", requiredCredits: 0 }],
                curriculum: [{ courseId: "course-1", courseCode: "CSC 101" }],
              },
            ],
          },
        ],
        [{ id: "course-1", code: "CSC 101", credits: 3 }],
      ),
    ).toMatchObject({
      approvedProgramCount: 1,
      curriculumCreditTotalMismatchCount: 1,
    });
  });
});

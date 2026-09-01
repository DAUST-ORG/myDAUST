import { describe, expect, it, vi } from "vitest";
import {
  buildWorkbookCutoverAcademicFingerprint,
  buildWorkbookCutoverBillingCatalogFingerprint,
  buildWorkbookCutoverFinancialFingerprint,
  captureWorkbookCutoverAcademicFingerprints,
  captureWorkbookCutoverLiveSnapshot,
  workbookCutoverApplicantSourceRecordDigest,
  workbookCutoverCapturedSnapshotDigest,
  workbookCutoverProductionStudentSourceRecordDigest,
  workbookCutoverSnapshotCounts,
} from "./workbook-cutover.snapshot.js";

const CAPTURED_AT = new Date("2026-09-01T10:00:00.000Z");

function transcript(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    courseId: `course-${id}`,
    courseCode: id.toUpperCase(),
    grade: "A",
    credits: 6,
    earnedCredits: 6,
    gradePoints: 4,
    countsTowardGpa: true,
    countsTowardCredits: true,
    voidedAt: null,
    ...overrides,
  };
}

describe("workbook cutover academic snapshot", () => {
  it("is source-order independent and includes effective credit and GPA inputs", () => {
    const left = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: [transcript("b"), transcript("a")],
      enrollments: [{ id: "enrollment-b" }, { id: "enrollment-a" }],
      gradeSnapshots: [{ id: "grade-b" }, { id: "grade-a" }],
    });
    const right = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: [transcript("a"), transcript("b")],
      enrollments: [{ id: "enrollment-a" }, { id: "enrollment-b" }],
      gradeSnapshots: [{ id: "grade-a" }, { id: "grade-b" }],
    });

    expect(left).toEqual(right);
    expect(left).toMatchObject({
      transcriptCount: 2,
      enrollmentCount: 2,
      gradeSnapshotCount: 2,
    });

    const gradeChanged = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: [transcript("a", { gradePoints: 3 }), transcript("b")],
      enrollments: [{ id: "enrollment-a" }, { id: "enrollment-b" }],
      gradeSnapshots: [{ id: "grade-a" }, { id: "grade-b" }],
    });
    expect(gradeChanged.transcriptSha256).not.toBe(left.transcriptSha256);
    expect(gradeChanged.gpaSha256).not.toBe(left.gpaSha256);
    expect(gradeChanged.creditsSha256).toBe(left.creditsSha256);
  });

  it("retains voided transcript rows in history but excludes them from effective totals", () => {
    const base = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: [transcript("active")],
      enrollments: [],
      gradeSnapshots: [],
    });
    const withVoided = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: [
        transcript("active"),
        transcript("voided", {
          voidedAt: new Date("2026-08-20T00:00:00.000Z"),
        }),
      ],
      enrollments: [],
      gradeSnapshots: [],
    });

    expect(withVoided.transcriptCount).toBe(2);
    expect(withVoided.transcriptSha256).not.toBe(base.transcriptSha256);
    expect(withVoided.creditsSha256).toBe(base.creditsSha256);
    expect(withVoided.gpaSha256).toBe(base.gpaSha256);
  });
});

describe("workbook cutover finance snapshot", () => {
  const state = {
    invoices: [{ id: "invoice-1", status: "open", totalAmount: 100 }],
    payments: [{ id: "payment-1", status: "success", amount: 40 }],
    billingProfiles: [{ id: "profile-1", revision: 0 }],
    linkedApplicant: {
      id: "applicant-accepted",
      onboardingStatus: "payment_pending",
      enrollmentInvoiceId: "invoice-1",
      activeOnboardingPaymentLinkId: "link-1",
      statusTokenHash: "a".repeat(64),
      statusTokenExpiresAt: null,
      statusTokenRevokedAt: null,
    },
    proofSubmissions: [
      {
        id: "proof-1",
        applicantId: "applicant-accepted",
        status: "submitted",
      },
    ],
    paymentLinks: [
      {
        id: "link-1",
        onboardingApplicantId: "applicant-accepted",
        status: "active",
      },
    ],
    piSpiRequests: [
      {
        id: "pispi-1",
        applicantId: "applicant-accepted",
        status: "sent",
      },
    ],
  };

  it("is independent of top-level row order", () => {
    expect(
      buildWorkbookCutoverFinancialFingerprint({
        ...state,
        invoices: [{ id: "invoice-2", status: "void" }, ...state.invoices],
      }),
    ).toBe(
      buildWorkbookCutoverFinancialFingerprint({
        ...state,
        invoices: [...state.invoices, { id: "invoice-2", status: "void" }],
      }),
    );
  });

  it.each([
    "invoices",
    "payments",
    "billingProfiles",
    "proofSubmissions",
    "paymentLinks",
    "piSpiRequests",
  ] as const)("detects a change in %s", (family) => {
    const baseline = buildWorkbookCutoverFinancialFingerprint(state);
    const changed = buildWorkbookCutoverFinancialFingerprint({
      ...state,
      [family]: state[family].map((row) =>
        row.id.endsWith("1") ? { ...row, changed: true } : row,
      ),
    });
    expect(changed).not.toBe(baseline);
  });

  it("detects accepted-Applicant gate and link drift for a Student", () => {
    const baseline = buildWorkbookCutoverFinancialFingerprint(state);
    const changed = buildWorkbookCutoverFinancialFingerprint({
      ...state,
      linkedApplicant: {
        ...state.linkedApplicant,
        onboardingStatus: "enrolled",
        activeOnboardingPaymentLinkId: null,
      },
    });

    expect(changed).not.toBe(baseline);
  });

  it("detects linked-Applicant public status bearer drift", () => {
    const baseline = buildWorkbookCutoverFinancialFingerprint(state);
    const changed = buildWorkbookCutoverFinancialFingerprint({
      ...state,
      linkedApplicant: {
        ...state.linkedApplicant,
        statusTokenRevokedAt: "2026-09-01T10:00:00.000Z",
        statusTokenExpiresAt: "2026-09-01T10:00:00.000Z",
      },
    });

    expect(changed).not.toBe(baseline);
  });

  it("detects drift in Applicant-only links and attempts with no Student or invoice reference", () => {
    const applicantOnly = {
      ...state,
      paymentLinks: [
        ...state.paymentLinks,
        {
          id: "link-retired",
          onboardingApplicantId: "applicant-accepted",
          studentId: null,
          invoiceId: null,
          status: "cancelled",
        },
      ],
      proofSubmissions: [
        ...state.proofSubmissions,
        {
          id: "proof-retired-link",
          applicantId: null,
          studentId: null,
          invoiceId: null,
          paymentId: null,
          paymentLinkId: "link-retired",
          status: "submitted",
        },
      ],
    };
    const baseline = buildWorkbookCutoverFinancialFingerprint(applicantOnly);
    const changed = buildWorkbookCutoverFinancialFingerprint({
      ...applicantOnly,
      proofSubmissions: applicantOnly.proofSubmissions.map((row) =>
        row.id === "proof-retired-link" ? { ...row, status: "cancelled" } : row,
      ),
    });

    expect(changed).not.toBe(baseline);
  });
});

describe("workbook cutover billing catalog snapshot", () => {
  it("sorts by stable ID and detects inactive catalog-row changes", () => {
    const left = buildWorkbookCutoverBillingCatalogFingerprint({
      serviceOptions: [
        { id: "service-b", active: false, amountXof: 2 },
        { id: "service-a", active: true, amountXof: 1 },
      ],
      adjustmentDefinitions: [{ id: "award-a", active: false }],
    });
    const reordered = buildWorkbookCutoverBillingCatalogFingerprint({
      serviceOptions: [
        { id: "service-a", active: true, amountXof: 1 },
        { id: "service-b", active: false, amountXof: 2 },
      ],
      adjustmentDefinitions: [{ id: "award-a", active: false }],
    });
    const changed = buildWorkbookCutoverBillingCatalogFingerprint({
      serviceOptions: [
        { id: "service-a", active: true, amountXof: 1 },
        { id: "service-b", active: false, amountXof: 3 },
      ],
      adjustmentDefinitions: [{ id: "award-a", active: false }],
    });
    expect(reordered).toBe(left);
    expect(changed).not.toBe(left);
  });
});

describe("captureWorkbookCutoverLiveSnapshot", () => {
  it("captures exhaustive roster state, current Applicants, attempts, and controls", async () => {
    const student = {
      id: "student-1",
      personId: "person-1",
      studentNo: "s2026001ab",
      recordStatus: "active",
      person: {
        firstName: "First",
        lastName: "Last",
        email: "FIRST.LAST@MYDAUST.COM",
        status: "active",
        roles: ["student"],
      },
      transcriptEntries: [transcript("transcript-1")],
      enrollments: [{ id: "enrollment-1" }],
      gradeSubmissionItems: [{ id: "grade-1" }],
      invoices: [
        {
          id: "invoice-1",
          status: "open",
          totalAmount: 100,
          components: [],
          componentOverrides: [],
          adjustments: [],
          plan: null,
        },
      ],
      payments: [
        {
          id: "payment-1",
          invoiceId: "invoice-1",
          status: "refund_pending",
          amount: 20,
          allocations: [],
          componentAllocations: [],
        },
      ],
      billingProfiles: [],
      applicant: {
        id: "accepted-applicant-1",
        studentId: "student-1",
        stage: "accepted",
        onboardingStatus: "payment_pending",
        enrollmentInvoiceId: "invoice-1",
        requiredEnrollmentCashXof: 25,
        activeOnboardingPaymentLinkId: "link-1",
        activatedByPaymentId: null,
        activeOnboardingPaymentLink: {
          id: "link-1",
          amountXof: 25,
          invoiceId: "invoice-1",
          studentId: "student-1",
          status: "active",
        },
      },
    };
    const studentFindMany = vi.fn().mockResolvedValue([student]);
    const applicantFindMany = vi.fn().mockResolvedValue([
      {
        id: "applicant-1",
        firstName: "Open",
        lastName: "Applicant",
        email: "OPEN@EXAMPLE.COM",
        stage: "submitted",
      },
    ]);
    const paymentLinks = [
      {
        id: "link-1",
        studentId: null,
        invoiceId: "invoice-1",
        status: "active",
        onboardingApplicantId: "accepted-applicant-1",
      },
      {
        id: "link-retired",
        studentId: null,
        invoiceId: null,
        status: "cancelled",
        onboardingApplicantId: "accepted-applicant-1",
      },
      {
        id: "link-indirect",
        studentId: null,
        invoiceId: null,
        status: "active",
        onboardingApplicantId: null,
      },
    ];
    const proofSubmissions = [
      {
        id: "proof-1",
        studentId: null,
        invoiceId: null,
        paymentId: null,
        paymentLinkId: "link-1",
        applicantId: null,
        status: "submitted",
      },
      {
        id: "proof-applicant",
        studentId: null,
        invoiceId: null,
        paymentId: null,
        paymentLinkId: null,
        applicantId: "accepted-applicant-1",
        status: "submitted",
      },
      {
        id: "proof-retired-link",
        studentId: null,
        invoiceId: null,
        paymentId: null,
        paymentLinkId: "link-retired",
        applicantId: null,
        status: "awaiting_proof",
      },
      {
        id: "proof-direct-indirect",
        studentId: "student-1",
        invoiceId: null,
        paymentId: null,
        paymentLinkId: "link-indirect",
        applicantId: null,
        status: "submitted",
      },
    ];
    const piSpiRequests = [
      {
        id: "pispi-1",
        studentId: null,
        invoiceId: null,
        paymentId: "payment-1",
        paymentLinkId: null,
        applicantId: null,
        status: "sent",
      },
      {
        id: "pispi-applicant",
        studentId: null,
        invoiceId: null,
        paymentId: null,
        paymentLinkId: null,
        applicantId: "accepted-applicant-1",
        status: "initiated",
      },
      {
        id: "pispi-retired-link",
        studentId: null,
        invoiceId: null,
        paymentId: null,
        paymentLinkId: "link-retired",
        applicantId: null,
        status: "sent",
      },
      {
        id: "pispi-indirect-only",
        studentId: null,
        invoiceId: null,
        paymentId: null,
        paymentLinkId: "link-indirect",
        applicantId: null,
        status: "sent",
      },
    ];
    const db = {
      student: { findMany: studentFindMany },
      applicant: { findMany: applicantFindMany },
      feeSchedule: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "schedule-1",
            academicYearLabel: "2026–2027",
            revision: 1,
            status: "approved",
            rows: [
              { id: "due-1", sequence: 1, dueOn: new Date("2026-09-10") },
              { id: "due-2", sequence: 2, dueOn: new Date("2026-11-10") },
              { id: "due-3", sequence: 3, dueOn: new Date("2027-01-10") },
              { id: "due-4", sequence: 4, dueOn: new Date("2027-03-10") },
            ],
            components: [],
          },
        ]),
      },
      term: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "term-1",
            name: "Annual 2026–2027",
            startDate: new Date("2026-09-01"),
            endDate: new Date("2027-06-30"),
            academicYear: { label: "2026–2027" },
            status: "active",
          },
        ]),
      },
      studentNumberSequence: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ academicYearStart: 2026, nextValue: 18 }),
      },
      person: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { email: "FIRST.LAST@MYDAUST.COM" },
            { email: "admin@daust.org" },
          ]),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { id: "payment-1", studentId: "student-1" },
          { id: "orphan-refund", studentId: "missing-student" },
        ]),
      },
      billingServiceOption: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "service-housing-double",
            academicYearLabel: "2026–2027",
            kind: "housing",
            code: "double",
            amountXof: 680_000,
            active: true,
          },
        ]),
      },
      billingAdjustmentDefinition: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "adjustment-merit-10",
            academicYearLabel: "2026–2027",
            key: "merit_10",
            percentageBasisPoints: 1_000,
            active: true,
          },
        ]),
      },
      paymentLink: {
        findMany: vi.fn().mockResolvedValue(paymentLinks),
      },
      paymentSubmission: {
        findMany: vi.fn().mockResolvedValue(proofSubmissions),
      },
      piSpiRequest: {
        findMany: vi.fn().mockResolvedValue(piSpiRequests),
      },
    };

    const snapshot = await captureWorkbookCutoverLiveSnapshot(
      db as never,
      {
        academicYearLabel: "2026–2027",
        academicYearStart: 2026,
      },
      {
        capturedAt: CAPTURED_AT,
      },
    );

    expect(snapshot.students).toHaveLength(1);
    expect(snapshot.billingCatalogFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.students[0]).toMatchObject({
      sourceKey: "student:student-1",
      studentNo: "S2026001AB",
      loginEmail: "first.last@mydaust.com",
      pendingRefundIds: ["payment-1"],
      inFlightProofSubmissionIds: [
        "proof-1",
        "proof-applicant",
        "proof-direct-indirect",
        "proof-retired-link",
      ],
      inFlightPaymentLinkIds: ["link-1", "link-indirect"],
      inFlightPiSpiRequestIds: [
        "pispi-1",
        "pispi-applicant",
        "pispi-indirect-only",
        "pispi-retired-link",
      ],
    });
    expect(snapshot.applicants[0]).toMatchObject({
      sourceKey: "applicant:applicant-1",
      email: "open@example.com",
    });
    expect(snapshot.studentNumberSequence).toEqual({
      academicYearStart: 2026,
      nextAssignableValue: 18,
    });
    expect(snapshot.terms[0]?.installmentDueDates).toEqual([
      "2026-09-10",
      "2026-11-10",
      "2027-01-10",
      "2027-03-10",
    ]);
    expect(snapshot.orphanPendingRefundIds).toEqual(["orphan-refund"]);
    expect(workbookCutoverSnapshotCounts(snapshot)).toMatchObject({
      students: 1,
      activeStudents: 1,
      currentApplicants: 1,
      pendingRefunds: 1,
      orphanPendingRefunds: 1,
    });
    expect(workbookCutoverCapturedSnapshotDigest(snapshot)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(applicantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stage: { in: ["submitted", "review", "interview", "offer"] },
        },
      }),
    );
    expect(db.paymentLink.findMany.mock.calls[0]?.[0]).not.toHaveProperty(
      "where",
    );
    for (const finder of [
      db.paymentSubmission.findMany,
      db.piSpiRequest.findMany,
    ]) {
      expect(finder.mock.calls[0]?.[0]).not.toHaveProperty("where");
    }

    const initialFinancialFingerprint =
      snapshot.students[0]?.financialFingerprintSha256;
    const indirectPiSpi = piSpiRequests.find(
      (row) => row.id === "pispi-indirect-only",
    );
    expect(indirectPiSpi).toBeDefined();
    indirectPiSpi!.status = "cancelled";
    const driftedSnapshot = await captureWorkbookCutoverLiveSnapshot(
      db as never,
      {
        academicYearLabel: "2026–2027",
        academicYearStart: 2026,
      },
      {
        capturedAt: CAPTURED_AT,
      },
    );
    expect(driftedSnapshot.students[0]?.financialFingerprintSha256).not.toBe(
      initialFinancialFingerprint,
    );
    expect(driftedSnapshot.students[0]?.inFlightPiSpiRequestIds).not.toContain(
      "pispi-indirect-only",
    );
  });

  it("reuses the same academic fingerprint contract for post-audit", async () => {
    const student = {
      id: "student-1",
      transcriptEntries: [transcript("transcript-1")],
      enrollments: [{ id: "enrollment-1" }],
      gradeSubmissionItems: [{ id: "grade-1" }],
    };
    const result = await captureWorkbookCutoverAcademicFingerprints(
      {
        student: { findMany: vi.fn().mockResolvedValue([student]) },
      } as never,
      ["student-1", "student-1"],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      studentId: "student-1",
      academicFingerprint: {
        transcriptCount: 1,
        enrollmentCount: 1,
        gradeSnapshotCount: 1,
      },
    });
    expect(result[0]?.academicFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses canonical source-record digests independent of object key order", () => {
    expect(
      workbookCutoverProductionStudentSourceRecordDigest({ a: 1, b: 2 }),
    ).toBe(workbookCutoverProductionStudentSourceRecordDigest({ b: 2, a: 1 }));
    expect(workbookCutoverApplicantSourceRecordDigest({ a: 1, b: 2 })).toBe(
      workbookCutoverApplicantSourceRecordDigest({ b: 2, a: 1 }),
    );
  });
});

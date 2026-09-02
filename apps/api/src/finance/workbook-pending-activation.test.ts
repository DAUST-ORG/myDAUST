import { describe, expect, it } from "vitest";
import {
  WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT,
  buildWorkbookPendingActivationPlan,
  type WorkbookPendingActivationCapturedState,
  type WorkbookPendingActivationTargetSnapshot,
} from "./workbook-pending-activation.runner.js";

function target(index: number): WorkbookPendingActivationTargetSnapshot {
  const suffix = String(index).padStart(2, "0");
  const studentId = `student-${suffix}`;
  const personId = `person-${suffix}`;
  const applicantId = `applicant-${suffix}`;
  const invoiceId = `invoice-${suffix}`;
  const linkId = `link-${suffix}`;
  return {
    sourceRecordId: `production-source-${suffix}`,
    sourceKeySha256: `${suffix}`.padEnd(64, "a"),
    linkedWorkbookRecord: {
      id: `workbook-source-${suffix}`,
      batchId: "batch-1",
      sourceKind: "workbook_row",
      sourceKeySha256: `${suffix}`.padEnd(64, "b"),
      disposition: "link_existing_student",
      studentId,
      canonicalInvoiceId: invoiceId,
      billingProfileId: `profile-${suffix}`,
      appliedAt: "2026-09-02T11:44:00.000Z",
    },
    student: {
      id: studentId,
      personId,
      recordStatus: "pending_payment",
      enrolledAt: null,
    },
    person: {
      id: personId,
      kind: "student",
      status: "active",
      suspendedAt: null,
      roles: [],
      emailSha256: `${suffix}`.padEnd(64, "c"),
      passwordHashSha256: null,
      mustChangePassword: false,
      passwordChangedAt: null,
      lastLoginAt: null,
      sessionVersion: 0,
      loginEmailMatchCount: 1,
      loginEmailValid: true,
    },
    applicant: {
      id: applicantId,
      studentId,
      stage: "accepted",
      onboardingStatus: "payment_pending",
      enrollmentInvoiceId: invoiceId,
      activeOnboardingPaymentLinkId: linkId,
      activatedByPaymentId: null,
      acceptedAt: "2026-08-01T10:00:00.000Z",
      paymentPendingAt: "2026-08-01T10:01:00.000Z",
      enrolledAt: null,
      onboardingCancelledAt: null,
      statusTokenHashSha256: `${suffix}`.padEnd(64, "d"),
      statusTokenExpiresAt: null,
      statusTokenRevokedAt: null,
    },
    links: [
      {
        id: linkId,
        onboardingApplicantId: applicantId,
        studentId,
        invoiceId,
        status: "active",
        amountXof: 100_000,
        tokenSha256: `${suffix}`.padEnd(64, "e"),
      },
    ],
    submissions: [],
    piSpiRequests: [],
    payments: [],
    invoices: [
      {
        id: invoiceId,
        studentId,
        status: "open",
        totalAmount: 4_285_000,
        amountPaid: 0,
        revision: 0,
        updatedAt: "2026-09-02T11:44:00.000Z",
      },
    ],
    invites: [],
    activeActivationRequests: [],
    activeActivationCards: [],
  };
}

function state(): WorkbookPendingActivationCapturedState {
  return {
    batch: {
      id: "batch-1",
      status: "imported",
      identityManifestSha256: "a".repeat(64),
      confirmationPlanSha256: "b".repeat(64),
      sourceWorkbookSha256: "c".repeat(64),
      importedAt: "2026-09-02T11:44:00.000Z",
    },
    actor: {
      id: "actor-1",
      kind: "staff",
      status: "active",
      roles: ["admin"],
    },
    globalStudentCounts: {
      physical: 446,
      active: 391,
      pendingPayment: 9,
      archived: 46,
    },
    targets: Array.from(
      { length: WORKBOOK_PENDING_ACTIVATION_TARGET_COUNT },
      (_, index) => target(index + 1),
    ),
  };
}

function blockerCodes(
  plan: ReturnType<typeof buildWorkbookPendingActivationPlan>,
) {
  return plan.blockers.map((blocker) => blocker.code);
}

describe("workbook pending-payment activation plan", () => {
  it("creates a deterministic, confirmable plan for exactly nine reviewed targets", () => {
    const input = state();
    const first = buildWorkbookPendingActivationPlan(
      input,
      "batch-1",
      new Date("2026-09-02T12:00:00.000Z"),
    );
    const second = buildWorkbookPendingActivationPlan(
      input,
      "batch-1",
      new Date("2026-09-02T12:05:00.000Z"),
    );
    expect(first).toMatchObject({
      confirmBlocked: false,
      targetCount: 9,
      activeLinkCount: 9,
      proofDraftCount: 0,
      submittedProofCount: 0,
      activePiSpiCount: 0,
      pendingPaymentCount: 0,
      refundPendingCount: 0,
      globalStudentCounts: {
        physical: 446,
        active: 391,
        pendingPayment: 9,
        archived: 46,
      },
    });
    expect(first.planSha256).toBe(second.planSha256);
    expect(first.capturedAt).not.toBe(second.capturedAt);
  });

  it("fails closed when the live target count is not exactly nine", () => {
    const input = state();
    input.targets.pop();
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(plan.confirmBlocked).toBe(true);
    expect(blockerCodes(plan)).toContain("pending_target_count_mismatch");
  });

  it("binds the exact pre-activation global roster baseline", () => {
    const input = state();
    input.globalStudentCounts.active = 392;
    input.globalStudentCounts.pendingPayment = 8;
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(plan.confirmBlocked).toBe(true);
    expect(blockerCodes(plan)).toEqual(
      expect.arrayContaining([
        "active_student_count_mismatch",
        "pending_payment_student_count_mismatch",
      ]),
    );
  });

  it("blocks existing credentials, invites, activation requests, and login collisions", () => {
    const input = state();
    input.targets[0]!.person.passwordHashSha256 = "f".repeat(64);
    input.targets[0]!.person.mustChangePassword = true;
    input.targets[0]!.person.loginEmailMatchCount = 2;
    input.targets[0]!.person.loginEmailValid = false;
    input.targets[0]!.person.passwordChangedAt = "2026-09-01T00:00:00.000Z";
    input.targets[0]!.person.lastLoginAt = "2026-09-01T01:00:00.000Z";
    input.targets[0]!.invites.push({
      id: "invite-1",
      purpose: "first_time",
      expiresAt: "2026-09-03T00:00:00.000Z",
      usedAt: null,
    });
    input.targets[0]!.activeActivationRequests.push({
      id: "request-1",
      expiresAt: "2026-09-03T00:00:00.000Z",
      approvedAt: null,
    });
    input.targets[0]!.activeActivationCards.push({
      id: "activation-card-1",
      batchId: "activation-card-batch-1",
      expiresAt: "2026-09-03T00:00:00.000Z",
    });
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(blockerCodes(plan)).toContain("student_identity_drift");
  });

  it("blocks an active public-bill attempt and its pending ledger row", () => {
    const input = state();
    const first = input.targets[0]!;
    first.submissions.push({
      id: "direct-proof",
      applicantId: first.applicant!.id,
      studentId: first.student.id,
      invoiceId: first.linkedWorkbookRecord!.canonicalInvoiceId,
      paymentLinkId: null,
      paymentId: "direct-payment",
      status: "submitted",
      activeKeySha256: "1".repeat(64),
      resumeTokenSha256: "2".repeat(64),
    });
    first.payments.push({
      id: "direct-payment",
      studentId: first.student.id,
      invoiceId: first.linkedWorkbookRecord!.canonicalInvoiceId!,
      status: "pending",
      amount: 100_000,
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(blockerCodes(plan)).toContain("active_payment_proof_attempt");
    expect(blockerCodes(plan)).toContain("pending_payment_attempt");
  });

  it("blocks cross-linked attempt relationship fields and duplicate target assignment", () => {
    const input = state();
    const first = input.targets[0]!;
    const second = input.targets[1]!;
    const crossLinked = {
      id: "cross-linked-proof",
      applicantId: second.applicant!.id,
      studentId: first.student.id,
      invoiceId: first.linkedWorkbookRecord!.canonicalInvoiceId,
      paymentLinkId: first.links[0]!.id,
      paymentId: null,
      status: "cancelled",
      activeKeySha256: null,
      resumeTokenSha256: null,
    };
    first.submissions.push(crossLinked);
    second.submissions.push(crossLinked);
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(blockerCodes(plan)).toContain("payment_attempt_ownership_drift");
    expect(blockerCodes(plan)).toContain(
      "duplicate_payment_attempt_target_assignment",
    );
  });

  it("blocks every active onboarding proof, PI-SPI request, and pending payment", () => {
    const input = state();
    const first = input.targets[0]!;
    const linkId = first.links[0]!.id;
    const invoiceId = first.linkedWorkbookRecord!.canonicalInvoiceId!;
    first.submissions.push(
      {
        id: "draft-proof",
        applicantId: first.applicant!.id,
        studentId: first.student.id,
        invoiceId,
        paymentLinkId: linkId,
        paymentId: null,
        status: "awaiting_proof",
        activeKeySha256: "3".repeat(64),
        resumeTokenSha256: "4".repeat(64),
      },
      {
        id: "submitted-proof",
        applicantId: first.applicant!.id,
        studentId: first.student.id,
        invoiceId,
        paymentLinkId: linkId,
        paymentId: "submitted-payment",
        status: "submitted",
        activeKeySha256: "5".repeat(64),
        resumeTokenSha256: "6".repeat(64),
      },
    );
    first.piSpiRequests.push({
      id: "active-pispi",
      applicantId: first.applicant!.id,
      studentId: first.student.id,
      invoiceId,
      paymentLinkId: linkId,
      paymentId: "pispi-payment",
      status: "sent",
      amountXof: 100_000,
    });
    first.payments.push(
      {
        id: "submitted-payment",
        studentId: first.student.id,
        invoiceId,
        status: "pending",
        amount: 100_000,
        updatedAt: "2026-09-02T12:00:00.000Z",
      },
      {
        id: "pispi-payment",
        studentId: first.student.id,
        invoiceId,
        status: "pending",
        amount: 100_000,
        updatedAt: "2026-09-02T12:00:00.000Z",
      },
    );
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(plan.confirmBlocked).toBe(true);
    expect(plan.proofDraftCount).toBe(1);
    expect(plan.submittedProofCount).toBe(1);
    expect(plan.activePiSpiCount).toBe(1);
    expect(plan.pendingPaymentCount).toBe(2);
    expect(blockerCodes(plan)).toContain("active_payment_proof_attempt");
    expect(blockerCodes(plan)).toContain("active_pispi_attempt");
    expect(blockerCodes(plan)).toContain("pending_payment_attempt");
  });

  it("blocks a refund that has not completed", () => {
    const input = state();
    const first = input.targets[0]!;
    first.payments.push({
      id: "refund-1",
      studentId: first.student.id,
      invoiceId: first.linkedWorkbookRecord!.canonicalInvoiceId!,
      status: "refund_pending",
      amount: 100_000,
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    const plan = buildWorkbookPendingActivationPlan(input, "batch-1");
    expect(blockerCodes(plan)).toContain("refund_pending");
  });
});

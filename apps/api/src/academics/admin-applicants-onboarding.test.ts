import { describe, expect, it, vi } from "vitest";
import { AcademicsService } from "./academics.service.js";

describe("Admissions queue onboarding summary", () => {
  it("shows payment progress only after acceptance has started", async () => {
    const prisma = {
      applicant: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "submitted-1",
            firstName: "New",
            lastName: "Applicant",
            email: "new@example.test",
            programCode: "BSCS",
            stage: "review",
            onboardingStatus: "not_started",
            score: 16,
            country: "SN",
            feePaid: true,
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
            enrolledAt: null,
            requiredEnrollmentCashXof: null,
            enrollmentInvoiceId: null,
            student: null,
            enrollmentInvoice: null,
          },
          {
            id: "accepted-1",
            firstName: "Awa",
            lastName: "Ndiaye",
            email: "awa@example.test",
            programCode: "BSCS",
            stage: "accepted",
            onboardingStatus: "payment_pending",
            score: 18,
            country: "SN",
            feePaid: true,
            createdAt: new Date("2026-08-02T00:00:00.000Z"),
            enrolledAt: null,
            requiredEnrollmentCashXof: 1_070_000,
            enrollmentInvoiceId: "invoice-1",
            student: { id: "student-1", studentNo: "S20261AN" },
            enrollmentInvoice: {
              amountPaid: 300_000,
              plan: {
                installments: [
                  {
                    amountDue: 1_070_000,
                    dueDate: new Date("2026-08-25T00:00:00.000Z"),
                  },
                ],
              },
              paymentSubmissions: [{ status: "submitted" }],
            },
          },
        ]),
      },
      payment: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ invoiceId: "invoice-1", amount: 300_000 }]),
      },
    };
    const academics = new AcademicsService(prisma as never);

    const result = await academics.adminApplicants();

    expect(
      result.applicants.find((applicant) => applicant.id === "accepted-1")
        ?.onboarding,
    ).toMatchObject({
      status: "payment_pending",
      studentId: "student-1",
      studentNo: "S20261AN",
      requiredCashXof: 1_070_000,
      paidCashXof: 300_000,
      remainingCashXof: 770_000,
      proofStatus: "submitted",
    });
    expect(
      result.applicants.find((applicant) => applicant.id === "submitted-1")
        ?.onboarding,
    ).toBeNull();
  });
});

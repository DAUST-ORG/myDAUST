import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  AdmissionsService,
  academicYearStart,
  enrollmentCashStatus,
  publicBillPaymentUrl,
  studentNameInitials,
} from "./admissions.service.js";

describe("admissions identity helpers", () => {
  it("builds normalized initials from every name token", () => {
    expect(studentNameInitials("Adja Fama", "Ndiaye")).toBe("AFN");
    expect(studentNameInitials("Éva-Maria", "D'Almeida")).toBe("EMDA");
  });

  it("reads the cohort start from the academic-year label", () => {
    expect(academicYearStart("2026-2027", null)).toBe(2026);
    expect(
      academicYearStart("Academic cohort", new Date("2027-08-01T00:00:00Z")),
    ).toBe(2027);
  });

  it("rejects an academic year without a trustworthy start year", () => {
    expect(() => academicYearStart("Current year", null)).toThrow(
      BadRequestException,
    );
  });

  it("derives the enrollment gate from cash rather than invoice credits", () => {
    const dueDate = new Date("2026-08-25T00:00:00Z");
    expect(
      enrollmentCashStatus({
        requiredCashXof: 1_000_000,
        paidCashXof: 0,
        dueDate,
        now: new Date("2026-08-20T12:00:00Z"),
      }),
    ).toBe("pending");
    expect(
      enrollmentCashStatus({
        requiredCashXof: 1_000_000,
        paidCashXof: 300_000,
        dueDate,
        now: new Date("2026-09-01T12:00:00Z"),
      }),
    ).toBe("partial");
    expect(
      enrollmentCashStatus({
        requiredCashXof: 1_000_000,
        paidCashXof: 0,
        dueDate,
        now: new Date("2026-09-01T12:00:00Z"),
      }),
    ).toBe("overdue");
    expect(
      enrollmentCashStatus({
        requiredCashXof: 1_000_000,
        paidCashXof: 1_000_000,
        dueDate,
      }),
    ).toBe("paid");
  });

  it("links production payment hosts at root and shared portal hosts at /pay-bill", () => {
    expect(publicBillPaymentUrl("https://payment.daust.net", "S202631AD")).toBe(
      "https://payment.daust.net/?sid=S202631AD",
    );
    expect(
      publicBillPaymentUrl("https://daust-staging.azt.dev", "S202631AD"),
    ).toBe("https://daust-staging.azt.dev/pay-bill?sid=S202631AD");
    expect(publicBillPaymentUrl("http://localhost:3000", "S 2026/31")).toBe(
      "http://localhost:3000/pay-bill?sid=S+2026%2F31",
    );
  });
});

describe("application-fee capability revocation", () => {
  it("does not restart checkout for a removed Applicant UUID", async () => {
    const paymentSubmissions = { createForApplicant: vi.fn() };
    const service = new AdmissionsService(
      {
        applicant: {
          findUnique: vi.fn().mockResolvedValue({
            id: "removed-applicant",
            email: "removed@example.test",
            stage: "rejected",
            onboardingStatus: "cancelled",
            feePaid: false,
          }),
        },
      } as never,
      {} as never,
      {} as never,
      paymentSubmissions as never,
    );

    await expect(
      service.feeCheckout("removed-applicant", "wave"),
    ).rejects.toThrow("Application not found");
    expect(paymentSubmissions.createForApplicant).not.toHaveBeenCalled();
  });
});

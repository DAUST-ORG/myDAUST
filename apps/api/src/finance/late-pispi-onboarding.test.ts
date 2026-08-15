import { describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service.js";

describe("late PI-SPI onboarding settlement", () => {
  it("books an old full-amount provider request after partial cash rotated its link", async () => {
    const request = {
      id: "request-1",
      txId: "tx-1",
      end2endId: null,
      status: "sent",
      amountXof: 100,
      paymentId: "payment-1",
      paymentLinkId: "old-link",
    };
    const auditCreate = vi.fn().mockResolvedValue({});
    const holdCreate = vi.fn().mockResolvedValue({ id: "hold-1" });
    const tx = {
      auditLog: { create: auditCreate },
      studentHold: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: holdCreate,
      },
    };
    const prisma = {
      piSpiRequest: { findFirst: vi.fn().mockResolvedValue(request) },
      paymentLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "old-link",
          status: "cancelled",
          onboardingApplicant: {
            id: "applicant-1",
            studentId: "student-1",
            onboardingStatus: "payment_pending",
            activeOnboardingPaymentLinkId: "new-link",
            requiredEnrollmentCashXof: 100,
          },
        }),
      },
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const finance = new FinanceService(
      prisma as never,
      {} as never,
      {} as never,
      new Map() as never,
    );
    const settle = vi.fn().mockResolvedValue(undefined);
    (finance as any).settlePayment = settle;

    await (finance as any).applyPiSpiEvent({
      txId: "tx-1",
      end2endId: "rail-e2e-1",
      status: "settled",
      statusReason: null,
      amount: 120,
    });

    expect(settle).toHaveBeenCalledWith("payment-1", {
      via: "pi_spi",
      method: "pi_spi",
      confirmedAmount: 100,
      payload: expect.objectContaining({ status: "settled" }),
      providerConfirmedStaleOnboarding: true,
      piSpiReview: { id: "request-1", end2endId: "rail-e2e-1" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "PiSpiRequest",
        entityId: "request-1",
        action: "late-onboarding-settlement-booked",
      }),
    });
    expect(holdCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        type: "payment_reconciliation",
      }),
    });
  });

  it("books a late invoice-target settlement after onboarding cancellation", async () => {
    const request = {
      id: "request-invoice",
      txId: "tx-invoice",
      end2endId: null,
      status: "cancelled",
      amountXof: 300,
      paymentId: "payment-invoice",
      paymentLinkId: null,
      invoiceId: "void-enrollment-invoice",
    };
    const auditCreate = vi.fn().mockResolvedValue({});
    const holdCreate = vi.fn().mockResolvedValue({ id: "hold-invoice" });
    const tx = {
      auditLog: { create: auditCreate },
      studentHold: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: holdCreate,
      },
    };
    const prisma = {
      piSpiRequest: { findFirst: vi.fn().mockResolvedValue(request) },
      applicant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "cancelled-applicant",
          studentId: "archived-student",
          onboardingStatus: "cancelled",
        }),
      },
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const finance = new FinanceService(
      prisma as never,
      {} as never,
      {} as never,
      new Map() as never,
    );
    const settle = vi.fn().mockResolvedValue(undefined);
    (finance as any).settlePayment = settle;

    await (finance as any).applyPiSpiEvent({
      txId: "tx-invoice",
      end2endId: "rail-e2e-invoice",
      status: "settled",
      statusReason: null,
      amount: 350,
    });

    expect(settle).toHaveBeenCalledWith("payment-invoice", {
      via: "pi_spi",
      method: "pi_spi",
      confirmedAmount: 300,
      payload: expect.objectContaining({ status: "settled" }),
      providerConfirmedStaleOnboarding: true,
      piSpiReview: {
        id: "request-invoice",
        end2endId: "rail-e2e-invoice",
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "request-invoice",
        action: "late-onboarding-settlement-booked",
        data: expect.objectContaining({
          applicantId: "cancelled-applicant",
          invoiceId: "void-enrollment-invoice",
          paymentLinkId: null,
        }),
      }),
    });
    expect(holdCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "archived-student",
        type: "payment_reconciliation",
      }),
    });
  });
});

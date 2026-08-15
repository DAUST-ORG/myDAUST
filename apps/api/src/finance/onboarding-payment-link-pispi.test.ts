import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceService } from "./finance.service.js";

describe("onboarding payment-link PI-SPI initiation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("targets the link once while keeping the accounting Payment on its invoice", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    const dueDate = new Date("2026-08-25T00:00:00.000Z");
    const onboardingApplicant = {
      id: "applicant-1",
      onboardingStatus: "payment_pending",
      activeOnboardingPaymentLinkId: "link-1",
      requiredEnrollmentCashXof: 100,
      enrollmentInvoice: {
        id: "invoice-1",
        amountPaid: 0,
        plan: { installments: [{ amountDue: 100, dueDate }] },
      },
    };
    const link = {
      id: "link-1",
      token: "opaque-link-token",
      status: "active",
      amountXof: 100,
      purpose: "First enrollment installment",
      studentId: "student-1",
      invoiceId: "invoice-1",
      expiresAt: null,
      onboardingApplicant,
    };
    let requestData: Record<string, unknown> | null = null;
    let paymentData: Record<string, unknown> | null = null;
    const createdAt = new Date("2026-08-15T00:00:00.000Z");
    const tx = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: "invoice-1",
          studentId: "student-1",
          status: "open",
        }),
      },
      paymentLink: { findUnique: vi.fn().mockResolvedValue(link) },
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(async ({ data }: any) => {
          paymentData = data;
          return { id: "payment-1", ...data };
        }),
      },
      piSpiRequest: {
        create: vi.fn(async ({ data }: any) => {
          requestData = data;
          return { id: "request-1", createdAt, ...data };
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      paymentLink: { findUnique: vi.fn().mockResolvedValue(link) },
      invoice: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: "invoice-1", studentId: "student-1" }),
      },
      piSpiRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(async ({ data }: any) => ({
          ...(requestData as object),
          createdAt,
          settledAmountXof: null,
          ...data,
        })),
      },
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const rail = {
      isConfigured: () => true,
      requestPayment: vi.fn().mockResolvedValue({
        end2endId: "e2e-1",
        status: "sent",
        statusReason: null,
        payerName: "Payer",
        payerCountry: "SN",
      }),
    };
    const finance = new FinanceService(
      prisma as never,
      {} as never,
      {} as never,
      { get: () => rail } as never,
    );
    const normalAccountRead = vi
      .spyOn(finance as any, "loadPayableAccount")
      .mockRejectedValue(new Error("account credits consumed payable lines"));

    await expect(
      finance.submitPaymentLinkPiSpi(link.token, randomUUID()),
    ).resolves.toMatchObject({ status: "sent", amountXof: 100 });

    expect(normalAccountRead).not.toHaveBeenCalled();
    expect(paymentData).toMatchObject({
      invoiceId: "invoice-1",
      studentId: "student-1",
      amount: 100,
    });
    expect(requestData).toMatchObject({
      paymentLinkId: "link-1",
      paymentId: "payment-1",
      studentId: "student-1",
      amountXof: 100,
    });
    expect(requestData?.invoiceId).toBeUndefined();
  });
});

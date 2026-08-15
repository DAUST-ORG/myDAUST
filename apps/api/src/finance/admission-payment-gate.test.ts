import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  assertCurrentOnboardingPaymentLinkInTransaction,
  syncEnrollmentGateInTransaction,
} from "./admission-payment-gate.js";

type ProofStatus =
  "awaiting_proof" | "submitted" | "approved" | "rejected" | "cancelled";

function gateFixture(options?: {
  paidCashXof?: number;
  invoiceAppliedCashXof?: number;
  requiredCashXof?: number;
  firstInstallmentPaidXof?: number;
  activeLinkAmountXof?: number;
  paymentSucceeded?: boolean;
  proofStatus?: ProofStatus;
  piSpiStatus?: "initiated" | "sent";
}) {
  const requiredCashXof = options?.requiredCashXof ?? 100;
  let paidCashXof = options?.paidCashXof ?? 0;
  const links: any[] = [
    {
      id: "link-1",
      status: "active",
      amountXof: options?.activeLinkAmountXof ?? requiredCashXof,
      invoiceId: "invoice-1",
      onboardingApplicantId: "applicant-1",
      dueDate: new Date("2026-08-25T00:00:00.000Z"),
    },
  ];
  const applicant: any = {
    id: "applicant-1",
    firstName: "Awa",
    lastName: "Ndiaye",
    email: "awa@example.test",
    onboardingStatus: "payment_pending",
    activatedByPaymentId: null,
    activeOnboardingPaymentLinkId: "link-1",
    requiredEnrollmentCashXof: requiredCashXof,
    activeOnboardingPaymentLink: links[0],
    student: {
      id: "student-1",
      studentNo: "S20261AN",
      recordStatus: "pending_payment",
      person: {
        id: "person-1",
        firstName: "Awa",
        lastName: "Ndiaye",
        roles: [],
      },
    },
    enrollmentInvoice: {
      id: "invoice-1",
      amountPaid: options?.invoiceAppliedCashXof ?? paidCashXof,
      costCenterCode: "9100",
      plan: {
        installments: [
          {
            id: "installment-1",
            sequence: 1,
            amountDue: requiredCashXof,
            // Deliberately independent from invoice cash. Account credits can
            // change installment ordering without becoming verified cash.
            amountPaid: options?.firstInstallmentPaidXof ?? 0,
            dueDate: new Date("2026-08-25T00:00:00.000Z"),
          },
        ],
      },
    },
  };
  const submissions: any[] = options?.proofStatus
    ? [
        {
          id: "submission-1",
          paymentId: "pending-proof-payment",
          paymentLinkId: "link-1",
          status: options.proofStatus,
          activeKey: "active-proof",
        },
      ]
    : [];
  const piSpiRequests: any[] = options?.piSpiStatus
    ? [
        {
          id: "pi-spi-1",
          paymentId: "pending-pi-spi-payment",
          paymentLinkId: "link-1",
          status: options.piSpiStatus,
        },
      ]
    : [];
  const audits: any[] = [];
  const invites: any[] = [];
  let paymentSucceeded = options?.paymentSucceeded ?? false;

  const refreshActiveLink = () => {
    applicant.activeOnboardingPaymentLink =
      links.find(
        (link) => link.id === applicant.activeOnboardingPaymentLinkId,
      ) ?? null;
  };

  const tx: any = {
    applicant: {
      findUnique: vi.fn(async () => {
        refreshActiveLink();
        return applicant;
      }),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(applicant, data);
        refreshActiveLink();
        return applicant;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (
          applicant.id !== where.id ||
          applicant.onboardingStatus !== where.onboardingStatus ||
          applicant.activatedByPaymentId !== where.activatedByPaymentId
        ) {
          return { count: 0 };
        }
        Object.assign(applicant, data);
        refreshActiveLink();
        return { count: 1 };
      }),
    },
    payment: {
      findMany: vi.fn(async () =>
        paidCashXof > 0
          ? [
              {
                invoiceId: applicant.enrollmentInvoice.id,
                amount: paidCashXof,
              },
            ]
          : [],
      ),
      findFirst: vi.fn(async ({ where }: any) =>
        paymentSucceeded &&
        where.invoiceId === applicant.enrollmentInvoice.id &&
        where.status === "success" &&
        (!where.id || where.id === "payment-success")
          ? { id: "payment-success" }
          : null,
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    student: {
      update: vi.fn(async ({ data }: any) => {
        Object.assign(applicant.student, data);
        return applicant.student;
      }),
    },
    person: {
      update: vi.fn(async ({ data }: any) => {
        Object.assign(applicant.student.person, data);
        return applicant.student.person;
      }),
    },
    paymentLink: {
      findUnique: vi.fn(async ({ where }: any) => {
        refreshActiveLink();
        const link = links.find((row) => row.id === where.id) ?? null;
        return link ? { ...link, onboardingApplicant: applicant } : null;
      }),
      findMany: vi.fn(async () => links.map(({ id }) => ({ id }))),
      update: vi.fn(async ({ where, data }: any) => {
        const link = links.find((row) => row.id === where.id);
        if (!link) throw new Error("missing link");
        Object.assign(link, data);
        refreshActiveLink();
        return link;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const link of links) {
          if (
            link.onboardingApplicantId === where.onboardingApplicantId &&
            link.status === where.status
          ) {
            Object.assign(link, data);
            count += 1;
          }
        }
        return { count };
      }),
      create: vi.fn(async ({ data }: any) => {
        const created = {
          id: `link-${links.length + 1}`,
          status: "active",
          ...data,
        };
        links.push(created);
        return created;
      }),
    },
    paymentSubmission: {
      findMany: vi.fn(async ({ where }: any) =>
        submissions
          .filter(
            (row) =>
              where.paymentLinkId.in.includes(row.paymentLinkId) &&
              where.status.in.includes(row.status),
          )
          .map(({ id, paymentId, status }) => ({ id, paymentId, status })),
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of submissions) {
          if (where.id.in.includes(row.id)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    piSpiRequest: {
      findMany: vi.fn(async () => piSpiRequests),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    studentInvite: {
      updateMany: vi.fn(async () => ({ count: invites.length })),
      create: vi.fn(async ({ data }: any) => {
        invites.push(data);
        return data;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        audits.push(data);
        return data;
      }),
    },
  };

  return {
    tx,
    applicant,
    links,
    submissions,
    piSpiRequests,
    audits,
    invites,
    setPaidCashXof(value: number) {
      paidCashXof = value;
      applicant.enrollmentInvoice.amountPaid = value;
    },
    setPaymentSucceeded(value: boolean) {
      paymentSucceeded = value;
    },
  };
}

describe("accepted-applicant cash gate", () => {
  it.each(["awaiting_proof", "submitted", "rejected"] as const)(
    "does not activate for a %s proof without settled cash",
    async (proofStatus) => {
      const state = gateFixture({ proofStatus });

      const result = await syncEnrollmentGateInTransaction(state.tx, {
        invoiceId: "invoice-1",
      });

      expect(result).toMatchObject({
        activation: null,
        paidCashXof: 0,
        remainingCashXof: 100,
      });
      expect(state.applicant.onboardingStatus).toBe("payment_pending");
      expect(state.applicant.student.recordStatus).toBe("pending_payment");
      expect(state.tx.student.update).not.toHaveBeenCalled();
    },
  );

  it("accumulates partial cash and activates exactly once at the threshold", async () => {
    const state = gateFixture({
      paidCashXof: 40,
      activeLinkAmountXof: 100,
    });

    const partial = await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
      paymentId: "payment-partial",
    });
    expect(partial).toMatchObject({
      activation: null,
      paidCashXof: 40,
      remainingCashXof: 60,
    });
    expect(state.links[0]).toMatchObject({ status: "cancelled" });
    expect(state.links[1]).toMatchObject({ status: "active", amountXof: 60 });

    state.setPaidCashXof(100);
    state.setPaymentSucceeded(true);
    const complete = await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
      paymentId: "payment-success",
    });
    expect(complete?.activation).toMatchObject({
      applicantId: "applicant-1",
      studentId: "student-1",
      studentNo: "S20261AN",
    });
    expect(state.applicant.onboardingStatus).toBe("enrolled");
    expect(state.applicant.activatedByPaymentId).toBe("payment-success");
    expect(state.applicant.student.recordStatus).toBe("active");
    expect(state.applicant.student.person.roles).toContain("student");
    expect(state.links.every((link) => link.status === "cancelled")).toBe(true);
    expect(state.invites).toHaveLength(1);

    await expect(
      syncEnrollmentGateInTransaction(state.tx, {
        invoiceId: "invoice-1",
        paymentId: "payment-success",
      }),
    ).resolves.toBeNull();
    expect(state.tx.student.update).toHaveBeenCalledTimes(1);
    expect(state.invites).toHaveLength(1);
  });

  it("uses net invoice cash even when a credit changed installment allocation order", async () => {
    const state = gateFixture({
      paidCashXof: 100,
      invoiceAppliedCashXof: 0,
      firstInstallmentPaidXof: 0,
      paymentSucceeded: true,
    });

    const result = await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
      paymentId: "payment-success",
    });

    expect(result?.activation).not.toBeNull();
    expect(result).toMatchObject({
      requiredCashXof: 100,
      paidCashXof: 100,
      remainingCashXof: 0,
    });
  });

  it("activates once when verified cash overpays the requirement", async () => {
    const state = gateFixture({
      paidCashXof: 125,
      invoiceAppliedCashXof: 75,
      requiredCashXof: 100,
      paymentSucceeded: true,
    });

    const result = await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
      paymentId: "payment-success",
    });

    expect(result).toMatchObject({
      paidCashXof: 125,
      requiredCashXof: 100,
      remainingCashXof: 0,
    });
    expect(result?.activation).not.toBeNull();
    await expect(
      syncEnrollmentGateInTransaction(state.tx, {
        invoiceId: "invoice-1",
        paymentId: "payment-success",
      }),
    ).resolves.toBeNull();
    expect(state.invites).toHaveLength(1);
  });

  it("raises the remaining gate and rotates the link after a pre-activation refund", async () => {
    const state = gateFixture({
      paidCashXof: 60,
      activeLinkAmountXof: 40,
    });
    await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
    });
    expect(state.links).toHaveLength(1);

    state.setPaidCashXof(20);
    const result = await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
    });

    expect(result).toMatchObject({
      activation: null,
      paidCashXof: 20,
      remainingCashXof: 80,
    });
    expect(state.links[0]).toMatchObject({ status: "cancelled" });
    expect(state.links[1]).toMatchObject({ status: "active", amountXof: 80 });
    expect(state.applicant.onboardingStatus).toBe("payment_pending");
  });

  it("fails closed on a plan-driven rotation while proof is under review", async () => {
    const state = gateFixture({ proofStatus: "submitted" });
    state.applicant.enrollmentInvoice.plan.installments[0].dueDate = new Date(
      "2026-09-05T00:00:00.000Z",
    );

    await expect(
      syncEnrollmentGateInTransaction(state.tx, {
        invoiceId: "invoice-1",
      }),
    ).rejects.toThrow("proof is under Finance review");

    expect(state.links).toHaveLength(1);
    expect(state.links[0]).toMatchObject({ status: "active" });
    expect(state.submissions[0]).toMatchObject({
      status: "submitted",
      activeKey: "active-proof",
    });
  });

  it("fails closed on a plan-driven rotation while PI-SPI is active", async () => {
    const state = gateFixture({ piSpiStatus: "sent" });
    state.applicant.enrollmentInvoice.plan.installments[0].dueDate = new Date(
      "2026-09-05T00:00:00.000Z",
    );

    await expect(
      syncEnrollmentGateInTransaction(state.tx, {
        invoiceId: "invoice-1",
      }),
    ).rejects.toThrow("PI-SPI payment request is active");
    expect(state.links).toHaveLength(1);
    expect(state.links[0]).toMatchObject({ status: "active" });
    expect(state.piSpiRequests[0]).toMatchObject({ status: "sent" });
  });

  it("does not roll back partial cash when another proof/provider attempt is in flight", async () => {
    const state = gateFixture({
      paidCashXof: 40,
      activeLinkAmountXof: 100,
      proofStatus: "submitted",
      piSpiStatus: "sent",
    });

    const result = await syncEnrollmentGateInTransaction(state.tx, {
      invoiceId: "invoice-1",
      paymentId: "payment-partial",
      inFlightRotationPolicy: "preserve",
    });

    expect(result).toMatchObject({ paidCashXof: 40, remainingCashXof: 60 });
    expect(state.links[0]).toMatchObject({ status: "cancelled" });
    expect(state.links[1]).toMatchObject({ status: "active", amountXof: 60 });
    expect(state.submissions[0]).toMatchObject({
      status: "submitted",
      activeKey: "active-proof",
    });
    expect(state.piSpiRequests[0]).toMatchObject({ status: "sent" });
  });

  it("fails closed when Finance reviews an obsolete onboarding link", async () => {
    const state = gateFixture({ paidCashXof: 40, activeLinkAmountXof: 60 });
    state.applicant.activeOnboardingPaymentLinkId = "replacement-link";

    await expect(
      assertCurrentOnboardingPaymentLinkInTransaction(state.tx, "link-1", 60),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

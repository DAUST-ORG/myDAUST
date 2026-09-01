import { randomBytes } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@mydaust/db";

const ENROLLED_STATUS_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type EnrollmentActivation = {
  applicantId: string;
  studentId: string;
  studentNo: string;
  personId: string;
  name: string;
};

export type EnrollmentGateSync = {
  activation: EnrollmentActivation | null;
  requiredCashXof: number;
  paidCashXof: number;
  remainingCashXof: number;
};

type EnrollmentCashClient = Pick<Prisma.TransactionClient, "payment">;

/**
 * Verified cash is the refund-net sum of successful Payment rows explicitly
 * initiated against the designated enrollment invoice. It is intentionally not
 * Invoice.amountPaid: allocation can divert newly landed cash to a CR-PAY memo
 * when an older scholarship or account credit already covers payable lines.
 */
export async function verifiedEnrollmentCashByInvoice(
  client: EnrollmentCashClient,
  invoiceIds: readonly string[],
): Promise<Map<string, number>> {
  const uniqueInvoiceIds = [...new Set(invoiceIds.filter(Boolean))];
  const totals = new Map<string, number>(uniqueInvoiceIds.map((id) => [id, 0]));
  if (uniqueInvoiceIds.length === 0) return totals;

  const payments = await client.payment.findMany({
    where: {
      invoiceId: { in: uniqueInvoiceIds },
      status: "success",
    },
    select: { invoiceId: true, amount: true },
  });
  for (const payment of payments) {
    const next = (totals.get(payment.invoiceId) ?? 0) + payment.amount;
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new BadRequestException(
        "Verified enrollment cash is outside the supported XOF range",
      );
    }
    totals.set(payment.invoiceId, next);
  }
  return totals;
}

export async function verifiedEnrollmentCashXof(
  client: EnrollmentCashClient,
  invoiceId: string,
): Promise<number> {
  return (
    (await verifiedEnrollmentCashByInvoice(client, [invoiceId])).get(
      invoiceId,
    ) ?? 0
  );
}

/** Revalidate a public-bill attempt against the live enrollment gate in its money transaction. */
export async function assertCurrentEnrollmentInvoicePaymentInTransaction(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  amountXof: number,
) {
  const applicant = await tx.applicant.findUnique({
    where: { enrollmentInvoiceId: invoiceId },
    include: {
      enrollmentInvoice: {
        include: {
          plan: {
            include: {
              installments: { orderBy: { sequence: "asc" }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!applicant || applicant.onboardingStatus === "enrolled") return;
  if (
    applicant.onboardingStatus !== "payment_pending" ||
    !applicant.enrollmentInvoice ||
    applicant.enrollmentInvoice.status === "void"
  ) {
    throw new BadRequestException(
      "This enrollment payment is no longer available",
    );
  }
  const first = applicant.enrollmentInvoice.plan?.installments[0];
  const requiredCashXof =
    first?.amountDue ?? applicant.requiredEnrollmentCashXof ?? 0;
  const paidCashXof = await verifiedEnrollmentCashXof(tx, invoiceId);
  const remainingCashXof = Math.max(0, requiredCashXof - paidCashXof);
  if (
    !Number.isSafeInteger(amountXof) ||
    amountXof <= 0 ||
    amountXof > remainingCashXof
  ) {
    throw new BadRequestException(
      "Amount exceeds the remaining first-installment cash requirement",
    );
  }
}

/** Fail closed when Finance tries to approve a stale onboarding-link attempt. */
export async function assertCurrentOnboardingPaymentLinkInTransaction(
  tx: Prisma.TransactionClient,
  paymentLinkId: string,
  amountXof: number,
) {
  const link = await tx.paymentLink.findUnique({
    where: { id: paymentLinkId },
    include: {
      onboardingApplicant: {
        include: {
          enrollmentInvoice: {
            include: {
              plan: {
                include: {
                  installments: { orderBy: { sequence: "asc" }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });
  const applicant = link?.onboardingApplicant;
  if (!applicant) return;
  const firstInstallment =
    applicant.enrollmentInvoice?.plan?.installments[0] ?? null;
  const requiredCashXof =
    applicant.requiredEnrollmentCashXof ?? firstInstallment?.amountDue ?? 0;
  const paidCashXof = applicant.enrollmentInvoice
    ? await verifiedEnrollmentCashXof(tx, applicant.enrollmentInvoice.id)
    : 0;
  const remainingCashXof = firstInstallment
    ? Math.max(0, requiredCashXof - paidCashXof)
    : 0;
  if (
    link?.status !== "active" ||
    applicant.onboardingStatus !== "payment_pending" ||
    applicant.activeOnboardingPaymentLinkId !== paymentLinkId ||
    amountXof > remainingCashXof
  ) {
    throw new BadRequestException(
      "This enrollment payment attempt is no longer current; use the latest payment link",
    );
  }
}

export async function cancelOnboardingPaymentAttemptsInTransaction(
  tx: Prisma.TransactionClient,
  paymentLinkIds: string[],
  reason: string,
  inFlightPolicy: "fail_closed" | "preserve" = "fail_closed",
) {
  if (paymentLinkIds.length === 0) return;
  const submissions = await tx.paymentSubmission.findMany({
    where: {
      paymentLinkId: { in: paymentLinkIds },
      status: { in: ["awaiting_proof", "submitted"] },
    },
    select: { id: true, paymentId: true, status: true },
  });
  const piSpiRequests = await tx.piSpiRequest.findMany({
    where: {
      paymentLinkId: { in: paymentLinkIds },
      status: { in: ["initiated", "sent"] },
    },
    select: { id: true, paymentId: true },
  });
  if (
    inFlightPolicy === "fail_closed" &&
    submissions.some((submission) => submission.status === "submitted")
  ) {
    throw new BadRequestException(
      "The enrollment payment link cannot be rotated while payment proof is under Finance review",
    );
  }
  if (inFlightPolicy === "fail_closed" && piSpiRequests.length > 0) {
    throw new BadRequestException(
      "The enrollment payment link cannot be rotated while a PI-SPI payment request is active",
    );
  }

  // An awaiting-proof draft has no payer evidence and is safe to retire. A
  // submitted proof or live provider request may represent cash already sent:
  // preserve it so Finance/provider confirmation can still book the money.
  const proofDrafts = submissions.filter(
    (submission) => submission.status === "awaiting_proof",
  );
  await tx.paymentSubmission.updateMany({
    where: { id: { in: proofDrafts.map((row) => row.id) } },
    data: {
      status: "cancelled",
      activeKey: null,
      rejectionReason: reason,
    },
  });
  const pendingPaymentIds = proofDrafts.flatMap((row) => row.paymentId ?? []);
  if (pendingPaymentIds.length > 0) {
    await tx.payment.updateMany({
      where: { id: { in: pendingPaymentIds }, status: "pending" },
      data: { status: "cancelled" },
    });
  }
}

/**
 * Prepare a zero-cash enrollment invoice for an explicit admissions
 * cancellation. Proofs already under Finance review and provider requests that
 * are still payable fail closed; staff must resolve those possible cash events
 * first. Only proof drafts and their otherwise dormant pending ledger rows are
 * cancelled here.
 */
export async function cancelDormantEnrollmentAttemptsInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    paymentLinkIds: string[];
    reason: string;
  },
): Promise<{
  cancelledProofDrafts: number;
  cancelledPendingPayments: number;
}> {
  const targetOr = [
    ...(input.paymentLinkIds.length > 0
      ? [{ paymentLinkId: { in: input.paymentLinkIds } }]
      : []),
    { invoiceId: input.invoiceId, source: "public_bill" },
  ];
  const [proofAttempts, providerAttempts] = await Promise.all([
    tx.paymentSubmission.findMany({
      where: {
        status: { in: ["awaiting_proof", "submitted"] },
        OR: targetOr,
      },
      select: { id: true, paymentId: true, status: true },
    }),
    tx.piSpiRequest.findMany({
      where: {
        status: { in: ["initiated", "sent"] },
        OR: targetOr,
      },
      select: { id: true, paymentId: true },
    }),
  ]);
  if (proofAttempts.some((attempt) => attempt.status === "submitted")) {
    throw new BadRequestException(
      "Enrollment cannot be cancelled while payment proof is under Finance review",
    );
  }
  if (providerAttempts.length > 0) {
    throw new BadRequestException(
      "Enrollment cannot be cancelled while a PI-SPI payment request is still active",
    );
  }

  const proofDrafts = proofAttempts.filter(
    (attempt) => attempt.status === "awaiting_proof",
  );
  if (proofDrafts.length > 0) {
    await tx.paymentSubmission.updateMany({
      where: { id: { in: proofDrafts.map((attempt) => attempt.id) } },
      data: {
        status: "cancelled",
        activeKey: null,
        rejectionReason: input.reason,
      },
    });
  }

  // No submitted proof or live provider request remains for this designated
  // invoice. Public-bill/payment-link Payment rows still pending are therefore
  // dormant attempts, not verified cash. Never cross into another invoice.
  const cancelledPayments = await tx.payment.updateMany({
    where: {
      invoiceId: input.invoiceId,
      status: "pending",
      source: { in: ["public_bill", "payment_link"] },
    },
    data: { status: "cancelled" },
  });
  return {
    cancelledProofDrafts: proofDrafts.length,
    cancelledPendingPayments: cancelledPayments.count,
  };
}

/**
 * Reconcile the admissions cash gate after a verified settlement or an approved
 * payment-plan change. Successful Payment rows are the canonical cash value:
 * credits and scholarships never create them, and a refund removes the payment
 * from the successful set even when allocation had produced an account credit.
 */
export async function syncEnrollmentGateInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    invoiceId: string;
    paymentId?: string;
    actorId?: string;
    /** Money settlement/refund must not roll back because another attempt is in flight. */
    inFlightRotationPolicy?: "fail_closed" | "preserve";
  },
): Promise<EnrollmentGateSync | null> {
  const applicant = await tx.applicant.findUnique({
    where: { enrollmentInvoiceId: input.invoiceId },
    include: {
      student: { include: { person: true } },
      enrollmentInvoice: {
        include: {
          plan: {
            include: { installments: { orderBy: { sequence: "asc" } } },
          },
        },
      },
      activeOnboardingPaymentLink: true,
    },
  });
  if (
    !applicant ||
    applicant.onboardingStatus !== "payment_pending" ||
    !applicant.student ||
    !applicant.enrollmentInvoice
  ) {
    return null;
  }
  const enrollmentInvoiceId = applicant.enrollmentInvoice.id;

  const firstInstallment =
    applicant.enrollmentInvoice.plan?.installments[0] ?? null;
  if (!firstInstallment) return null;

  const requiredCashXof = firstInstallment.amountDue;
  const paidCashXof = await verifiedEnrollmentCashXof(tx, enrollmentInvoiceId);
  const remainingCashXof = Math.max(0, requiredCashXof - paidCashXof);
  const now = new Date();

  await tx.applicant.update({
    where: { id: applicant.id },
    data: { requiredEnrollmentCashXof: requiredCashXof },
  });

  if (remainingCashXof > 0) {
    const currentLink = applicant.activeOnboardingPaymentLink;
    if (
      !currentLink ||
      currentLink.status !== "active" ||
      currentLink.amountXof !== remainingCashXof ||
      currentLink.invoiceId !== enrollmentInvoiceId ||
      currentLink.dueDate?.getTime() !== firstInstallment.dueDate.getTime()
    ) {
      if (currentLink) {
        await cancelOnboardingPaymentAttemptsInTransaction(
          tx,
          [currentLink.id],
          "Enrollment balance changed; use the replacement payment link",
          input.inFlightRotationPolicy ?? "fail_closed",
        );
      }
      if (currentLink?.status === "active") {
        await tx.paymentLink.update({
          where: { id: currentLink.id },
          data: { status: "cancelled" },
        });
      }
      const replacement = await tx.paymentLink.create({
        data: {
          token: randomBytes(18).toString("hex"),
          amountXof: remainingCashXof,
          purpose: "First installment required for enrollment",
          payeeName:
            `${applicant.student.person.firstName} ${applicant.student.person.lastName}`
              .replace(/\s+/g, " ")
              .trim(),
          payeeMeta: applicant.student.studentNo,
          studentId: applicant.student.id,
          invoiceId: enrollmentInvoiceId,
          costCenterCode: applicant.enrollmentInvoice.costCenterCode,
          dueDate: firstInstallment.dueDate,
          createdById: input.actorId ?? null,
          onboardingApplicantId: applicant.id,
        },
      });
      await tx.applicant.update({
        where: { id: applicant.id },
        data: { activeOnboardingPaymentLinkId: replacement.id },
      });
      await tx.auditLog.create({
        data: {
          entity: "PaymentLink",
          entityId: replacement.id,
          action: "onboarding-link-rotated",
          actorId: input.actorId,
          data: {
            applicantId: applicant.id,
            invoiceId: enrollmentInvoiceId,
            replacedLinkId: currentLink?.id ?? null,
            amountXof: remainingCashXof,
          },
        },
      });
    }
    return {
      activation: null,
      requiredCashXof,
      paidCashXof,
      remainingCashXof,
    };
  }

  const activationPayment = input.paymentId
    ? await tx.payment.findFirst({
        where: {
          id: input.paymentId,
          invoiceId: enrollmentInvoiceId,
          status: "success",
        },
        select: { id: true },
      })
    : await tx.payment.findFirst({
        where: {
          invoiceId: enrollmentInvoiceId,
          status: "success",
        },
        orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
  // A credit or schedule edit must never fabricate a cash activation.
  if (!activationPayment) {
    return {
      activation: null,
      requiredCashXof,
      paidCashXof,
      remainingCashXof,
    };
  }

  const claimed = await tx.applicant.updateMany({
    where: {
      id: applicant.id,
      onboardingStatus: "payment_pending",
      activatedByPaymentId: null,
    },
    data: {
      onboardingStatus: "enrolled",
      enrolledAt: now,
      statusTokenExpiresAt: new Date(
        now.getTime() + ENROLLED_STATUS_LINK_TTL_MS,
      ),
      activatedByPaymentId: activationPayment.id,
      activeOnboardingPaymentLinkId: null,
    },
  });
  if (claimed.count !== 1) return null;

  await tx.student.update({
    where: { id: applicant.student.id },
    data: { recordStatus: "active", enrolledAt: now },
  });
  const roles = applicant.student.person.roles.includes("student")
    ? applicant.student.person.roles
    : [...applicant.student.person.roles, "student"];
  await tx.person.update({
    where: { id: applicant.student.person.id },
    data: { roles },
  });
  const onboardingLinks = await tx.paymentLink.findMany({
    where: { onboardingApplicantId: applicant.id },
    select: { id: true },
  });
  await tx.paymentLink.updateMany({
    where: { onboardingApplicantId: applicant.id, status: "active" },
    data: { status: "cancelled" },
  });
  await cancelOnboardingPaymentAttemptsInTransaction(
    tx,
    onboardingLinks.map((link) => link.id),
    "Enrollment is already active",
    "preserve",
  );

  await tx.auditLog.create({
    data: {
      entity: "Applicant",
      entityId: applicant.id,
      action: "onboarding-activated",
      actorId: input.actorId,
      data: {
        studentId: applicant.student.id,
        invoiceId: enrollmentInvoiceId,
        paymentId: activationPayment.id,
        requiredCashXof,
        paidCashXof,
      },
    },
  });

  return {
    activation: {
      applicantId: applicant.id,
      studentId: applicant.student.id,
      studentNo: applicant.student.studentNo,
      personId: applicant.student.person.id,
      name: `${applicant.firstName} ${applicant.lastName}`
        .replace(/\s+/g, " ")
        .trim(),
    },
    requiredCashXof,
    paidCashXof,
    remainingCashXof,
  };
}

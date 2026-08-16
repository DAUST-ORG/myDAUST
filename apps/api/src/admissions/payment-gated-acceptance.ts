import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@mydaust/db";
import { normalizeStudentNumber, toDakarDateKey } from "@mydaust/shared";
import { assignStandardPackageInTransaction } from "../finance/standard-package.js";
import { isLegacyCohortStudentNumber } from "./legacy-cohort-import.manifest.js";

const STATUS_TOKEN_BYTES = 32;

export function hashApplicantStatusCapability(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newApplicantStatusCapability(): string {
  return randomBytes(STATUS_TOKEN_BYTES).toString("base64url");
}

export type PaymentGateCreationResult = {
  applicantId: string;
  studentId: string;
  studentNo: string;
  personId: string;
  invoiceId: string;
  paymentLinkId: string;
  requiredEnrollmentCashXof: number;
  statusToken: string;
};

/**
 * Shared atomic data phase for normal acceptance and reviewed legacy cohorts.
 * It deliberately sends no email and never grants a role or password. The
 * caller owns post-commit delivery or explicit in-transaction suppression.
 * Legacy callers provide an explicit F-ID; this helper never reads or advances
 * StudentNumberSequence.
 */
export async function createPaymentGatedAcceptanceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    applicantId: string;
    actorId: string;
    academicYearId: string;
    studentNo: string;
    studentNoSource: "generated" | "legacy_explicit";
  },
): Promise<PaymentGateCreationResult> {
  const reviewedStudentNo = input.studentNo.normalize("NFKC").trim();
  const studentNo = normalizeStudentNumber(input.studentNo);
  const applicant = await tx.applicant.findUnique({
    where: { id: input.applicantId },
  });
  if (!applicant) throw new NotFoundException("Applicant not found");
  if (applicant.onboardingStatus !== "not_started") {
    throw new BadRequestException(
      "Only an applicant whose onboarding has not started can receive a payment gate",
    );
  }
  if (applicant.stage !== "offer" && applicant.stage !== "accepted") {
    throw new BadRequestException(
      "Only an offered applicant can enter the acceptance workflow",
    );
  }
  if (
    !applicant.dateOfBirth ||
    Number.isNaN(applicant.dateOfBirth.getTime()) ||
    applicant.dateOfBirth < new Date("1900-01-01T00:00:00Z") ||
    toDakarDateKey(applicant.dateOfBirth) > toDakarDateKey(new Date())
  ) {
    throw new BadRequestException(
      "A valid date of birth is required before acceptance",
    );
  }
  const isReviewedLegacy = input.studentNoSource === "legacy_explicit";
  if (!applicant.programCode && !isReviewedLegacy) {
    throw new BadRequestException("A program is required before acceptance");
  }
  if (
    isReviewedLegacy &&
    (reviewedStudentNo !== studentNo || !isLegacyCohortStudentNumber(studentNo))
  ) {
    throw new BadRequestException(
      "A reviewed legacy acceptance requires an explicit permanent F-ID",
    );
  }

  const [program, academicYear, existingStudentNo] = await Promise.all([
    applicant.programCode
      ? tx.program.findUnique({ where: { code: applicant.programCode } })
      : Promise.resolve(null),
    tx.academicYear.findUnique({ where: { id: input.academicYearId } }),
    tx.student.findFirst({
      where: {
        studentNo: { equals: studentNo, mode: "insensitive" },
      },
      select: { id: true },
    }),
  ]);
  if (applicant.programCode && !program) {
    throw new BadRequestException("Unknown applicant program");
  }
  if (!academicYear) throw new BadRequestException("Unknown academic year");
  if (existingStudentNo) {
    throw new BadRequestException(
      `Student ID ${studentNo} is already assigned`,
    );
  }

  const email = applicant.email.trim().toLowerCase();
  const existingPerson = await tx.person.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existingPerson) {
    throw new BadRequestException(
      `Email ${email} is already attached to an existing account; reconcile it before acceptance`,
    );
  }

  const now = new Date();
  const person = await tx.person.create({
    data: {
      email,
      firstName: applicant.firstName.trim(),
      lastName: applicant.lastName.trim() || applicant.firstName.trim(),
      kind: "student",
      roles: [],
      passwordHash: null,
      mustChangePassword: false,
    },
  });
  const student = await tx.student.create({
    data: {
      personId: person.id,
      studentNo,
      programId: program?.id ?? null,
      dateOfBirth: new Date(
        `${applicant.dateOfBirth.toISOString().slice(0, 10)}T00:00:00Z`,
      ),
      gender: applicant.gender,
      phone: applicant.phone,
      city: applicant.city,
      nationality: applicant.nationality ?? applicant.country,
      guardianName: applicant.parentName,
      guardianPhone: applicant.parentPhone,
      allergies: applicant.allergies,
      personalEmail: email,
      admitTerm: applicant.term,
      catalogYear: academicYear.label,
      catalogYearId: academicYear.id,
      recordStatus: "pending_payment",
    },
  });

  const assignment = await assignStandardPackageInTransaction(
    tx,
    student.id,
    input.actorId,
    academicYear.id,
  );
  const invoice = await tx.invoice.findUnique({
    where: { id: assignment.invoiceId },
    include: {
      plan: {
        include: { installments: { orderBy: { sequence: "asc" } } },
      },
    },
  });
  const firstInstallment = invoice?.plan?.installments[0];
  if (!invoice || !firstInstallment || firstInstallment.amountDue <= 0) {
    throw new BadRequestException(
      "The approved fee schedule has no payable first installment",
    );
  }

  const paymentToken = newApplicantStatusCapability();
  const paymentLink = await tx.paymentLink.create({
    data: {
      token: paymentToken,
      amountXof: firstInstallment.amountDue,
      purpose: "First enrollment installment",
      payeeName: `${applicant.firstName} ${applicant.lastName}`.trim(),
      payeeMeta: program ? `${studentNo} · ${program.code}` : studentNo,
      studentId: student.id,
      invoiceId: invoice.id,
      costCenterCode: invoice.costCenterCode,
      dueDate: firstInstallment.dueDate,
      createdById: input.actorId,
      onboardingApplicantId: applicant.id,
    },
  });
  const statusToken = newApplicantStatusCapability();
  await tx.applicant.update({
    where: { id: applicant.id },
    data: {
      stage: "accepted",
      onboardingStatus: "payment_pending",
      studentId: student.id,
      admissionAcademicYearId: academicYear.id,
      enrollmentInvoiceId: invoice.id,
      requiredEnrollmentCashXof: firstInstallment.amountDue,
      activeOnboardingPaymentLinkId: paymentLink.id,
      statusTokenHash: hashApplicantStatusCapability(statusToken),
      statusTokenExpiresAt: null,
      statusTokenRevokedAt: null,
      acceptedAt: applicant.acceptedAt ?? now,
      paymentPendingAt: now,
      onboardingCancelledAt: null,
    },
  });
  await tx.auditLog.createMany({
    data: [
      {
        entity: "Applicant",
        entityId: applicant.id,
        action: "applicant-payment-gate-created",
        actorId: input.actorId,
        data: {
          studentId: student.id,
          studentNo,
          studentNoSource: input.studentNoSource,
          academicYearId: academicYear.id,
          invoiceId: invoice.id,
          requiredEnrollmentCashXof: firstInstallment.amountDue,
          paymentLinkId: paymentLink.id,
        },
      },
      {
        entity: "Student",
        entityId: student.id,
        action: "student-created-pending-payment",
        actorId: input.actorId,
        data: {
          applicantId: applicant.id,
          studentNo,
          studentNoSource: input.studentNoSource,
        },
      },
    ],
  });
  return {
    applicantId: applicant.id,
    studentId: student.id,
    studentNo,
    personId: person.id,
    invoiceId: invoice.id,
    paymentLinkId: paymentLink.id,
    requiredEnrollmentCashXof: firstInstallment.amountDue,
    statusToken,
  };
}

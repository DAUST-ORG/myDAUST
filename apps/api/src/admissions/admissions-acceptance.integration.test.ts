import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@mydaust/db";
import { SCHOLARSHIP_TIERS } from "@mydaust/shared";
import { AppConfigService } from "../app-config/app-config.service.js";
import { FinanceService } from "../finance/finance.service.js";
import { AdmissionsService } from "./admissions.service.js";

const SCHEMA = `admission_gate_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

let prisma: PrismaClient;
let admissions: AdmissionsService;
let actorId: string;
let programCode: string;
let academicYearId: string;

async function createApplicant(overrides: Record<string, unknown> = {}) {
  return prisma.applicant.create({
    data: {
      firstName: "Adja",
      lastName: "Diop",
      email: `applicant-${randomUUID()}@test.local`,
      programCode,
      stage: "offer",
      dateOfBirth: new Date("2006-03-12T00:00:00Z"),
      term: "Fall 2026",
      ...overrides,
    },
  });
}

describe.skipIf(!DB_URL)("accepted applicant payment gate", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    process.env.DATABASE_URL = DB_URL!;
    process.env.PORTAL_ORIGIN = "https://my.test.daust.net";
    process.env.PAYMENT_ORIGIN = "https://payment.test.daust.net";
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    const mail = { send: async () => ({ sent: false }) };
    admissions = new AdmissionsService(
      prisma as never,
      mail as never,
      new AppConfigService(prisma as never),
      {} as never,
    );

    await prisma.costCenter.createMany({
      data: [{ code: "9100", name: "Tuition", type: "revenue" }],
      skipDuplicates: true,
    });
    const actor = await prisma.person.create({
      data: {
        email: `admin-${randomUUID()}@test.local`,
        firstName: "Admissions",
        lastName: "Admin",
        kind: "staff",
        roles: ["admin"],
      },
    });
    actorId = actor.id;
    const department = await prisma.department.create({
      data: { code: "CSE", name: "Computer Science" },
    });
    const program = await prisma.program.create({
      data: {
        code: "BSCS",
        name: "Computer Science",
        departmentId: department.id,
      },
    });
    programCode = program.code;
    const academicYear = await prisma.academicYear.create({
      data: {
        label: "2026-2027",
        status: "active",
        startsOn: new Date("2026-08-01T00:00:00Z"),
        endsOn: new Date("2027-07-31T00:00:00Z"),
      },
    });
    academicYearId = academicYear.id;
    await prisma.term.create({
      data: {
        name: "Fall 2026",
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        academicYearId: academicYear.id,
      },
    });
    await prisma.feeSchedule.create({
      data: {
        academicYearLabel: academicYear.label,
        revision: 1,
        status: "approved",
        reason: "Acceptance integration fixture",
        createdById: actor.id,
        approvedById: actor.id,
        approvedAt: new Date(),
        components: {
          create: {
            key: "tuition",
            label: "Tuition",
            costCenterCode: "9100",
            annualAmountXof: 4_000_004,
            defaultSelected: true,
          },
        },
        rows: {
          create: [
            [1, "Registration", "2026-08-25"],
            [2, "Fall balance", "2026-11-25"],
            [3, "Spring registration", "2027-01-25"],
            [4, "Spring balance", "2027-04-25"],
          ].map(([sequence, label, dueOn]) => ({
            academicYearLabel: academicYear.label,
            semester: Number(sequence) < 3 ? "Fall" : "Spring",
            label: String(label),
            sequence: Number(sequence),
            dueOn: new Date(String(dueOn)),
            amountFullXof: 1_000_001,
            amountTuitionXof: 1_000_001,
          })),
        },
      },
    });

    for (const studentNo of ["S20261XX", "S202630YY"]) {
      const person = await prisma.person.create({
        data: {
          email: `${studentNo.toLowerCase()}@test.local`,
          firstName: "Imported",
          lastName: "Student",
          kind: "student",
          roles: ["student"],
        },
      });
      await prisma.student.create({ data: { personId: person.id, studentNo } });
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("seeds fee and scholarship defaults exactly once across concurrent readers", async () => {
    await prisma.feeItem.deleteMany();
    await prisma.scholarshipTier.deleteMany();
    const configs = Array.from(
      { length: 4 },
      () => new AppConfigService(prisma as never),
    );

    await Promise.all(
      configs.flatMap((config) => [
        config.fees(),
        config.scholarships(),
        config.applicationFee(),
      ]),
    );

    await expect(prisma.feeItem.count()).resolves.toBe(5);
    await expect(prisma.scholarshipTier.count()).resolves.toBe(
      SCHOLARSHIP_TIERS.length,
    );
  });

  it("concurrently accepts once and resumes both requests idempotently", async () => {
    const applicant = await createApplicant();
    const results = await Promise.allSettled([
      admissions.adminAcceptApplicant(actorId, applicant.id, {
        academicYearId,
      }),
      admissions.adminAcceptApplicant(actorId, applicant.id, {
        academicYearId,
      }),
    ]);

    expect(
      results
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) => String(result.reason)),
    ).toEqual([]);
    const accepted = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
      include: { student: true },
    });
    expect(accepted).toMatchObject({
      stage: "accepted",
      onboardingStatus: "payment_pending",
      requiredEnrollmentCashXof: 1_000_001,
    });
    expect(accepted.student?.studentNo).toBe("S202631AD");
    expect(accepted.student?.recordStatus).toBe("pending_payment");
    expect(
      await prisma.person.findUniqueOrThrow({
        where: { id: accepted.student!.personId },
      }),
    ).toMatchObject({ roles: [], passwordHash: null });
    await expect(
      admissions.adminAcceptApplicant(actorId, applicant.id, {
        academicYearId,
      }),
    ).resolves.toMatchObject({
      stage: "accepted",
      onboarding: {
        status: "payment_pending",
        emailDelivery: "not_requested",
      },
    });
    const [people, students, invoices, links] = await Promise.all([
      prisma.person.count({ where: { email: applicant.email } }),
      prisma.student.count({ where: { applicant: { id: applicant.id } } }),
      prisma.invoice.count({
        where: { enrollmentForApplicant: { id: applicant.id } },
      }),
      prisma.paymentLink.count({
        where: { onboardingApplicantId: applicant.id },
      }),
    ]);
    expect({ people, students, invoices, links }).toEqual({
      people: 1,
      students: 1,
      invoices: 1,
      links: 1,
    });

    const responseWithToken = results
      .filter(
        (result): result is PromiseFulfilledResult<Record<string, any>> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .find((value) => value.onboarding.statusUrl);
    const token = responseWithToken?.onboarding.statusUrl.split("/").at(-1);
    expect(token).toBeTruthy();
    expect(accepted.statusTokenHash).toBe(
      createHash("sha256").update(token!).digest("hex"),
    );
    expect(accepted.statusTokenHash).not.toBe(token);
    await expect(
      admissions.publicOnboardingStatus(token!),
    ).resolves.toMatchObject({
      onboardingStatus: "payment_pending",
      studentNo: "S202631AD",
      firstInstallment: {
        amountDue: 1_000_001,
        amountPaid: 0,
        remainingAmount: 1_000_001,
      },
      payment: { canPay: true },
    });
  }, 30_000);

  it("rolls back every provisional record when required identity is missing", async () => {
    const applicant = await createApplicant({ dateOfBirth: null });
    await expect(
      admissions.adminAcceptApplicant(actorId, applicant.id, {
        academicYearId,
      }),
    ).rejects.toThrow("date of birth");
    const unchanged = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    expect(unchanged).toMatchObject({
      stage: "offer",
      onboardingStatus: "not_started",
      studentId: null,
      enrollmentInvoiceId: null,
    });
    expect(
      await prisma.person.count({ where: { email: applicant.email } }),
    ).toBe(0);
  });

  it("rejects missing program, unknown year and unapproved schedule without partial rows", async () => {
    const notOffered = await createApplicant({ stage: "review" });
    await expect(
      admissions.adminAcceptApplicant(actorId, notOffered.id, {
        academicYearId,
      }),
    ).rejects.toThrow("Only an offered applicant");
    const missingProgram = await createApplicant({ programCode: null });
    await expect(
      admissions.adminAcceptApplicant(actorId, missingProgram.id, {
        academicYearId,
      }),
    ).rejects.toThrow("program");
    const futureBirthDate = await createApplicant({
      dateOfBirth: new Date("2099-01-01T00:00:00Z"),
    });
    await expect(
      admissions.adminAcceptApplicant(actorId, futureBirthDate.id, {
        academicYearId,
      }),
    ).rejects.toThrow("date of birth");

    const unknownYear = await createApplicant();
    await expect(
      admissions.adminAcceptApplicant(actorId, unknownYear.id, {
        academicYearId: randomUUID(),
      }),
    ).rejects.toThrow("Unknown academic year");

    const yearWithoutSchedule = await prisma.academicYear.create({
      data: {
        label: "2028-2029",
        status: "draft",
        startsOn: new Date("2028-08-01T00:00:00Z"),
      },
    });
    const noSchedule = await createApplicant();
    await expect(
      admissions.adminAcceptApplicant(actorId, noSchedule.id, {
        academicYearId: yearWithoutSchedule.id,
      }),
    ).rejects.toThrow("approved fee schedule");

    for (const applicant of [
      notOffered,
      missingProgram,
      futureBirthDate,
      unknownYear,
      noSchedule,
    ]) {
      const unchanged = await prisma.applicant.findUniqueOrThrow({
        where: { id: applicant.id },
      });
      expect(unchanged).toMatchObject({
        stage: applicant.stage,
        onboardingStatus: "not_started",
        studentId: null,
      });
      expect(
        await prisma.person.count({ where: { email: applicant.email } }),
      ).toBe(0);
    }

    const caseConflict = await createApplicant({
      email: "case-conflict@test.local",
    });
    await prisma.person.create({
      data: {
        email: "Case-Conflict@Test.Local",
        firstName: "Existing",
        lastName: "Account",
        kind: "staff",
        roles: ["registrar"],
      },
    });
    await expect(
      admissions.adminAcceptApplicant(actorId, caseConflict.id, {
        academicYearId,
      }),
    ).rejects.toThrow("existing account");
    expect(
      await prisma.applicant.findUniqueOrThrow({
        where: { id: caseConflict.id },
      }),
    ).toMatchObject({
      stage: "offer",
      onboardingStatus: "not_started",
      studentId: null,
    });
  });

  it("rotates private capabilities and keeps enrolled status read-only for 30 days", async () => {
    const applicant = await createApplicant();
    const accepted = (await admissions.adminAcceptApplicant(
      actorId,
      applicant.id,
      { academicYearId },
    )) as any;
    const firstToken = String(accepted.onboarding.statusUrl).split("/").at(-1)!;
    await expect(
      admissions.publicOnboardingStatus(applicant.id),
    ).rejects.toThrow("not found");

    const resent = (await admissions.adminResendAcceptance(
      actorId,
      applicant.id,
    )) as any;
    const secondToken = String(resent.onboarding.statusUrl).split("/").at(-1)!;
    expect(secondToken).not.toBe(firstToken);
    await expect(admissions.publicOnboardingStatus(firstToken)).rejects.toThrow(
      "not found",
    );
    await expect(
      admissions.publicOnboardingStatus(secondToken),
    ).resolves.toMatchObject({ onboardingStatus: "payment_pending" });

    const beforeRotation = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    const staleProof = await prisma.paymentSubmission.create({
      data: {
        status: "submitted",
        method: "wave",
        source: "payment_link",
        studentId: beforeRotation.studentId,
        invoiceId: beforeRotation.enrollmentInvoiceId,
        paymentLinkId: beforeRotation.activeOnboardingPaymentLinkId,
        submittedAmountXof: 1_000_001,
        contactEmail: applicant.email,
        bankSnapshot: {},
      },
    });
    const stalePiSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `acceptance-rotate-${randomUUID()}`,
        status: "initiated",
        source: "payment_link",
        payerAlias: randomUUID(),
        amountXof: 1_000_001,
        motif: "Enrollment",
        paymentLinkId: beforeRotation.activeOnboardingPaymentLinkId,
      },
    });
    await expect(
      admissions.adminRotateOnboardingLink(actorId, applicant.id),
    ).rejects.toThrow("proof is under Finance review");
    await expect(
      prisma.paymentLink.findUniqueOrThrow({
        where: { id: beforeRotation.activeOnboardingPaymentLinkId! },
      }),
    ).resolves.toMatchObject({ status: "active" });
    await expect(
      prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: staleProof.id },
      }),
    ).resolves.toMatchObject({ status: "submitted" });
    await expect(
      prisma.piSpiRequest.findUniqueOrThrow({ where: { id: stalePiSpi.id } }),
    ).resolves.toMatchObject({ status: "initiated" });
    await expect(
      admissions.publicOnboardingStatus(secondToken),
    ).resolves.toMatchObject({ onboardingStatus: "payment_pending" });

    await prisma.paymentSubmission.update({
      where: { id: staleProof.id },
      data: { status: "rejected", activeKey: null },
    });
    await expect(
      admissions.adminRotateOnboardingLink(actorId, applicant.id),
    ).rejects.toThrow("PI-SPI payment request is active");
    await expect(
      prisma.paymentLink.findUniqueOrThrow({
        where: { id: beforeRotation.activeOnboardingPaymentLinkId! },
      }),
    ).resolves.toMatchObject({ status: "active" });

    await prisma.piSpiRequest.update({
      where: { id: stalePiSpi.id },
      data: { status: "cancelled", statusReason: "Payer cancelled request" },
    });
    const rotated = (await admissions.adminRotateOnboardingLink(
      actorId,
      applicant.id,
    )) as any;
    const thirdToken = String(rotated.onboarding.statusUrl).split("/").at(-1)!;
    expect(thirdToken).not.toBe(secondToken);
    expect(
      await prisma.paymentLink.findUniqueOrThrow({
        where: { id: beforeRotation.activeOnboardingPaymentLinkId! },
      }),
    ).toMatchObject({ status: "cancelled" });
    expect(
      await prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: staleProof.id },
      }),
    ).toMatchObject({ status: "rejected", activeKey: null });
    expect(
      await prisma.piSpiRequest.findUniqueOrThrow({
        where: { id: stalePiSpi.id },
      }),
    ).toMatchObject({ status: "cancelled" });
    await expect(
      admissions.publicOnboardingStatus(secondToken),
    ).rejects.toThrow("not found");
    await expect(
      admissions.adminUpdateApplicant(actorId, applicant.id, {
        email: "changed-after-acceptance@test.local",
      }),
    ).rejects.toThrow("reviewed correction workflow");

    const now = new Date();
    await prisma.$transaction([
      prisma.applicant.update({
        where: { id: applicant.id },
        data: {
          onboardingStatus: "enrolled",
          enrolledAt: now,
          statusTokenExpiresAt: new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      }),
      prisma.student.update({
        where: { id: beforeRotation.studentId! },
        data: { recordStatus: "active" },
      }),
    ]);
    await expect(
      admissions.publicOnboardingStatus(thirdToken),
    ).resolves.toMatchObject({
      onboardingStatus: "enrolled",
      readOnly: true,
      payment: { canPay: false, paymentUrl: null },
    });

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: beforeRotation.studentId! },
    });
    const actualInvites = await prisma.studentInvite.findMany({
      where: { studentPersonId: student.personId },
    });
    expect(actualInvites).toHaveLength(0);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: applicant.id,
          action: { startsWith: "student-invite-" },
        },
      }),
    ).toBe(0);

    await prisma.applicant.update({
      where: { id: applicant.id },
      data: { statusTokenExpiresAt: new Date(Date.now() - 1) },
    });
    await expect(admissions.publicOnboardingStatus(thirdToken)).rejects.toThrow(
      "not found",
    );
  });

  it("cancels a zero-cash onboarding gate without deleting its permanent identity", async () => {
    const applicant = await createApplicant();
    const accepted = (await admissions.adminAcceptApplicant(
      actorId,
      applicant.id,
      { academicYearId },
    )) as any;
    const statusToken = String(accepted.onboarding.statusUrl)
      .split("/")
      .at(-1)!;
    const pending = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
      include: {
        student: { include: { person: true } },
        enrollmentInvoice: { include: { plan: true } },
      },
    });
    const studentNo = pending.student!.studentNo;
    const planId = pending.enrollmentInvoice!.plan!.id;
    await prisma.person.update({
      where: { id: pending.student!.personId },
      data: {
        roles: ["student", "registrar"],
        passwordHash: "provisional-password-must-be-revoked",
        mustChangePassword: true,
      },
    });
    const invite = await prisma.studentInvite.create({
      data: {
        studentPersonId: pending.student!.personId,
        tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const publicDraftPayment = await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 250_000,
        method: "wave",
        status: "pending",
        providerRef: `cancel-public-${randomUUID()}`,
        source: "public_bill",
      },
    });
    const publicDraft = await prisma.paymentSubmission.create({
      data: {
        status: "awaiting_proof",
        activeKey: `invoice:${pending.enrollmentInvoiceId}`,
        method: "wave",
        source: "public_bill",
        studentId: pending.studentId,
        invoiceId: pending.enrollmentInvoiceId,
        paymentId: publicDraftPayment.id,
        submittedAmountXof: publicDraftPayment.amount,
        contactEmail: applicant.email,
        bankSnapshot: {},
      },
    });
    const linkDraftPayment = await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 100_000,
        method: "orange_money",
        status: "pending",
        providerRef: `cancel-link-${randomUUID()}`,
        source: "payment_link",
      },
    });
    const linkDraft = await prisma.paymentSubmission.create({
      data: {
        status: "awaiting_proof",
        method: "orange_money",
        source: "payment_link",
        studentId: pending.studentId,
        invoiceId: pending.enrollmentInvoiceId,
        paymentId: linkDraftPayment.id,
        paymentLinkId: pending.activeOnboardingPaymentLinkId,
        submittedAmountXof: linkDraftPayment.amount,
        contactEmail: applicant.email,
        bankSnapshot: {},
      },
    });
    const dormantPayment = await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 50_000,
        method: "wire",
        status: "pending",
        providerRef: `cancel-dormant-${randomUUID()}`,
        source: "public_bill",
      },
    });

    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Applicant withdrew before making an enrollment payment",
      ),
    ).resolves.toMatchObject({
      stage: "accepted",
      onboarding: {
        status: "cancelled",
        cancelledAt: expect.any(String),
        studentNo,
        paymentLink: null,
      },
    });

    const cancelled = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
      include: {
        student: { include: { person: true } },
        enrollmentInvoice: { include: { plan: true } },
        onboardingPaymentLinks: true,
      },
    });
    expect(cancelled).toMatchObject({
      stage: "accepted",
      onboardingStatus: "cancelled",
      activeOnboardingPaymentLinkId: null,
    });
    expect(cancelled.onboardingCancelledAt).not.toBeNull();
    expect(cancelled.statusTokenRevokedAt).not.toBeNull();
    expect(cancelled.student).toMatchObject({
      studentNo,
      recordStatus: "archived",
      enrolledAt: null,
    });
    expect(cancelled.student!.person).toMatchObject({
      roles: ["registrar"],
      passwordHash: null,
      mustChangePassword: false,
    });
    expect(cancelled.enrollmentInvoice).toMatchObject({
      status: "void",
      plan: { id: planId },
    });
    expect(
      cancelled.onboardingPaymentLinks.every(
        (link) => link.status === "cancelled",
      ),
    ).toBe(true);
    await expect(
      prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: publicDraft.id },
      }),
    ).resolves.toMatchObject({ status: "cancelled", activeKey: null });
    await expect(
      prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: linkDraft.id },
      }),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(
      await prisma.payment.findMany({
        where: {
          id: {
            in: [publicDraftPayment.id, linkDraftPayment.id, dormantPayment.id],
          },
        },
        select: { status: true },
      }),
    ).toEqual([
      { status: "cancelled" },
      { status: "cancelled" },
      { status: "cancelled" },
    ]);
    await expect(
      prisma.studentInvite.findUniqueOrThrow({ where: { id: invite.id } }),
    ).resolves.toMatchObject({ usedAt: expect.any(Date) });
    await expect(
      admissions.publicOnboardingStatus(statusToken),
    ).rejects.toThrow("not found");

    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Repeat request remains an idempotent detail read",
      ),
    ).resolves.toMatchObject({
      stage: "accepted",
      onboarding: { status: "cancelled", studentNo },
    });
    await expect(
      prisma.auditLog.count({
        where: {
          entity: "Applicant",
          entityId: applicant.id,
          action: "onboarding-cancelled",
        },
      }),
    ).resolves.toBe(1);
  }, 30_000);

  it("fails closed while proof, provider settlement or refund activity is in flight", async () => {
    const applicant = await createApplicant();
    await admissions.adminAcceptApplicant(actorId, applicant.id, {
      academicYearId,
    });
    const pending = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    const proofPayment = await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 100_000,
        method: "wire",
        status: "pending",
        providerRef: `review-proof-${randomUUID()}`,
        source: "public_bill",
      },
    });
    const proof = await prisma.paymentSubmission.create({
      data: {
        status: "submitted",
        activeKey: `invoice:${pending.enrollmentInvoiceId}`,
        source: "public_bill",
        studentId: pending.studentId,
        invoiceId: pending.enrollmentInvoiceId,
        paymentId: proofPayment.id,
        submittedAmountXof: proofPayment.amount,
        contactEmail: applicant.email,
        bankSnapshot: {},
      },
    });
    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Applicant asked to withdraw while proof is under review",
      ),
    ).rejects.toThrow("under Finance review");
    await prisma.$transaction([
      prisma.paymentSubmission.update({
        where: { id: proof.id },
        data: { status: "rejected", activeKey: null },
      }),
      prisma.payment.update({
        where: { id: proofPayment.id },
        data: { status: "cancelled" },
      }),
    ]);

    const piSpiPayment = await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 100_000,
        method: "pi_spi",
        status: "pending",
        providerRef: `review-pispi-${randomUUID()}`,
        source: "public_bill",
      },
    });
    const piSpi = await prisma.piSpiRequest.create({
      data: {
        txId: `cancel-${randomUUID()}`,
        status: "sent",
        source: "public_bill",
        payerAlias: randomUUID(),
        amountXof: piSpiPayment.amount,
        motif: "Enrollment",
        studentId: pending.studentId,
        invoiceId: pending.enrollmentInvoiceId,
        paymentId: piSpiPayment.id,
      },
    });
    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Applicant asked to withdraw while provider payment is active",
      ),
    ).rejects.toThrow("PI-SPI payment request is still active");
    await prisma.$transaction([
      prisma.piSpiRequest.update({
        where: { id: piSpi.id },
        data: { status: "cancelled" },
      }),
      prisma.payment.update({
        where: { id: piSpiPayment.id },
        data: { status: "cancelled" },
      }),
    ]);

    const refund = await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 10_000,
        method: "wire",
        status: "refund_pending",
        providerRef: `review-refund-${randomUUID()}`,
        source: "public_bill",
      },
    });
    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Applicant asked to withdraw while a refund is pending",
      ),
    ).rejects.toThrow("refund is pending");
    await prisma.payment.update({
      where: { id: refund.id },
      data: { status: "refunded", refundedAt: new Date() },
    });
    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Applicant withdrew after all pending money activity was resolved",
      ),
    ).resolves.toMatchObject({ onboarding: { status: "cancelled" } });

    const finance = new FinanceService(
      prisma as never,
      { send: async () => ({ sent: false }) } as never,
      {} as never,
      new Map() as never,
    );
    await (finance as any).applyPiSpiEvent({
      txId: piSpi.txId,
      end2endId: `late-${randomUUID()}`,
      status: "settled",
      statusReason: null,
      amount: piSpiPayment.amount,
    });
    await expect(
      prisma.payment.findUniqueOrThrow({ where: { id: piSpiPayment.id } }),
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      prisma.piSpiRequest.findUniqueOrThrow({ where: { id: piSpi.id } }),
    ).resolves.toMatchObject({
      status: "settled",
      settledAmountXof: piSpiPayment.amount,
    });
    await expect(
      prisma.invoice.findUniqueOrThrow({
        where: { id: pending.enrollmentInvoiceId! },
      }),
    ).resolves.toMatchObject({ status: "void", amountPaid: 0 });
    await expect(
      prisma.invoice.findUniqueOrThrow({
        where: { number: `CR-PAY-${piSpiPayment.id}` },
      }),
    ).resolves.toMatchObject({
      packageType: "credit",
      totalAmount: -piSpiPayment.amount,
    });
    await expect(
      prisma.studentHold.findFirstOrThrow({
        where: {
          studentId: pending.studentId!,
          active: true,
          type: "payment_reconciliation",
        },
      }),
    ).resolves.toMatchObject({
      reason: expect.stringContaining("cancelled enrollment payment request"),
    });
  }, 30_000);

  it("rejects cancellation after any verified enrollment cash", async () => {
    const applicant = await createApplicant();
    await admissions.adminAcceptApplicant(actorId, applicant.id, {
      academicYearId,
    });
    const pending = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    await prisma.payment.create({
      data: {
        invoiceId: pending.enrollmentInvoiceId!,
        studentId: pending.studentId!,
        amount: 1,
        method: "wire",
        status: "success",
        providerRef: `verified-cash-${randomUUID()}`,
        source: "public_bill",
        settledAt: new Date(),
      },
    });

    await expect(
      admissions.adminCancelOnboarding(
        actorId,
        applicant.id,
        "Applicant asked to cancel after a verified payment",
      ),
    ).rejects.toThrow("verified cash");
    await expect(
      prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } }),
    ).resolves.toMatchObject({ onboardingStatus: "payment_pending" });
    await expect(
      prisma.invoice.findUniqueOrThrow({
        where: { id: pending.enrollmentInvoiceId! },
      }),
    ).resolves.not.toMatchObject({ status: "void" });
  });

  it("advances past a higher manual import even when the yearly counter exists", async () => {
    const person = await prisma.person.create({
      data: {
        email: `late-import-${randomUUID()}@test.local`,
        firstName: "Late",
        lastName: "Import",
        kind: "student",
        roles: ["student"],
      },
    });
    await prisma.student.create({
      data: { personId: person.id, studentNo: "S202650ZZ" },
    });
    const applicant = await createApplicant();
    await admissions.adminAcceptApplicant(actorId, applicant.id, {
      academicYearId,
    });
    const accepted = await prisma.applicant.findUniqueOrThrow({
      where: { id: applicant.id },
      include: { student: true },
    });
    expect(accepted.student?.studentNo).toBe("S202651AD");
    expect(
      await prisma.studentNumberSequence.findUniqueOrThrow({
        where: { academicYearStart: 2026 },
      }),
    ).toMatchObject({ nextValue: 52 });
  });
});

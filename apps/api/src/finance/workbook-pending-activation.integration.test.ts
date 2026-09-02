import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@mydaust/db";

vi.mock("./workbook-cutover.audit.js", () => ({
  auditWorkbookCutoverBatch: vi.fn(async () => ({ ok: true })),
}));
import {
  WORKBOOK_PENDING_ACTIVATION_APPLICANT_AUDIT_ACTION,
  WORKBOOK_PENDING_ACTIVATION_BATCH_AUDIT_ACTION,
  WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION,
  WorkbookPendingActivationBlockedError,
  executeWorkbookPendingActivation,
  planWorkbookPendingActivationFromDatabase,
} from "./workbook-pending-activation.runner.js";

const SCHEMA = `workbook_pending_activation_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

const run = DB_URL ? describe : describe.skip;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

let prisma: PrismaClient;
let batchId: string;
let actorEmail: string;
let studentIds: string[];
let applicantIds: string[];
let linkIds: string[];
let invoiceIds: string[];

run("workbook pending-payment activation PostgreSQL transaction", () => {
  beforeAll(async () => {
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@mydaust/db",
        "exec",
        "prisma",
        "db",
        "push",
        "--skip-generate",
      ],
      {
        cwd: new URL("../../../..", import.meta.url),
        env: { ...process.env, DATABASE_URL: DB_URL! },
        stdio: "ignore",
      },
    );
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    actorEmail = `pending-activation-admin-${randomUUID()}@test.local`;
    const actor = await prisma.person.create({
      data: {
        email: actorEmail,
        firstName: "Activation",
        lastName: "Administrator",
        kind: "staff",
        roles: ["admin"],
      },
    });
    const academicYear = await prisma.academicYear.create({
      data: {
        label: "2026-2027",
        status: "active",
        startsOn: new Date("2026-08-01T00:00:00.000Z"),
        endsOn: new Date("2027-07-31T00:00:00.000Z"),
      },
    });
    const term = await prisma.term.create({
      data: {
        name: `Pending activation term ${randomUUID()}`,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        academicYearId: academicYear.id,
      },
    });
    await prisma.costCenter.create({
      data: { code: "9100", name: "Tuition", type: "revenue" },
    });
    const batch = await prisma.workbookCutoverBatch.create({
      data: {
        sourceFileName: "source.xlsx",
        sourceWorkbookSha256: sha("workbook"),
        sourceExtractionSha256: sha("extraction"),
        identityManifestSha256: sha("manifest"),
        rosterSnapshotSha256: sha("snapshot"),
        confirmationPlanSha256: sha("cutover-plan"),
        status: "imported",
        academicYearLabel: academicYear.label,
        sourceAsOfDate: new Date("2026-08-29T00:00:00.000Z"),
        workbookRowCount: 9,
        productionStudentCount: 9,
        applicantCount: 0,
        workbookLinkedRows: 9,
        productionLinkedStudents: 9,
        sourceBilledXof: 9_000_000n,
        sourcePaidXof: 0n,
        includedBilledXof: 9_000_000n,
        includedPaidXof: 0n,
        createdById: actor.id,
        importedAt: new Date("2026-09-02T11:44:00.000Z"),
      },
    });
    batchId = batch.id;
    studentIds = [];
    applicantIds = [];
    linkIds = [];
    invoiceIds = [];

    for (let index = 0; index < 9; index += 1) {
      const person = await prisma.person.create({
        data: {
          email: `pending-student-${index}-${randomUUID()}@test.local`,
          firstName: `Pending${index}`,
          lastName: "Student",
          kind: "student",
          roles: [],
          passwordHash: null,
          mustChangePassword: false,
          student: {
            create: {
              studentNo: `PENDING-${randomUUID()}`,
              recordStatus: "pending_payment",
              enrolledAt: null,
            },
          },
        },
        include: { student: true },
      });
      const student = person.student!;
      const invoice = await prisma.invoice.create({
        data: {
          studentId: student.id,
          termId: term.id,
          number: `PENDING-INV-${randomUUID()}`,
          totalAmount: 1_000_000,
          amountPaid: 0,
          status: "open",
          costCenterCode: "9100",
          packageType: "standard_full",
          academicYearLabel: academicYear.label,
        },
      });
      const profile = await prisma.annualBillingProfile.create({
        data: {
          studentId: student.id,
          academicYearLabel: academicYear.label,
          status: "active",
          sourceKind: "workbook",
          sourceWorkbookSha256: batch.sourceWorkbookSha256,
          sourceSheet: "Comparison",
          sourceRowNumber: index + 2,
          sourceRowFingerprintSha256: sha(`row-${index}`),
          sourceAsOfDate: batch.sourceAsOfDate,
          canonicalInvoiceId: invoice.id,
          grossChargesXof: 1_000_000,
          netBilledXof: 1_000_000,
        },
      });
      const applicant = await prisma.applicant.create({
        data: {
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email!,
          stage: "accepted",
          onboardingStatus: "payment_pending",
          studentId: student.id,
          enrollmentInvoiceId: invoice.id,
          requiredEnrollmentCashXof: 250_000,
          acceptedAt: new Date("2026-08-01T10:00:00.000Z"),
          paymentPendingAt: new Date("2026-08-01T10:01:00.000Z"),
          statusTokenHash: sha(`status-token-${index}`),
        },
      });
      const link = await prisma.paymentLink.create({
        data: {
          token: `pending-link-${randomUUID()}`,
          amountXof: 250_000,
          purpose: "First installment required for enrollment",
          payeeName: `${person.firstName} ${person.lastName}`,
          payeeMeta: student.studentNo,
          studentId: student.id,
          invoiceId: invoice.id,
          costCenterCode: "9100",
          status: "active",
          onboardingApplicantId: applicant.id,
        },
      });
      await prisma.applicant.update({
        where: { id: applicant.id },
        data: { activeOnboardingPaymentLinkId: link.id },
      });
      const workbookRecord = await prisma.workbookCutoverSourceRecord.create({
        data: {
          batchId,
          sourceKind: "workbook_row",
          sourceKey: `workbook-row:${index}`,
          sourceKeySha256: sha(`workbook-row:${index}`),
          sourceFingerprintSha256: sha(`workbook-fingerprint:${index}`),
          sourceClaimSha256: sha(`workbook-claim:${index}`),
          sourceSheet: "Comparison",
          sourceRowNumber: index + 2,
          sourceStudentClaim: student.studentNo,
          sourceBilledXof: 1_000_000n,
          sourcePaidXof: 0n,
          disposition: "link_existing_student",
          studentId: student.id,
          billingProfileId: profile.id,
          canonicalInvoiceId: invoice.id,
          appliedAt: new Date("2026-09-02T11:44:00.000Z"),
        },
      });
      await prisma.workbookCutoverSourceRecord.create({
        data: {
          batchId,
          sourceKind: "production_student",
          sourceKey: `production-student:${index}`,
          sourceKeySha256: sha(`production-student:${index}`),
          sourceFingerprintSha256: sha(`production-fingerprint:${index}`),
          disposition: "link_workbook_row",
          studentId: student.id,
          linkedWorkbookRecordId: workbookRecord.id,
          appliedAt: new Date("2026-09-02T11:44:00.000Z"),
        },
      });
      studentIds.push(student.id);
      applicantIds.push(applicant.id);
      linkIds.push(link.id);
      invoiceIds.push(invoice.id);
    }

    const fillerPeople = Array.from({ length: 437 }, (_, index) => ({
      id: randomUUID(),
      email: `roster-control-${index}-${randomUUID()}@test.local`,
      firstName: `Roster${index}`,
      lastName: "Control",
      kind: "student" as const,
      roles: index < 391 ? ["student"] : [],
    }));
    await prisma.person.createMany({ data: fillerPeople });
    await prisma.student.createMany({
      data: fillerPeople.map((person, index) => ({
        personId: person.id,
        studentNo: `ROSTER-CONTROL-${randomUUID()}`,
        recordStatus: index < 391 ? ("active" as const) : ("archived" as const),
        enrolledAt: index < 391 ? new Date("2026-08-01T00:00:00.000Z") : null,
      })),
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$disconnect();
    const adminUrl = new URL(DB_URL!);
    adminUrl.searchParams.set("schema", "public");
    const admin = new PrismaClient({
      datasources: { db: { url: adminUrl.toString() } },
    });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await admin.$disconnect();
  });

  it("blocks in-flight cash, rejects a wrong digest, rolls back atomically, and replays with zero writes", async () => {
    const invocation = { batchId, actorEmail };
    const initialDryRun = await planWorkbookPendingActivationFromDatabase(
      prisma,
      invocation,
    );
    expect(initialDryRun).toMatchObject({
      confirmBlocked: false,
      targetCount: 9,
      activeLinkCount: 9,
      proofDraftCount: 0,
      submittedProofCount: 0,
      activePiSpiCount: 0,
      pendingPaymentCount: 0,
      refundPendingCount: 0,
    });

    const inFlightPayment = await prisma.payment.create({
      data: {
        studentId: studentIds[0]!,
        invoiceId: invoiceIds[0]!,
        amount: 100_000,
        method: "wire",
        status: "pending",
        provider: "blocked-proof-test",
        providerRef: `blocked-proof-${randomUUID()}`,
        source: "payment_link",
      },
    });
    const inFlightSubmission = await prisma.paymentSubmission.create({
      data: {
        resumeToken: `blocked-resume-${randomUUID()}`,
        activeKey: `blocked-active-${randomUUID()}`,
        status: "submitted",
        method: "wire",
        source: "payment_link",
        studentId: studentIds[0],
        invoiceId: invoiceIds[0],
        paymentId: inFlightPayment.id,
        paymentLinkId: linkIds[0],
        applicantId: applicantIds[0],
        submittedAmountXof: 100_000,
        contactEmail: "blocked@test.local",
        payerProofSubmittedAt: new Date("2026-09-02T11:00:00.000Z"),
        proofObjectKey: "proofs/blocked",
        proofFileName: "proof.pdf",
        proofMimeType: "application/pdf",
        proofSize: 100,
        bankSnapshot: {},
      },
    });
    const blockedPlan = await planWorkbookPendingActivationFromDatabase(
      prisma,
      invocation,
    );
    expect(blockedPlan).toMatchObject({
      confirmBlocked: true,
      submittedProofCount: 1,
      pendingPaymentCount: 1,
    });
    expect(blockedPlan.blockers.map((row) => row.code)).toEqual(
      expect.arrayContaining([
        "active_payment_proof_attempt",
        "pending_payment_attempt",
      ]),
    );
    await expect(
      executeWorkbookPendingActivation(prisma, {
        ...invocation,
        expectedPlanSha256: blockedPlan.planSha256,
      }),
    ).rejects.toBeInstanceOf(WorkbookPendingActivationBlockedError);
    await prisma.paymentSubmission.delete({
      where: { id: inFlightSubmission.id },
    });
    await prisma.payment.delete({ where: { id: inFlightPayment.id } });
    const dryRun = await planWorkbookPendingActivationFromDatabase(
      prisma,
      invocation,
    );
    expect(dryRun.planSha256).toBe(initialDryRun.planSha256);

    await expect(
      executeWorkbookPendingActivation(prisma, {
        ...invocation,
        expectedPlanSha256: "f".repeat(64),
      }),
    ).rejects.toBeInstanceOf(WorkbookPendingActivationBlockedError);
    await expect(
      prisma.student.count({ where: { recordStatus: "pending_payment" } }),
    ).resolves.toBe(9);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${SCHEMA}"."fail_pending_activation_audit"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."entity" = 'Student' AND NEW."action" = '${WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION}' THEN
          RAISE EXCEPTION 'forced activation audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "fail_pending_activation_audit_trigger"
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION "${SCHEMA}"."fail_pending_activation_audit"();
    `);
    await expect(
      executeWorkbookPendingActivation(prisma, {
        ...invocation,
        expectedPlanSha256: dryRun.planSha256,
      }),
    ).rejects.toThrow(/forced activation audit failure/);
    await expect(
      prisma.student.count({ where: { recordStatus: "pending_payment" } }),
    ).resolves.toBe(9);
    await expect(
      prisma.applicant.count({
        where: { onboardingStatus: "payment_pending" },
      }),
    ).resolves.toBe(9);
    await expect(
      prisma.paymentLink.count({ where: { status: "active" } }),
    ).resolves.toBe(9);
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER "fail_pending_activation_audit_trigger" ON "AuditLog"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION "${SCHEMA}"."fail_pending_activation_audit"()`,
    );

    const invoiceStateBefore = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        totalAmount: true,
        amountPaid: true,
        status: true,
        revision: true,
      },
    });
    const inviteCountBefore = await prisma.studentInvite.count();
    const enrollmentCountBefore = await prisma.enrollment.count();
    const result = await executeWorkbookPendingActivation(prisma, {
      ...invocation,
      expectedPlanSha256: dryRun.planSha256,
    });
    expect(result).toMatchObject({
      alreadyApplied: false,
      activatedStudents: 9,
      activatedApplicants: 9,
      cancelledPaymentLinks: 9,
      cancelledProofDrafts: 0,
      cancelledDraftPayments: 0,
      auditRowsCreated: 19,
    });
    await expect(
      prisma.student.count({ where: { recordStatus: "active" } }),
    ).resolves.toBe(400);
    await expect(
      prisma.student.count({ where: { recordStatus: "pending_payment" } }),
    ).resolves.toBe(0);
    await expect(
      prisma.student.count({ where: { recordStatus: "archived" } }),
    ).resolves.toBe(46);
    await expect(prisma.student.count()).resolves.toBe(446);
    const studentPeople = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        person: {
          select: {
            roles: true,
            passwordHash: true,
            sessionVersion: true,
          },
        },
      },
    });
    expect(studentPeople).toHaveLength(9);
    expect(
      studentPeople.every((row) => row.person.roles.join() === "student"),
    ).toBe(true);
    expect(studentPeople.every((row) => row.person.passwordHash === null)).toBe(
      true,
    );
    expect(studentPeople.every((row) => row.person.sessionVersion === 1)).toBe(
      true,
    );
    const activatedApplicants = await prisma.applicant.findMany({
      where: { id: { in: applicantIds } },
    });
    expect(
      activatedApplicants.every(
        (row) =>
          row.stage === "accepted" &&
          row.onboardingStatus === "enrolled" &&
          row.activatedByPaymentId === null &&
          row.activeOnboardingPaymentLinkId === null &&
          row.statusTokenHash === null &&
          row.statusTokenRevokedAt !== null,
      ),
    ).toBe(true);
    await expect(prisma.paymentSubmission.count()).resolves.toBe(0);
    await expect(prisma.piSpiRequest.count()).resolves.toBe(0);
    await expect(prisma.payment.count()).resolves.toBe(0);
    expect(
      await prisma.invoice.findMany({
        where: { id: { in: invoiceIds } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          totalAmount: true,
          amountPaid: true,
          status: true,
          revision: true,
        },
      }),
    ).toEqual(invoiceStateBefore);
    expect(await prisma.studentInvite.count()).toBe(inviteCountBefore);
    expect(await prisma.enrollment.count()).toBe(enrollmentCountBefore);

    const lifecycleAudits = await prisma.auditLog.findMany({
      where: {
        action: WORKBOOK_PENDING_ACTIVATION_STUDENT_AUDIT_ACTION,
        entity: { in: ["Student", "Applicant"] },
      },
    });
    expect(
      lifecycleAudits.filter((row) => row.entity === "Student"),
    ).toHaveLength(9);
    expect(
      lifecycleAudits.filter((row) => row.entity === "Applicant"),
    ).toHaveLength(9);
    await expect(
      prisma.auditLog.count({
        where: {
          entity: "WorkbookCutoverBatch",
          entityId: batchId,
          action: WORKBOOK_PENDING_ACTIVATION_BATCH_AUDIT_ACTION,
        },
      }),
    ).resolves.toBe(1);
    const auditsBeforeReplay = await prisma.auditLog.count();
    const replay = await executeWorkbookPendingActivation(prisma, {
      ...invocation,
      expectedPlanSha256: dryRun.planSha256,
    });
    expect(replay).toMatchObject({
      alreadyApplied: true,
      activatedStudents: 0,
      auditRowsCreated: 0,
    });
    expect(await prisma.auditLog.count()).toBe(auditsBeforeReplay);
    const replayPlan = await planWorkbookPendingActivationFromDatabase(
      prisma,
      invocation,
    );
    expect(replayPlan).toMatchObject({
      alreadyApplied: true,
      planSha256: dryRun.planSha256,
      targetCount: 9,
    });
  }, 120_000);
});

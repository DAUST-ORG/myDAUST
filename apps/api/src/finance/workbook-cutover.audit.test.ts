import { createHash } from "node:crypto";
import type { PrismaClient } from "@mydaust/db";
import { describe, expect, it } from "vitest";
import {
  WORKBOOK_CUTOVER_ARCHIVE_AUDIT,
  WORKBOOK_CUTOVER_BATCH_AUDIT,
  WORKBOOK_CUTOVER_PAYMENT_AUDIT,
  auditWorkbookCutoverBatch,
  captureWorkbookCutoverAcademicFingerprint,
} from "./workbook-cutover.audit.js";
import {
  canonicalWorkbookCutoverJson,
  workbookCutoverAcademicFingerprintDigest,
} from "./workbook-cutover.manifest.js";
import { WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256 } from "./workbook-cutover-attestation.service.js";

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotHash(value: unknown): string {
  return sha(canonicalWorkbookCutoverJson(value));
}

function jsonSnapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function sourceBase(sourceKey: string, sourceKind: string) {
  return {
    id: `record-${sha(sourceKey).slice(0, 12)}`,
    batchId: "batch-1",
    sourceKind,
    sourceKey,
    sourceKeySha256: sha(sourceKey),
    sourceFingerprintSha256: sha(`fingerprint:${sourceKey}`),
    sourceClaimSha256:
      sourceKind === "workbook_row" ? sha(`claim:${sourceKey}`) : null,
    reviewedById: "reviewer-1",
    reviewedAt: new Date("2026-09-01T10:00:00.000Z"),
    reviewReason: "Signed test disposition evidence",
    reviewSignatureSha256: sha(`review:${sourceKey}`),
    appliedAt: new Date("2026-09-01T11:00:00.000Z"),
    linkedWorkbookRecordId: null,
    linkedWorkbookRecord: null,
    duplicateOfRecordId: null,
    duplicateOfRecord: null,
    priorRecordId: null,
    studentId: null,
    student: null,
    applicantId: null,
    applicant: null,
    billingProfileId: null,
    billingProfile: null,
    canonicalInvoiceId: null,
    canonicalInvoice: null,
    reconstructionPaymentId: null,
    reconstructionPayment: null,
    financialProvenance: [],
    sourceSheet: null,
    sourceRowNumber: null,
    sourceStudentClaim: null,
    sourceBilledXof: null,
    sourcePaidXof: null,
    createdAt: new Date("2026-09-01T11:00:00.000Z"),
  };
}

async function emptyAcademicFingerprint() {
  return captureWorkbookCutoverAcademicFingerprint(
    {
      student: {
        findMany: async () => [
          {
            id: "student-1",
            transcriptEntries: [],
            enrollments: [],
            gradeSubmissionItems: [],
          },
        ],
      },
    } as unknown as Pick<PrismaClient, "student">,
    "student-1",
  );
}

async function fixture() {
  const academic = await emptyAcademicFingerprint();
  const person = {
    id: "person-1",
    roles: ["student"],
    status: "active",
    sessionVersion: 2,
    suspendedAt: null,
  };
  const housingNone = {
    id: "option-housing-none",
    academicYearLabel: "2026-2027",
    kind: "housing",
    code: "none",
    label: "No housing",
    calculation: "fixed",
    amountXof: 0,
    percentageBasisPoints: null,
    basisServiceKind: null,
    refundable: false,
  };
  const options = [
    housingNone,
    {
      id: "option-cafeteria-none",
      academicYearLabel: "2026-2027",
      kind: "cafeteria",
      code: "none",
      label: "No cafeteria",
      calculation: "fixed",
      amountXof: 0,
      percentageBasisPoints: null,
      basisServiceKind: null,
      refundable: false,
    },
    {
      id: "option-insurance-none",
      academicYearLabel: "2026-2027",
      kind: "insurance",
      code: "none",
      label: "No insurance",
      calculation: "fixed",
      amountXof: 0,
      percentageBasisPoints: null,
      basisServiceKind: null,
      refundable: false,
    },
    {
      id: "option-caution-none",
      academicYearLabel: "2026-2027",
      kind: "housing_caution",
      code: "none",
      label: "No caution",
      calculation: "fixed",
      amountXof: 0,
      percentageBasisPoints: null,
      basisServiceKind: null,
      refundable: true,
    },
  ];
  const selections = options.map((option) => ({
    id: `selection-${option.kind}`,
    profileId: "profile-1",
    academicYearLabel: "2026-2027",
    kind: option.kind,
    serviceOptionId: option.id,
    serviceOption: option,
    optionCode: option.code,
    percentageBasisOptionId: null,
    percentageBasisOptionCode: null,
    percentageBasisServiceKind: null,
    percentageBasisOption: null,
    label: option.label,
    amountXof: 0,
    refundable: option.kind === "housing_caution",
  }));
  const dueDates = [
    new Date("2026-09-01T00:00:00.000Z"),
    new Date("2026-11-01T00:00:00.000Z"),
    new Date("2027-01-01T00:00:00.000Z"),
    new Date("2027-03-01T00:00:00.000Z"),
  ];
  const installments = [1, 2, 3, 4].map((sequence) => ({
    id: `installment-${sequence}`,
    sequence,
    dueDate: dueDates[sequence - 1]!,
    amountDue: sequence === 1 ? 1_514_469_978 : 0,
    amountPaid: sequence === 1 ? 286_551_042 : 0,
    allocations:
      sequence === 1
        ? [{ id: "allocation-1", paymentId: "payment-1", amount: 286_551_042 }]
        : [],
    components: [],
  }));
  const manualCharge = {
    id: "adjustment-1",
    invoiceId: "invoice-1",
    invoiceComponentId: null,
    billingProfileId: "profile-1",
    code: "manual_test",
    label: "Manual test adjustment",
    amountXof: 1_511_494_978,
    effect: "charge",
    basis: "manual",
    calculation: "manual",
    stacking: "additive",
    basisAmountXof: 0,
    percentageBasisPoints: null,
  };
  const invoice = {
    id: "invoice-1",
    studentId: "student-1",
    totalAmount: 1_514_469_978,
    amountPaid: 286_551_042,
    status: "partial",
    packageType: "custom",
    academicYearLabel: "2026-2027",
    components: [
      {
        id: "component-1",
        kind: "tuition",
        grossAmountXof: 2_975_000,
        amountXof: 1_514_469_978,
        adjustments: [],
      },
    ],
    adjustments: [manualCharge],
    plan: { id: "plan-1", installments },
  };
  const payment = {
    id: "payment-1",
    invoiceId: invoice.id,
    studentId: "student-1",
    amount: 286_551_042,
    status: "success",
    method: "legacy_unknown",
    provider: "workbook_cutover",
    source: "paid_to_date_workbook",
    settledAt: null,
    recognizedOn: new Date("2026-08-29T00:00:00.000Z"),
    allocations: [
      {
        id: "allocation-1",
        installmentId: "installment-1",
        installment: installments[0],
        amount: 286_551_042,
      },
    ],
    componentAllocations: [
      {
        id: "component-allocation-1",
        invoiceComponentId: "component-1",
        invoiceComponent: invoice.components[0],
        amountXof: 286_551_042,
        refundedAmountXof: 0,
      },
    ],
  };
  const oldInstallmentComponent = {
    id: "old-installment-component-1",
    invoiceComponentId: "old-component-1",
    amountDue: 100_000,
  };
  const oldAllocation = {
    id: "old-allocation-1",
    paymentId: "old-payment-1",
    installmentId: "old-installment-1",
    amount: 25_000,
  };
  const oldInvoice = {
    id: "old-invoice-1",
    studentId: "student-1",
    status: "void",
    totalAmount: 100_000,
    amountPaid: 25_000,
    components: [
      {
        id: "old-component-1",
        scheduleComponentId: null,
        kind: "tuition",
        label: "Old tuition",
        costCenterCode: "9100",
        grossAmountXof: 100_000,
        amountXof: 100_000,
        adjustments: [],
        installments: [oldInstallmentComponent],
      },
    ],
    adjustments: [],
    plan: {
      id: "old-plan-1",
      installments: [
        {
          id: "old-installment-1",
          sequence: 1,
          label: "Old installment",
          dueDate: new Date("2025-09-01T00:00:00.000Z"),
          amountDue: 100_000,
          amountPaid: 25_000,
          status: "partial",
          components: [oldInstallmentComponent],
          allocations: [oldAllocation],
        },
      ],
    },
  };
  const oldInvoiceSnapshot = jsonSnapshot({
    ...oldInvoice,
    status: "partial",
  });
  const oldPayment = {
    id: "old-payment-1",
    studentId: "student-1",
    status: "cancelled",
    amount: 25_000,
    allocations: [oldAllocation],
    componentAllocations: [
      {
        id: "old-component-allocation-1",
        invoiceComponentId: "old-component-1",
        amountXof: 25_000,
        refundedAmountXof: 0,
      },
    ],
  };
  const oldPaymentSnapshot = jsonSnapshot({
    ...oldPayment,
    status: "success",
  });
  const student = {
    id: "student-1",
    personId: person.id,
    person,
    recordStatus: "active",
    housingAssignments: [
      {
        id: "housing-1",
        billedServiceOptionId: null,
        academicYearLabel: "2026-2027",
        status: "unassigned",
      },
    ],
  };
  const profile = {
    id: "profile-1",
    studentId: student.id,
    academicYearLabel: "2026-2027",
    status: "active",
    sourceKind: "workbook",
    sourceWorkbookSha256: sha("workbook"),
    sourceSheet: "Comparison",
    sourceRowNumber: 2,
    sourceRowFingerprintSha256: sha("fingerprint:workbook:Comparison!2"),
    sourceAsOfDate: new Date("2026-08-29T00:00:00.000Z"),
    canonicalInvoiceId: invoice.id,
    grossChargesXof: 2_975_000,
    netBilledXof: invoice.totalAmount,
    selections,
    awards: [
      {
        id: "award-1",
        profileId: "profile-1",
        invoiceAdjustmentId: manualCharge.id,
        invoiceAdjustment: manualCharge,
        definitionKey: "manual_charge",
        label: manualCharge.label,
        amountXof: manualCharge.amountXof,
        effect: manualCharge.effect,
        basis: manualCharge.basis,
        calculation: manualCharge.calculation,
        stacking: manualCharge.stacking,
        requiresApproval: true,
      },
    ],
    mealPlan: {
      id: "meal-1",
      billingProfileId: "profile-1",
      studentId: student.id,
      type: "none",
      active: false,
    },
  };
  const reconstructionSnapshot = {
    sourceKey: "workbook:Comparison!2",
    amountBilledXof: invoice.totalAmount,
    amountPaidXof: payment.amount,
    recognizedOn: "2026-08-29",
    settledAt: null,
    installmentDueDates: dueDates.map((date) =>
      date.toISOString().slice(0, 10),
    ),
    installments: installments.map((installment) => ({
      sequence: installment.sequence,
      dueXof: installment.amountDue,
      paidDetailXof: installment.amountPaid,
    })),
    components: invoice.components.map((component) => ({
      key: component.kind,
      grossAmountXof: component.grossAmountXof,
      netAmountXof: component.amountXof,
    })),
    adjustments: [
      {
        instanceKey: manualCharge.code,
        definitionKey: "reviewed_manual_adjustment",
        label: manualCharge.label,
        targetComponentKey: null,
        direction: "charge",
        calculation: "manual",
        basis: "none",
        basisAmountXof: 0,
        amountXof: manualCharge.amountXof,
        stacking: "additive",
      },
    ],
    services: {},
    accountCreditXof: 0,
  };
  const included = {
    ...sourceBase("workbook:Comparison!2", "workbook_row"),
    disposition: "link_existing_student",
    sourceSheet: "Comparison",
    sourceRowNumber: 2,
    sourceStudentClaim: "Test Student",
    sourceBilledXof: 1_514_469_978n,
    sourcePaidXof: 286_551_042n,
    studentId: student.id,
    student,
    billingProfileId: profile.id,
    billingProfile: profile,
    canonicalInvoiceId: invoice.id,
    canonicalInvoice: invoice,
    reconstructionPaymentId: payment.id,
    reconstructionPayment: payment,
    financialProvenance: [
      {
        id: "event-old-invoice-1",
        kind: "invoice_void",
        invoiceId: oldInvoice.id,
        invoice: oldInvoice,
        paymentId: null,
        payment: null,
        replacementInvoiceId: invoice.id,
        replacementInvoice: invoice,
        replacementPaymentId: null,
        replacementPayment: null,
        originalStatus: "partial",
        originalAmountXof: BigInt(oldInvoice.totalAmount),
        originalPaidXof: BigInt(oldInvoice.amountPaid),
        recognizedOn: null,
        snapshotJson: oldInvoiceSnapshot,
        snapshotSha256: snapshotHash(oldInvoiceSnapshot),
        eventClaimSha256: sha("event-old-invoice-1"),
      },
      {
        id: "event-old-payment-1",
        kind: "payment_superseded",
        invoiceId: null,
        invoice: null,
        paymentId: oldPayment.id,
        payment: oldPayment,
        replacementInvoiceId: null,
        replacementInvoice: null,
        replacementPaymentId: payment.id,
        replacementPayment: payment,
        originalStatus: "success",
        originalAmountXof: BigInt(oldPayment.amount),
        originalPaidXof: null,
        recognizedOn: null,
        snapshotJson: oldPaymentSnapshot,
        snapshotSha256: snapshotHash(oldPaymentSnapshot),
        eventClaimSha256: sha("event-old-payment-1"),
      },
      {
        id: "event-invoice-1",
        kind: "new_invoice",
        invoiceId: invoice.id,
        invoice,
        paymentId: null,
        payment: null,
        replacementInvoiceId: null,
        replacementInvoice: null,
        replacementPaymentId: null,
        replacementPayment: null,
        originalStatus: null,
        originalAmountXof: null,
        originalPaidXof: null,
        recognizedOn: null,
        snapshotJson: { reconstruction: reconstructionSnapshot },
        snapshotSha256: snapshotHash({
          reconstruction: reconstructionSnapshot,
        }),
        eventClaimSha256: sha("event-invoice-1"),
      },
      {
        id: "event-payment-1",
        kind: "reconstruction_payment",
        invoiceId: null,
        invoice: null,
        paymentId: payment.id,
        payment,
        replacementInvoiceId: null,
        replacementInvoice: null,
        replacementPaymentId: null,
        replacementPayment: null,
        originalStatus: null,
        originalAmountXof: null,
        originalPaidXof: null,
        recognizedOn: new Date("2026-08-29T00:00:00.000Z"),
        snapshotJson: { kind: "reconstruction_payment", paymentId: payment.id },
        snapshotSha256: snapshotHash({
          kind: "reconstruction_payment",
          paymentId: payment.id,
        }),
        eventClaimSha256: sha("event-payment-1"),
      },
    ],
  };

  const duplicates = Array.from({ length: 402 }, (_, index) => ({
    ...sourceBase(`workbook:Comparison!${index + 3}`, "workbook_row"),
    disposition: "reviewed_duplicate",
    sourceSheet: "Comparison",
    sourceRowNumber: index + 3,
    sourceStudentClaim: `Duplicate ${index}`,
    sourceBilledXof: 0n,
    sourcePaidXof: index < 222 ? 1n : 0n,
    duplicateOfRecordId: included.id,
    duplicateOfRecord: included,
  }));
  const production = {
    ...sourceBase("student:student-1", "production_student"),
    disposition: "link_workbook_row",
    studentId: student.id,
    student,
    linkedWorkbookRecordId: included.id,
    linkedWorkbookRecord: included,
  };
  const productionExceptions = Array.from({ length: 417 }, (_, index) => {
    const exceptionPerson = {
      id: `person-exception-${index + 1}`,
      roles: ["student"],
      status: "active",
      sessionVersion: 0,
      suspendedAt: null,
    };
    const exceptionStudent = {
      id: `student-exception-${index + 1}`,
      personId: exceptionPerson.id,
      person: exceptionPerson,
      recordStatus: "active",
      housingAssignments: [],
    };
    return {
      ...sourceBase(`student:${exceptionStudent.id}`, "production_student"),
      disposition: "keep_exception",
      studentId: exceptionStudent.id,
      student: exceptionStudent,
    };
  });
  const applicant = {
    ...sourceBase("applicant:applicant-1", "applicant"),
    disposition: "preserve_applicant",
    applicantId: "applicant-1",
    applicant: { id: "applicant-1" },
  };
  const additionalApplicants = Array.from({ length: 45 }, (_, index) => {
    const applicantId = `applicant-${index + 2}`;
    return {
      ...sourceBase(`applicant:${applicantId}`, "applicant"),
      disposition: "preserve_applicant",
      applicantId,
      applicant: { id: applicantId },
    };
  });
  const batch = {
    id: "batch-1",
    status: "imported",
    importedAt: new Date("2026-09-01T11:00:00.000Z"),
    academicYearLabel: "2026-2027",
    sourceAsOfDate: new Date("2026-08-29T00:00:00.000Z"),
    sourceWorkbookSha256: sha("workbook"),
    sourceExtractionSha256: sha("extraction"),
    rosterSnapshotSha256: sha("roster"),
    identityManifestSha256: sha("manifest"),
    confirmationPlanSha256: sha("plan"),
    workbookRowCount: 403,
    productionStudentCount: 418,
    applicantCount: 46,
    workbookLinkedRows: 1,
    workbookCreatedRows: 0,
    workbookDuplicateRows: 402,
    productionLinkedStudents: 1,
    productionKeptStudents: 417,
    productionArchivedStudents: 0,
    preservedApplicants: 46,
    sourceBilledXof: 1_514_469_978n,
    sourcePaidXof: 286_551_264n,
    includedBilledXof: 1_514_469_978n,
    includedPaidXof: 286_551_042n,
    excludedBilledXof: 0n,
    excludedPaidXof: 222n,
    sourceRecords: [
      included,
      ...duplicates,
      production,
      ...productionExceptions,
      applicant,
      ...additionalApplicants,
    ],
  };
  const batchAuditData = {
    sourceWorkbookSha256: batch.sourceWorkbookSha256,
    sourceExtractionSha256: batch.sourceExtractionSha256,
    rosterSnapshotSha256: batch.rosterSnapshotSha256,
    manifestSha256: batch.identityManifestSha256,
    confirmationPlanSha256: batch.confirmationPlanSha256,
    liveSnapshotSha256: sha("live-snapshot"),
    billingCatalogFingerprintSha256: sha("billing-catalog"),
    sourceAsOfDate: "2026-08-29",
    controls: {
      workbookRows: batch.workbookRowCount,
      productionStudents: batch.productionStudentCount,
      applicants: batch.applicantCount,
      sourceBilledXof: 1_514_469_978,
      sourcePaidXof: 286_551_264,
      includedRows: 1,
      includedBilledXof: 1_514_469_978,
      includedPaidXof: 286_551_042,
      reviewedExclusionRows: 402,
      reviewedExclusionBilledXof: 0,
      reviewedExclusionPaidXof: 222,
      heldRows: 0,
      heldBilledXof: 0,
      heldPaidXof: 0,
      accountCreditXof: 0,
      archiveStudents: 0,
      keepExceptionStudents: 417,
      preserveApplicants: 46,
      reconciles: true,
    },
    activations: 0,
    activationApplicantIds: [],
    academicFingerprints: [production, ...productionExceptions].map(
      (record) => ({
        personId: record.student.personId,
        ...academic,
        academicFingerprintSha256:
          workbookCutoverAcademicFingerprintDigest(academic),
        studentId: record.studentId,
      }),
    ),
    originalProductionStudentIds: [production, ...productionExceptions].map(
      (record) => record.studentId,
    ),
    originalApplicantIds: [applicant, ...additionalApplicants].map(
      (record) => record.applicantId,
    ),
    supersededInvoiceIds: [oldInvoice.id],
    supersededPaymentIds: [oldPayment.id],
    cancelledPaymentSubmissionIds: [],
    cancelledPaymentLinkIds: [],
    cancelledPiSpiRequestIds: [],
    cancelledPendingPaymentIds: [],
    archivedCapabilityCancellations: [] as Array<{
      studentId: string;
      sourceRecordId: string;
      cancelledPaymentSubmissionIds: string[];
      cancelledPaymentLinkIds: string[];
      cancelledPiSpiRequestIds: string[];
      cancelledPendingPaymentIds: string[];
      linkedApplicantIds: string[];
      statusTokenCapabilityApplicantIds: string[];
      revokedApplicantStatusTokenIds: string[];
      preexistingInactiveApplicantStatusTokenIds: string[];
      clearedApplicantPaymentLinkPointers: Array<{
        applicantId: string;
        paymentLinkId: string;
      }>;
    }>,
    reviewerAttestationIds: ["attestation-1"],
  };
  const batchAuditRows = [
    {
      action: WORKBOOK_CUTOVER_BATCH_AUDIT.action,
      data: batchAuditData,
    },
  ];
  const academicStudentRows = [production, ...productionExceptions].map(
    (record) => ({
      id: record.studentId,
      transcriptEntries: [],
      enrollments: [],
      gradeSubmissionItems: [],
    }),
  );
  const archiveAuditRows: Array<{ entityId: string; data: unknown }> = [];
  const onboardingApplicants: Array<Record<string, unknown>> = [];
  const paymentLinks: Array<Record<string, unknown>> = [];
  const prisma = {
    workbookCutoverBatch: {
      findUnique: async () => batch,
      count: async () => 1,
    },
    workbookCutoverReviewerAttestation: {
      findMany: async () => [
        {
          id: "attestation-1",
          manifestSha256: batch.identityManifestSha256,
          reviewerId: "reviewer-1",
          reviewerEmailNormalized: "reviewer@daust.org",
          authorizedRoles: ["admin"],
          statementSha256: WORKBOOK_CUTOVER_ATTESTATION_STATEMENT_SHA256,
          attestedAt: new Date("2026-09-01T10:30:00.000Z"),
          revokedAt: null,
        },
      ],
    },
    student: {
      findMany: async () => academicStudentRows,
    },
    invoice: { findMany: async () => [{ id: invoice.id }] },
    payment: {
      findMany: async (args: { where?: { status?: unknown } }) =>
        args.where?.status
          ? [{ id: payment.id, status: "success" }]
          : [payment],
    },
    paymentSubmission: { findMany: async () => [] },
    paymentLink: { findMany: async () => paymentLinks },
    piSpiRequest: { findMany: async () => [] },
    applicant: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const studentId = args.where?.studentId;
        if (typeof studentId === "string") {
          return onboardingApplicants.filter(
            (applicant) => applicant.studentId === studentId,
          );
        }
        if (studentId && typeof studentId === "object") {
          const ids = (studentId as { in?: unknown }).in;
          if (Array.isArray(ids)) {
            return onboardingApplicants.filter((applicant) =>
              ids.includes(applicant.studentId),
            );
          }
        }
        return [];
      },
    },
    auditLog: {
      findMany: async (args: { where: { entity: string } }) => {
        if (args.where.entity === WORKBOOK_CUTOVER_BATCH_AUDIT.entity) {
          return batchAuditRows;
        }
        if (args.where.entity === WORKBOOK_CUTOVER_PAYMENT_AUDIT.entity) {
          return [
            {
              entityId: payment.id,
              data: {
                batchId: batch.id,
                sourceRecordId: included.id,
                sourceClaimSha256: included.sourceClaimSha256,
              },
            },
          ];
        }
        if (args.where.entity === WORKBOOK_CUTOVER_ARCHIVE_AUDIT.entity) {
          return archiveAuditRows;
        }
        return [];
      },
    },
  } as unknown as PrismaClient;
  return {
    prisma,
    batch,
    batchAuditData,
    batchAuditRows,
    invoice,
    oldInvoice,
    oldPayment,
    productionExceptions,
    academicStudentRows,
    archiveAuditRows,
    onboardingApplicants,
    paymentLinks,
    payment,
  };
}

function addCanonicalPendingPaymentLink(
  fixtureData: Awaited<ReturnType<typeof fixture>>,
  amountAdjustmentXof = 0,
) {
  const firstInstallment = fixtureData.invoice.plan.installments[0]!;
  const remainingCashXof =
    firstInstallment.amountDue - fixtureData.payment.amount;
  const link = {
    id: "canonical-onboarding-link-1",
    status: "active",
    amountXof: remainingCashXof + amountAdjustmentXof,
    studentId: "student-1",
    invoiceId: fixtureData.invoice.id,
    onboardingApplicantId: "accepted-applicant-1",
    costCenterCode: "9100",
    dueDate: firstInstallment.dueDate,
  };
  const applicant = {
    id: "accepted-applicant-1",
    studentId: "student-1",
    onboardingStatus: "payment_pending",
    requiredEnrollmentCashXof: firstInstallment.amountDue,
    enrollmentInvoiceId: fixtureData.invoice.id,
    activeOnboardingPaymentLinkId: link.id,
    activeOnboardingPaymentLink: link,
    enrollmentInvoice: {
      id: fixtureData.invoice.id,
      status: fixtureData.invoice.status,
      costCenterCode: "9100",
      payments: [{ amount: fixtureData.payment.amount }],
      plan: { installments: [firstInstallment] },
    },
  };
  fixtureData.paymentLinks.push(link);
  fixtureData.onboardingApplicants.push(applicant);
  return { applicant, link };
}

async function addArchivedPendingPaymentStudent(
  fixtureData: Awaited<ReturnType<typeof fixture>>,
) {
  const record = fixtureData.productionExceptions[0]!;
  record.disposition = "archive_student";
  record.student.recordStatus = "archived";
  record.student.person.roles = [];
  record.student.person.status = "suspended";
  record.student.person.sessionVersion = 8;
  record.student.person.suspendedAt = new Date("2026-09-01T11:00:00.000Z");
  const student = record.student;
  const person = student.person;
  fixtureData.batch.productionKeptStudents -= 1;
  fixtureData.batch.productionArchivedStudents += 1;
  fixtureData.batchAuditData.controls.keepExceptionStudents -= 1;
  fixtureData.batchAuditData.controls.archiveStudents += 1;
  const applicant = {
    id: "archived-linked-applicant",
    studentId: student.id,
    enrollmentInvoiceId: null,
    activeOnboardingPaymentLinkId: null,
    statusTokenHash: null as string | null,
    statusTokenRevokedAt: null as Date | null,
    statusTokenExpiresAt: null as Date | null,
  };
  fixtureData.onboardingApplicants.push(applicant);
  const capabilityEvidence = {
    studentId: student.id,
    sourceRecordId: record.id,
    cancelledPaymentSubmissionIds: [],
    cancelledPaymentLinkIds: [],
    cancelledPiSpiRequestIds: [],
    cancelledPendingPaymentIds: [],
    linkedApplicantIds: [applicant.id],
    statusTokenCapabilityApplicantIds: [],
    revokedApplicantStatusTokenIds: [],
    preexistingInactiveApplicantStatusTokenIds: [],
    clearedApplicantPaymentLinkPointers: [],
  };
  fixtureData.batchAuditData.archivedCapabilityCancellations.push(
    capabilityEvidence,
  );
  const auditData = {
    batchId: fixtureData.batch.id,
    sourceRecordId: record.id,
    personId: person.id,
    removedRole: false,
    remainingRoles: [],
    personSuspended: true,
    previousSessionVersion: 7,
  };
  fixtureData.archiveAuditRows.push({ entityId: student.id, data: auditData });
  return { auditData, applicant, capabilityEvidence };
}

describe("workbook cutover independent post-audit", () => {
  it("reconciles exhaustive sources, billing, academics, audit evidence, and replay anchors", async () => {
    const { prisma } = await fixture();
    const result = await auditWorkbookCutoverBatch(prisma, "batch-1");
    expect(result).toMatchObject({
      ok: true,
      workbookRows: 403,
      productionStudents: 418,
      applicants: 46,
      canonicalInvoices: 1,
      reconstructionPayments: 1,
      preservedAcademicRecords: 418,
      paymentAuditRows: 1,
      reviewerAttestations: 1,
      replayAnchorBatchCount: 1,
    });
  });

  it("accepts refreshed production and Applicant counts but rejects a persisted Student-count mismatch", async () => {
    const { prisma, batch } = await fixture();
    batch.productionStudentCount -= 1;
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /production Student source count differs/,
    );
  });

  it("rejects a persisted Applicant-count mismatch against the exhaustive source records", async () => {
    const { prisma, batch } = await fixture();
    batch.applicantCount -= 1;
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /Applicant source count differs/,
    );
  });

  it("fails closed when imported evidence omits a signed reviewer's attestation", async () => {
    const { prisma, batchAuditData } = await fixture();
    batchAuditData.reviewerAttestationIds = [];
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /does not cover every distinct signed reviewer/,
    );
  });

  it("allows only the Applicant's canonical post-gate active payment link", async () => {
    const fixtureData = await fixture();
    addCanonicalPendingPaymentLink(fixtureData);
    await expect(
      auditWorkbookCutoverBatch(fixtureData.prisma, "batch-1"),
    ).resolves.toMatchObject({ ok: true });
  });

  it("fails closed when the post-gate active link amount differs from the remaining cash gate", async () => {
    const fixtureData = await fixture();
    addCanonicalPendingPaymentLink(fixtureData, 1);
    await expect(
      auditWorkbookCutoverBatch(fixtureData.prisma, "batch-1"),
    ).rejects.toThrow(
      /does not match the canonical remaining enrollment balance/,
    );
  });

  it("fails closed when the reviewed academic fingerprint differs", async () => {
    const { prisma, batchAuditData } = await fixture();
    batchAuditData.academicFingerprints[0]!.gpaSha256 = sha("changed-gpa");
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /transcript, enrollment, grade, credit, or GPA fingerprint changed/,
    );
  });

  it("fails closed on a canonical invoice allocation mismatch", async () => {
    const { prisma, invoice } = await fixture();
    invoice.amountPaid += 1;
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /payment allocation equations differ/,
    );
  });

  it("fails closed when an installment date differs from the workbook snapshot", async () => {
    const { prisma, invoice } = await fixture();
    invoice.plan.installments[0]!.dueDate = new Date(
      "2026-09-02T00:00:00.000Z",
    );
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /installment 1 differs from the workbook snapshot/,
    );
  });

  it("fails closed when retained pre-cutover finance child rows change", async () => {
    const { prisma, oldInvoice } = await fixture();
    oldInvoice.components[0]!.amountXof += 1;
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /old invoice components or adjustments changed/,
    );
  });

  it("fails closed when a retained pre-cutover payment allocation changes", async () => {
    const { prisma, oldPayment } = await fixture();
    oldPayment.componentAllocations[0]!.amountXof += 1;
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /old payment allocations changed or were deleted/,
    );
  });

  it("fails closed when a no-housing workbook profile remains operationally assigned", async () => {
    const { prisma, batch } = await fixture();
    batch.sourceRecords[0]!.student.housingAssignments[0]!.status = "assigned";
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /Housing conflicts with the no-housing selection/,
    );
  });

  it("accepts exact archive evidence for a payment-pending Student with no active role", async () => {
    const fixtureData = await fixture();
    await addArchivedPendingPaymentStudent(fixtureData);
    const result = await auditWorkbookCutoverBatch(
      fixtureData.prisma,
      "batch-1",
    );
    expect(result).toMatchObject({
      productionStudents: 418,
      archivedStudents: 1,
      preservedAcademicRecords: 418,
    });
  });

  it("fails closed when archive access-revocation evidence is not exact", async () => {
    const fixtureData = await fixture();
    const { auditData } = await addArchivedPendingPaymentStudent(fixtureData);
    auditData.previousSessionVersion = 6;
    await expect(
      auditWorkbookCutoverBatch(fixtureData.prisma, "batch-1"),
    ).rejects.toThrow(/lacks exact access-revocation audit evidence/);
  });

  it("fails closed when an archive disposition omits capability-cancellation evidence", async () => {
    const fixtureData = await fixture();
    await addArchivedPendingPaymentStudent(fixtureData);
    fixtureData.batchAuditData.archivedCapabilityCancellations.length = 0;
    await expect(
      auditWorkbookCutoverBatch(fixtureData.prisma, "batch-1"),
    ).rejects.toThrow(
      /archived capability evidence count differs from archive dispositions/,
    );
  });

  it("fails closed when an archived Student retains an active payment capability", async () => {
    const fixtureData = await fixture();
    await addArchivedPendingPaymentStudent(fixtureData);
    fixtureData.paymentLinks.push({
      id: "archived-active-link",
      status: "active",
      amountXof: 1,
      studentId: fixtureData.productionExceptions[0]!.studentId,
      invoiceId: null,
      onboardingApplicantId: null,
      costCenterCode: "9100",
      dueDate: null,
    });
    await expect(
      auditWorkbookCutoverBatch(fixtureData.prisma, "batch-1"),
    ).rejects.toThrow(/retains an active payment-link capability/);
  });

  it("fails closed when an archived Student retains an Applicant status bearer", async () => {
    const fixtureData = await fixture();
    const { applicant, capabilityEvidence } =
      await addArchivedPendingPaymentStudent(fixtureData);
    applicant.statusTokenHash = sha("still-usable-status-token");
    capabilityEvidence.statusTokenCapabilityApplicantIds = [applicant.id];
    capabilityEvidence.preexistingInactiveApplicantStatusTokenIds = [
      applicant.id,
    ];
    await expect(
      auditWorkbookCutoverBatch(fixtureData.prisma, "batch-1"),
    ).rejects.toThrow(
      /retains an Applicant status or payment-link bearer capability/,
    );
  });

  it("detects an audit record emitted by an exact replay", async () => {
    const { prisma, batchAuditRows, batchAuditData } = await fixture();
    batchAuditRows.push({ action: "replayed", data: batchAuditData });
    await expect(auditWorkbookCutoverBatch(prisma, "batch-1")).rejects.toThrow(
      /exact replay emitted another audit/,
    );
  });
});

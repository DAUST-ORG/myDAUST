import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@mydaust/db";
import {
  canonicalWorkbookCutoverJson,
  workbookCutoverAcademicFingerprintDigest,
  workbookCutoverApplicantKey,
  workbookCutoverProductionStudentKey,
  type WorkbookCutoverAcademicFingerprintSchema,
  type WorkbookCutoverManifest,
} from "./workbook-cutover.manifest.js";
import {
  WorkbookCutoverLiveSnapshotSchema,
  workbookCutoverLiveSnapshotDigest,
  type WorkbookCutoverLiveSnapshot,
} from "./workbook-cutover.planner.js";
import type { z } from "zod";

/** Matches the Admissions badge and the frozen reviewed production snapshot. */
export const WORKBOOK_CUTOVER_CURRENT_APPLICANT_STAGES = [
  "submitted",
  "review",
  "interview",
  "offer",
] as const;

type AcademicFingerprint = z.infer<
  typeof WorkbookCutoverAcademicFingerprintSchema
>;

export type WorkbookCutoverSnapshotDb = Pick<
  Prisma.TransactionClient,
  | "student"
  | "applicant"
  | "feeSchedule"
  | "term"
  | "studentNumberSequence"
  | "person"
  | "billingServiceOption"
  | "billingAdjustmentDefinition"
  | "paymentLink"
  | "paymentSubmission"
  | "piSpiRequest"
  | "payment"
>;

export interface WorkbookCutoverSnapshotScope {
  academicYearLabel: string;
  academicYearStart: number;
  /** Injected by tests and replay tooling; production callers normally omit it. */
  capturedAt?: Date;
}

export type WorkbookCutoverSnapshotManifestScope = Pick<
  WorkbookCutoverManifest,
  "academicYearLabel" | "academicYearStart"
>;

export interface WorkbookCutoverCapturedAcademicFingerprint {
  studentId: string;
  academicFingerprint: AcademicFingerprint;
  academicFingerprintSha256: string;
}

export interface WorkbookCutoverAcademicState {
  transcriptEntries: readonly Record<string, unknown>[];
  enrollments: readonly Record<string, unknown>[];
  gradeSnapshots: readonly Record<string, unknown>[];
}

export interface WorkbookCutoverFinancialState {
  invoices: readonly Record<string, unknown>[];
  payments: readonly Record<string, unknown>[];
  billingProfiles: readonly Record<string, unknown>[];
  linkedApplicant: Record<string, unknown> | null;
  proofSubmissions: readonly Record<string, unknown>[];
  paymentLinks: readonly Record<string, unknown>[];
  piSpiRequests: readonly Record<string, unknown>[];
}

export interface WorkbookCutoverBillingCatalogState {
  serviceOptions: readonly Record<string, unknown>[];
  adjustmentDefinitions: readonly Record<string, unknown>[];
}

export interface WorkbookCutoverLiveSnapshotCounts {
  students: number;
  activeStudents: number;
  pendingPaymentStudents: number;
  archivedStudents: number;
  currentApplicants: number;
  feeSchedules: number;
  terms: number;
  pendingRefunds: number;
  orphanPendingRefunds: number;
}

/**
 * Opens one repeatable, explicitly read-only transaction. Confirmation calls
 * `captureWorkbookCutoverLiveSnapshot` inside its own SERIALIZABLE transaction
 * so the same sequence and finance rows anchor the plan digest.
 */
export async function captureWorkbookCutoverLiveSnapshotReadOnly(
  prisma: PrismaClient,
  manifest: WorkbookCutoverSnapshotManifestScope,
  options: Pick<WorkbookCutoverSnapshotScope, "capturedAt"> = {},
): Promise<WorkbookCutoverLiveSnapshot> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return captureWorkbookCutoverLiveSnapshot(tx, manifest, options);
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/** Performs no writes and emits no names or other identity data to logs. */
export async function captureWorkbookCutoverLiveSnapshot(
  db: WorkbookCutoverSnapshotDb,
  manifest: WorkbookCutoverSnapshotManifestScope,
  options: Pick<WorkbookCutoverSnapshotScope, "capturedAt"> = {},
): Promise<WorkbookCutoverLiveSnapshot> {
  const scope: WorkbookCutoverSnapshotScope = {
    academicYearLabel: manifest.academicYearLabel,
    academicYearStart: manifest.academicYearStart,
    capturedAt: options.capturedAt,
  };
  const capturedAt = scope.capturedAt ?? new Date();
  assertScope(scope);

  const [
    students,
    applicants,
    feeSchedules,
    terms,
    sequence,
    people,
    refunds,
    billingServiceOptions,
    billingAdjustmentDefinitions,
  ] = await Promise.all([
    db.student.findMany({
      select: {
        id: true,
        personId: true,
        studentNo: true,
        recordStatus: true,
        person: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            roles: true,
          },
        },
        applicant: {
          select: {
            id: true,
            studentId: true,
            stage: true,
            onboardingStatus: true,
            admissionAcademicYearId: true,
            enrollmentInvoiceId: true,
            requiredEnrollmentCashXof: true,
            activeOnboardingPaymentLinkId: true,
            activatedByPaymentId: true,
            acceptedAt: true,
            paymentPendingAt: true,
            enrolledAt: true,
            onboardingCancelledAt: true,
            statusTokenHash: true,
            statusTokenExpiresAt: true,
            statusTokenRevokedAt: true,
            acceptanceEmailSentAt: true,
            studentInviteSentAt: true,
            activeOnboardingPaymentLink: {
              select: {
                id: true,
                amountXof: true,
                purpose: true,
                studentId: true,
                invoiceId: true,
                costCenterCode: true,
                dueDate: true,
                expiresAt: true,
                status: true,
                method: true,
                paidAt: true,
                onboardingApplicantId: true,
                createdAt: true,
              },
            },
          },
        },
        transcriptEntries: {
          select: {
            id: true,
            studentId: true,
            source: true,
            sourceKey: true,
            importBatchId: true,
            importRowNumber: true,
            gradeSubmissionItemId: true,
            enrollmentId: true,
            courseId: true,
            termId: true,
            courseCode: true,
            courseTitle: true,
            termLabel: true,
            termSortKey: true,
            grade: true,
            credits: true,
            earnedCredits: true,
            gradePoints: true,
            countsTowardGpa: true,
            countsTowardCredits: true,
            requirementCategory: true,
            note: true,
            createdById: true,
            updatedById: true,
            voidedById: true,
            createdAt: true,
            updatedAt: true,
            voidedAt: true,
            voidReason: true,
          },
          orderBy: { id: "asc" },
        },
        enrollments: {
          select: {
            id: true,
            studentId: true,
            sectionId: true,
            status: true,
            grade: true,
            enrolledAt: true,
            section: {
              select: {
                courseId: true,
                termId: true,
                sectionCode: true,
                gradingSchemeId: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
        gradeSubmissionItems: {
          select: {
            id: true,
            studentId: true,
            gradeSubmissionId: true,
            version: true,
            enrollmentId: true,
            courseId: true,
            termId: true,
            courseCode: true,
            courseTitle: true,
            termLabel: true,
            credits: true,
            grade: true,
            gradePoints: true,
            countsTowardGpa: true,
            countsTowardCredits: true,
            createdAt: true,
            gradeSubmission: {
              select: {
                sectionId: true,
                status: true,
                version: true,
                submittedById: true,
                submittedAt: true,
                approvedById: true,
                approvedAt: true,
                note: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
        invoices: {
          select: {
            id: true,
            studentId: true,
            number: true,
            termId: true,
            totalAmount: true,
            amountPaid: true,
            status: true,
            description: true,
            costCenterCode: true,
            packageType: true,
            academicYearLabel: true,
            feeScheduleId: true,
            feeScheduleRevision: true,
            paymentPlanOverride: true,
            revision: true,
            createdAt: true,
            updatedAt: true,
            components: {
              select: {
                id: true,
                scheduleComponentId: true,
                kind: true,
                label: true,
                costCenterCode: true,
                grossAmountXof: true,
                amountXof: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: { id: "asc" },
            },
            componentOverrides: {
              select: {
                id: true,
                componentKey: true,
                included: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: { id: "asc" },
            },
            adjustments: {
              select: {
                id: true,
                invoiceComponentId: true,
                billingProfileId: true,
                definitionId: true,
                code: true,
                label: true,
                source: true,
                basis: true,
                calculation: true,
                stacking: true,
                effect: true,
                basisAmountXof: true,
                percentageBasisPoints: true,
                amountXof: true,
                reason: true,
                sourceReference: true,
                approvalRequestId: true,
                createdById: true,
                createdAt: true,
              },
              orderBy: { id: "asc" },
            },
            plan: {
              select: {
                id: true,
                createdById: true,
                createdAt: true,
                installments: {
                  select: {
                    id: true,
                    sequence: true,
                    label: true,
                    dueDate: true,
                    amountDue: true,
                    amountPaid: true,
                    status: true,
                    allocations: {
                      select: {
                        id: true,
                        paymentId: true,
                        amount: true,
                      },
                      orderBy: { id: "asc" },
                    },
                    components: {
                      select: {
                        id: true,
                        invoiceComponentId: true,
                        amountDue: true,
                        createdAt: true,
                        updatedAt: true,
                      },
                      orderBy: { id: "asc" },
                    },
                  },
                  orderBy: [{ sequence: "asc" }, { id: "asc" }],
                },
              },
            },
          },
          orderBy: { id: "asc" },
        },
        payments: {
          select: {
            id: true,
            studentId: true,
            invoiceId: true,
            amount: true,
            method: true,
            status: true,
            provider: true,
            providerRef: true,
            externalReferenceFingerprintSha256: true,
            source: true,
            initiatedById: true,
            initiatedByEmail: true,
            settledAt: true,
            refundedAt: true,
            importBatchId: true,
            importRowKey: true,
            importSheetName: true,
            importRowNumber: true,
            ipnPayload: true,
            recognizedOn: true,
            createdAt: true,
            updatedAt: true,
            allocations: {
              select: {
                id: true,
                installmentId: true,
                amount: true,
              },
              orderBy: { id: "asc" },
            },
            componentAllocations: {
              select: {
                id: true,
                invoiceComponentId: true,
                amountXof: true,
                refundedAmountXof: true,
                createdAt: true,
              },
              orderBy: { id: "asc" },
            },
          },
          orderBy: { id: "asc" },
        },
        billingProfiles: {
          select: {
            id: true,
            academicYearLabel: true,
            status: true,
            revision: true,
            sourceKind: true,
            sourceWorkbookSha256: true,
            sourceSheet: true,
            sourceRowNumber: true,
            sourceRowFingerprintSha256: true,
            sourceAsOfDate: true,
            feeScheduleId: true,
            canonicalInvoiceId: true,
            grossChargesXof: true,
            netBilledXof: true,
            mismatchWarnings: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
            selections: {
              select: {
                id: true,
                kind: true,
                serviceOptionId: true,
                optionCode: true,
                label: true,
                amountXof: true,
                refundable: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: { id: "asc" },
            },
            awards: {
              select: {
                id: true,
                definitionId: true,
                definitionKey: true,
                label: true,
                source: true,
                basis: true,
                calculation: true,
                stacking: true,
                effect: true,
                basisAmountXof: true,
                percentageBasisPoints: true,
                amountXof: true,
                reason: true,
                approvalRequestId: true,
                invoiceAdjustmentId: true,
                createdAt: true,
              },
              orderBy: { id: "asc" },
            },
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
    db.applicant.findMany({
      where: { stage: { in: [...WORKBOOK_CUTOVER_CURRENT_APPLICANT_STAGES] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        stage: true,
        onboardingStatus: true,
        studentId: true,
        enrollmentInvoiceId: true,
        activeOnboardingPaymentLinkId: true,
        statusTokenHash: true,
        statusTokenExpiresAt: true,
        statusTokenRevokedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    db.feeSchedule.findMany({
      where: { academicYearLabel: scope.academicYearLabel },
      select: {
        id: true,
        academicYearLabel: true,
        revision: true,
        status: true,
        reason: true,
        createdById: true,
        approvedById: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
        rows: {
          select: {
            id: true,
            academicYearLabel: true,
            semester: true,
            label: true,
            sequence: true,
            dueOn: true,
            amountFullXof: true,
            amountTuitionXof: true,
            amountHousingXof: true,
            amountCafeteriaXof: true,
          },
          orderBy: [{ sequence: "asc" }, { id: "asc" }],
        },
        components: {
          select: {
            id: true,
            key: true,
            label: true,
            description: true,
            costCenterCode: true,
            annualAmountXof: true,
            defaultSelected: true,
            sortOrder: true,
            createdAt: true,
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ revision: "asc" }, { id: "asc" }],
    }),
    db.term.findMany({
      where: { academicYear: { label: scope.academicYearLabel } },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        addDeadline: true,
        dropDeadline: true,
        academicYearId: true,
        academicYear: { select: { label: true } },
        semester: true,
        status: true,
      },
      orderBy: { id: "asc" },
    }),
    db.studentNumberSequence.findUnique({
      where: { academicYearStart: scope.academicYearStart },
      select: { academicYearStart: true, nextValue: true },
    }),
    db.person.findMany({
      where: { email: { not: null } },
      select: { email: true },
      orderBy: { id: "asc" },
    }),
    db.payment.findMany({
      where: { status: "refund_pending" },
      select: { id: true, studentId: true },
      orderBy: { id: "asc" },
    }),
    db.billingServiceOption.findMany({
      where: { academicYearLabel: scope.academicYearLabel },
      select: {
        id: true,
        academicYearLabel: true,
        kind: true,
        code: true,
        label: true,
        description: true,
        calculation: true,
        amountXof: true,
        percentageBasisPoints: true,
        basisServiceKind: true,
        costCenterCode: true,
        refundable: true,
        defaultSelected: true,
        active: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    db.billingAdjustmentDefinition.findMany({
      where: { academicYearLabel: scope.academicYearLabel },
      select: {
        id: true,
        academicYearLabel: true,
        key: true,
        label: true,
        description: true,
        basis: true,
        calculation: true,
        stacking: true,
        effect: true,
        percentageBasisPoints: true,
        fixedAmountXof: true,
        requiresApproval: true,
        active: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  const studentIds = students.map((student) => student.id);
  const applicantOwners = new Map<string, Set<string>>();
  const invoiceOwners = new Map<string, Set<string>>();
  const paymentOwners = new Map<string, Set<string>>();
  const activeApplicantLinkOwners = new Map<string, Set<string>>();
  for (const student of students) {
    if (student.applicant) {
      addOwner(applicantOwners, student.applicant.id, student.id);
      if (student.applicant.enrollmentInvoiceId) {
        addOwner(
          invoiceOwners,
          student.applicant.enrollmentInvoiceId,
          student.id,
        );
      }
      if (student.applicant.activeOnboardingPaymentLinkId) {
        addOwner(
          activeApplicantLinkOwners,
          student.applicant.activeOnboardingPaymentLinkId,
          student.id,
        );
      }
    }
    for (const invoice of student.invoices) {
      addOwner(invoiceOwners, invoice.id, student.id);
    }
    for (const payment of student.payments) {
      addOwner(paymentOwners, payment.id, student.id);
      for (const owner of invoiceOwners.get(payment.invoiceId) ?? []) {
        addOwner(paymentOwners, payment.id, owner);
      }
    }
  }
  const paymentLinks = await db.paymentLink.findMany({
    select: {
      id: true,
      token: true,
      amountXof: true,
      purpose: true,
      payeeName: true,
      payeeMeta: true,
      studentId: true,
      invoiceId: true,
      costCenterCode: true,
      dueDate: true,
      expiresAt: true,
      status: true,
      method: true,
      paidAt: true,
      createdById: true,
      createdAt: true,
      onboardingApplicantId: true,
    },
    orderBy: { id: "asc" },
  });
  const paymentLinkOwners = new Map<string, Set<string>>();
  for (const link of paymentLinks) {
    if (link.studentId) addOwner(paymentLinkOwners, link.id, link.studentId);
    if (link.invoiceId) {
      for (const owner of invoiceOwners.get(link.invoiceId) ?? []) {
        addOwner(paymentLinkOwners, link.id, owner);
      }
    }
    if (link.onboardingApplicantId) {
      for (const owner of applicantOwners.get(link.onboardingApplicantId) ??
        []) {
        addOwner(paymentLinkOwners, link.id, owner);
      }
    }
    for (const owner of activeApplicantLinkOwners.get(link.id) ?? []) {
      addOwner(paymentLinkOwners, link.id, owner);
    }
  }
  const [proofSubmissions, piSpiRequests] = await Promise.all([
    db.paymentSubmission.findMany({
      select: {
        id: true,
        resumeToken: true,
        activeKey: true,
        status: true,
        auditStatus: true,
        method: true,
        source: true,
        studentId: true,
        invoiceId: true,
        paymentId: true,
        paymentLinkId: true,
        applicantId: true,
        diningOrderId: true,
        submittedAmountXof: true,
        confirmedAmountXof: true,
        contactEmail: true,
        submittedById: true,
        submittedByEmail: true,
        proofObjectKey: true,
        proofFileName: true,
        proofMimeType: true,
        proofSize: true,
        payerProofSubmittedAt: true,
        bankSnapshot: true,
        bankReference: true,
        confirmationNote: true,
        verificationProofObjectKey: true,
        verificationProofFileName: true,
        verificationProofMimeType: true,
        verificationProofSize: true,
        reviewedById: true,
        reviewedByName: true,
        reviewedByEmail: true,
        reviewedAt: true,
        rejectionReason: true,
        auditedById: true,
        auditedByName: true,
        auditedByEmail: true,
        auditedAt: true,
        auditNote: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    db.piSpiRequest.findMany({
      select: {
        id: true,
        txId: true,
        end2endId: true,
        status: true,
        statusReason: true,
        source: true,
        payerAlias: true,
        payerName: true,
        payerCountry: true,
        amountXof: true,
        settledAmountXof: true,
        motif: true,
        studentId: true,
        invoiceId: true,
        paymentId: true,
        paymentLinkId: true,
        applicantId: true,
        expiresAt: true,
        settledAt: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  let proofOwners = ownersByAttempt(
    proofSubmissions,
    invoiceOwners,
    paymentOwners,
    paymentLinkOwners,
    applicantOwners,
  );
  let piSpiOwners = ownersByAttempt(
    piSpiRequests,
    invoiceOwners,
    paymentOwners,
    paymentLinkOwners,
    applicantOwners,
  );
  let previousOwnerEdges = -1;
  while (
    previousOwnerEdges !==
    ownerEdgeCount(paymentOwners) +
      ownerEdgeCount(paymentLinkOwners) +
      ownerEdgeCount(proofOwners) +
      ownerEdgeCount(piSpiOwners)
  ) {
    previousOwnerEdges =
      ownerEdgeCount(paymentOwners) +
      ownerEdgeCount(paymentLinkOwners) +
      ownerEdgeCount(proofOwners) +
      ownerEdgeCount(piSpiOwners);
    propagateAttemptOwners(
      proofSubmissions,
      proofOwners,
      paymentOwners,
      paymentLinkOwners,
    );
    propagateAttemptOwners(
      piSpiRequests,
      piSpiOwners,
      paymentOwners,
      paymentLinkOwners,
    );
    proofOwners = ownersByAttempt(
      proofSubmissions,
      invoiceOwners,
      paymentOwners,
      paymentLinkOwners,
      applicantOwners,
    );
    piSpiOwners = ownersByAttempt(
      piSpiRequests,
      invoiceOwners,
      paymentOwners,
      paymentLinkOwners,
      applicantOwners,
    );
  }
  const linksByStudent = groupByOwners(paymentLinks, paymentLinkOwners);
  const proofByStudent = groupByOwners(proofSubmissions, proofOwners);
  const piSpiByStudent = groupByOwners(piSpiRequests, piSpiOwners);
  const paymentsByStudent = groupByOwners(
    students.flatMap((student) => student.payments),
    paymentOwners,
  );
  const allPayments = students.flatMap((student) => student.payments);
  const pendingRefundsByStudent = groupIds(
    refunds.filter((refund) => studentIds.includes(refund.studentId)),
    (refund) => refund.studentId,
  );

  const liveStudents = students.map((student) => {
    const roles = [...student.person.roles].sort(compareText);
    const academicFingerprint = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: student.transcriptEntries,
      enrollments: student.enrollments,
      gradeSnapshots: student.gradeSubmissionItems,
    });
    const academicFingerprintSha256 =
      workbookCutoverAcademicFingerprintDigest(academicFingerprint);
    const sourceRecord = {
      studentId: student.id,
      personId: student.personId,
      studentNo: canonicalStudentNo(student.studentNo),
      firstName: student.person.firstName,
      lastName: student.person.lastName,
      loginEmail: canonicalEmail(student.person.email),
      recordStatus: student.recordStatus,
      personStatus: student.person.status,
      roles,
      academicFingerprintSha256,
    };
    const studentLinks = linksByStudent.get(student.id) ?? [];
    const studentProof = proofByStudent.get(student.id) ?? [];
    const studentPiSpi = piSpiByStudent.get(student.id) ?? [];
    return {
      sourceKey: workbookCutoverProductionStudentKey(student.id),
      sourceRecordSha256:
        workbookCutoverProductionStudentSourceRecordDigest(sourceRecord),
      ...sourceRecord,
      academicFingerprint,
      financialFingerprintSha256: buildWorkbookCutoverFinancialFingerprint({
        invoices: student.invoices,
        payments: paymentsByStudent.get(student.id) ?? [],
        billingProfiles: student.billingProfiles,
        linkedApplicant: student.applicant,
        proofSubmissions: studentProof,
        paymentLinks: studentLinks,
        piSpiRequests: studentPiSpi,
      }),
      pendingRefundIds: [
        ...(pendingRefundsByStudent.get(student.id) ?? []),
      ].sort(compareText),
      inFlightProofSubmissionIds: studentProof
        .filter(
          (row) =>
            row.status === "awaiting_proof" || row.status === "submitted",
        )
        .map((row) => row.id)
        .sort(compareText),
      inFlightPaymentLinkIds: studentLinks
        .filter((row) => row.status === "active")
        .map((row) => row.id)
        .sort(compareText),
      inFlightPiSpiRequestIds: studentPiSpi
        .filter((row) => row.status === "initiated" || row.status === "sent")
        .map((row) => row.id)
        .sort(compareText),
    };
  });

  const approvedDueDateSets = new Set(
    feeSchedules
      .filter((schedule) => schedule.status === "approved")
      .map((schedule) => installmentDates(schedule.rows))
      .filter((dates): dates is string[] => dates !== null)
      .map((dates) => canonicalWorkbookCutoverJson(dates)),
  );
  const installmentDueDates =
    approvedDueDateSets.size === 1
      ? (JSON.parse([...approvedDueDateSets][0]!) as string[])
      : null;

  const snapshot = WorkbookCutoverLiveSnapshotSchema.parse({
    schemaVersion: 1,
    capturedAt: capturedAt.toISOString(),
    academicYearLabel: scope.academicYearLabel,
    billingCatalogFingerprintSha256:
      buildWorkbookCutoverBillingCatalogFingerprint({
        serviceOptions: billingServiceOptions,
        adjustmentDefinitions: billingAdjustmentDefinitions,
      }),
    students: liveStudents,
    applicants: applicants.map((applicant) => {
      const source = {
        applicantId: applicant.id,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: canonicalEmail(applicant.email),
        stage: applicant.stage,
      };
      const operational = applicantOperationalState({
        applicant,
        capturedAt,
        paymentLinks,
        proofSubmissions,
        piSpiRequests,
        payments: allPayments,
      });
      return {
        sourceKey: workbookCutoverApplicantKey(applicant.id),
        sourceRecordSha256: workbookCutoverApplicantSourceRecordDigest(source),
        ...source,
        ...operational,
      };
    }),
    feeSchedules: feeSchedules.map((schedule) => ({
      id: schedule.id,
      academicYearLabel: schedule.academicYearLabel,
      revision: schedule.revision,
      status: schedule.status,
      fingerprintSha256: digestCanonicalState(schedule),
    })),
    terms: installmentDueDates
      ? terms.map((term) => ({
          id: term.id,
          academicYearLabel:
            term.academicYear?.label ?? scope.academicYearLabel,
          label: term.name,
          status: normalizeTermStatus(term.status, term.endDate, capturedAt),
          installmentDueDates,
          fingerprintSha256: digestCanonicalState({
            ...term,
            installmentDueDates,
          }),
        }))
      : [],
    studentNumberSequence: sequence
      ? {
          academicYearStart: sequence.academicYearStart,
          nextAssignableValue: sequence.nextValue,
        }
      : null,
    existingStudentNumbers: students
      .map((student) => canonicalStudentNo(student.studentNo))
      .sort(compareText),
    existingLoginEmails: people
      .flatMap((person) => {
        const email = canonicalEmail(person.email);
        return email ? [email] : [];
      })
      .sort(compareText),
    orphanPendingRefundIds: refunds
      .filter((refund) => !studentIds.includes(refund.studentId))
      .map((refund) => refund.id)
      .sort(compareText),
  });
  // Forces the same normalized digest path used by the planner before returning.
  workbookCutoverLiveSnapshotDigest(snapshot);
  return snapshot;
}

/**
 * Re-derives only the immutable academic anchors for post-mutation audit. The
 * selected fields deliberately mirror the academic portion of the live
 * snapshot and include voided transcript history plus every grade version.
 */
export async function captureWorkbookCutoverAcademicFingerprints(
  db: Pick<WorkbookCutoverSnapshotDb, "student">,
  studentIds: readonly string[],
): Promise<WorkbookCutoverCapturedAcademicFingerprint[]> {
  if (studentIds.length === 0) return [];
  const students = await db.student.findMany({
    where: { id: { in: [...new Set(studentIds)] } },
    select: {
      id: true,
      transcriptEntries: {
        select: {
          id: true,
          studentId: true,
          source: true,
          sourceKey: true,
          importBatchId: true,
          importRowNumber: true,
          gradeSubmissionItemId: true,
          enrollmentId: true,
          courseId: true,
          termId: true,
          courseCode: true,
          courseTitle: true,
          termLabel: true,
          termSortKey: true,
          grade: true,
          credits: true,
          earnedCredits: true,
          gradePoints: true,
          countsTowardGpa: true,
          countsTowardCredits: true,
          requirementCategory: true,
          note: true,
          createdById: true,
          updatedById: true,
          voidedById: true,
          createdAt: true,
          updatedAt: true,
          voidedAt: true,
          voidReason: true,
        },
        orderBy: { id: "asc" },
      },
      enrollments: {
        select: {
          id: true,
          studentId: true,
          sectionId: true,
          status: true,
          grade: true,
          enrolledAt: true,
          section: {
            select: {
              courseId: true,
              termId: true,
              sectionCode: true,
              gradingSchemeId: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
      gradeSubmissionItems: {
        select: {
          id: true,
          studentId: true,
          gradeSubmissionId: true,
          version: true,
          enrollmentId: true,
          courseId: true,
          termId: true,
          courseCode: true,
          courseTitle: true,
          termLabel: true,
          credits: true,
          grade: true,
          gradePoints: true,
          countsTowardGpa: true,
          countsTowardCredits: true,
          createdAt: true,
          gradeSubmission: {
            select: {
              sectionId: true,
              status: true,
              version: true,
              submittedById: true,
              submittedAt: true,
              approvedById: true,
              approvedAt: true,
              note: true,
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  return students.map((student) => {
    const academicFingerprint = buildWorkbookCutoverAcademicFingerprint({
      transcriptEntries: student.transcriptEntries,
      enrollments: student.enrollments,
      gradeSnapshots: student.gradeSubmissionItems,
    });
    return {
      studentId: student.id,
      academicFingerprint,
      academicFingerprintSha256:
        workbookCutoverAcademicFingerprintDigest(academicFingerprint),
    };
  });
}

export function buildWorkbookCutoverAcademicFingerprint(
  state: WorkbookCutoverAcademicState,
): AcademicFingerprint {
  const transcript = sortRecords(state.transcriptEntries);
  const enrollments = sortRecords(state.enrollments);
  const gradeSnapshots = sortRecords(state.gradeSnapshots);
  const effectiveTranscript = transcript.filter(
    (row) => normalizeDbValue(row).voidedAt === null,
  );
  const creditRows = effectiveTranscript.map((raw) => {
    const row = normalizeDbValue(raw);
    return {
      id: row.id,
      courseId: row.courseId,
      courseCode: row.courseCode,
      credits: row.credits,
      earnedCredits: row.earnedCredits,
      countsTowardCredits: row.countsTowardCredits,
    };
  });
  const gpaRows = effectiveTranscript.map((raw) => {
    const row = normalizeDbValue(raw);
    return {
      id: row.id,
      courseId: row.courseId,
      courseCode: row.courseCode,
      credits: row.credits,
      grade: row.grade,
      gradePoints: row.gradePoints,
      countsTowardGpa: row.countsTowardGpa,
    };
  });
  const creditControls = deriveCreditControls(creditRows);
  const gpaControls = deriveGpaControls(gpaRows);
  return {
    transcriptCount: transcript.length,
    transcriptSha256: digestCanonicalState(transcript),
    enrollmentCount: enrollments.length,
    enrollmentSha256: digestCanonicalState(enrollments),
    gradeSnapshotCount: gradeSnapshots.length,
    gradeSnapshotSha256: digestCanonicalState(gradeSnapshots),
    creditsSha256: digestCanonicalState({
      rows: creditRows,
      ...creditControls,
    }),
    gpaSha256: digestCanonicalState({ rows: gpaRows, ...gpaControls }),
  };
}

export function buildWorkbookCutoverFinancialFingerprint(
  state: WorkbookCutoverFinancialState,
): string {
  return digestCanonicalState({
    invoices: sortRecords(state.invoices),
    payments: sortRecords(state.payments),
    billingProfiles: sortRecords(state.billingProfiles),
    linkedApplicant: state.linkedApplicant
      ? normalizeDbValue(state.linkedApplicant)
      : null,
    proofSubmissions: sortRecords(state.proofSubmissions),
    paymentLinks: sortRecords(state.paymentLinks),
    piSpiRequests: sortRecords(state.piSpiRequests),
  });
}

export function buildWorkbookCutoverBillingCatalogFingerprint(
  state: WorkbookCutoverBillingCatalogState,
): string {
  return digestCanonicalState({
    serviceOptions: sortRecords(state.serviceOptions),
    adjustmentDefinitions: sortRecords(state.adjustmentDefinitions),
  });
}

export function workbookCutoverProductionStudentSourceRecordDigest(
  source: Record<string, unknown>,
): string {
  return digestCanonicalState(source);
}

export function workbookCutoverApplicantSourceRecordDigest(
  source: Record<string, unknown>,
): string {
  return digestCanonicalState(source);
}

function applicantOperationalState(input: {
  applicant: {
    id: string;
    onboardingStatus: string;
    studentId: string | null;
    enrollmentInvoiceId: string | null;
    activeOnboardingPaymentLinkId: string | null;
    statusTokenHash: string | null;
    statusTokenExpiresAt: Date | null;
    statusTokenRevokedAt: Date | null;
  };
  capturedAt: Date;
  paymentLinks: readonly {
    id: string;
    status: string;
    onboardingApplicantId: string | null;
  }[];
  proofSubmissions: readonly {
    id: string;
    status: string;
    resumeToken: string | null;
    paymentId: string | null;
    paymentLinkId: string | null;
    applicantId: string | null;
  }[];
  piSpiRequests: readonly {
    id: string;
    status: string;
    paymentId: string | null;
    paymentLinkId: string | null;
    applicantId: string | null;
  }[];
  payments: readonly {
    id: string;
    status: string;
  }[];
}): {
  onboardingStatus:
    "not_started" | "payment_pending" | "enrolled" | "cancelled";
  studentId: string | null;
  activeOnboardingPaymentLinkId: string | null;
  statusTokenCapability: boolean;
  statusTokenActive: boolean;
  operationalFingerprintSha256: string;
  paymentLinkBearerIds: string[];
  paymentSubmissionResumeTokenIds: string[];
  inFlightProofSubmissionIds: string[];
  inFlightPaymentLinkIds: string[];
  inFlightPiSpiRequestIds: string[];
  pendingPaymentIds: string[];
  pendingRefundIds: string[];
} {
  const paymentLinkIds = new Set(
    input.paymentLinks
      .filter(
        (link) =>
          link.onboardingApplicantId === input.applicant.id ||
          link.id === input.applicant.activeOnboardingPaymentLinkId,
      )
      .map((link) => link.id),
  );
  const paymentIds = new Set<string>();
  let proof = input.proofSubmissions.filter(
    (row) =>
      row.applicantId === input.applicant.id ||
      (row.paymentLinkId !== null && paymentLinkIds.has(row.paymentLinkId)),
  );
  let piSpi = input.piSpiRequests.filter(
    (row) =>
      row.applicantId === input.applicant.id ||
      (row.paymentLinkId !== null && paymentLinkIds.has(row.paymentLinkId)),
  );
  let changed = true;
  while (changed) {
    const before =
      paymentLinkIds.size + paymentIds.size + proof.length + piSpi.length;
    for (const row of [...proof, ...piSpi]) {
      if (row.paymentId) paymentIds.add(row.paymentId);
      if (row.paymentLinkId) paymentLinkIds.add(row.paymentLinkId);
    }
    proof = input.proofSubmissions.filter(
      (row) =>
        row.applicantId === input.applicant.id ||
        (row.paymentId !== null && paymentIds.has(row.paymentId)) ||
        (row.paymentLinkId !== null && paymentLinkIds.has(row.paymentLinkId)),
    );
    piSpi = input.piSpiRequests.filter(
      (row) =>
        row.applicantId === input.applicant.id ||
        (row.paymentId !== null && paymentIds.has(row.paymentId)) ||
        (row.paymentLinkId !== null && paymentLinkIds.has(row.paymentLinkId)),
    );
    changed =
      before !==
      paymentLinkIds.size + paymentIds.size + proof.length + piSpi.length;
  }
  const links = input.paymentLinks.filter((link) =>
    paymentLinkIds.has(link.id),
  );
  const payments = input.payments.filter((payment) =>
    paymentIds.has(payment.id),
  );
  const statusTokenCapability = input.applicant.statusTokenHash !== null;
  const statusTokenActive =
    statusTokenCapability &&
    input.applicant.statusTokenRevokedAt === null &&
    (input.applicant.statusTokenExpiresAt === null ||
      input.applicant.statusTokenExpiresAt.getTime() >
        input.capturedAt.getTime());
  const onboardingStatus = input.applicant.onboardingStatus as
    "not_started" | "payment_pending" | "enrolled" | "cancelled";
  return {
    onboardingStatus,
    studentId: input.applicant.studentId,
    activeOnboardingPaymentLinkId:
      input.applicant.activeOnboardingPaymentLinkId,
    statusTokenCapability,
    statusTokenActive,
    operationalFingerprintSha256: digestCanonicalState({
      applicant: input.applicant,
      paymentLinks: sortRecords(links),
      proofSubmissions: sortRecords(proof),
      piSpiRequests: sortRecords(piSpi),
      payments: sortRecords(payments),
    }),
    paymentLinkBearerIds: links.map((row) => row.id).sort(compareText),
    paymentSubmissionResumeTokenIds: proof
      .filter((row) => typeof row.resumeToken === "string")
      .map((row) => row.id)
      .sort(compareText),
    inFlightProofSubmissionIds: proof
      .filter((row) => ["awaiting_proof", "submitted"].includes(row.status))
      .map((row) => row.id)
      .sort(compareText),
    inFlightPaymentLinkIds: links
      .filter((row) => row.status === "active")
      .map((row) => row.id)
      .sort(compareText),
    inFlightPiSpiRequestIds: piSpi
      .filter((row) => ["initiated", "sent"].includes(row.status))
      .map((row) => row.id)
      .sort(compareText),
    pendingPaymentIds: payments
      .filter((row) => row.status === "pending")
      .map((row) => row.id)
      .sort(compareText),
    pendingRefundIds: payments
      .filter((row) => row.status === "refund_pending")
      .map((row) => row.id)
      .sort(compareText),
  };
}

export function workbookCutoverSnapshotCounts(
  snapshot: WorkbookCutoverLiveSnapshot,
): WorkbookCutoverLiveSnapshotCounts {
  return {
    students: snapshot.students.length,
    activeStudents: snapshot.students.filter(
      (row) => row.recordStatus === "active",
    ).length,
    pendingPaymentStudents: snapshot.students.filter(
      (row) => row.recordStatus === "pending_payment",
    ).length,
    archivedStudents: snapshot.students.filter(
      (row) => row.recordStatus === "archived",
    ).length,
    currentApplicants: snapshot.applicants.length,
    feeSchedules: snapshot.feeSchedules.length,
    terms: snapshot.terms.length,
    pendingRefunds: snapshot.students.reduce(
      (total, row) => total + row.pendingRefundIds.length,
      0,
    ),
    orphanPendingRefunds: snapshot.orphanPendingRefundIds.length,
  };
}

export function workbookCutoverCapturedSnapshotDigest(
  snapshot: WorkbookCutoverLiveSnapshot,
): string {
  return workbookCutoverLiveSnapshotDigest(snapshot);
}

function addOwner(
  ownerMap: Map<string, Set<string>>,
  objectId: string,
  studentId: string,
): boolean {
  const owners = ownerMap.get(objectId) ?? new Set<string>();
  const before = owners.size;
  owners.add(studentId);
  ownerMap.set(objectId, owners);
  return owners.size !== before;
}

function ownerEdgeCount(ownerMap: ReadonlyMap<string, ReadonlySet<string>>) {
  let count = 0;
  for (const owners of ownerMap.values()) count += owners.size;
  return count;
}

function ownersByAttempt<
  T extends {
    id: string;
    studentId: string | null;
    invoiceId: string | null;
    paymentId: string | null;
    paymentLinkId: string | null;
    applicantId: string | null;
  },
>(
  rows: readonly T[],
  invoiceOwners: ReadonlyMap<string, ReadonlySet<string>>,
  paymentOwners: ReadonlyMap<string, ReadonlySet<string>>,
  paymentLinkOwner: ReadonlyMap<string, ReadonlySet<string>>,
  applicantOwners: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const owners = new Set<string>();
    if (row.studentId) owners.add(row.studentId);
    if (row.invoiceId) {
      for (const owner of invoiceOwners.get(row.invoiceId) ?? []) {
        owners.add(owner);
      }
    }
    if (row.paymentId) {
      for (const owner of paymentOwners.get(row.paymentId) ?? []) {
        owners.add(owner);
      }
    }
    if (row.paymentLinkId) {
      for (const owner of paymentLinkOwner.get(row.paymentLinkId) ?? []) {
        owners.add(owner);
      }
    }
    if (row.applicantId) {
      for (const owner of applicantOwners.get(row.applicantId) ?? []) {
        owners.add(owner);
      }
    }
    result.set(row.id, owners);
  }
  return result;
}

function propagateAttemptOwners<
  T extends {
    id: string;
    paymentId: string | null;
    paymentLinkId: string | null;
  },
>(
  attempts: readonly T[],
  attemptOwners: ReadonlyMap<string, ReadonlySet<string>>,
  paymentOwners: Map<string, Set<string>>,
  paymentLinkOwners: Map<string, Set<string>>,
): void {
  for (const attempt of attempts) {
    for (const owner of attemptOwners.get(attempt.id) ?? []) {
      if (attempt.paymentId) addOwner(paymentOwners, attempt.paymentId, owner);
      if (attempt.paymentLinkId) {
        addOwner(paymentLinkOwners, attempt.paymentLinkId, owner);
      }
    }
  }
}

function groupByOwners<T extends { id: string }>(
  rows: readonly T[],
  ownerMap: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    for (const owner of ownerMap.get(row.id) ?? []) {
      const bucket = result.get(owner) ?? [];
      bucket.push(row);
      result.set(owner, bucket);
    }
  }
  for (const bucket of result.values()) bucket.sort(compareRecordId);
  return result;
}

function groupIds<T extends { id: string }>(
  rows: readonly T[],
  owner: (row: T) => string,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const key = owner(row);
    const bucket = result.get(key) ?? [];
    bucket.push(row.id);
    result.set(key, bucket);
  }
  return result;
}

function deriveCreditControls(rows: readonly Record<string, unknown>[]) {
  let attemptedCredits = 0;
  const earnedByCourse = new Map<string, number>();
  for (const row of rows) {
    const credits = wholeNumber(row.credits);
    attemptedCredits += credits;
    if (row.countsTowardCredits !== true) continue;
    const earned = wholeNumber(row.earnedCredits);
    if (earned <= 0) continue;
    const key =
      typeof row.courseId === "string" && row.courseId
        ? row.courseId
        : canonicalCourseCode(String(row.courseCode ?? ""));
    earnedByCourse.set(key, Math.max(earnedByCourse.get(key) ?? 0, earned));
  }
  return {
    attemptedCredits,
    earnedCredits: [...earnedByCourse.values()].reduce(
      (total, value) => total + value,
      0,
    ),
    earnedByCourse: [...earnedByCourse.entries()].sort(([left], [right]) =>
      compareText(left, right),
    ),
  };
}

function deriveGpaControls(rows: readonly Record<string, unknown>[]) {
  let gpaCredits = 0;
  let qualityPoints = 0;
  for (const row of rows) {
    if (row.countsTowardGpa !== true || typeof row.gradePoints !== "number") {
      continue;
    }
    const credits = wholeNumber(row.credits);
    gpaCredits += credits;
    qualityPoints += row.gradePoints * credits;
  }
  return {
    gpaCredits,
    qualityPoints,
    gpa:
      gpaCredits === 0
        ? null
        : Math.round((qualityPoints / gpaCredits) * 100) / 100,
  };
}

function installmentDates(
  rows: readonly { dueOn: Date | null }[],
): string[] | null {
  if (rows.length !== 4 || rows.some((row) => row.dueOn === null)) return null;
  return rows.map((row) => dateOnly(row.dueOn!));
}

function normalizeTermStatus(
  status: string | null,
  endDate: Date,
  capturedAt: Date,
): "planned" | "active" | "closed" {
  if (status === "active") return "active";
  if (status === "closed" || endDate.getTime() < capturedAt.getTime()) {
    return "closed";
  }
  return "planned";
}

function sortRecords<T extends Record<string, unknown>>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(compareRecordId);
}

function compareRecordId(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  return compareText(String(left.id ?? ""), String(right.id ?? ""));
}

function digestCanonicalState(value: unknown): string {
  return createHash("sha256")
    .update(canonicalWorkbookCutoverJson(normalizeDbValue(value)))
    .digest("hex");
}

function normalizeDbValue(value: unknown): any {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeDbValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, current]) => current !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, current]) => [key, normalizeDbValue(current)]),
    );
  }
  return value;
}

function canonicalStudentNo(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

function canonicalEmail(value: string | null): string | null {
  return value?.normalize("NFKC").trim().toLowerCase() ?? null;
}

function canonicalCourseCode(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function wholeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertScope(scope: WorkbookCutoverSnapshotScope): void {
  if (!scope.academicYearLabel.trim()) {
    throw new Error("Workbook cutover academic year label is required");
  }
  if (
    !Number.isInteger(scope.academicYearStart) ||
    scope.academicYearStart < 2000 ||
    scope.academicYearStart > 2999
  ) {
    throw new Error("Workbook cutover academic year start is invalid");
  }
}

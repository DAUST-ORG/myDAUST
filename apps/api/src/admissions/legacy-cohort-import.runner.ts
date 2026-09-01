import { createHash, randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { Prisma, type PaymentMethod, type PrismaClient } from "@mydaust/db";
import { toDakarDateKey } from "@mydaust/shared";
import { createPaymentGatedAcceptanceInTransaction } from "./payment-gated-acceptance.js";
import {
  type LegacyCohortManifest,
  type LegacyCohortPayment,
  legacyCohortCoordinate,
  legacyCohortManifestDigest,
  legacyCohortPersonDigest,
  legacyCohortProviderRef,
} from "./legacy-cohort-import.manifest.js";
import {
  type TrustedLegacyCohortExtraction,
  verifyLegacyCohortManifestExtraction,
} from "./legacy-cohort-import.extraction.js";
import { applyHistoricalCashSettlementInTransaction } from "../finance/historical-cash-settlement.js";
import { cancelOnboardingPaymentAttemptsInTransaction } from "../finance/admission-payment-gate.js";
import { normalizeExternalReference } from "../finance/historical-payment-import.manifest.js";
import {
  externalReferenceFingerprintSha256,
  paymentReferenceEvidence,
} from "../finance/payment-reference.js";

const IMPORT_ROLES = new Set(["admin"]);
const SERIALIZABLE_RETRIES = 3;

type ImportDb = PrismaClient | Prisma.TransactionClient;

export type LegacyCohortImportInvocation = {
  actorEmail: string;
};

export type LegacyCohortImportBlocker = {
  code: string;
  message: string;
  personKey?: string;
  guardianKey?: string;
  details?: Record<string, unknown>;
};

export type LegacyCohortImportPlan = {
  actorId: string;
  alreadyImportedBatchId: string | null;
  manifestSha256: string;
  sourceSha256: string;
  planSha256: string;
  sourceRows: number;
  includedSourceRows: number;
  excludedSourceRows: number;
  people: number;
  guardians: number;
  payments: number;
  paymentAmountXof: number;
  pendingAfterImport: number;
  projectedActivations: number;
  feeSchedule: { id: string; revision: number; totalXof: number } | null;
  blockers: LegacyCohortImportBlocker[];
  warnings: {
    code: string;
    message: string;
    personKey?: string;
    guardianKey?: string;
  }[];
};

export type LegacyCohortImportResult = {
  batchId: string;
  alreadyImported: boolean;
  peopleCreated: number;
  guardiansCreated: number;
  guardianLinksCreated: number;
  paymentsImported: number;
  importedXof: number;
  activatedStudents: number;
};

export class LegacyCohortImportBlockedError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LegacyCohortImportBlockedError";
  }
}

export function legacyCohortDryRunExitCode(
  plan: Pick<LegacyCohortImportPlan, "blockers">,
): 0 | 2 {
  return plan.blockers.length === 0 ? 0 : 2;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function paymentDate(payment: LegacyCohortPayment): string {
  return payment.evidence.settledOn;
}

function paymentMethod(payment: LegacyCohortPayment): PaymentMethod {
  return payment.evidence.method;
}

function paymentExternalReference(payment: LegacyCohortPayment): string | null {
  return payment.evidence.externalReference ?? null;
}

function academicYearStart(label: string): number | null {
  const match = label.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

async function requireActor(db: ImportDb, emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const actor = await db.person.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, roles: true },
  });
  if (!actor || !actor.roles.some((role) => IMPORT_ROLES.has(role))) {
    throw new LegacyCohortImportBlockedError(
      "Legacy cohort confirmation requires an existing administrator",
      {},
    );
  }
  return actor;
}

function projectedFirstInstallmentXof(input: {
  totalXof: number;
  installmentCount: number;
}): number {
  return (
    Math.floor(input.totalXof / input.installmentCount) +
    (input.totalXof % input.installmentCount > 0 ? 1 : 0)
  );
}

export async function planLegacyCohortImport(
  db: ImportDb,
  manifest: LegacyCohortManifest,
  invocation: LegacyCohortImportInvocation,
): Promise<LegacyCohortImportPlan> {
  const actor = await requireActor(db, invocation.actorEmail);
  const manifestSha256 = legacyCohortManifestDigest(manifest);
  const [existingSourceBatch, existingManifestBatch] = await Promise.all([
    db.legacyCohortImportBatch.findUnique({
      where: { sourceSha256: manifest.sourceWorkbook.sha256 },
    }),
    db.legacyCohortImportBatch.findUnique({ where: { manifestSha256 } }),
  ]);
  if (existingSourceBatch) {
    if (existingSourceBatch.manifestSha256 !== manifestSha256) {
      throw new LegacyCohortImportBlockedError(
        "This workbook hash already belongs to a different reviewed cohort manifest",
        { batchId: existingSourceBatch.id },
      );
    }
    if (existingSourceBatch.status !== "imported") {
      throw new LegacyCohortImportBlockedError(
        "A non-complete cohort batch already owns this workbook hash",
        { batchId: existingSourceBatch.id, status: existingSourceBatch.status },
      );
    }
    return {
      actorId: actor.id,
      alreadyImportedBatchId: existingSourceBatch.id,
      manifestSha256,
      sourceSha256: manifest.sourceWorkbook.sha256,
      planSha256: existingSourceBatch.confirmationPlanSha256,
      sourceRows: manifest.sourceRowCount,
      includedSourceRows: manifest.people.reduce(
        (sum, person) => sum + person.sources.length,
        0,
      ),
      excludedSourceRows: manifest.excludedSources.length,
      people: 0,
      guardians: 0,
      payments: 0,
      paymentAmountXof: 0,
      pendingAfterImport: 0,
      projectedActivations: 0,
      feeSchedule: null,
      blockers: [],
      warnings: [],
    };
  }
  if (
    existingManifestBatch &&
    existingManifestBatch.sourceSha256 !== manifest.sourceWorkbook.sha256
  ) {
    throw new LegacyCohortImportBlockedError(
      "This reviewed manifest digest is already bound to another workbook",
      { batchId: existingManifestBatch.id },
    );
  }

  const blockers: LegacyCohortImportBlocker[] = [];
  const warnings: LegacyCohortImportPlan["warnings"] = [];
  const existingPaymentBatch = await db.paymentImportBatch.findUnique({
    where: { sourceSha256: manifest.sourceWorkbook.sha256 },
    select: { id: true, status: true },
  });
  if (existingPaymentBatch) {
    blockers.push({
      code: "source_workbook_already_used_for_payment_import",
      message:
        "This workbook hash is already owned by a different payment import and requires reconciliation",
      details: {
        batchId: existingPaymentBatch.id,
        status: existingPaymentBatch.status,
      },
    });
  }
  const yearStart = academicYearStart(manifest.academicYear.label);
  if (!yearStart) {
    blockers.push({
      code: "invalid_academic_year_label",
      message: "Academic-year label must contain a four-digit start year",
    });
  }

  const academicYear = await db.academicYear.findUnique({
    where: { id: manifest.academicYear.id },
  });
  if (!academicYear || academicYear.label !== manifest.academicYear.label) {
    blockers.push({
      code: "academic_year_mismatch",
      message: "Reviewed academic-year id and label do not match the database",
    });
  }

  const programCodes = [
    ...new Set(
      manifest.people.flatMap((person) =>
        person.applicant.programCode ? [person.applicant.programCode] : [],
      ),
    ),
  ];
  const programs = await db.program.findMany({
    where: { code: { in: programCodes } },
    select: { id: true, code: true },
  });
  const programByCode = new Map(
    programs.map((program) => [program.code, program]),
  );
  for (const person of manifest.people) {
    if (
      person.applicant.programCode &&
      !programByCode.has(person.applicant.programCode)
    ) {
      blockers.push({
        code: "program_not_found",
        personKey: person.personKey,
        message: "Reviewed program code does not exist",
      });
    } else if (!person.applicant.programCode) {
      warnings.push({
        code: "program_unassigned",
        personKey: person.personKey,
        message:
          "Student will be imported without a program and requires later registrar assignment",
      });
    }
    if (yearStart && !person.legacyStudentNo.startsWith(`F${yearStart}`)) {
      blockers.push({
        code: "legacy_student_id_wrong_year",
        personKey: person.personKey,
        message: `Permanent legacy Student ID must begin with F${yearStart}`,
      });
    }
    const dob = new Date(`${person.applicant.dateOfBirth}T00:00:00.000Z`);
    if (
      dob < new Date("1900-01-01T00:00:00.000Z") ||
      person.applicant.dateOfBirth > toDakarDateKey(new Date())
    ) {
      blockers.push({
        code: "invalid_date_of_birth",
        personKey: person.personKey,
        message:
          "Date of birth must be valid, historical, and not in the future",
      });
    }
  }

  const feeSchedule = academicYear
    ? await db.feeSchedule.findFirst({
        where: {
          academicYearLabel: academicYear.label,
          status: "approved",
          approvedById: { not: null },
          approvedAt: { not: null },
        },
        orderBy: { revision: "desc" },
        include: {
          rows: { orderBy: { sequence: "asc" } },
          components: true,
        },
      })
    : null;
  const selectedComponents =
    feeSchedule?.components.filter(
      (component) => component.defaultSelected && component.annualAmountXof > 0,
    ) ?? [];
  const packageTotalXof = selectedComponents.reduce(
    (sum, component) => sum + component.annualAmountXof,
    0,
  );
  if (
    !feeSchedule ||
    feeSchedule.rows.length === 0 ||
    feeSchedule.rows.some((row) => !row.dueOn) ||
    packageTotalXof <= 0
  ) {
    blockers.push({
      code: "approved_fee_schedule_missing",
      message:
        "Academic year requires an explicitly approved package with dated installments and default components",
    });
  }
  const billingTerm = academicYear
    ? await db.term.findFirst({
        where: { academicYearId: academicYear.id },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        select: { id: true },
      })
    : null;
  if (!billingTerm) {
    blockers.push({
      code: "billing_term_missing",
      message: "Academic year has no billing term for the approved package",
    });
  }

  const studentNos = manifest.people.map((person) => person.legacyStudentNo);
  const studentCollisions = await db.student.findMany({
    where: {
      OR: studentNos.map((studentNo) => ({
        studentNo: { equals: studentNo, mode: "insensitive" as const },
      })),
    },
    select: { studentNo: true },
  });
  if (studentCollisions.length > 0) {
    blockers.push({
      code: "legacy_student_id_collision",
      message: `${studentCollisions.length} permanent legacy Student ID assignment(s) already exist`,
    });
  }

  const expectedProviderRefs = manifest.people.flatMap((person) =>
    person.payments.map((payment) =>
      legacyCohortProviderRef(
        manifestSha256,
        person.personKey,
        payment.paymentKey,
      ),
    ),
  );
  const providerRefCollisions =
    expectedProviderRefs.length > 0
      ? await db.payment.findMany({
          where: { providerRef: { in: expectedProviderRefs } },
          select: { id: true },
        })
      : [];
  if (providerRefCollisions.length > 0) {
    blockers.push({
      code: "historical_payment_reference_collision",
      message:
        "One or more deterministic cohort payment references already belong to ledger entries",
      details: { collisionCount: providerRefCollisions.length },
    });
  }

  const reviewedExternalReferences = manifest.people.flatMap((person) =>
    person.payments.flatMap((payment) => {
      const normalized = normalizeExternalReference(
        payment.evidence.externalReference,
      );
      return normalized
        ? [
            {
              normalized,
              normalizedSha256: sha256(normalized),
              fingerprintSha256: externalReferenceFingerprintSha256(
                payment.evidence.method,
                normalized,
              )!,
            },
          ]
        : [];
    }),
  );
  const existingReferencePayments =
    reviewedExternalReferences.length > 0
      ? await db.payment.findMany({
          where: {
            status: {
              in: ["pending", "success", "refund_pending", "refunded"],
            },
          },
          select: {
            id: true,
            providerRef: true,
            externalReferenceFingerprintSha256: true,
            ipnPayload: true,
            submission: { select: { bankReference: true } },
          },
        })
      : [];
  const existingReferenceCollisionIds = new Set<string>();
  for (const payment of existingReferencePayments) {
    const evidence = paymentReferenceEvidence(payment);
    if (
      reviewedExternalReferences.some(
        (reference) =>
          payment.externalReferenceFingerprintSha256 ===
            reference.fingerprintSha256 ||
          evidence.normalized.has(reference.normalized) ||
          evidence.hashes.has(reference.normalizedSha256),
      )
    ) {
      existingReferenceCollisionIds.add(payment.id);
    }
  }
  if (existingReferenceCollisionIds.size > 0) {
    blockers.push({
      code: "documented_payment_reference_already_recorded",
      message:
        "One or more documented payment references already appear in canonical ledger evidence and require reconciliation",
      details: { collisionCount: existingReferenceCollisionIds.size },
    });
  }

  const studentEmails = manifest.people.map(
    (person) => person.applicant.studentEmail.finalEmail,
  );
  const [personEmailCollisions, applicantEmailCollisions] = await Promise.all([
    db.person.findMany({
      where: {
        OR: studentEmails.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
      select: { id: true, email: true },
    }),
    db.applicant.findMany({
      where: {
        OR: studentEmails.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
      select: { id: true, email: true },
    }),
  ]);
  if (personEmailCollisions.length > 0) {
    blockers.push({
      code: "student_email_person_collision",
      message: `${personEmailCollisions.length} reviewed student emails already belong to Person records`,
    });
  }
  if (applicantEmailCollisions.length > 0) {
    blockers.push({
      code: "student_email_applicant_collision",
      message: `${applicantEmailCollisions.length} reviewed student emails already belong to Applicant records`,
    });
  }

  const existingGuardianIds = manifest.guardians.flatMap((guardian) =>
    guardian.identityDecision.disposition === "link_existing_parent"
      ? [guardian.identityDecision.personId]
      : [],
  );
  const guardianEmails = manifest.guardians.flatMap((guardian) =>
    guardian.email.finalEmail ? [guardian.email.finalEmail] : [],
  );
  const [existingGuardians, guardianApplicantEmailCollisions] =
    await Promise.all([
      db.person.findMany({
        where: {
          OR: [
            ...(existingGuardianIds.length > 0
              ? [{ id: { in: existingGuardianIds } }]
              : []),
            ...guardianEmails.map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            })),
          ],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          kind: true,
          roles: true,
          guardianProfile: { select: { phone: true, address: true } },
        },
      }),
      db.applicant.findMany({
        where: {
          OR: guardianEmails.map((email) => ({
            email: { equals: email, mode: "insensitive" as const },
          })),
        },
        select: { id: true },
      }),
    ]);
  if (guardianApplicantEmailCollisions.length > 0) {
    blockers.push({
      code: "guardian_email_applicant_collision",
      message:
        "One or more reviewed guardian emails already belong to Applicant records",
      details: { collisionCount: guardianApplicantEmailCollisions.length },
    });
  }
  const guardianById = new Map(existingGuardians.map((row) => [row.id, row]));
  for (const guardian of manifest.guardians) {
    const finalEmail = guardian.email.finalEmail;
    const byEmail = existingGuardians.filter(
      (row) =>
        finalEmail !== null && row.email?.trim().toLowerCase() === finalEmail,
    );
    if (!finalEmail) {
      warnings.push({
        code: "guardian_email_unavailable",
        guardianKey: guardian.guardianKey,
        message:
          "Guardian will remain a contact-only parent until staff add a real email",
      });
    }
    if (guardian.identityDecision.disposition === "create_new") {
      if (byEmail.length > 0) {
        blockers.push({
          code: "guardian_email_collision",
          guardianKey: guardian.guardianKey,
          message: "A create-new guardian email already belongs to a Person",
        });
      }
      continue;
    }
    const existing = guardianById.get(guardian.identityDecision.personId);
    const existingName = existing
      ? `${existing.firstName} ${existing.lastName}`.trim()
      : null;
    const reviewedName = `${guardian.firstName} ${guardian.lastName}`.trim();
    if (
      !existing ||
      existing.kind !== "parent" ||
      !existing.roles.includes("parent") ||
      (existing.email?.trim().toLowerCase() ?? null) !== finalEmail ||
      (finalEmail !== null && byEmail.length !== 1) ||
      existingName !== reviewedName ||
      existing.guardianProfile?.phone !== guardian.phone ||
      (existing.guardianProfile?.address ?? null) !== guardian.address
    ) {
      blockers.push({
        code: "existing_guardian_identity_mismatch",
        guardianKey: guardian.guardianKey,
        message:
          "Reviewed existing guardian must be the unique parent Person with the final email",
      });
    }
  }

  const firstInstallmentXof =
    feeSchedule && feeSchedule.rows.length > 0
      ? projectedFirstInstallmentXof({
          totalXof: packageTotalXof,
          installmentCount: feeSchedule.rows.length,
        })
      : 0;
  let paymentGateActivations = 0;
  let paymentGatePending = 0;
  for (const person of manifest.people) {
    const total = person.payments.reduce(
      (sum, payment) => sum + payment.amountXof,
      0,
    );
    if (!Number.isSafeInteger(total) || total > packageTotalXof) {
      blockers.push({
        code: "payment_exceeds_package",
        personKey: person.personKey,
        message: "Reviewed historical cash exceeds the approved annual package",
      });
    }
    if (total >= firstInstallmentXof && firstInstallmentXof > 0) {
      paymentGateActivations += 1;
    } else {
      paymentGatePending += 1;
    }
    for (const payment of person.payments) {
      const settledOn = paymentDate(payment);
      if (settledOn > toDakarDateKey(new Date())) {
        blockers.push({
          code: "future_settlement_date",
          personKey: person.personKey,
          message: "Historical cash cannot have a future accounting date",
        });
      }
      if (payment.evidence.status === "reviewed_legacy_gap") {
        warnings.push({
          code: "legacy_payment_evidence_gap",
          personKey: person.personKey,
          message:
            "Payment retains explicit method/reference/date uncertainty provenance",
        });
      }
    }
  }
  const activateAllLegacyStudents =
    manifest.onboardingPolicy.disposition === "activate_all_legacy_students";
  const projectedActivations = activateAllLegacyStudents
    ? manifest.people.length
    : paymentGateActivations;
  const pendingAfterImport = activateAllLegacyStudents ? 0 : paymentGatePending;
  if (activateAllLegacyStudents) {
    warnings.push({
      code: "reviewed_legacy_activation_override",
      message:
        "Every included legacy record will be activated after canonical historical-cash processing, including records below the enrollment payment gate",
    });
  }

  const paymentAmountXof = manifest.people.reduce(
    (sum, person) =>
      sum +
      person.payments.reduce(
        (personTotal, payment) => personTotal + payment.amountXof,
        0,
      ),
    0,
  );
  const anchor = {
    manifestSha256,
    onboardingPolicy: manifest.onboardingPolicy,
    academicYear: academicYear
      ? {
          id: academicYear.id,
          label: academicYear.label,
          status: academicYear.status,
        }
      : null,
    feeSchedule: feeSchedule
      ? {
          id: feeSchedule.id,
          revision: feeSchedule.revision,
          approvedAt: feeSchedule.approvedAt?.toISOString() ?? null,
          totalXof: packageTotalXof,
          rows: feeSchedule.rows.map((row) => ({
            id: row.id,
            sequence: row.sequence,
            dueOn: row.dueOn?.toISOString() ?? null,
          })),
          components: selectedComponents
            .map((component) => ({
              id: component.id,
              key: component.key,
              costCenterCode: component.costCenterCode,
              annualAmountXof: component.annualAmountXof,
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }
      : null,
    billingTermId: billingTerm?.id ?? null,
    programs: programs
      .map((program) => ({ id: program.id, code: program.code }))
      .sort((left, right) => left.code.localeCompare(right.code)),
    collisionCounts: {
      students: studentCollisions.length,
      people: personEmailCollisions.length,
      applicants: applicantEmailCollisions.length,
      providerRefs: providerRefCollisions.length,
      documentedPaymentReferences: existingReferenceCollisionIds.size,
      guardianApplicants: guardianApplicantEmailCollisions.length,
      priorPaymentBatches: existingPaymentBatch ? 1 : 0,
    },
    blockers: blockers.map((blocker) => blocker.code).sort(),
  };
  return {
    actorId: actor.id,
    alreadyImportedBatchId: null,
    manifestSha256,
    sourceSha256: manifest.sourceWorkbook.sha256,
    planSha256: sha256(stableJson(anchor)),
    sourceRows: manifest.sourceRowCount,
    includedSourceRows: manifest.people.reduce(
      (sum, person) => sum + person.sources.length,
      0,
    ),
    excludedSourceRows: manifest.excludedSources.length,
    people: manifest.people.length,
    guardians: manifest.guardians.length,
    payments: manifest.people.reduce(
      (sum, person) => sum + person.payments.length,
      0,
    ),
    paymentAmountXof,
    pendingAfterImport,
    projectedActivations,
    feeSchedule: feeSchedule
      ? {
          id: feeSchedule.id,
          revision: feeSchedule.revision,
          totalXof: packageTotalXof,
        }
      : null,
    blockers,
    warnings,
  };
}

async function recordLegacyCohortPairedActivationInTransaction(
  tx: Prisma.TransactionClient,
  activation: {
    applicantId: string;
    studentId: string;
  },
  batchId: string,
  actorId: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entity: "Applicant",
      entityId: activation.applicantId,
      action: "legacy-cohort-student-activation-required",
      actorId,
      data: {
        batchId,
        studentId: activation.studentId,
        notificationPolicy: "suppress_all",
      },
    },
  });
}

async function activateLegacyCohortStudentByReviewedOverrideInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    applicantId: string;
    studentId: string;
    personId: string;
    invoiceId: string;
    cohortBatchId: string;
    manifestSha256: string;
    actorId: string;
    reason: string;
  },
): Promise<void> {
  const [person, activeInvite] = await Promise.all([
    tx.person.findUnique({
      where: { id: input.personId },
      select: { roles: true },
    }),
    tx.studentInvite.findFirst({
      where: { studentPersonId: input.personId },
      select: { id: true },
    }),
  ]);
  if (!person) throw new Error("Legacy cohort Student Person is missing");
  if (activeInvite) {
    throw new Error(
      "Reviewed legacy activation override cannot consume or replace an account invite",
    );
  }

  const now = new Date();
  const claimed = await tx.applicant.updateMany({
    where: {
      id: input.applicantId,
      studentId: input.studentId,
      enrollmentInvoiceId: input.invoiceId,
      onboardingStatus: "payment_pending",
      activatedByPaymentId: null,
    },
    data: {
      onboardingStatus: "enrolled",
      enrolledAt: now,
      activeOnboardingPaymentLinkId: null,
      statusTokenHash: null,
      statusTokenExpiresAt: now,
      statusTokenRevokedAt: now,
    },
  });
  if (claimed.count !== 1) {
    throw new Error(
      "Reviewed legacy activation override could not claim the pending applicant",
    );
  }

  await tx.student.update({
    where: { id: input.studentId },
    data: { recordStatus: "active", enrolledAt: now },
  });
  await tx.person.update({
    where: { id: input.personId },
    data: {
      roles: person.roles.includes("student")
        ? person.roles
        : [...person.roles, "student"],
    },
  });
  const onboardingLinks = await tx.paymentLink.findMany({
    where: { onboardingApplicantId: input.applicantId },
    select: { id: true },
  });
  await tx.paymentLink.updateMany({
    where: {
      onboardingApplicantId: input.applicantId,
      status: "active",
    },
    data: { status: "cancelled" },
  });
  await cancelOnboardingPaymentAttemptsInTransaction(
    tx,
    onboardingLinks.map((link) => link.id),
    "Legacy cohort enrollment was activated by reviewed migration policy",
    "preserve",
  );
  await tx.auditLog.create({
    data: {
      entity: "Applicant",
      entityId: input.applicantId,
      action: "legacy-cohort-onboarding-override-activated",
      actorId: input.actorId,
      data: {
        cohortBatchId: input.cohortBatchId,
        manifestSha256: input.manifestSha256,
        studentId: input.studentId,
        invoiceId: input.invoiceId,
        activatedByPaymentId: null,
        onboardingPolicy: "activate_all_legacy_students",
        reviewed: true,
        reason: input.reason,
        notificationPolicy: "suppress_all",
      },
    },
  });
}

function assertCleanPlan(
  plan: LegacyCohortImportPlan,
  expectedPlanSha256: string,
): void {
  if (plan.blockers.length > 0) {
    throw new LegacyCohortImportBlockedError(
      "Confirmation refused because the dry-run plan contains blockers",
      { blockers: plan.blockers.slice(0, 300) },
    );
  }
  if (plan.planSha256 !== expectedPlanSha256) {
    throw new LegacyCohortImportBlockedError(
      "The database state changed after dry-run; review the new plan digest",
      {
        expectedPlanSha256,
        currentPlanSha256: plan.planSha256,
      },
    );
  }
}

function settlementTimestamp(dateOnly: string): Date {
  return new Date(`${dateOnly}T12:00:00.000Z`);
}

function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

export async function executeLegacyCohortImport(
  prisma: PrismaClient,
  manifest: LegacyCohortManifest,
  extraction: TrustedLegacyCohortExtraction,
  invocation: LegacyCohortImportInvocation,
  expectedPlanSha256: string,
): Promise<LegacyCohortImportResult> {
  verifyLegacyCohortManifestExtraction(manifest, extraction);
  const sourceDispositionByCoordinate = new Map(
    manifest.people.flatMap((person) =>
      person.sources.map(
        (source) =>
          [legacyCohortCoordinate(source), source.disposition.kind] as const,
      ),
    ),
  );
  const importedSourceRows = [...sourceDispositionByCoordinate.values()].filter(
    (disposition) => disposition === "cash",
  ).length;
  const duplicateSourceRows = [
    ...sourceDispositionByCoordinate.values(),
  ].filter((disposition) => disposition === "duplicate").length;
  const noCashSourceRows = [...sourceDispositionByCoordinate.values()].filter(
    (disposition) => disposition === "no_cash",
  ).length;
  const explicitlyExcludedSourceRows = manifest.excludedSources.length;
  const excludedHoldCodeCounts = manifest.excludedSources
    .flatMap((source) => source.holdCodes)
    .reduce<Record<string, number>>((counts, code) => {
      counts[code] = (counts[code] ?? 0) + 1;
      return counts;
    }, {});
  const skippedSourceRows = manifest.sourceRowCount - importedSourceRows;
  const excludedSourceXof = extraction.rows.reduce((sum, row) => {
    const disposition = sourceDispositionByCoordinate.get(
      legacyCohortCoordinate(row),
    );
    return disposition === "cash" ? sum : sum + (row.paymentAmountXof ?? 0);
  }, 0);
  const sourceControlDifferenceXof =
    manifest.people.reduce(
      (sum, person) =>
        sum +
        person.payments.reduce(
          (paymentSum, payment) => paymentSum + payment.amountXof,
          0,
        ),
      0,
    ) +
    excludedSourceXof -
    manifest.sourcePaidTotalXof;
  for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const plan = await planLegacyCohortImport(tx, manifest, invocation);
          if (plan.alreadyImportedBatchId) {
            assertCleanPlan(plan, expectedPlanSha256);
            return {
              batchId: plan.alreadyImportedBatchId,
              alreadyImported: true,
              peopleCreated: 0,
              guardiansCreated: 0,
              guardianLinksCreated: 0,
              paymentsImported: 0,
              importedXof: 0,
              activatedStudents: 0,
            };
          }
          assertCleanPlan(plan, expectedPlanSha256);
          const cohortBatch = await tx.legacyCohortImportBatch.create({
            data: {
              sourceFileName: manifest.sourceWorkbook.fileName,
              sourceSha256: manifest.sourceWorkbook.sha256,
              sourceExtractionSha256: manifest.sourceExtractionSha256,
              manifestSha256: plan.manifestSha256,
              confirmationPlanSha256: plan.planSha256,
              status: "pending",
              academicYearId: manifest.academicYear.id,
              sourceRowCount: manifest.sourceRowCount,
              personCount: manifest.people.length,
              paymentCount: plan.payments,
              sourcePaidTotalXof: BigInt(manifest.sourcePaidTotalXof),
              notificationPolicy: manifest.notificationPolicy,
              createdById: plan.actorId,
            },
          });

          const guardianIds = new Map<string, string>();
          let guardiansCreated = 0;
          for (const guardian of manifest.guardians) {
            let guardianId: string;
            if (guardian.identityDecision.disposition === "create_new") {
              const person = await tx.person.create({
                data: {
                  email: guardian.email.finalEmail,
                  firstName: guardian.firstName,
                  lastName: guardian.lastName,
                  kind: "parent",
                  roles: ["parent"],
                  passwordHash: null,
                  mustChangePassword: false,
                },
              });
              guardianId = person.id;
              guardiansCreated += 1;
              await tx.guardianProfile.create({
                data: {
                  guardianId,
                  phone: guardian.phone,
                  address: guardian.address,
                },
              });
            } else {
              guardianId = guardian.identityDecision.personId;
              await tx.guardianProfile.upsert({
                where: { guardianId },
                create: {
                  guardianId,
                  phone: guardian.phone,
                  address: guardian.address,
                },
                update: {},
              });
            }
            guardianIds.set(guardian.guardianKey, guardianId);
            await tx.auditLog.create({
              data: {
                entity: "Person",
                entityId: guardianId,
                action:
                  guardian.identityDecision.disposition === "create_new"
                    ? "legacy-cohort-guardian-created"
                    : "legacy-cohort-guardian-reviewed",
                actorId: plan.actorId,
                data: {
                  cohortBatchId: cohortBatch.id,
                  guardianKey: guardian.guardianKey,
                  sourceSha256: manifest.sourceWorkbook.sha256,
                },
              },
            });
          }

          const paymentBatch =
            plan.payments > 0
              ? await tx.paymentImportBatch.create({
                  data: {
                    sourceFileName: manifest.sourceWorkbook.fileName,
                    sourceSha256: manifest.sourceWorkbook.sha256,
                    sourceExtractionSha256: manifest.sourceExtractionSha256,
                    manifestSha256: plan.manifestSha256,
                    status: "pending",
                    academicYear: manifest.academicYear.label,
                    sourceGroupCount:
                      plan.payments +
                      noCashSourceRows +
                      explicitlyExcludedSourceRows,
                    totalRows: manifest.sourceRowCount,
                    skippedRows: skippedSourceRows,
                    excludedSourceGroups:
                      noCashSourceRows + explicitlyExcludedSourceRows,
                    sourceTotalXof: BigInt(manifest.sourcePaidTotalXof),
                    excludedXof: BigInt(excludedSourceXof),
                    reviewedAdjustmentXof: BigInt(sourceControlDifferenceXof),
                    errorSummary: {
                      importedSourceRows,
                      skippedSourceRows,
                      duplicateSourceRows,
                      noCashSourceRows,
                      explicitlyExcludedSourceRows,
                      excludedHoldCodeCounts,
                      ledgerPaymentCount: plan.payments,
                      sourceControlDifferenceXof,
                    },
                    note: "Legacy cohort historical cash; receipts and acceptance emails suppressed",
                    createdById: plan.actorId,
                  },
                })
              : null;
          const extractionByCoordinate = new Map(
            extraction.rows.map((row) => [legacyCohortCoordinate(row), row]),
          );
          const paymentIds = new Map<string, string>();
          const provenanceIds = new Map<string, string>();
          const personRecords = new Map<
            string,
            {
              id: string;
              applicantId: string;
              studentId: string;
              invoiceId: string;
            }
          >();
          let activatedStudents = 0;
          let guardianLinksCreated = 0;
          for (const person of manifest.people) {
            const primaryGuardian = manifest.guardians.find(
              (guardian) => guardian.guardianKey === person.guardianKeys[0],
            )!;
            const applicant = await tx.applicant.create({
              data: {
                firstName: person.applicant.firstName,
                lastName: person.applicant.lastName,
                email: person.applicant.studentEmail.finalEmail,
                programCode: person.applicant.programCode,
                stage: "offer",
                phone: person.applicant.phone ?? null,
                dateOfBirth: new Date(
                  `${person.applicant.dateOfBirth}T00:00:00.000Z`,
                ),
                gender: person.applicant.gender ?? null,
                nationality: person.applicant.nationality ?? null,
                city: person.applicant.city ?? null,
                term: person.applicant.term ?? manifest.academicYear.label,
                parentName:
                  `${primaryGuardian.firstName} ${primaryGuardian.lastName}`.trim(),
                parentPhone: primaryGuardian.phone,
                parentEmail: primaryGuardian.email.finalEmail,
                source: "legacy_cohort_import",
              },
            });
            const gate = await createPaymentGatedAcceptanceInTransaction(tx, {
              applicantId: applicant.id,
              actorId: plan.actorId,
              academicYearId: manifest.academicYear.id,
              studentNo: person.legacyStudentNo,
              studentNoSource: "legacy_explicit",
              statusCapabilityPolicy:
                manifest.onboardingPolicy.disposition ===
                "activate_all_legacy_students"
                  ? "suppress"
                  : "create",
            });
            const personRecord = await tx.legacyCohortImportPerson.create({
              data: {
                batchId: cohortBatch.id,
                personKey: person.personKey,
                groupDigestSha256: legacyCohortPersonDigest(person),
                legacyStudentNo: person.legacyStudentNo,
                applicantId: applicant.id,
                studentId: gate.studentId,
                invoiceId: gate.invoiceId,
                onboardingStatusAtImport: "payment_pending",
              },
            });
            personRecords.set(person.personKey, {
              id: personRecord.id,
              applicantId: applicant.id,
              studentId: gate.studentId,
              invoiceId: gate.invoiceId,
            });
            for (const guardianKey of person.guardianKeys) {
              await tx.guardianStudent.create({
                data: {
                  guardianId: guardianIds.get(guardianKey)!,
                  studentId: gate.studentId,
                  relation: "parent",
                },
              });
              guardianLinksCreated += 1;
            }

            let activated = false;
            const orderedPayments = [...person.payments].sort(
              (left, right) =>
                paymentDate(left).localeCompare(paymentDate(right)) ||
                left.paymentKey.localeCompare(right.paymentKey),
            );
            for (const payment of orderedPayments) {
              if (!paymentBatch) {
                throw new Error("Payment batch is missing for reviewed cash");
              }
              const paymentId = randomUUID();
              const providerRef = legacyCohortProviderRef(
                plan.manifestSha256,
                person.personKey,
                payment.paymentKey,
              );
              const sourceCoordinates = payment.sourceCoordinates.map(
                legacyCohortCoordinate,
              );
              const firstCoordinate = payment.sourceCoordinates[0]!;
              const externalReference = paymentExternalReference(payment);
              const externalReferenceFingerprint =
                externalReferenceFingerprintSha256(
                  paymentMethod(payment),
                  externalReference,
                );
              const settlement =
                await applyHistoricalCashSettlementInTransaction(tx, {
                  paymentId,
                  invoiceId: gate.invoiceId,
                  studentId: gate.studentId,
                  amountXof: payment.amountXof,
                  method: paymentMethod(payment),
                  providerRef,
                  externalReferenceFingerprintSha256:
                    externalReferenceFingerprint,
                  settledAt: settlementTimestamp(paymentDate(payment)),
                  actorId: plan.actorId,
                  importBatchId: paymentBatch.id,
                  importRowKey: `${person.personKey}:${payment.paymentKey}`,
                  importSheetName: firstCoordinate.sourceSheet,
                  importRowNumber: firstCoordinate.sourceRowNumber,
                  ipnPayload: {
                    sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
                    sourceExtractionSha256: manifest.sourceExtractionSha256,
                    cohortManifestSha256: plan.manifestSha256,
                    cohortBatchId: cohortBatch.id,
                    personKey: person.personKey,
                    paymentKey: payment.paymentKey,
                    sourceCoordinates,
                    evidenceStatus: payment.evidence.status,
                    settlementDateAccuracy: payment.evidence.dateAccuracy,
                    unknownFields:
                      payment.evidence.status === "reviewed_legacy_gap"
                        ? payment.evidence.unknownFields
                        : [],
                    externalReferenceSha256: externalReference
                      ? sha256(normalizeExternalReference(externalReference)!)
                      : null,
                    notificationPolicy: manifest.notificationPolicy,
                  },
                  auditAction: "legacy-cohort-payment-imported",
                  auditData: {
                    cohortBatchId: cohortBatch.id,
                    paymentImportBatchId: paymentBatch.id,
                    sourceSha256: manifest.sourceWorkbook.sha256,
                    manifestSha256: plan.manifestSha256,
                    personKey: person.personKey,
                    paymentKey: payment.paymentKey,
                    amountXof: payment.amountXof,
                    settledOn: paymentDate(payment),
                    dateAccuracy: payment.evidence.dateAccuracy,
                    method: paymentMethod(payment),
                    notificationPolicy: manifest.notificationPolicy,
                  },
                });
              paymentIds.set(
                `${person.personKey}:${payment.paymentKey}`,
                paymentId,
              );
              if (settlement.activation) {
                await recordLegacyCohortPairedActivationInTransaction(
                  tx,
                  settlement.activation,
                  cohortBatch.id,
                  plan.actorId,
                );
                activatedStudents += 1;
                activated = true;
              }
            }
            if (
              !activated &&
              manifest.onboardingPolicy.disposition ===
                "activate_all_legacy_students"
            ) {
              await activateLegacyCohortStudentByReviewedOverrideInTransaction(
                tx,
                {
                  applicantId: applicant.id,
                  studentId: gate.studentId,
                  personId: gate.personId,
                  invoiceId: gate.invoiceId,
                  cohortBatchId: cohortBatch.id,
                  manifestSha256: plan.manifestSha256,
                  actorId: plan.actorId,
                  reason: manifest.onboardingPolicy.reason,
                },
              );
              activatedStudents += 1;
              activated = true;
            }
            if (activated) {
              await tx.legacyCohortImportPerson.update({
                where: { id: personRecord.id },
                data: { onboardingStatusAtImport: "enrolled" },
              });
            }
          }

          for (const person of manifest.people) {
            for (const source of person.sources) {
              provenanceIds.set(legacyCohortCoordinate(source), randomUUID());
            }
          }
          const duplicateUpdates: { id: string; duplicateOfId: string }[] = [];
          for (const person of manifest.people) {
            const personRecord = personRecords.get(person.personKey)!;
            for (const source of person.sources) {
              const coordinate = legacyCohortCoordinate(source);
              const extracted = extractionByCoordinate.get(coordinate);
              if (!extracted) {
                throw new BadRequestException(
                  `Trusted extraction no longer contains ${coordinate}`,
                );
              }
              const disposition = source.disposition;
              const duplicateCoordinate =
                disposition.kind === "duplicate"
                  ? legacyCohortCoordinate(disposition.canonicalSource)
                  : null;
              await tx.legacyCohortImportRow.create({
                data: {
                  id: provenanceIds.get(coordinate)!,
                  batchId: cohortBatch.id,
                  personRecordId: personRecord.id,
                  sourceSheet: source.sourceSheet,
                  sourceRowNumber: source.sourceRowNumber,
                  rowFingerprintSha256: source.rowFingerprintSha256,
                  sourceLegacyStudentNo: extracted.sourceLegacyStudentNo,
                  sourceLabel: extracted.sourceLabel,
                  disposition: disposition.kind,
                  paymentId:
                    disposition.kind === "cash"
                      ? paymentIds.get(
                          `${person.personKey}:${disposition.paymentKey}`,
                        )
                      : null,
                  duplicateOfId: null,
                },
              });
              if (duplicateCoordinate) {
                const duplicateOfId = provenanceIds.get(duplicateCoordinate);
                if (!duplicateOfId) {
                  throw new BadRequestException(
                    `Duplicate target ${duplicateCoordinate} is not represented`,
                  );
                }
                duplicateUpdates.push({
                  id: provenanceIds.get(coordinate)!,
                  duplicateOfId,
                });
              }
            }
          }
          for (const update of duplicateUpdates) {
            await tx.legacyCohortImportRow.update({
              where: { id: update.id },
              data: { duplicateOfId: update.duplicateOfId },
            });
          }

          if (paymentBatch) {
            await tx.paymentImportBatch.update({
              where: { id: paymentBatch.id },
              data: {
                status: "imported",
                importedRows: importedSourceRows,
                importedXof: BigInt(plan.paymentAmountXof),
                importedAt: new Date(),
              },
            });
          }
          await tx.legacyCohortImportBatch.update({
            where: { id: cohortBatch.id },
            data: {
              status: "imported",
              importedPaymentXof: BigInt(plan.paymentAmountXof),
              paymentImportBatchId: paymentBatch?.id ?? null,
              importedAt: new Date(),
            },
          });
          await tx.auditLog.create({
            data: {
              entity: "LegacyCohortImportBatch",
              entityId: cohortBatch.id,
              action: "legacy-cohort-imported",
              actorId: plan.actorId,
              data: {
                sourceSha256: manifest.sourceWorkbook.sha256,
                sourceExtractionSha256: manifest.sourceExtractionSha256,
                manifestSha256: plan.manifestSha256,
                academicYearId: manifest.academicYear.id,
                sourceRows: manifest.sourceRowCount,
                includedSourceRows: plan.includedSourceRows,
                excludedSourceRows: plan.excludedSourceRows,
                excludedHoldCodeCounts,
                exclusionReview: manifest.exclusionReview ?? null,
                people: manifest.people.length,
                guardians: manifest.guardians.length,
                payments: plan.payments,
                importedXof: plan.paymentAmountXof,
                activatedStudents,
                notificationPolicy: manifest.notificationPolicy,
                onboardingPolicy: manifest.onboardingPolicy,
              },
            },
          });
          return {
            batchId: cohortBatch.id,
            alreadyImported: false,
            peopleCreated: manifest.people.length,
            guardiansCreated,
            guardianLinksCreated,
            paymentsImported: plan.payments,
            importedXof: plan.paymentAmountXof,
            activatedStudents,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 180_000,
        },
      );
    } catch (error) {
      if (!isRetryable(error) || attempt === SERIALIZABLE_RETRIES - 1) {
        throw error;
      }
    }
  }
  throw new Error("Legacy cohort import retry limit exhausted");
}

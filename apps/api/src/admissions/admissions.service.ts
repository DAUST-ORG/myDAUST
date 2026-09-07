import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@mydaust/db";
import {
  normalizeStudentNumber,
  toDakarDateKey,
  type ApplicationInput,
} from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { AppConfigService } from "../app-config/app-config.service.js";
import type { ProofPaymentMethod } from "@mydaust/shared";
import { PaymentSubmissionsService } from "../finance/payment-submissions.service.js";
import { assignStandardPackageInTransaction } from "../finance/standard-package.js";
import {
  cancelDormantEnrollmentAttemptsInTransaction,
  cancelOnboardingPaymentAttemptsInTransaction,
  verifiedEnrollmentCashXof,
} from "../finance/admission-payment-gate.js";
import { loadEnv } from "../config/env.js";
import {
  BillingProfileService,
  type BillingProfileChangeInput,
  type BillingProfilePricingClaims,
} from "../finance/billing-profile.service.js";
import { assertActiveApplicantPaymentCapability } from "./applicant-payment-capability.js";

/** Escape user-supplied text before embedding it in email HTML (applications are anonymous/public). */
const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const STATUS_TOKEN_BYTES = 32;
const ENROLLED_STATUS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SERIALIZABLE_RETRIES = 3;

const hashCapability = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const newCapability = (): string =>
  randomBytes(STATUS_TOKEN_BYTES).toString("base64url");

function isSerializationConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown };
  };
  return (
    candidate.code === "P2034" ||
    (candidate.code === "P2010" && candidate.meta?.code === "40001")
  );
}

/** Initials are derived from every normalized first/last-name token. */
export function studentNameInitials(
  firstName: string,
  lastName: string,
): string {
  const tokens = `${firstName} ${lastName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  return tokens.map((token) => token[0]).join("") || "XX";
}

/** Academic year labels are authoritative; startsOn is a fallback for migrated rows. */
export function academicYearStart(
  label: string,
  startsOn: Date | null,
): number {
  const match = label.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  const value = match ? Number(match[1]) : startsOn?.getUTCFullYear();
  if (!value || value < 2000 || value > 2999) {
    throw new BadRequestException(
      "The academic year must have a valid four-digit start year",
    );
  }
  return value;
}

export function enrollmentCashStatus(input: {
  requiredCashXof: number;
  paidCashXof: number;
  dueDate: Date;
  now?: Date;
}): "pending" | "partial" | "paid" | "overdue" {
  if (input.paidCashXof >= input.requiredCashXof) return "paid";
  if (input.paidCashXof > 0) return "partial";
  return toDakarDateKey(input.dueDate) < toDakarDateKey(input.now ?? new Date())
    ? "overdue"
    : "pending";
}

/**
 * Production's payment.* host rewrites its root to the public bill page. Staging
 * and local environments share the normal portal host and need /pay-bill.
 */
export function publicBillPaymentUrl(
  paymentOrigin: string,
  studentNo: string,
): string {
  const url = new URL(paymentOrigin);
  url.pathname = url.hostname.toLowerCase().startsWith("payment.")
    ? "/"
    : "/pay-bill";
  url.search = "";
  url.hash = "";
  url.searchParams.set("sid", studentNo);
  return url.toString();
}

/** Optional applicant columns the registrar form captures beyond name + email. */
export interface ApplicantFields {
  programCode?: string | null;
  country?: string | null;
  score?: number | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  city?: string | null;
  origin?: string | null;
  school?: string | null;
  priorGpa?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  allergies?: string | null;
  source?: string | null;
  sourceDetail?: string | null;
  essay?: string | null;
  term?: string | null;
}

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);
  private readonly billingProfiles: BillingProfileService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly appConfig: AppConfigService,
    private readonly paymentSubmissions: PaymentSubmissionsService,
    @Optional() billingProfiles?: BillingProfileService,
  ) {
    this.billingProfiles = billingProfiles ?? new BillingProfileService(prisma);
  }

  /**
   * Start or resume the proof-based application-fee payment. The applicant id is the
   * capability; Finance verification flips feePaid.
   */
  /** Current application fee in XOF, for alternative rails that bill it themselves. */
  applicationFeeXof(): Promise<number> {
    return this.appConfig.applicationFee();
  }

  async feeCheckout(applicantId: string, method: ProofPaymentMethod) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
    });
    assertActiveApplicantPaymentCapability(applicant);
    if (applicant.feePaid)
      throw new BadRequestException("Application fee already paid");
    const fee = await this.appConfig.applicationFee();
    const attempt = await this.paymentSubmissions.createForApplicant(
      applicant.id,
      method,
      fee,
    );
    if (!attempt.resumeToken) {
      throw new BadRequestException("Payment resume capability is unavailable");
    }
    const resumeUrl = `${process.env.VITRINE_ORIGIN ?? "http://localhost:3001"}/admissions/payment/?id=${encodeURIComponent(applicant.id)}&resume=${encodeURIComponent(attempt.resumeToken)}`;
    await this.mail
      .send({
        to: applicant.email,
        subject: "Resume your DAUST application fee payment",
        html: `<h2>Your payment is saved</h2><p>You can upload proof now or return at any time using this private link:</p><p><a href="${resumeUrl}">Resume application fee payment</a></p>`,
      })
      .catch((error) =>
        this.logger.warn(`payment resume email failed: ${String(error)}`),
      );
    return attempt;
  }

  /** Anonymous public application: persist applicant + send confirmation email. */
  async apply(input: ApplicationInput) {
    // The public workflow sends `score`; older clients sent `bacScore`. Either drives the merit award.
    const score = input.score ?? input.bacScore ?? null;
    const applicant = await this.prisma.applicant.create({
      data: {
        ...this.applicantData({ ...input, score }),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        stage: "submitted",
      },
    });

    const appFee = await this.appConfig.applicationFee();

    const templates = await this.appConfig.emailTemplates();
    const cc = templates.applicationCc?.length
      ? templates.applicationCc
      : undefined;
    const bcc = templates.applicationBcc?.length
      ? templates.applicationBcc
      : undefined;

    const interpolate = (str: string) =>
      str
        .replace(/\{\{firstName\}\}/g, esc(input.firstName))
        .replace(/\{\{lastName\}\}/g, esc(input.lastName))
        .replace(/\{\{appFee\}\}/g, appFee.toLocaleString("en-US"));

    try {
      await this.mail.send({
        to: input.email,
        cc,
        bcc,
        subject: interpolate(templates.applicationSubject),
        html: `${interpolate(templates.applicationBody)}<p><a href="${process.env.VITRINE_ORIGIN ?? "http://localhost:3001"}/admissions/payment/?id=${encodeURIComponent(applicant.id)}">Pay or resume the application fee</a></p>`,
      });
    } catch (e) {
      this.logger.warn(`application email failed: ${String(e)}`);
    }

    return { id: applicant.id };
  }

  /** Registrar/admin: one applicant's detail. */
  async applicantDetail(id: string) {
    const a = await this.prisma.applicant.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Applicant not found");
    const program = a.programCode
      ? await this.prisma.program.findUnique({ where: { code: a.programCode } })
      : null;
    const appFee = await this.appConfig.applicationFee();
    const onboarding = await this.adminOnboardingSummary(a.id);
    return {
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      name: `${a.firstName} ${a.lastName}`,
      email: a.email,
      programCode: a.programCode,
      program: program?.name ?? null,
      stage: a.stage,
      score: a.score,
      country: a.country,
      feePaid: a.feePaid,
      appFee,
      submittedAt: a.createdAt.toISOString(),
      // Extended application-form fields, surfaced so the detail page + edit modal prefill.
      phone: a.phone,
      dateOfBirth: a.dateOfBirth
        ? a.dateOfBirth.toISOString().slice(0, 10)
        : null,
      gender: a.gender,
      nationality: a.nationality,
      city: a.city,
      origin: a.origin,
      school: a.school,
      priorGpa: a.priorGpa,
      parentName: a.parentName,
      parentPhone: a.parentPhone,
      parentEmail: a.parentEmail,
      allergies: a.allergies,
      source: a.source,
      sourceDetail: a.sourceDetail,
      housingPreference: a.housingPreference,
      cafeteriaPreference: a.cafeteriaPreference,
      essay: a.essay,
      term: a.term,
      onboarding,
    };
  }

  /** Pricing options for the Applicant's resolved intake, never the caller's active year. */
  async acceptanceBillingProfileOptions(id: string) {
    const resolved = await this.serializable(async (tx) => {
      const applicant = await tx.applicant.findUnique({
        where: { id },
        select: {
          term: true,
          admissionAcademicYearId: true,
        },
      });
      if (!applicant) throw new NotFoundException("Applicant not found");
      return this.resolveAdmissionAcademicYear(
        tx,
        applicant.term,
        applicant.admissionAcademicYearId ?? undefined,
      );
    });
    const options = await this.billingProfiles.options(resolved.label);
    if (
      options.academicYearId !== resolved.id ||
      !options.feeScheduleId ||
      options.feeScheduleRevision <= 0 ||
      !options.feeScheduleFingerprintSha256 ||
      !options.billingCatalogFingerprintSha256
    ) {
      throw new BadRequestException(
        `Approved admission pricing is incomplete for ${resolved.label}`,
      );
    }
    return options;
  }

  /** Public capability read: the applicant's own plan options + current pick. */
  async applicantPlanPreferenceOptions(token: string) {
    const applicant = await this.applicantFromStatusToken(token);
    const resolved = await this.serializable(async (tx) =>
      this.resolveAdmissionAcademicYear(
        tx,
        applicant.term,
        applicant.admissionAcademicYearId ?? undefined,
      ),
    );
    const options = await this.billingProfiles.options(resolved.label);
    const picking = await this.appConfig.planPicking();
    return {
      academicYearLabel: resolved.label,
      deadline: picking.deadline,
      open: this.planPickingOpen(picking),
      housingPreference: applicant.housingPreference,
      cafeteriaPreference: applicant.cafeteriaPreference,
      housingOptions: options.housingOptions
        .filter((o) => o.active)
        .map((o) => ({ code: o.code, label: o.label, amountXof: o.amountXof })),
      cafeteriaOptions: options.cafeteriaOptions
        .filter((o) => o.active)
        .map((o) => ({ code: o.code, label: o.label, amountXof: o.amountXof })),
    };
  }

  /** Public capability write: the applicant's own housing/cafeteria pick. */
  async saveApplicantPlanPreference(
    token: string,
    input: { housingOptionCode: string; cafeteriaOptionCode: string },
  ) {
    const applicant = await this.applicantFromStatusToken(token);
    const picking = await this.appConfig.planPicking();
    if (!this.planPickingOpen(picking)) {
      throw new BadRequestException(
        picking.enabled
          ? "Plan picking is closed for this intake"
          : "Plan picking is not open",
      );
    }
    const resolved = await this.serializable(async (tx) =>
      this.resolveAdmissionAcademicYear(
        tx,
        applicant.term,
        applicant.admissionAcademicYearId ?? undefined,
      ),
    );
    const options = await this.billingProfiles.options(resolved.label);
    const housingCodes = new Set(
      options.housingOptions.filter((o) => o.active).map((o) => o.code),
    );
    const cafeteriaCodes = new Set(
      options.cafeteriaOptions.filter((o) => o.active).map((o) => o.code),
    );
    if (!housingCodes.has(input.housingOptionCode)) {
      throw new BadRequestException("Unknown housing option for this intake");
    }
    if (!cafeteriaCodes.has(input.cafeteriaOptionCode)) {
      throw new BadRequestException("Unknown cafeteria option for this intake");
    }
    const updated = await this.prisma.applicant.update({
      where: { id: applicant.id },
      data: {
        housingPreference: input.housingOptionCode,
        cafeteriaPreference: input.cafeteriaOptionCode,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: applicant.id,
        action: "plan-preference-saved",
        actorId: applicant.id,
        data: {
          housingPreference: input.housingOptionCode,
          cafeteriaPreference: input.cafeteriaOptionCode,
        },
      },
    });
    return {
      housingPreference: updated.housingPreference,
      cafeteriaPreference: updated.cafeteriaPreference,
    };
  }

  private planPickingOpen(picking: { enabled: boolean; deadline: string | null }) {
    if (!picking.enabled) return false;
    if (!picking.deadline) return true;
    return toDakarDateKey(new Date()) <= picking.deadline;
  }

  private async applicantFromStatusToken(token: string) {
    if (!token || token.length < 32) {
      throw new NotFoundException("Application status link not found");
    }
    const applicant = await this.prisma.applicant.findUnique({
      where: { statusTokenHash: hashCapability(token) },
    });
    if (!applicant) throw new NotFoundException("Application status link not found");
    return applicant;
  }

  private static readonly STAGES = [
    "submitted",
    "review",
    "interview",
    "offer",
    "accepted",
    "rejected",
  ];

  /** Registrar/admin: manually add an applicant to the pipeline. Audited. */
  async adminCreateApplicant(
    actorId: string,
    input: ApplicantFields & {
      firstName: string;
      lastName: string;
      email: string;
    },
  ) {
    const applicant = await this.prisma.applicant.create({
      data: {
        ...this.applicantData(input),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        stage: "submitted",
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: applicant.id,
        action: "applicant-created",
        actorId,
      },
    });
    return applicant;
  }

  /** Registrar/admin: edit an applicant's captured details (not the stage). Audited. */
  async adminUpdateApplicant(
    actorId: string,
    id: string,
    input: ApplicantFields & {
      firstName?: string;
      lastName?: string;
      email?: string;
    },
  ) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException("Applicant not found");
    if (applicant.onboardingStatus !== "not_started") {
      throw new BadRequestException(
        "Accepted applicant identity and billing details require a reviewed correction workflow",
      );
    }
    const updated = await this.prisma.applicant.update({
      where: { id },
      data: {
        ...this.applicantData(input),
        ...(input.firstName !== undefined
          ? { firstName: input.firstName }
          : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: id,
        action: "applicant-updated",
        actorId,
      },
    });
    return updated;
  }

  /** The optional application-form columns, undefined keys left untouched on update. */
  private applicantData(input: ApplicantFields) {
    const set = <T>(v: T | undefined | null) =>
      v === undefined ? undefined : (v ?? null);
    return {
      programCode: set(input.programCode),
      country: set(input.country),
      score: set(input.score),
      phone: set(input.phone),
      dateOfBirth:
        input.dateOfBirth === undefined
          ? undefined
          : input.dateOfBirth
            ? new Date(input.dateOfBirth)
            : null,
      gender: set(input.gender),
      nationality: set(input.nationality),
      city: set(input.city),
      origin: set(input.origin),
      school: set(input.school),
      priorGpa: set(input.priorGpa),
      parentName: set(input.parentName),
      parentPhone: set(input.parentPhone),
      parentEmail: set(input.parentEmail),
      allergies: set(input.allergies),
      source: set(input.source),
      sourceDetail: set(input.sourceDetail),
      essay: set(input.essay),
      term: set(input.term),
    };
  }

  /** Registrar/admin: advance/reject an applicant's pipeline stage. Audited. */
  async adminSetStage(actorId: string, id: string, stage: string) {
    if (!AdmissionsService.STAGES.includes(stage)) {
      throw new BadRequestException(`Invalid stage "${stage}"`);
    }
    // Acceptance is not a cosmetic stage change and may only enter through the
    // explicit admin-only endpoint.
    if (stage === "accepted") {
      throw new BadRequestException(
        "Use the explicit admin acceptance workflow for an accepted decision",
      );
    }

    const applicant = await this.prisma.applicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException("Applicant not found");
    if (applicant.onboardingStatus === "enrolled") {
      throw new BadRequestException(
        "An enrolled applicant cannot be moved back through the admissions pipeline",
      );
    }
    if (applicant.onboardingStatus === "payment_pending") {
      throw new BadRequestException(
        "Cancel the payment-pending admission explicitly before changing its stage",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.applicant.update({
        where: { id },
        data: { stage },
      });
      await tx.auditLog.create({
        data: {
          entity: "Applicant",
          entityId: id,
          action: `applicant-stage-${stage}`,
          actorId,
        },
      });
      return row;
    });
    // A rejection closes the applicant's file, so the decision email goes out
    // with the transition (best-effort, like every other applicant email).
    if (stage === "rejected") {
      await this.sendStageEmail(updated.id, "rejected", actorId).catch((e) =>
        this.logger.warn(`rejection email failed: ${String(e)}`),
      );
    }
    return updated;
  }

  /**
   * Manual "your file is going stale" nudge. There is no automatic stale
   * detector — an officer decides the file has sat too long and pings the
   * applicant with the stale template. Audited; never throws on mail failure.
   */
  async sendStaleNudge(actorId: string, id: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException("Applicant not found");
    if (applicant.stage === "rejected" || applicant.stage === "accepted") {
      throw new BadRequestException(
        "A closed file cannot be nudged as stale",
      );
    }
    const sent = await this.sendStageEmail(id, "stale", actorId).catch((e) => {
      this.logger.warn(`stale nudge failed: ${String(e)}`);
      return false;
    });
    return { sent };
  }

  /**
   * Sends the rejected/stale template for an applicant. Returns whether the
   * mailer accepted it; audit-logs the send either way.
   */
  private async sendStageEmail(
    applicantId: string,
    kind: "rejected" | "stale",
    actorId: string,
  ): Promise<boolean> {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
    });
    if (!applicant) throw new NotFoundException("Applicant not found");
    const appFee = await this.appConfig.applicationFee();
    const templates = await this.appConfig.emailTemplates();
    const subject = templates[`${kind}Subject`];
    const body = templates[`${kind}Body`];
    const cc = templates[`${kind}Cc`]?.length
      ? templates[`${kind}Cc`]
      : undefined;
    const bcc = templates[`${kind}Bcc`]?.length
      ? templates[`${kind}Bcc`]
      : undefined;
    const interpolate = (str: string) =>
      str
        .replace(/\{\{firstName\}\}/g, esc(applicant.firstName))
        .replace(/\{\{lastName\}\}/g, esc(applicant.lastName))
        .replace(/\{\{appFee\}\}/g, appFee.toLocaleString("en-US"));
    try {
      await this.mail.send({
        to: applicant.email,
        cc,
        bcc,
        subject: interpolate(subject),
        html: interpolate(body),
      });
    } catch (e) {
      this.logger.warn(`${kind} email failed: ${String(e)}`);
      return false;
    }
    await this.prisma.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: applicantId,
        action:
          kind === "rejected" ? "rejection-email-sent" : "stale-nudge-sent",
        actorId,
      },
    });
    return true;
  }

  /**
   * Explicit, idempotent acceptance workflow. No Student role, password or academic
   * visibility is granted here; verified settlement activates those later.
   */
  async adminAcceptApplicant(
    actorId: string,
    id: string,
    input: {
      academicYearId: string;
      academicYearLabel: string;
      billingProfile: Omit<
        BillingProfileChangeInput,
        "academicYearLabel" | "expectedRevision" | "manualAdjustments"
      > &
        BillingProfilePricingClaims;
    },
  ) {
    if (!input.billingProfile) {
      throw new BadRequestException(
        "Housing, cafeteria, insurance and caution selections are required before acceptance",
      );
    }
    const {
      feeScheduleId,
      feeScheduleRevision,
      feeScheduleFingerprintSha256,
      billingCatalogFingerprintSha256,
      ...profileSelection
    } = input.billingProfile;
    const pricingClaims: BillingProfilePricingClaims = {
      feeScheduleId,
      feeScheduleRevision,
      feeScheduleFingerprintSha256,
      billingCatalogFingerprintSha256,
    };
    const createAcceptance = () =>
      this.serializable(async (tx) => {
        const applicant = await tx.applicant.findUnique({ where: { id } });
        if (!applicant) throw new NotFoundException("Applicant not found");

        if (
          applicant.onboardingStatus === "payment_pending" ||
          applicant.onboardingStatus === "enrolled"
        ) {
          if (
            applicant.admissionAcademicYearId !== input.academicYearId ||
            (applicant.admissionAcademicYearId &&
              input.academicYearLabel !==
                (
                  await tx.academicYear.findUniqueOrThrow({
                    where: { id: applicant.admissionAcademicYearId },
                    select: { label: true },
                  })
                ).label)
          ) {
            throw new BadRequestException(
              "This applicant was already accepted for a different academic year",
            );
          }
          if (
            !applicant.studentId ||
            !applicant.enrollmentInvoiceId ||
            !applicant.requiredEnrollmentCashXof
          ) {
            throw new BadRequestException(
              "This legacy acceptance is incomplete and requires reviewed reconciliation",
            );
          }
          return { created: false as const, statusToken: null };
        }
        if (applicant.onboardingStatus === "cancelled") {
          throw new BadRequestException(
            "A cancelled admission requires reviewed reinstatement before acceptance",
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
        if (!applicant.programCode) {
          throw new BadRequestException(
            "A program is required before acceptance",
          );
        }

        const program = await tx.program.findUnique({
          where: { code: applicant.programCode },
        });
        if (!program)
          throw new BadRequestException("Unknown applicant program");

        const academicYear = await this.resolveAdmissionAcademicYear(
          tx,
          applicant.term,
        );
        if (
          academicYear.id !== input.academicYearId ||
          academicYear.label !== input.academicYearLabel
        ) {
          throw new BadRequestException(
            "The applicant intake academic year changed; refresh the billing options before accepting",
          );
        }
        const email = applicant.email.trim().toLowerCase();
        const existingPerson = await tx.person.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
        if (existingPerson) {
          throw new BadRequestException(
            `Email ${email} is already attached to an existing account; reconcile it before acceptance`,
          );
        }

        const studentNo = normalizeStudentNumber(
          await this.allocateStudentNo(
            tx,
            academicYearStart(academicYear.label, academicYear.startsOn),
            applicant.firstName,
            applicant.lastName,
          ),
        );
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
            programId: program.id,
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
          actorId,
          academicYear.id,
        );
        const billingProfile =
          await this.billingProfiles.createAdmissionProfile(tx, {
            studentId: student.id,
            actorId,
            academicYearLabel: academicYear.label,
            selection: profileSelection,
            pricingClaims,
          });
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

        const paymentToken = newCapability();
        const paymentLink = await tx.paymentLink.create({
          data: {
            token: paymentToken,
            amountXof: firstInstallment.amountDue,
            purpose: "First enrollment installment",
            payeeName: `${applicant.firstName} ${applicant.lastName}`.trim(),
            payeeMeta: `${studentNo} · ${program.code}`,
            studentId: student.id,
            invoiceId: invoice.id,
            costCenterCode: invoice.costCenterCode,
            dueDate: firstInstallment.dueDate,
            createdById: actorId,
            onboardingApplicantId: applicant.id,
          },
        });
        const statusToken = newCapability();
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
            statusTokenHash: hashCapability(statusToken),
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
              actorId,
              data: {
                studentId: student.id,
                studentNo,
                academicYearId: academicYear.id,
                invoiceId: invoice.id,
                requiredEnrollmentCashXof: firstInstallment.amountDue,
                paymentLinkId: paymentLink.id,
                billingProfileId: billingProfile.profileId,
                billingProfileRevision: billingProfile.revision,
              },
            },
            {
              entity: "Student",
              entityId: student.id,
              action: "student-created-pending-payment",
              actorId,
              data: { applicantId: applicant.id, studentNo },
            },
          ],
        });
        return { created: true as const, statusToken };
      });

    let accepted: Awaited<ReturnType<typeof createAcceptance>> | undefined;
    for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        accepted = await createAcceptance();
        break;
      } catch (error) {
        const uniqueConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002";
        if (!uniqueConflict) throw error;

        // A concurrent request for this same applicant may have committed first.
        // Re-read its authoritative gate and treat that as an idempotent success.
        const winner = await this.prisma.applicant.findUnique({
          where: { id },
          select: {
            onboardingStatus: true,
            studentId: true,
            enrollmentInvoiceId: true,
            requiredEnrollmentCashXof: true,
          },
        });
        if (
          winner &&
          (winner.onboardingStatus === "payment_pending" ||
            winner.onboardingStatus === "enrolled") &&
          winner.studentId &&
          winner.enrollmentInvoiceId &&
          winner.requiredEnrollmentCashXof
        ) {
          accepted = { created: false, statusToken: null };
          break;
        }
        if (attempt === SERIALIZABLE_RETRIES - 1) throw error;
      }
    }
    if (!accepted) {
      throw new Error("Acceptance transaction retry limit exhausted");
    }

    const delivery = accepted.statusToken
      ? await this.deliverAcceptanceEmail(id, accepted.statusToken)
      : null;
    const detail = await this.applicantDetail(id);
    return {
      ...detail,
      onboarding: {
        ...detail.onboarding,
        statusUrl: accepted.statusToken
          ? this.statusPageUrl(accepted.statusToken)
          : null,
        emailDelivery: delivery === null ? "not_requested" : delivery,
      },
    };
  }

  /** Resending rotates only the private status capability; the payment link stays stable. */
  async adminResendAcceptance(actorId: string, id: string) {
    const token = newCapability();
    await this.serializable(async (tx) => {
      const applicant = await tx.applicant.findUnique({ where: { id } });
      if (!applicant) throw new NotFoundException("Applicant not found");
      if (
        applicant.onboardingStatus !== "payment_pending" &&
        applicant.onboardingStatus !== "enrolled"
      ) {
        throw new BadRequestException(
          "Acceptance can only be resent for a pending or enrolled applicant",
        );
      }
      await tx.applicant.update({
        where: { id },
        data: {
          statusTokenHash: hashCapability(token),
          statusTokenRevokedAt: null,
          statusTokenExpiresAt:
            applicant.onboardingStatus === "enrolled"
              ? new Date(Date.now() + ENROLLED_STATUS_TTL_MS)
              : null,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "Applicant",
          entityId: id,
          action: "acceptance-email-resent",
          actorId,
        },
      });
    });
    const delivery = await this.deliverAcceptanceEmail(id, token);
    const detail = await this.applicantDetail(id);
    return {
      ...detail,
      onboarding: {
        ...detail.onboarding,
        statusUrl: this.statusPageUrl(token),
        emailDelivery: delivery,
      },
    };
  }

  /** Rotate both public capabilities if an acceptance/payment URL may be exposed. */
  async adminRotateOnboardingLink(actorId: string, id: string) {
    const rotated = await this.serializable(async (tx) => {
      const applicant = await tx.applicant.findUnique({
        where: { id },
        include: {
          student: true,
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
      if (!applicant) throw new NotFoundException("Applicant not found");
      if (applicant.onboardingStatus !== "payment_pending") {
        throw new BadRequestException(
          "Payment links can only be rotated while enrollment payment is pending",
        );
      }
      const first = applicant.enrollmentInvoice?.plan?.installments[0];
      if (!applicant.student || !applicant.enrollmentInvoice || !first) {
        throw new BadRequestException(
          "This acceptance is incomplete and requires reviewed reconciliation",
        );
      }
      const threshold = applicant.requiredEnrollmentCashXof ?? first.amountDue;
      const paidCashXof = await verifiedEnrollmentCashXof(
        tx,
        applicant.enrollmentInvoice.id,
      );
      const remaining = Math.max(0, threshold - paidCashXof);
      if (remaining <= 0) {
        throw new BadRequestException(
          "The enrollment threshold is already satisfied",
        );
      }
      if (applicant.activeOnboardingPaymentLink) {
        await cancelOnboardingPaymentAttemptsInTransaction(
          tx,
          [applicant.activeOnboardingPaymentLink.id],
          "The private enrollment payment link was rotated",
        );
      }
      if (applicant.activeOnboardingPaymentLink?.status === "active") {
        await tx.paymentLink.update({
          where: { id: applicant.activeOnboardingPaymentLink.id },
          data: { status: "cancelled" },
        });
      }

      const paymentToken = newCapability();
      const statusToken = newCapability();
      const paymentLink = await tx.paymentLink.create({
        data: {
          token: paymentToken,
          amountXof: remaining,
          purpose: "First enrollment installment",
          payeeName: `${applicant.firstName} ${applicant.lastName}`.trim(),
          payeeMeta: `${applicant.student.studentNo} · enrollment`,
          studentId: applicant.student.id,
          invoiceId: applicant.enrollmentInvoice.id,
          costCenterCode: applicant.enrollmentInvoice.costCenterCode,
          dueDate: first.dueDate,
          createdById: actorId,
          onboardingApplicantId: applicant.id,
        },
      });
      await tx.applicant.update({
        where: { id },
        data: {
          activeOnboardingPaymentLinkId: paymentLink.id,
          statusTokenHash: hashCapability(statusToken),
          statusTokenExpiresAt: null,
          statusTokenRevokedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "Applicant",
          entityId: id,
          action: "onboarding-links-rotated",
          actorId,
          data: {
            oldPaymentLinkId: applicant.activeOnboardingPaymentLink?.id ?? null,
            paymentLinkId: paymentLink.id,
            amountXof: remaining,
          },
        },
      });
      return { statusToken };
    });
    const delivery = await this.deliverAcceptanceEmail(id, rotated.statusToken);
    const detail = await this.applicantDetail(id);
    return {
      ...detail,
      onboarding: {
        ...detail.onboarding,
        statusUrl: this.statusPageUrl(rotated.statusToken),
        emailDelivery: delivery,
      },
    };
  }

  /**
   * Explicitly withdraw a payment-pending acceptance without deleting or
   * recycling its permanent Student ID. Possible in-flight cash fails closed.
   */
  async adminCancelOnboarding(actorId: string, id: string, reason: string) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new BadRequestException(
        "Cancellation reason must be between 10 and 500 characters",
      );
    }

    await this.serializable(async (tx) => {
      const applicant = await tx.applicant.findUnique({
        where: { id },
        include: {
          student: { include: { person: true } },
          enrollmentInvoice: { include: { plan: true } },
          onboardingPaymentLinks: true,
        },
      });
      if (!applicant) throw new NotFoundException("Applicant not found");
      if (applicant.onboardingStatus === "cancelled") return;
      if (applicant.onboardingStatus !== "payment_pending") {
        throw new BadRequestException(
          "Only a payment-pending admission can be cancelled",
        );
      }
      if (
        applicant.stage !== "accepted" ||
        !applicant.student ||
        !applicant.enrollmentInvoice ||
        applicant.student.recordStatus !== "pending_payment" ||
        applicant.activatedByPaymentId
      ) {
        throw new BadRequestException(
          "This acceptance is inconsistent and requires reviewed reconciliation",
        );
      }
      if (
        applicant.enrollmentInvoice.packageType !== "standard_full" ||
        applicant.enrollmentInvoice.status === "void"
      ) {
        throw new BadRequestException(
          "Only an active provisional standard enrollment invoice can be cancelled",
        );
      }
      if (
        applicant.onboardingPaymentLinks.some(
          (link) => link.invoiceId !== applicant.enrollmentInvoice!.id,
        )
      ) {
        throw new BadRequestException(
          "Onboarding links target an unexpected invoice and require reviewed reconciliation",
        );
      }

      const [paidCashXof, refundPending] = await Promise.all([
        verifiedEnrollmentCashXof(tx, applicant.enrollmentInvoice.id),
        tx.payment.count({
          where: {
            invoiceId: applicant.enrollmentInvoice.id,
            status: "refund_pending",
          },
        }),
      ]);
      if (paidCashXof > 0) {
        throw new BadRequestException(
          "Enrollment cannot be cancelled after verified cash has been received",
        );
      }
      if (refundPending > 0) {
        throw new BadRequestException(
          "Enrollment cannot be cancelled while a refund is pending",
        );
      }

      const paymentLinkIds = applicant.onboardingPaymentLinks.map(
        (link) => link.id,
      );
      const cancelledAttempts =
        await cancelDormantEnrollmentAttemptsInTransaction(tx, {
          invoiceId: applicant.enrollmentInvoice.id,
          paymentLinkIds,
          reason: normalizedReason,
        });
      const now = new Date();
      await tx.paymentLink.updateMany({
        where: { id: { in: paymentLinkIds }, status: "active" },
        data: { status: "cancelled" },
      });
      await tx.studentInvite.updateMany({
        where: {
          studentPersonId: applicant.student.personId,
          usedAt: null,
        },
        data: { usedAt: now },
      });
      await tx.invoice.update({
        where: { id: applicant.enrollmentInvoice.id },
        data: { status: "void", revision: { increment: 1 } },
      });
      await tx.student.update({
        where: { id: applicant.student.id },
        data: { recordStatus: "archived", enrolledAt: null },
      });
      await tx.person.update({
        where: { id: applicant.student.personId },
        data: {
          roles: applicant.student.person.roles.filter(
            (role) => role !== "student",
          ),
          passwordHash: null,
          mustChangePassword: false,
        },
      });
      await tx.applicant.update({
        where: { id: applicant.id },
        data: {
          onboardingStatus: "cancelled",
          onboardingCancelledAt: now,
          activeOnboardingPaymentLinkId: null,
          statusTokenRevokedAt: now,
          statusTokenExpiresAt: now,
        },
      });
      await tx.auditLog.createMany({
        data: [
          {
            entity: "Applicant",
            entityId: applicant.id,
            action: "onboarding-cancelled",
            actorId,
            data: {
              reason: normalizedReason,
              studentId: applicant.student.id,
              studentNo: applicant.student.studentNo,
              invoiceId: applicant.enrollmentInvoice.id,
              paymentPlanId: applicant.enrollmentInvoice.plan?.id ?? null,
              paymentLinkIds,
              ...cancelledAttempts,
            },
          },
          {
            entity: "Student",
            entityId: applicant.student.id,
            action: "student-archived-onboarding-cancelled",
            actorId,
            data: { applicantId: applicant.id, reason: normalizedReason },
          },
          {
            entity: "Invoice",
            entityId: applicant.enrollmentInvoice.id,
            action: "provisional-enrollment-invoice-voided",
            actorId,
            data: {
              applicantId: applicant.id,
              paymentPlanId: applicant.enrollmentInvoice.plan?.id ?? null,
              reason: normalizedReason,
            },
          },
        ],
      });
    });
    return this.applicantDetail(id);
  }

  /** Public capability read. A raw Applicant id is never accepted here. */
  async publicOnboardingStatus(token: string) {
    if (!token || token.length < 32) {
      throw new NotFoundException("Application status link not found");
    }
    const applicant = await this.prisma.applicant.findUnique({
      where: { statusTokenHash: hashCapability(token) },
      include: {
        student: true,
        admissionAcademicYear: true,
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
      applicant.statusTokenRevokedAt ||
      (applicant.statusTokenExpiresAt &&
        applicant.statusTokenExpiresAt.getTime() <= Date.now())
    ) {
      throw new NotFoundException("Application status link not found");
    }
    this.requireOnboardingStarted(applicant.onboardingStatus);
    const program = applicant.programCode
      ? await this.prisma.program.findUnique({
          where: { code: applicant.programCode },
        })
      : null;
    const first = applicant.enrollmentInvoice?.plan?.installments[0] ?? null;
    const proofStatus = await this.latestOnboardingProofStatus(
      applicant.id,
      applicant.enrollmentInvoiceId,
    );
    const paymentLinkStatus = this.paymentLinkStatus(
      applicant.activeOnboardingPaymentLink,
    );
    const paidCashXof = applicant.enrollmentInvoiceId
      ? await verifiedEnrollmentCashXof(
          this.prisma,
          applicant.enrollmentInvoiceId,
        )
      : 0;
    const readOnly = applicant.onboardingStatus !== "payment_pending";
    const remainingAmount = first
      ? Math.max(
          0,
          (applicant.requiredEnrollmentCashXof ?? first.amountDue) -
            paidCashXof,
        )
      : 0;
    const canPay =
      !readOnly && paymentLinkStatus === "active" && remainingAmount > 0;
    const env = loadEnv();
    return {
      onboardingStatus: applicant.onboardingStatus,
      readOnly,
      applicant: {
        name: `${applicant.firstName} ${applicant.lastName}`.trim(),
        programCode: applicant.programCode,
        program: program?.name ?? null,
        academicYear: applicant.admissionAcademicYear
          ? {
              id: applicant.admissionAcademicYear.id,
              label: applicant.admissionAcademicYear.label,
            }
          : null,
      },
      studentNo: applicant.student?.studentNo ?? null,
      firstInstallment: this.installmentView(applicant, first, paidCashXof),
      proofStatus,
      payment: {
        canPay,
        paymentUrl:
          canPay && applicant.activeOnboardingPaymentLink
            ? `${env.PAYMENT_ORIGIN}/pay/${applicant.activeOnboardingPaymentLink.token}`
            : null,
        publicBillUrl: applicant.student
          ? publicBillPaymentUrl(
              env.PAYMENT_ORIGIN,
              applicant.student.studentNo,
            )
          : null,
      },
    };
  }

  private async resolveAdmissionAcademicYear(
    tx: Prisma.TransactionClient,
    intakeTerm: string | null,
    requestedId?: string,
  ) {
    if (requestedId) {
      const requested = await tx.academicYear.findUnique({
        where: { id: requestedId },
      });
      if (!requested) throw new BadRequestException("Unknown academic year");
      return requested;
    }
    if (intakeTerm?.trim()) {
      const term = await tx.term.findFirst({
        where: { name: { equals: intakeTerm.trim(), mode: "insensitive" } },
        include: { academicYear: true },
      });
      if (term?.academicYear) return term.academicYear;
      const byLabel = await tx.academicYear.findFirst({
        where: { label: { equals: intakeTerm.trim(), mode: "insensitive" } },
      });
      if (byLabel) return byLabel;
    }
    const active = await tx.academicYear.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (!active) {
      throw new BadRequestException(
        "An active academic year is required before acceptance",
      );
    }
    return active;
  }

  private async allocateStudentNo(
    tx: Prisma.TransactionClient,
    year: number,
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const initials = studentNameInitials(firstName, lastName);
    // Bootstrap a new yearly counter above every recognizable imported number.
    // The numeric cohort sequence is global for the year; initials are not part
    // of uniqueness, so S20261AA and S20261BB may never both be issued.
    const existingNumbers = await tx.student.findMany({
      where: {
        studentNo: { startsWith: `S${year}`, mode: "insensitive" },
      },
      select: { studentNo: true },
    });
    const pattern = new RegExp(`^S${year}(\\d+)[A-Z]+$`);
    const importedMaximum = existingNumbers.reduce((maximum, row) => {
      const match = row.studentNo.toUpperCase().match(pattern);
      const sequence = match ? Number(match[1]) : 0;
      return Number.isSafeInteger(sequence)
        ? Math.max(maximum, sequence)
        : maximum;
    }, 0);

    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const [counter] = await tx.$queryRaw<Array<{ nextValue: number }>>(
        Prisma.sql`
          INSERT INTO "StudentNumberSequence" ("academicYearStart", "nextValue", "updatedAt")
          VALUES (${year}, ${importedMaximum + 2}, NOW())
          ON CONFLICT ("academicYearStart") DO UPDATE
          SET "nextValue" = GREATEST(
                "StudentNumberSequence"."nextValue" + 1,
                EXCLUDED."nextValue"
              ),
              "updatedAt" = NOW()
          RETURNING "nextValue"
        `,
      );
      if (!counter)
        throw new Error("Student ID counter update returned no row");
      const sequence = counter.nextValue - 1;
      const candidate = `S${year}${sequence}${initials}`;
      const existing = await tx.student.findUnique({
        where: { studentNo: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException(
      `Unable to allocate a Student ID for academic year ${year}`,
    );
  }

  private async adminOnboardingSummary(id: string) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, studentNo: true } },
        admissionAcademicYear: { select: { id: true, label: true } },
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
    if (!applicant) throw new NotFoundException("Applicant not found");
    const first = applicant.enrollmentInvoice?.plan?.installments[0] ?? null;
    const proofStatus = await this.latestOnboardingProofStatus(
      applicant.id,
      applicant.enrollmentInvoiceId,
    );
    const paymentLinkStatus = this.paymentLinkStatus(
      applicant.activeOnboardingPaymentLink,
    );
    const paidCashXof = applicant.enrollmentInvoiceId
      ? await verifiedEnrollmentCashXof(
          this.prisma,
          applicant.enrollmentInvoiceId,
        )
      : 0;
    const env = loadEnv();
    return {
      status: applicant.onboardingStatus,
      studentId: applicant.student?.id ?? null,
      studentNo: applicant.student?.studentNo ?? null,
      academicYear: applicant.admissionAcademicYear,
      acceptedAt: applicant.acceptedAt?.toISOString() ?? null,
      paymentPendingAt: applicant.paymentPendingAt?.toISOString() ?? null,
      enrolledAt: applicant.enrolledAt?.toISOString() ?? null,
      cancelledAt: applicant.onboardingCancelledAt?.toISOString() ?? null,
      requiredCashXof: applicant.requiredEnrollmentCashXof,
      invoiceId: applicant.enrollmentInvoiceId,
      firstInstallment: this.installmentView(applicant, first, paidCashXof),
      proofStatus,
      paymentLink: applicant.activeOnboardingPaymentLink
        ? {
            id: applicant.activeOnboardingPaymentLink.id,
            status: paymentLinkStatus,
            url: `${env.PAYMENT_ORIGIN}/pay/${applicant.activeOnboardingPaymentLink.token}`,
          }
        : null,
      acceptanceEmailSentAt:
        applicant.acceptanceEmailSentAt?.toISOString() ?? null,
    };
  }

  private installmentView(
    applicant: {
      requiredEnrollmentCashXof: number | null;
    },
    first: {
      amountDue: number;
      amountPaid: number;
      dueDate: Date;
      status: string;
    } | null,
    paidCashXof: number,
  ) {
    if (!first) return null;
    const amountDue = applicant.requiredEnrollmentCashXof ?? first.amountDue;
    return {
      amountDue,
      amountPaid: paidCashXof,
      remainingAmount: Math.max(0, amountDue - paidCashXof),
      dueDate: first.dueDate.toISOString().slice(0, 10),
      status: enrollmentCashStatus({
        requiredCashXof: amountDue,
        paidCashXof,
        dueDate: first.dueDate,
      }),
    };
  }

  private async latestOnboardingProofStatus(
    applicantId: string,
    invoiceId: string | null,
  ): Promise<
    | "none"
    | "awaiting_proof"
    | "submitted"
    | "approved"
    | "rejected"
    | "cancelled"
  > {
    const proof = await this.prisma.paymentSubmission.findFirst({
      where: {
        OR: [
          ...(invoiceId ? [{ invoiceId }] : []),
          { paymentLink: { onboardingApplicantId: applicantId } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { status: true },
    });
    return proof?.status ?? "none";
  }

  private paymentLinkStatus(
    link: { status: string; expiresAt: Date | null } | null,
  ): "active" | "paid" | "cancelled" | "expired" | null {
    if (!link) return null;
    if (
      link.status === "active" &&
      link.expiresAt &&
      link.expiresAt.getTime() <= Date.now()
    ) {
      return "expired";
    }
    if (link.status === "paid" || link.status === "cancelled") {
      return link.status;
    }
    return "active";
  }

  private requireOnboardingStarted(status: string) {
    if (status === "not_started") {
      throw new BadRequestException(
        "The applicant has not completed the acceptance workflow",
      );
    }
  }

  private statusPageUrl(token: string): string {
    return `${loadEnv().PORTAL_ORIGIN}/application-status/${encodeURIComponent(token)}`;
  }

  private async deliverAcceptanceEmail(
    id: string,
    statusToken: string,
  ): Promise<"sent" | "not_sent"> {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id },
      include: {
        student: true,
        admissionAcademicYear: true,
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
    if (!applicant || !applicant.student) {
      throw new NotFoundException("Accepted applicant not found");
    }
    const first = applicant.enrollmentInvoice?.plan?.installments[0];
    if (!first) {
      throw new BadRequestException("Enrollment installment not found");
    }
    const expectedHash = hashCapability(statusToken);
    if (applicant.statusTokenHash !== expectedHash) {
      return "not_sent";
    }
    const env = loadEnv();
    const statusUrl = this.statusPageUrl(statusToken);
    const paymentUrl =
      applicant.onboardingStatus === "payment_pending" &&
      applicant.activeOnboardingPaymentLink?.status === "active"
        ? `${env.PAYMENT_ORIGIN}/pay/${applicant.activeOnboardingPaymentLink.token}`
        : null;
    const publicBillUrl = publicBillPaymentUrl(
      env.PAYMENT_ORIGIN,
      applicant.student.studentNo,
    );
    try {
      const templates = await this.appConfig.emailTemplates();
      const interpolate = (str: string) =>
        str
          .replace(/\{\{firstName\}\}/g, esc(applicant.firstName))
          .replace(/\{\{lastName\}\}/g, esc(applicant.lastName))
          .replace(/\{\{scholarshipLine\}\}/g, "")
          .replace(/\{\{appFee\}\}/g, "");
      const required = applicant.requiredEnrollmentCashXof ?? first.amountDue;
      const enrollmentMessage =
        applicant.onboardingStatus === "enrolled"
          ? `<p>Your first installment is confirmed and your enrollment is active.</p>`
          : `<p>Your first installment is <strong>${required.toLocaleString("fr-SN")} XOF</strong>. Your enrollment remains payment pending until the full amount is verified.</p>
             ${paymentUrl ? `<p><a href="${paymentUrl}">Pay the first installment or upload proof</a></p>` : ""}
             <p>You may also visit <a href="${publicBillUrl}">payment.daust.net</a> and verify with your Student ID and date of birth.</p>`;
      const enrollmentHeading =
        applicant.onboardingStatus === "enrolled"
          ? "Your enrollment is active"
          : "Complete your enrollment payment";
      const delivery = await this.mail.send({
        to: applicant.email,
        cc: templates.acceptanceCc?.length ? templates.acceptanceCc : undefined,
        bcc: templates.acceptanceBcc?.length
          ? templates.acceptanceBcc
          : undefined,
        subject: interpolate(templates.acceptanceSubject),
        html: `${interpolate(templates.acceptanceBody)}
          <h2>${enrollmentHeading}</h2>
          <p>Your permanent Student ID is <strong>${esc(applicant.student.studentNo)}</strong>.</p>
          ${enrollmentMessage}
          <p><a href="${statusUrl}">View your private application status</a></p>
          `,
      });
      if (!delivery.sent) return "not_sent";
      await this.prisma.applicant.updateMany({
        where: { id, statusTokenHash: expectedHash },
        data: { acceptanceEmailSentAt: new Date() },
      });
      return "sent";
    } catch (error) {
      this.logger.warn(`acceptance email failed: ${String(error)}`);
      return "not_sent";
    }
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        const retryable = isSerializationConflict(error);
        if (!retryable || attempt === SERIALIZABLE_RETRIES - 1) throw error;
      }
    }
    throw new Error("Serializable transaction retry limit exhausted");
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ApplicationInput } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { AppConfigService } from "../app-config/app-config.service.js";
import type { ProofPaymentMethod } from "@mydaust/shared";
import { PaymentSubmissionsService } from "../finance/payment-submissions.service.js";

/** Escape user-supplied text before embedding it in email HTML (applications are anonymous/public). */
const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
  essay?: string | null;
  term?: string | null;
}

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly appConfig: AppConfigService,
    private readonly paymentSubmissions: PaymentSubmissionsService,
  ) {}

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
    if (!applicant) throw new NotFoundException("Application not found");
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

    const award = await this.appConfig.awardFor(score);
    const appFee = await this.appConfig.applicationFee();
    const scholarshipLine =
      award.pct > 0
        ? `<p>Based on your reported BAC, you may qualify for a <strong>${award.pct}% merit scholarship</strong> (${award.band}).</p>`
        : "";

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
        .replace(/\{\{scholarshipLine\}\}/g, scholarshipLine)
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

    return { id: applicant.id, scholarship: award };
  }

  /** Registrar/admin: one applicant's detail + the merit scholarship their BAC would earn. */
  async applicantDetail(id: string) {
    const a = await this.prisma.applicant.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Applicant not found");
    const program = a.programCode
      ? await this.prisma.program.findUnique({ where: { code: a.programCode } })
      : null;
    const scholarship = await this.appConfig.awardFor(a.score);
    const appFee = await this.appConfig.applicationFee();
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
      essay: a.essay,
      term: a.term,
      scholarship,
    };
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
      essay: set(input.essay),
      term: set(input.term),
    };
  }

  /** Registrar/admin: advance/reject an applicant's pipeline stage. Audited. */
  async adminSetStage(actorId: string, id: string, stage: string) {
    if (!AdmissionsService.STAGES.includes(stage))
      throw new BadRequestException(`Invalid stage "${stage}"`);
    const applicant = await this.prisma.applicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException("Applicant not found");
    const updated = await this.prisma.applicant.update({
      where: { id },
      data: { stage },
    });
    await this.prisma.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: id,
        action: `applicant-stage-${stage}`,
        actorId,
      },
    });

    if (stage === "accepted") {
      try {
        const templates = await this.appConfig.emailTemplates();
        const cc = templates.acceptanceCc?.length
          ? templates.acceptanceCc
          : undefined;
        const bcc = templates.acceptanceBcc?.length
          ? templates.acceptanceBcc
          : undefined;

        const award = await this.appConfig.awardFor(applicant.score);
        const scholarshipLine =
          award.pct > 0
            ? `<p>Based on your reported BAC, you may qualify for a <strong>${award.pct}% merit scholarship</strong> (${award.band}).</p>`
            : "";

        const interpolate = (str: string) =>
          str
            .replace(/\{\{firstName\}\}/g, esc(applicant.firstName))
            .replace(/\{\{lastName\}\}/g, esc(applicant.lastName))
            .replace(/\{\{scholarshipLine\}\}/g, scholarshipLine)
            .replace(/\{\{appFee\}\}/g, "");

        await this.mail.send({
          to: applicant.email,
          cc,
          bcc,
          subject: interpolate(templates.acceptanceSubject),
          html: interpolate(templates.acceptanceBody),
        });
      } catch (e) {
        this.logger.warn(`acceptance email failed: ${String(e)}`);
      }
    }

    return updated;
  }
}

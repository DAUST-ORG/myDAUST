import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ApplicationInput } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";
import { AppConfigService } from "../app-config/app-config.service.js";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../finance/payment-provider.js";

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly appConfig: AppConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * PayTech checkout for the 30k FCFA application fee. Anonymous (the applicant id is the
   * capability); the verified IPN (ref APPFEE-<id>) flips feePaid — never this endpoint.
   */
  async feeCheckout(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundException("Application not found");
    if (applicant.feePaid) throw new BadRequestException("Application fee already paid");
    if (!process.env.PAYTECH_API_KEY) {
      throw new BadRequestException("Online fee payment is not available right now — pay at the Office of Admissions");
    }
    const fee = await this.appConfig.applicationFee();
    const vitrine = process.env.VITRINE_ORIGIN ?? "http://localhost:3001";
    const { redirectUrl } = await this.provider.requestPayment({
      ref: `APPFEE-${applicant.id}`,
      amount: fee,
      itemName: "DAUST application fee",
      customField: { applicantId: applicant.id },
      // Applicants are anonymous — return them to the public site, not the portal.
      successUrl: `${vitrine}/admissions?fee=paid`,
      cancelUrl: `${vitrine}/admissions`,
    });
    return { redirectUrl };
  }

  /** Anonymous public application: persist applicant + send confirmation email. */
  async apply(input: ApplicationInput) {
    const applicant = await this.prisma.applicant.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        programCode: input.programCode ?? null,
        country: input.country ?? null,
        score: input.bacScore ?? null,
        stage: "submitted",
      },
    });

    const award = await this.appConfig.awardFor(input.bacScore);
    const appFee = await this.appConfig.applicationFee();
    const scholarshipLine =
      award.pct > 0
        ? `<p>Based on your reported BAC, you may qualify for a <strong>${award.pct}% merit scholarship</strong> (${award.band}).</p>`
        : "";

    await this.mail.send({
      to: input.email,
      subject: "Your DAUST application has been received",
      html: `
        <h2>Thank you, ${input.firstName}!</h2>
        <p>We've received your application to DAUST for the September 2026 intake.</p>
        ${scholarshipLine}
        <p>Next step: submit your documents and the ${appFee.toLocaleString("en-US")} FCFA application fee. Our admissions team will be in touch.</p>
        <p>— Office of Admissions, DAUST</p>`,
    });

    return { id: applicant.id, scholarship: award };
  }

  /** Registrar/admin: one applicant's detail + the merit scholarship their BAC would earn. */
  async applicantDetail(id: string) {
    const a = await this.prisma.applicant.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Applicant not found");
    const program = a.programCode ? await this.prisma.program.findUnique({ where: { code: a.programCode } }) : null;
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
      scholarship,
    };
  }

  private static readonly STAGES = ["submitted", "review", "interview", "offer", "accepted", "rejected"];

  /** Registrar/admin: manually add an applicant to the pipeline. Audited. */
  async adminCreateApplicant(
    actorId: string,
    input: { firstName: string; lastName: string; email: string; programCode?: string | null; country?: string | null; score?: number | null },
  ) {
    const applicant = await this.prisma.applicant.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        programCode: input.programCode ?? null,
        country: input.country ?? null,
        score: input.score ?? null,
        stage: "submitted",
      },
    });
    await this.prisma.auditLog.create({
      data: { entity: "Applicant", entityId: applicant.id, action: "applicant-created", actorId },
    });
    return applicant;
  }

  /** Registrar/admin: advance/reject an applicant's pipeline stage. Audited. */
  async adminSetStage(actorId: string, id: string, stage: string) {
    if (!AdmissionsService.STAGES.includes(stage)) throw new BadRequestException(`Invalid stage "${stage}"`);
    const applicant = await this.prisma.applicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException("Applicant not found");
    const updated = await this.prisma.applicant.update({ where: { id }, data: { stage } });
    await this.prisma.auditLog.create({
      data: { entity: "Applicant", entityId: id, action: `applicant-stage-${stage}`, actorId },
    });
    return updated;
  }
}

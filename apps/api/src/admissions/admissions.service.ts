import { Injectable, Logger } from "@nestjs/common";
import { type ApplicationInput, scholarshipForBac } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../mail/mail.service.js";

@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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

    const award = scholarshipForBac(input.bacScore);
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
        <p>Next step: submit your documents and the 30,000 FCFA application fee. Our admissions team will be in touch.</p>
        <p>— Office of Admissions, DAUST</p>`,
    });

    return { id: applicant.id, scholarship: award };
  }
}

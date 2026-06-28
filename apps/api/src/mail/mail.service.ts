import { Injectable, Logger } from "@nestjs/common";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Transactional email. Sends via Resend when RESEND_API_KEY is set; otherwise logs to the
 * console (dev mode) so flows are testable without a provider. Same seam, swap the impl later.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.MAIL_FROM ?? "myDAUST <no-reply@daust.org>";

  async send(msg: MailMessage): Promise<{ sent: boolean; id?: string }> {
    if (!this.apiKey) {
      this.logger.log(`[dev-mail] to=${msg.to} subject="${msg.subject}" (no RESEND_API_KEY — not sent)`);
      return { sent: false };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html }),
    });
    if (!res.ok) {
      this.logger.error(`Resend send failed (${res.status}): ${await res.text()}`);
      return { sent: false };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { requirePersonEmail } from "../auth/person-email.js";
import { MailService } from "../mail/mail.service.js";
import { NOTIFICATIONS_EMAIL_ENABLED_KEY } from "./recipient-resolver.js";

export interface DeliverByMailInput {
  notificationId: string;
  personId: string;
  title: string;
  body: string | null;
  href: string | null;
}

export interface DeliverByMailSummary {
  attempted: number;
  sent: number;
  deferred: number;
  failed: number;
  skipped: number;
}

/**
 * Best-effort mail hand-off for an in-app notification. Gated by the
 * `notifications.emailEnabled` AppSetting — if the operator has not turned it on,
 * the function no-ops and the notification stays `emailStatus = not_attempted`.
 *
 * Mail errors never throw. They update the notification row to `emailStatus =
 * deferred` or `failed` and log the reason. A failed email cannot roll back the
 * in-app row, by design — see AGENTS.md §4.
 */
@Injectable()
export class MailDelivery {
  private readonly logger = new Logger(MailDelivery.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: NOTIFICATIONS_EMAIL_ENABLED_KEY },
    });
    return row?.valueJson === true;
  }

  async deliver(inputs: DeliverByMailInput[]): Promise<DeliverByMailSummary> {
    if (inputs.length === 0) {
      return { attempted: 0, sent: 0, deferred: 0, failed: 0, skipped: 0 };
    }
    if (!(await this.isEnabled())) {
      return { attempted: 0, sent: 0, deferred: 0, failed: 0, skipped: inputs.length };
    }

    const summary: DeliverByMailSummary = {
      attempted: 0,
      sent: 0,
      deferred: 0,
      failed: 0,
      skipped: 0,
    };

    for (const input of inputs) {
      summary.attempted++;
      let person: { firstName: string | null; lastName: string | null };
      let email: string;
      try {
        const row = await this.prisma.person.findUnique({
          where: { id: input.personId },
          select: { email: true, firstName: true, lastName: true },
        });
        if (!row) {
          summary.failed++;
          await this.markFailed(
            input.notificationId,
            "Recipient person row missing",
          );
          continue;
        }
        email = requirePersonEmail(row.email);
        person = row;
      } catch (err) {
        summary.failed++;
        await this.markFailed(
          input.notificationId,
          err instanceof Error ? err.message : String(err),
        );
        continue;
      }

      try {
        const result = await this.mail.send({
          to: email,
          subject: input.title,
          html: renderMailBody({
            firstName: person.firstName,
            title: input.title,
            body: input.body,
            href: input.href,
          }),
          idempotencyKey: `notification:${input.notificationId}`,
        });
        if (result.sent) {
          summary.sent++;
          await this.prisma.notification.update({
            where: { id: input.notificationId },
            data: {
              emailStatus: "sent",
              emailAttemptedAt: new Date(),
              emailError: null,
            },
          });
        } else {
          // No API key or dev-mode log — treat as deferred (no error, just not delivered).
          summary.deferred++;
          await this.prisma.notification.update({
            where: { id: input.notificationId },
            data: {
              emailStatus: "deferred",
              emailAttemptedAt: new Date(),
              emailError: "Mail provider not configured",
            },
          });
        }
      } catch (err) {
        summary.deferred++;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Mail delivery failed for notification ${input.notificationId}: ${message}`,
        );
        await this.prisma.notification.update({
          where: { id: input.notificationId },
          data: {
            emailStatus: "deferred",
            emailAttemptedAt: new Date(),
            emailError: message,
          },
        });
      }
    }

    return summary;
  }

  private async markFailed(notificationId: string, reason: string) {
    try {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          emailStatus: "failed",
          emailAttemptedAt: new Date(),
          emailError: reason,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to mark notification ${notificationId} as failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function renderMailBody(args: {
  firstName: string | null;
  title: string;
  body: string | null;
  href: string | null;
}): string {
  const greeting = args.firstName ? `Hi ${args.firstName},` : "Hello,";
  const body = args.body ? `<p>${escapeHtml(args.body)}</p>` : "";
  const link = args.href
    ? `<p style="margin-top:16px"><a href="${escapeAttr(args.href)}">Open in myDAUST</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">${escapeHtml(greeting)}${body}${link}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

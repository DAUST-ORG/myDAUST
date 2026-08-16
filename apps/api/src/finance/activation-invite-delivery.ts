import { createHash } from "node:crypto";
import type { PrismaClient } from "@mydaust/db";
import type { MailService } from "../mail/mail.service.js";
import { loadEnv } from "../config/env.js";
import type { EnrollmentActivation } from "./admission-payment-gate.js";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Deliver only after the money/data transaction commits. Failure is audited. */
export async function deliverStudentActivationInviteAfterCommit(
  prisma: Pick<PrismaClient, "applicant" | "auditLog">,
  mail: Pick<MailService, "send">,
  activation: EnrollmentActivation,
): Promise<"sent" | "pending"> {
  let sent = false;
  let providerMessageId: string | null = null;
  const inviteFingerprint = createHash("sha256")
    .update(activation.inviteToken)
    .digest("hex");
  const idempotencyKey = `student-activation/${activation.applicantId}/${inviteFingerprint.slice(0, 32)}`;
  try {
    const setupUrl = `${loadEnv().PORTAL_ORIGIN}/set-password?token=${encodeURIComponent(activation.inviteToken)}`;
    const delivery = await mail.send({
      to: activation.email,
      subject: "Your myDAUST student account is ready",
      html: `
          <h2>Enrollment confirmed</h2>
          <p>Hello ${escapeHtml(activation.name)},</p>
          <p>DAUST has verified your first installment and activated your student record.</p>
          <table cellpadding="6">
            <tr><td><strong>Student ID</strong></td><td>${escapeHtml(activation.studentNo)}</td></tr>
            <tr><td><strong>Setup link expires</strong></td><td>${activation.inviteExpiresAt.toISOString()}</td></tr>
          </table>
          <p><a href="${setupUrl}">Set up your myDAUST password</a>.</p>
          <p>If the link expires, Admissions can send you a new one.</p>
        `,
      idempotencyKey,
    });
    sent = delivery.sent;
    providerMessageId = delivery.id ?? null;
  } catch {
    sent = false;
  }
  if (sent) {
    const marked = await prisma.applicant.updateMany({
      where: {
        id: activation.applicantId,
        onboardingStatus: "enrolled",
        studentInviteSentAt: null,
      },
      data: { studentInviteSentAt: new Date() },
    });
    if (marked.count === 1) return "sent";
    const current = await prisma.applicant.findUnique({
      where: { id: activation.applicantId },
      select: { studentInviteSentAt: true },
    });
    if (current?.studentInviteSentAt) return "sent";
    await prisma.auditLog.create({
      data: {
        entity: "Applicant",
        entityId: activation.applicantId,
        action: "student-invite-delivery-marker-pending",
        data: {
          studentId: activation.studentId,
          providerMessageId,
          idempotencyKey,
        },
      },
    });
    return "pending";
  }
  await prisma.auditLog.create({
    data: {
      entity: "Applicant",
      entityId: activation.applicantId,
      action: "student-invite-delivery-pending",
      data: { studentId: activation.studentId },
    },
  });
  return "pending";
}

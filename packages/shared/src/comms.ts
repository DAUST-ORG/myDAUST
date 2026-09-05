import { z } from "zod";

/**
 * An attachment url is a capability to render a link inside the portal, so it
 * is constrained to what POST /uploads actually returns: one path segment under
 * /uploads. The client resolves a stored path against the API origin but passes
 * anything already starting with "http" straight through, so an unconstrained
 * string here lets a sender put an arbitrary external link, under a filename
 * they choose, into a recipient's inbox.
 */
export const UPLOAD_PATH = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export const MessageAttachment = z.object({
  url: z.string().regex(UPLOAD_PATH, "Attachment url must be an uploaded file"),
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative().optional(),
});
export type MessageAttachment = z.infer<typeof MessageAttachment>;

export const SendMessageInput = z
  .object({
    body: z.string().max(5000).default(""),
    attachments: z.array(MessageAttachment).max(10).optional(),
  })
  .refine((v) => v.body.trim().length > 0 || (v.attachments?.length ?? 0) > 0, {
    message: "Message must have some text or an attachment",
    path: ["body"],
  });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const StartThreadInput = z
  .object({
    recipientId: z.string().uuid().optional(),
    recipientIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    subject: z.string().max(200).optional(),
    body: z.string().max(5000).default(""),
    attachments: z.array(MessageAttachment).max(10).optional(),
  })
  .refine((v) => Boolean(v.recipientId) || Boolean(v.recipientIds), {
    message: "Provide a recipientId or recipientIds",
  })
  .refine((v) => v.body.trim().length > 0 || (v.attachments?.length ?? 0) > 0, {
    message: "Message must have some text or an attachment",
    path: ["body"],
  });
export type StartThreadInput = z.infer<typeof StartThreadInput>;

export const CreateAnnouncementInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  category: z.string().min(1).max(50),
  audience: z.enum(["all", "student", "faculty", "staff"]).default("all"),
});
export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementInput>;

import { z } from "zod";

export const MessageAttachment = z.object({
  url: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
});
export type MessageAttachment = z.infer<typeof MessageAttachment>;

export const SendMessageInput = z.object({
  body: z.string().min(1).max(5000),
  attachments: z.array(MessageAttachment).max(10).optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const StartThreadInput = z.object({
  recipientId: z.string().uuid().optional(),
  recipientIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
  attachments: z.array(MessageAttachment).max(10).optional(),
}).refine((v) => Boolean(v.recipientId) || Boolean(v.recipientIds), {
  message: "Provide a recipientId or recipientIds",
});
export type StartThreadInput = z.infer<typeof StartThreadInput>;

export const CreateAnnouncementInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  category: z.string().min(1).max(50),
  audience: z.enum(["all", "student", "faculty", "staff"]).default("all"),
});
export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementInput>;

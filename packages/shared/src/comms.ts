import { z } from "zod";

export const SendMessageInput = z.object({
  body: z.string().min(1).max(5000),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const StartThreadInput = z.object({
  recipientId: z.string().uuid(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
});
export type StartThreadInput = z.infer<typeof StartThreadInput>;

export const CreateAnnouncementInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  category: z.string().min(1).max(50),
  audience: z.enum(["all", "student", "faculty", "staff"]).default("all"),
});
export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementInput>;

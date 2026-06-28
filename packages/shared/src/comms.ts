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

import { z } from "zod";

/** Self-service password change (verifies the current password server-side). */
export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

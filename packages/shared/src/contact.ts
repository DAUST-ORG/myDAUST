import { z } from "zod";

/** Public "Contact us" submission from the vitrine. Stored in the CMS inbox. */
export const ContactInput = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  message: z.string().min(1).max(4000),
});
export type ContactInput = z.infer<typeof ContactInput>;

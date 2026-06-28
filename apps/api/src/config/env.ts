import { z } from "zod";

/**
 * Boot-time env validation. Core vars are required; PayTech vars are optional so the
 * app (and the read-only tracking UI) runs before sandbox keys are set — the PayTech
 * provider throws a clear error if a payment is initiated without them.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  PORTAL_ORIGIN: z.string().url().default("http://localhost:3000"),
  VITRINE_ORIGIN: z.string().url().default("http://localhost:3001"),
  SESSION_SECRET: z.string().min(16).default("dev-only-session-secret-change-me"),

  PAYTECH_ENV: z.enum(["test", "prod"]).default("test"),
  PAYTECH_API_KEY: z.string().optional(),
  PAYTECH_API_SECRET: z.string().optional(),
  PAYTECH_IPN_URL: z.string().url().optional(),
  PAYTECH_SUCCESS_URL: z.string().url().optional(),
  PAYTECH_CANCEL_URL: z.string().url().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && env.SESSION_SECRET === "dev-only-session-secret-change-me") {
    ctx.addIssue({
      code: "custom",
      path: ["SESSION_SECRET"],
      message: "SESSION_SECRET must be set to a real secret in production",
    });
  }
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

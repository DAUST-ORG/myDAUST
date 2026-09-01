import { z } from "zod";

/** Boot-time environment validation. */
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().url(),
    PORTAL_ORIGIN: z.string().url().default("http://localhost:3000"),
    VITRINE_ORIGIN: z.string().url().default("http://localhost:3001"),
    ADDITIONAL_CORS_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().url())),
    // Public bill-payment portal (payment.daust.net).
    PAYMENT_ORIGIN: z.string().url().default("http://localhost:3000"),
    WIRE_PROOFS_BUCKET: z.string().min(3).optional(),
    MEDIA_BUCKET: z.string().min(3).optional(),
    AWS_REGION: z.string().min(3).default("us-east-1"),
    SESSION_SECRET: z
      .string()
      .min(16)
      .default("dev-only-session-secret-change-me"),
    // Dedicated pepper for the short student-activation pairing code. It is
    // optional at boot so existing app services remain available; activation
    // endpoints fail closed unless it decodes to exactly 32 bytes.
    STUDENT_ACTIVATION_CODE_KEY_V1: z.string().optional(),
    COOKIE_SECURE: z.enum(["true", "false"]).optional(),

    // PI-SPI (BCEAO instant-payment rail). The app
    // boots without them and the provider reports itself unconfigured, which keeps the
    // method hidden from payers rather than failing at checkout. Calling the Business API
    // needs all four of client id/secret, api key and the mTLS certificate pair — the
    // gateway drops the TLS connection outright when no client certificate is presented.
    PI_SPI_ENABLED: z.enum(["true", "false"]).default("false"),
    PI_SPI_BASE_URL: z
      .string()
      .url()
      .default("https://sandbox.api.pi-bceao.com/piz/v1"),
    PI_SPI_TOKEN_URL: z.string().url().optional(),
    PI_SPI_CLIENT_ID: z.string().optional(),
    PI_SPI_CLIENT_SECRET: z.string().optional(),
    PI_SPI_API_KEY: z.string().optional(),
    /** DAUST's own alias — the account credited by every request-to-pay we send. */
    PI_SPI_PAYE_ALIAS: z.string().uuid().optional(),
    /** Shared secret PI-SPI signs webhook bodies with (from POST /webhooks/{id}/secrets). */
    PI_SPI_WEBHOOK_SECRET: z.string().optional(),
    /** PEM client certificate + key issued through the PICERT portal. */
    PI_SPI_CLIENT_CERT: z.string().optional(),
    PI_SPI_CLIENT_KEY: z.string().optional(),
    /** Hours a tuition request-to-pay stays payable before the rail expires it. */
    PI_SPI_REQUEST_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(720)
      .default(72),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === "production" &&
      env.SESSION_SECRET === "dev-only-session-secret-change-me"
    ) {
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

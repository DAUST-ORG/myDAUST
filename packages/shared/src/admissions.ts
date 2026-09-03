import { z } from "zod";

export const ApplicationTrack = z.enum(["first-year", "transfer"]);
export type ApplicationTrack = z.infer<typeof ApplicationTrack>;

/**
 * Public Apply form (anonymous — no auth). Name + email are the only required fields;
 * the multi-step public workflow fills the rest, feeding the same Applicant pipeline the
 * registrar reads. The server always forces stage "submitted" — none of these can set it.
 */
export const ApplicationInput = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  programCode: z.string().max(20).nullish(),
  track: ApplicationTrack.default("first-year"),
  // `score` is the 0–20 entrance/BAC score (drives the merit award); `bacScore` kept for back-compat.
  score: z.number().min(0).max(20).nullish(),
  bacScore: z.number().min(0).max(20).optional(),
  country: z.string().max(80).nullish(),
  phone: z.string().max(40).nullish(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  gender: z.enum(["Male", "Female", "Homme", "Femme"]).nullish(),
  nationality: z.string().max(80).nullish(),
  city: z.string().max(80).nullish(),
  origin: z.enum(["high-school", "transfer"]).nullish(),
  school: z.string().max(160).nullish(),
  priorGpa: z.string().max(40).nullish(),
  parentName: z.string().max(120).nullish(),
  parentPhone: z.string().max(40).nullish(),
  parentEmail: z.string().email().nullish(),
  allergies: z.string().max(300).nullish(),
  source: z.string().max(80).nullish(),
  essay: z.string().max(4000).nullish(),
  term: z.literal("Fall 2026").nullish(),
});
export type ApplicationInput = z.infer<typeof ApplicationInput>;

// --- Director-editable config contracts ---

export const UpdateFeeInput = z.object({
  label: z.string().min(1).max(100).optional(),
  minXof: z.number().int().min(0).max(100_000_000).optional(),
  maxXof: z.number().int().min(0).max(100_000_000).nullable().optional(),
  period: z.enum(["year", "semester", "one-time"]).optional(),
  note: z.string().max(300).nullable().optional(),
});
export type UpdateFeeInput = z.infer<typeof UpdateFeeInput>;

/** Who gets emailed when a new application is submitted (editable in the registrar dashboard). */
export const NotificationRecipientsInput = z.object({
  recipients: z.array(z.string().email()).max(50),
});
export type NotificationRecipientsInput = z.infer<typeof NotificationRecipientsInput>;

export const EmailTemplatesInput = z.object({
  applicationSubject: z.string().min(1).max(200),
  applicationBody: z.string().min(1).max(10000),
  applicationCc: z.array(z.string()).optional().default(["admissions@daust.org"]),
  applicationBcc: z.array(z.string()).optional().default(["sndao@daust.org"]),
  acceptanceSubject: z.string().min(1).max(200),
  acceptanceBody: z.string().min(1).max(10000),
  acceptanceCc: z.array(z.string()).optional().default(["admissions@daust.org"]),
  acceptanceBcc: z.array(z.string()).optional().default(["sndao@daust.org"]),
});
export type EmailTemplatesInput = z.infer<typeof EmailTemplatesInput>;

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplatesInput = {
  applicationSubject: "Your DAUST application has been received",
  applicationBody: `<h2>Thank you, {{firstName}}!</h2>
<p>We've received your application to DAUST for the September 2026 intake.</p>
<p>Next step: submit your documents and the {{appFee}} FCFA application fee. Our admissions team will be in touch.</p>
<p>Office of Admissions, DAUST</p>`,
  applicationCc: ["admissions@daust.org"],
  applicationBcc: ["sndao@daust.org"],
  acceptanceSubject: "Congratulations! You have been accepted to DAUST",
  acceptanceBody: `<h2>Congratulations, {{firstName}} {{lastName}}!</h2>
<p>We are thrilled to offer you admission to DAUST for the September 2026 intake.</p>
<p>Please log in to your portal to review your offer and next steps.</p>
<p>Office of Admissions, DAUST</p>`,
  acceptanceCc: ["admissions@daust.org"],
  acceptanceBcc: ["sndao@daust.org"],
};

/** Published cost of attendance (integer XOF; ranges keep min/max). Source: vitrine design. */
// Official DAUST payment plan (finance office sheet, 2026): flat yearly housing/cafeteria,
// annual total paid in 4 installments (Inscription, Nov 5, Jan 5, Mar 5).
export const FEE_STRUCTURE = {
  tuitionPerYear: 2_975_000,
  tuitionPerSemester: 1_487_500,
  housingPerYear: 680_000,
  cafeteriaPerYear: 630_000,
  housingPerSemester: { min: 340_000, max: 340_000 },
  cafeteriaPerSemester: { min: 315_000, max: 315_000 },
  applicationFee: 30_000,
  insurancePerYear: 10_000,
} as const;

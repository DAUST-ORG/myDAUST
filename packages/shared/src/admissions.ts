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
  gender: z.string().max(20).nullish(),
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
  term: z.string().max(40).nullish(),
});
export type ApplicationInput = z.infer<typeof ApplicationInput>;

export interface ScholarshipTierDef {
  minScore: number;
  pct: number;
  band: string;
  note?: string | null;
}

/** Default merit tiers — the SEED for the director-editable `ScholarshipTier` table, and the offline fallback. */
export const SCHOLARSHIP_TIERS: readonly ScholarshipTierDef[] = [
  { minScore: 15, pct: 20, band: "BAC 15 and above", note: "Top of the class — the highest automatic merit discount." },
  { minScore: 13.5, pct: 15, band: "BAC 13.5 – 14.9", note: "Strong academic performance rewarded on enrollment." },
  { minScore: 12, pct: 10, band: "BAC 12 – 13.4", note: "A solid foundation earns a meaningful tuition reduction." },
];

/**
 * Merit scholarship for a BAC score against a tier list (highest matching threshold wins).
 * Callers pass the director-configured tiers from the DB; defaults keep this pure + testable.
 */
export function scholarshipForBac(
  score: number | null | undefined,
  tiers: readonly ScholarshipTierDef[] = SCHOLARSHIP_TIERS,
): { pct: number; band: string } {
  if (score == null) return { pct: 0, band: "Not provided" };
  const tier = [...tiers].sort((a, b) => b.minScore - a.minScore).find((t) => score >= t.minScore);
  return tier ? { pct: tier.pct, band: tier.band } : { pct: 0, band: "No award" };
}

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

export const ScholarshipTierInput = z.object({
  minScore: z.number().min(0).max(20),
  pct: z.number().int().min(1).max(100),
  band: z.string().min(1).max(100),
  note: z.string().max(300).optional(),
});
export type ScholarshipTierInput = z.infer<typeof ScholarshipTierInput>;

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

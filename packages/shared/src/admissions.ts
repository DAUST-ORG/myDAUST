import { z } from "zod";

export const ApplicationTrack = z.enum(["first-year", "transfer"]);
export type ApplicationTrack = z.infer<typeof ApplicationTrack>;

/** Public Apply form (anonymous — no auth). */
export const ApplicationInput = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  programCode: z.string().max(20).optional(),
  track: ApplicationTrack.default("first-year"),
  bacScore: z.number().min(0).max(20).optional(),
  country: z.string().max(80).optional(),
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

export const ScholarshipTierInput = z.object({
  minScore: z.number().min(0).max(20),
  pct: z.number().int().min(1).max(100),
  band: z.string().min(1).max(100),
  note: z.string().max(300).optional(),
});
export type ScholarshipTierInput = z.infer<typeof ScholarshipTierInput>;

/** Published cost of attendance (integer XOF; ranges keep min/max). Source: vitrine design. */
export const FEE_STRUCTURE = {
  tuitionPerYear: 2_975_000,
  tuitionPerSemester: 1_487_500,
  housingPerSemester: { min: 300_000, max: 400_000 },
  cafeteriaPerSemester: { min: 202_500, max: 315_000 },
  applicationFee: 30_000,
  insurancePerYear: 10_000,
} as const;

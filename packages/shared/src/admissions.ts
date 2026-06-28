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

/** Merit scholarship auto-awarded on the Baccalauréat result (design: admissions). */
export function scholarshipForBac(score: number | null | undefined): { pct: number; band: string } {
  if (score == null) return { pct: 0, band: "Not provided" };
  if (score >= 15) return { pct: 20, band: "BAC 15 and above" };
  if (score >= 13.5) return { pct: 15, band: "BAC 13.5 – 14.9" };
  if (score >= 12) return { pct: 10, band: "BAC 12 – 13.4" };
  return { pct: 0, band: "Below 12" };
}

/** Published cost of attendance (integer XOF; ranges keep min/max). Source: vitrine design. */
export const FEE_STRUCTURE = {
  tuitionPerYear: 2_975_000,
  tuitionPerSemester: 1_487_500,
  housingPerSemester: { min: 300_000, max: 400_000 },
  cafeteriaPerSemester: { min: 202_500, max: 315_000 },
  applicationFee: 30_000,
  insurancePerYear: 10_000,
} as const;

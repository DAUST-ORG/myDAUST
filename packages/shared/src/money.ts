import { z } from "zod";

/**
 * All money in myDAUST is integer XOF (West African CFA franc — zero-decimal).
 * Never floats, never minor units. 1500 means 1500 FCFA.
 */
export const Xof = z
  .number()
  .int("XOF amounts are whole francs (no decimals)")
  .nonnegative();

export type Xof = z.infer<typeof Xof>;

export const CURRENCY = "XOF" as const;

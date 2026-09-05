import { z } from "zod";

/**
 * Wire contracts for the scholarship half of a fee-schedule revision.
 *
 * A `FeeScheduleComponent` says what a charge costs; a `ScholarshipDefinition`
 * says what an award takes off, on what basis, and where the credit books. Both
 * hang off the same versioned `FeeSchedule`, so both travel through the same
 * `global_fee_schedule` approval.
 *
 * The invariants below mirror the `ScholarshipDefinition_*_check` constraints in
 * the database exactly. Keeping them here as well is what turns a constraint
 * violation (a 500 from Postgres) into a field-level 400 the editor can render.
 */

export const SCHOLARSHIP_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Ceiling shared with the fee-component contracts; Prisma stores XOF as Int. */
export const SCHOLARSHIP_MAX_FLAT_XOF = 100_000_000;
export const SCHOLARSHIP_MAX_PCT_BPS = 10_000;
export const MAX_SCHOLARSHIPS_PER_SCHEDULE = 50;

/** What the award is a share of: tuition alone, or the whole annual package. */
export const ScholarshipBasis = z.enum(["tuition", "package"]);
export type ScholarshipBasis = z.infer<typeof ScholarshipBasis>;

/**
 * `fixed` awards carry their rate in the catalog (Mention Bien is always 15%).
 * `per_student` awards are defined here but priced on the individual award
 * (the 3FPT subsidy covers a negotiated share; social help varies by case).
 */
export const ScholarshipRateMode = z.enum(["fixed", "per_student"]);
export type ScholarshipRateMode = z.infer<typeof ScholarshipRateMode>;

export const ScholarshipKey = z
  .string()
  .trim()
  .regex(
    SCHOLARSHIP_KEY_PATTERN,
    "Use a lowercase key of up to 40 letters, digits or underscores, starting with a letter",
  );

const ScholarshipFields = z
  .object({
    /** Present when editing an award already on the approved schedule. */
    id: z.string().min(1).max(64).optional(),
    key: ScholarshipKey,
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).nullish(),
    basis: ScholarshipBasis,
    rateMode: ScholarshipRateMode,
    /** Basis points; 1500 is 15%. Fixed-rate awards only. */
    pctBps: z.number().int().min(1).max(SCHOLARSHIP_MAX_PCT_BPS).optional(),
    /** Flat XOF reduction. Fixed-rate awards only. */
    flatXof: z.number().int().min(1).max(SCHOLARSHIP_MAX_FLAT_XOF).optional(),
    costCenterCode: z.string().trim().min(1).max(8),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

export const ScholarshipDefinitionInput = ScholarshipFields.superRefine(
  (definition, ctx) => {
    const hasPct = definition.pctBps !== undefined;
    const hasFlat = definition.flatXof !== undefined;
    if (definition.rateMode === "fixed") {
      if (hasPct === hasFlat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pctBps"],
          message:
            "A fixed-rate award must carry exactly one of pctBps or flatXof",
        });
      }
      return;
    }
    if (hasPct || hasFlat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasPct ? "pctBps" : "flatXof"],
        message:
          "An award set per student takes its rate from the award, not from the catalog entry",
      });
    }
  },
);
export type ScholarshipDefinitionInput = z.infer<
  typeof ScholarshipDefinitionInput
>;

/** One edit session over the whole catalog, filed as a single approval. */
export const ScholarshipCatalogRevisionInput = z
  .object({
    academicYearLabel: z.string().trim().min(4).max(20).optional(),
    reason: z.string().trim().min(1).max(1000),
    scholarships: z
      .array(ScholarshipDefinitionInput)
      .max(MAX_SCHOLARSHIPS_PER_SCHEDULE),
  })
  .strict();
export type ScholarshipCatalogRevisionInput = z.infer<
  typeof ScholarshipCatalogRevisionInput
>;

export const ScholarshipCatalogEntry = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  basis: ScholarshipBasis,
  rateMode: ScholarshipRateMode,
  pctBps: z.number().int().nullable(),
  flatXof: z.number().int().nullable(),
  costCenterCode: z.string(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type ScholarshipCatalogEntry = z.infer<typeof ScholarshipCatalogEntry>;

/**
 * The catalog as it stands on the latest approved schedule. Nulls throughout the
 * header mean no approved schedule exists for the year yet, which is the same
 * shape the fee-plan read returns.
 */
export const ScholarshipCatalogResponse = z.object({
  academicYearLabel: z.string().nullable(),
  scheduleId: z.string().nullable(),
  revision: z.number().int().nullable(),
  status: z.string().nullable(),
  approvedAt: z.string().nullable(),
  scholarships: z.array(ScholarshipCatalogEntry),
});
export type ScholarshipCatalogResponse = z.infer<
  typeof ScholarshipCatalogResponse
>;

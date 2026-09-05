import { BadRequestException } from "@nestjs/common";

/**
 * The catalog of awards a student's bill can carry — merit mentions, family and
 * residency discounts, the 3FPT subsidy, social help.
 *
 * This is the scholarship half of the fee catalog. A `FeeScheduleComponent` says
 * what a charge costs; a `ScholarshipDefinition` says what an award takes off, on
 * what basis, and where the credit books. Both hang off the same versioned
 * `FeeSchedule` and move through the same approval rail, so "Mention Bien is 15%
 * of tuition" is data an operator can change rather than a number retyped per
 * student on a spreadsheet.
 *
 * Two rate modes, because the workbook has both:
 *   - `fixed`       the rate lives in the catalog (Mention Bien is always 15%)
 *   - `per_student` the catalog defines the award, the rate is set per award
 *                   (3FPT covers a negotiated share; social help varies by case)
 */

export const SCHOLARSHIP_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export type ScholarshipBasis = "tuition" | "package";
export type ScholarshipRateMode = "fixed" | "per_student";

export interface ScholarshipDefinition {
  key: string;
  label: string;
  description: string;
  basis: ScholarshipBasis;
  rateMode: ScholarshipRateMode;
  /** Basis points; 1500 is 15%. Fixed-rate awards only. */
  pctBps?: number;
  /** Flat XOF reduction. Fixed-rate awards only. */
  flatXof?: number;
  costCenterCode: string;
  active: boolean;
  sortOrder: number;
}

/** One award on one student. A per-student award carries its own rate. */
export interface ScholarshipAward {
  key: string;
  pctBps?: number;
  flatXof?: number;
}

export interface ResolvedAward {
  key: string;
  label: string;
  basis: ScholarshipBasis;
  costCenterCode: string;
  pctBps: number;
  flatXof: number;
}

const MAX_SCHOLARSHIPS = 50;
const MAX_FLAT_XOF = 100_000_000;

/**
 * Seed values recovered from the August 2026 finance workbook. These are the
 * starting catalog, not a hardcoded rule set — they are written to the fee
 * schedule and edited from there afterwards.
 */
export const SEED_SCHOLARSHIPS: readonly ScholarshipDefinition[] = [
  {
    key: "merit_assez_bien",
    label: "Mention Assez Bien",
    description: "Merit award for a baccalaureate mention of Assez Bien",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 1_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 0,
  },
  {
    key: "merit_bien",
    label: "Mention Bien",
    description: "Merit award for a baccalaureate mention of Bien",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 1_500,
    costCenterCode: "9100",
    active: true,
    sortOrder: 1,
  },
  {
    key: "merit_tres_bien",
    label: "Mention Très Bien",
    description: "Merit award for a baccalaureate mention of Très Bien",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 2_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 2,
  },
  {
    key: "family_discount",
    label: "Family discount",
    description: "Reduction where a sibling is already enrolled",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 1_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 3,
  },
  {
    key: "somone_resident",
    label: "Somone resident",
    description: "Reduction for students resident in Somone",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 1_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 4,
  },
  {
    key: "full_scholarship",
    label: "Full scholarship",
    description: "Full remission of tuition",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 10_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 5,
  },
  {
    key: "s10_half_tuition",
    label: "S10 half tuition",
    description: "Half tuition for a student in their tenth semester",
    basis: "tuition",
    rateMode: "fixed",
    pctBps: 5_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 6,
  },
  {
    key: "january_enrollment",
    label: "January enrollment",
    description: "Flat reduction for a student starting in the second semester",
    basis: "tuition",
    rateMode: "fixed",
    flatXof: 250_000,
    costCenterCode: "9100",
    active: true,
    sortOrder: 7,
  },
  {
    key: "fpt_subsidy",
    label: "3FPT subsidy",
    description:
      "State 3FPT subsidy covering a negotiated share of the full annual package",
    basis: "package",
    rateMode: "per_student",
    costCenterCode: "9100",
    active: true,
    sortOrder: 8,
  },
  {
    key: "social_help",
    label: "Social help",
    description: "Discretionary hardship reduction, rate set case by case",
    basis: "tuition",
    rateMode: "per_student",
    costCenterCode: "9100",
    active: true,
    sortOrder: 9,
  },
  {
    key: "other_discount",
    label: "Other discount",
    description: "Any approved reduction that no other award describes",
    basis: "tuition",
    rateMode: "per_student",
    costCenterCode: "9100",
    active: true,
    sortOrder: 10,
  },
];

function validateOne(
  definition: ScholarshipDefinition,
  seenKeys: Set<string>,
): ScholarshipDefinition {
  const key = definition.key.trim();
  if (!SCHOLARSHIP_KEY.test(key)) {
    throw new BadRequestException(
      "Scholarship keys must start with a lowercase letter and contain only lowercase letters, numbers, or underscores (40 characters maximum)",
    );
  }
  if (seenKeys.has(key)) {
    throw new BadRequestException(`Duplicate scholarship ${key}`);
  }
  seenKeys.add(key);
  const label = definition.label.trim();
  if (!label || label.length > 80) {
    throw new BadRequestException(`${key} needs a label of 1 to 80 characters`);
  }
  const hasPct = definition.pctBps !== undefined;
  const hasFlat = definition.flatXof !== undefined;
  if (definition.rateMode === "fixed") {
    if (hasPct === hasFlat) {
      throw new BadRequestException(
        `${key} is a fixed-rate award and must carry exactly one of pctBps or flatXof`,
      );
    }
  } else if (hasPct || hasFlat) {
    throw new BadRequestException(
      `${key} is set per student, so its rate belongs on the award and not on the catalog entry`,
    );
  }
  if (
    hasPct &&
    (!Number.isInteger(definition.pctBps) ||
      definition.pctBps! < 1 ||
      definition.pctBps! > 10_000)
  ) {
    throw new BadRequestException(
      `${key} must have a percentage between 1 and 10000 basis points`,
    );
  }
  if (
    hasFlat &&
    (!Number.isInteger(definition.flatXof) ||
      definition.flatXof! < 1 ||
      definition.flatXof! > MAX_FLAT_XOF)
  ) {
    throw new BadRequestException(
      `${key} must have a flat amount between 1 and ${MAX_FLAT_XOF} XOF`,
    );
  }
  const costCenterCode = definition.costCenterCode.trim();
  if (!costCenterCode || costCenterCode.length > 8) {
    throw new BadRequestException(
      `${key} needs a cost center of 1 to 8 characters`,
    );
  }
  return { ...definition, key, label, costCenterCode };
}

export function validateScholarships(
  definitions: readonly ScholarshipDefinition[],
): ScholarshipDefinition[] {
  if (definitions.length > MAX_SCHOLARSHIPS) {
    throw new BadRequestException(
      `A fee schedule carries at most ${MAX_SCHOLARSHIPS} scholarships`,
    );
  }
  const seenKeys = new Set<string>();
  return definitions.map((definition) => validateOne(definition, seenKeys));
}

/**
 * Turns one award into the rate that applies, taking it from the catalog for a
 * fixed award and from the award itself for a per-student one. An inactive award
 * is refused rather than silently priced at zero.
 */
export function resolveAward(
  award: ScholarshipAward,
  catalog: readonly ScholarshipDefinition[],
): ResolvedAward {
  const definition = catalog.find((entry) => entry.key === award.key);
  if (!definition) {
    throw new BadRequestException(`Unknown scholarship ${award.key}`);
  }
  if (!definition.active) {
    throw new BadRequestException(
      `Scholarship ${award.key} is no longer offered`,
    );
  }
  const hasPct = award.pctBps !== undefined;
  const hasFlat = award.flatXof !== undefined;
  if (definition.rateMode === "fixed") {
    if (hasPct || hasFlat) {
      throw new BadRequestException(
        `${award.key} has a catalog rate; remove the per-student rate or change the award to a per-student one`,
      );
    }
    return {
      key: definition.key,
      label: definition.label,
      basis: definition.basis,
      costCenterCode: definition.costCenterCode,
      pctBps: definition.pctBps ?? 0,
      flatXof: definition.flatXof ?? 0,
    };
  }
  if (hasPct === hasFlat) {
    throw new BadRequestException(
      `${award.key} is set per student and needs exactly one of pctBps or flatXof on the award`,
    );
  }
  if (
    hasPct &&
    (!Number.isInteger(award.pctBps) ||
      award.pctBps! < 1 ||
      award.pctBps! > 10_000)
  ) {
    throw new BadRequestException(
      `${award.key} needs a rate between 1 and 10000 basis points`,
    );
  }
  if (
    hasFlat &&
    (!Number.isInteger(award.flatXof) ||
      award.flatXof! < 1 ||
      award.flatXof! > MAX_FLAT_XOF)
  ) {
    throw new BadRequestException(
      `${award.key} needs a flat amount between 1 and ${MAX_FLAT_XOF} XOF`,
    );
  }
  return {
    key: definition.key,
    label: definition.label,
    basis: definition.basis,
    costCenterCode: definition.costCenterCode,
    pctBps: award.pctBps ?? 0,
    flatXof: award.flatXof ?? 0,
  };
}

export function resolveAwards(
  awards: readonly ScholarshipAward[],
  catalog: readonly ScholarshipDefinition[],
): ResolvedAward[] {
  const seen = new Set<string>();
  return awards.map((award) => {
    if (seen.has(award.key)) {
      throw new BadRequestException(
        `${award.key} is awarded twice to the same student`,
      );
    }
    seen.add(award.key);
    return resolveAward(award, catalog);
  });
}

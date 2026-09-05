/**
 * Pure pricing resolver for the finance-office billing workbook.
 *
 * The rules were recovered by recomputing all 403 workbook rows against their own
 * stated totals. Two contradict the workbook's header block and are load-bearing:
 *   - stacked percentage awards compose ADDITIVELY, not multiplicatively;
 *   - a 3FPT subsidy is a percentage of the full reference package, not of tuition.
 *
 * A student is priced by which catalog components are SELECTED — amounts always
 * come from the catalog, because that is what applyInvoiceComponentSelection writes.
 * Whatever the workbook bills beyond the selected catalog total is the residual,
 * carried as an explicit credit or charge rather than by bending a component.
 */

import {
  DEPOSIT_KEY_BY_TIER,
  HOUSING_KEY_BY_TIER,
  type HousingTier,
  catalogAmountXof,
} from "./student-billing-import.catalog.js";
import type { ResolvedAward, ScholarshipBasis } from "./scholarship-catalog.js";

export const TUITION_ANNUAL_XOF = 2_975_000;
export const CAFETERIA_ANNUAL_XOF = 630_000;
export const INSURANCE_ANNUAL_XOF = 10_000;

/** Reference package at the double-housing tier; the basis for a 3FPT subsidy. */
export const REFERENCE_PACKAGE_XOF = 4_295_000;

export const HOUSING_TIER_AMOUNTS: Record<HousingTier, number> = {
  none: 0,
  double: 680_000,
  double_ac: 800_000,
  individual: 1_360_000,
  individual_ac: 1_600_000,
};

export interface PricingInput {
  housingTier: HousingTier;
  /** A negotiated rate stated in the workbook; folds into the residual. */
  housingAnnualOverrideXof?: number;
  cafeteria: boolean;
  insurance: boolean;
  caution: boolean;
  awards: readonly ResolvedAward[];
}

export interface PricingResult {
  /** Catalog keys to select on the invoice. */
  selectedKeys: readonly string[];
  /** What the catalog charges for that selection. */
  catalogTotalXof: number;
  /** What the rules say the student owes, before comparing to the workbook. */
  expectedTotalXof: number;
  /** Total reduction the awards describe. */
  adjustmentXof: number;
  /** Per-award reduction, for the credit lines and their cost centers. */
  awardBreakdown: readonly {
    key: string;
    label: string;
    costCenterCode: string;
    amountXof: number;
  }[];
}

export class PricingError extends Error {}

export function resolveSelection(input: PricingInput): {
  selectedKeys: string[];
  catalogTotalXof: number;
} {
  const keys = ["tuition"];
  const housingKey = HOUSING_KEY_BY_TIER[input.housingTier];
  if (housingKey === undefined) {
    throw new PricingError(`Unknown housing tier ${input.housingTier}`);
  }
  if (housingKey) keys.push(housingKey);
  if (input.cafeteria) keys.push("cafeteria");
  if (input.insurance) keys.push("student_insurance");
  if (input.caution) {
    const depositKey = DEPOSIT_KEY_BY_TIER[input.housingTier];
    if (!depositKey) {
      throw new PricingError("A housing deposit requires a housing tier");
    }
    keys.push(depositKey);
  }
  return {
    selectedKeys: keys,
    catalogTotalXof: keys.reduce((sum, key) => sum + catalogAmountXof(key), 0),
  };
}

const BASIS_AMOUNT: Record<ScholarshipBasis, number> = {
  tuition: TUITION_ANNUAL_XOF,
  package: REFERENCE_PACKAGE_XOF,
};

/** Awards on the same basis stack additively — verified against all 403 rows. */
function reductionOnBasis(
  awards: readonly ResolvedAward[],
  basis: ScholarshipBasis,
): number {
  const onBasis = awards.filter((award) => award.basis === basis);
  const bps = onBasis.reduce((sum, award) => sum + award.pctBps, 0);
  if (bps < 0 || bps > 10_000) {
    throw new PricingError(
      `Stacked ${basis} awards total ${bps} bps, outside 0–10000`,
    );
  }
  const flat = onBasis.reduce((sum, award) => sum + award.flatXof, 0);
  return Math.round((BASIS_AMOUNT[basis] * bps) / 10_000) + flat;
}

function awardAmountXof(award: ResolvedAward): number {
  return (
    Math.round((BASIS_AMOUNT[award.basis] * award.pctBps) / 10_000) +
    award.flatXof
  );
}

/**
 * The price the rules imply, using the workbook's own housing amount rather than
 * the catalog's, so a negotiated rate still reconciles against the stated total.
 */
export function resolveStudentPackage(input: PricingInput): PricingResult {
  const { selectedKeys, catalogTotalXof } = resolveSelection(input);
  const housing =
    input.housingTier === "none"
      ? 0
      : (input.housingAnnualOverrideXof ??
        HOUSING_TIER_AMOUNTS[input.housingTier]);
  const gross =
    TUITION_ANNUAL_XOF +
    housing +
    (input.cafeteria ? CAFETERIA_ANNUAL_XOF : 0) +
    (input.insurance ? INSURANCE_ANNUAL_XOF : 0) +
    (input.caution ? Math.round(housing / 10) : 0);

  const tuitionCut = reductionOnBasis(input.awards, "tuition");
  if (tuitionCut > TUITION_ANNUAL_XOF) {
    throw new PricingError(
      `Tuition awards of ${tuitionCut} XOF exceed tuition of ${TUITION_ANNUAL_XOF} XOF`,
    );
  }
  const packageCut = reductionOnBasis(input.awards, "package");
  const adjustmentXof = tuitionCut + packageCut;
  const expectedTotalXof = gross - adjustmentXof;
  if (expectedTotalXof < 0) {
    throw new PricingError(
      `Awards of ${adjustmentXof} XOF exceed the gross package of ${gross} XOF`,
    );
  }
  return {
    selectedKeys,
    catalogTotalXof,
    expectedTotalXof,
    adjustmentXof,
    awardBreakdown: input.awards.map((award) => ({
      key: award.key,
      label: award.label,
      costCenterCode: award.costCenterCode,
      amountXof: awardAmountXof(award),
    })),
  };
}

import { z } from "zod";
import { Xof } from "./money.js";

export const INITIAL_BILLING_CATALOG_ACADEMIC_YEAR = "2026–2027";

export const BillingServiceKind = z.enum([
  "housing",
  "cafeteria",
  "insurance",
  "housing_caution",
]);
export type BillingServiceKind = z.infer<typeof BillingServiceKind>;

export const BillingServiceCalculation = z.enum([
  "fixed",
  "percentage_of_service",
]);
export type BillingServiceCalculation = z.infer<
  typeof BillingServiceCalculation
>;

export const BillingProfileStatus = z.enum(["draft", "active", "archived"]);
export type BillingProfileStatus = z.infer<typeof BillingProfileStatus>;

export const BillingProfileSourceKind = z.enum([
  "workbook",
  "admissions",
  "staff",
]);
export type BillingProfileSourceKind = z.infer<typeof BillingProfileSourceKind>;

export const BillingAdjustmentBasis = z.enum([
  "tuition",
  "housing",
  "cafeteria",
  "insurance",
  "housing_caution",
  "gross_charges",
  "manual",
]);
export type BillingAdjustmentBasis = z.infer<typeof BillingAdjustmentBasis>;

export const BillingAdjustmentCalculation = z.enum([
  "percentage",
  "fixed",
  "manual",
]);
export type BillingAdjustmentCalculation = z.infer<
  typeof BillingAdjustmentCalculation
>;

export const BillingAdjustmentStacking = z.enum([
  "additive",
  "sequential",
  "exclusive",
]);
export type BillingAdjustmentStacking = z.infer<
  typeof BillingAdjustmentStacking
>;

export const BillingAdjustmentEffect = z.enum(["discount", "charge"]);
export type BillingAdjustmentEffect = z.infer<typeof BillingAdjustmentEffect>;

export const BillingAdjustmentSource = z.enum([
  "scholarship",
  "manual_reconciliation",
  "workbook",
  "admissions",
]);
export type BillingAdjustmentSource = z.infer<typeof BillingAdjustmentSource>;

export interface BillingServiceOptionTemplate {
  kind: BillingServiceKind;
  code: string;
  label: string;
  description: string;
  calculation: BillingServiceCalculation;
  amountXof: number | null;
  percentageBasisPoints: number | null;
  basisServiceKind: BillingServiceKind | null;
  costCenterCode: string;
  refundable: boolean;
  defaultSelected: boolean;
  sortOrder: number;
}

/**
 * Institution-approved initial annual services. The half cafeteria plan is
 * deliberately absent until Finance approves an annual price.
 */
export const INITIAL_BILLING_SERVICE_OPTIONS = [
  {
    kind: "housing",
    code: "none",
    label: "No housing",
    description: "No DAUST housing charge.",
    calculation: "fixed",
    amountXof: 0,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3700",
    refundable: false,
    defaultSelected: true,
    sortOrder: 0,
  },
  {
    kind: "housing",
    code: "double",
    label: "Double room",
    description: "Shared double room.",
    calculation: "fixed",
    amountXof: 680_000,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3700",
    refundable: false,
    defaultSelected: false,
    sortOrder: 10,
  },
  {
    kind: "housing",
    code: "individual",
    label: "Individual room",
    description: "Private individual room.",
    calculation: "fixed",
    amountXof: 1_360_000,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3700",
    refundable: false,
    defaultSelected: false,
    sortOrder: 20,
  },
  {
    kind: "housing",
    code: "double_ac",
    label: "Double room with AC",
    description: "Shared double room with air conditioning.",
    calculation: "fixed",
    amountXof: 800_000,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3700",
    refundable: false,
    defaultSelected: false,
    sortOrder: 30,
  },
  {
    kind: "housing",
    code: "individual_ac",
    label: "Individual room with AC",
    description: "Private individual room with air conditioning.",
    calculation: "fixed",
    amountXof: 1_600_000,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3700",
    refundable: false,
    defaultSelected: false,
    sortOrder: 40,
  },
  {
    kind: "cafeteria",
    code: "none",
    label: "No cafeteria plan",
    description: "No annual cafeteria charge.",
    calculation: "fixed",
    amountXof: 0,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3600",
    refundable: false,
    defaultSelected: true,
    sortOrder: 0,
  },
  {
    kind: "cafeteria",
    code: "full",
    label: "Full cafeteria plan",
    description: "Full annual cafeteria plan.",
    calculation: "fixed",
    amountXof: 630_000,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3600",
    refundable: false,
    defaultSelected: false,
    sortOrder: 10,
  },
  {
    kind: "insurance",
    code: "none",
    label: "No insurance",
    description: "No annual insurance charge.",
    calculation: "fixed",
    amountXof: 0,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "9100",
    refundable: false,
    defaultSelected: false,
    sortOrder: 0,
  },
  {
    kind: "insurance",
    code: "annual",
    label: "Annual insurance",
    description: "Annual student insurance.",
    calculation: "fixed",
    amountXof: 10_000,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "9100",
    refundable: false,
    defaultSelected: true,
    sortOrder: 10,
  },
  {
    kind: "housing_caution",
    code: "none",
    label: "No housing caution",
    description: "No refundable housing caution.",
    calculation: "fixed",
    amountXof: 0,
    percentageBasisPoints: null,
    basisServiceKind: null,
    costCenterCode: "3700",
    refundable: true,
    defaultSelected: true,
    sortOrder: 0,
  },
  {
    kind: "housing_caution",
    code: "housing_10_percent",
    label: "Housing caution (10%)",
    description:
      "Refundable caution equal to 10% of the selected housing option.",
    calculation: "percentage_of_service",
    amountXof: null,
    percentageBasisPoints: 1_000,
    basisServiceKind: "housing",
    costCenterCode: "3700",
    refundable: true,
    defaultSelected: false,
    sortOrder: 10,
  },
] as const satisfies readonly BillingServiceOptionTemplate[];

export interface BillingAdjustmentDefinitionTemplate {
  key: string;
  label: string;
  description: string;
  basis: BillingAdjustmentBasis;
  calculation: BillingAdjustmentCalculation;
  stacking: BillingAdjustmentStacking;
  effect: BillingAdjustmentEffect;
  percentageBasisPoints: number | null;
  fixedAmountXof: number | null;
  requiresApproval: boolean;
  sortOrder: number;
}

export const INITIAL_BILLING_ADJUSTMENT_DEFINITIONS = [
  {
    key: "merit_10",
    label: "BAC merit 10%",
    description: "Automatic BAC merit award.",
    basis: "tuition",
    calculation: "percentage",
    stacking: "exclusive",
    effect: "discount",
    percentageBasisPoints: 1_000,
    fixedAmountXof: null,
    requiresApproval: false,
    sortOrder: 10,
  },
  {
    key: "merit_15",
    label: "BAC merit 15%",
    description: "Automatic BAC merit award.",
    basis: "tuition",
    calculation: "percentage",
    stacking: "exclusive",
    effect: "discount",
    percentageBasisPoints: 1_500,
    fixedAmountXof: null,
    requiresApproval: false,
    sortOrder: 20,
  },
  {
    key: "merit_20",
    label: "BAC merit 20%",
    description: "Automatic BAC merit award.",
    basis: "tuition",
    calculation: "percentage",
    stacking: "exclusive",
    effect: "discount",
    percentageBasisPoints: 2_000,
    fixedAmountXof: null,
    requiresApproval: false,
    sortOrder: 30,
  },
  {
    key: "family",
    label: "Family award",
    description: "Reviewed family award; amount is entered during approval.",
    basis: "tuition",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 40,
  },
  {
    key: "somone_resident",
    label: "Somone resident award",
    description: "Reviewed Somone resident award.",
    basis: "tuition",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 50,
  },
  {
    key: "full_scholarship",
    label: "Full tuition scholarship",
    description: "Full annual tuition scholarship; services remain billable.",
    basis: "tuition",
    calculation: "percentage",
    stacking: "exclusive",
    effect: "discount",
    percentageBasisPoints: 10_000,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 60,
  },
  {
    key: "s10",
    label: "S10 award",
    description: "Reviewed S10 award.",
    basis: "tuition",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 70,
  },
  {
    key: "three_fpt",
    label: "3FPT award",
    description: "Reviewed 3FPT award.",
    basis: "gross_charges",
    calculation: "manual",
    stacking: "exclusive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 80,
  },
  {
    key: "social_help",
    label: "Social help",
    description: "Reviewed social-help award.",
    basis: "tuition",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 90,
  },
  {
    key: "january_enrollment",
    label: "January enrollment adjustment",
    description: "Reviewed January-enrollment adjustment.",
    basis: "tuition",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 100,
  },
  {
    key: "manual_adjustment",
    label: "Manual reconciliation adjustment",
    description:
      "Reviewed manual reduction used only with explicit provenance.",
    basis: "manual",
    calculation: "manual",
    stacking: "additive",
    effect: "discount",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 110,
  },
  {
    key: "manual_charge",
    label: "Manual reconciliation charge",
    description:
      "Reviewed manual charge used only with explicit reconciliation provenance.",
    basis: "manual",
    calculation: "manual",
    stacking: "additive",
    effect: "charge",
    percentageBasisPoints: null,
    fixedAmountXof: null,
    requiresApproval: true,
    sortOrder: 120,
  },
] as const satisfies readonly BillingAdjustmentDefinitionTemplate[];

export const BillingProfileServiceViewSchema = z.object({
  kind: BillingServiceKind,
  optionCode: z.string(),
  percentageBasisOptionCode: z.string().nullable(),
  percentageBasisServiceKind: BillingServiceKind.nullable(),
  label: z.string(),
  amountXof: Xof,
  refundable: z.boolean(),
});
export type BillingProfileServiceView = z.infer<
  typeof BillingProfileServiceViewSchema
>;

export const BillingProfileAwardViewSchema = z.object({
  definitionKey: z.string(),
  label: z.string(),
  source: BillingAdjustmentSource,
  effect: BillingAdjustmentEffect,
  basis: BillingAdjustmentBasis,
  calculation: BillingAdjustmentCalculation,
  stacking: BillingAdjustmentStacking,
  requiresApproval: z.boolean(),
  basisAmountXof: Xof.nullable(),
  percentageBasisPoints: z.number().int().min(0).max(10_000).nullable(),
  amountXof: Xof,
  reason: z.string().nullable(),
});
export type BillingProfileAwardView = z.infer<
  typeof BillingProfileAwardViewSchema
>;

export const BillingProfileViewSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  academicYearLabel: z.string(),
  status: BillingProfileStatus,
  revision: z.number().int().nonnegative(),
  housing: BillingProfileServiceViewSchema.nullable(),
  cafeteria: BillingProfileServiceViewSchema.nullable(),
  insurance: BillingProfileServiceViewSchema.nullable(),
  caution: BillingProfileServiceViewSchema.nullable(),
  awards: z.array(BillingProfileAwardViewSchema),
  grossChargesXof: Xof,
  netBilledXof: Xof,
  paidXof: Xof,
  outstandingXof: Xof,
  accountCreditXof: Xof,
  source: z.object({
    kind: BillingProfileSourceKind,
    workbookSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    sheet: z.string().nullable(),
    rowNumber: z.number().int().positive().nullable(),
    asOfDate: z.string().date().nullable(),
  }),
  mismatchWarnings: z.array(z.string()),
});
export type BillingProfileView = z.infer<typeof BillingProfileViewSchema>;

function assertXof(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer XOF`);
  }
  return value;
}

/** Integer-XOF percentage using the same nearest-XOF convention as Finance. */
export function percentageOfXof(
  basisXof: number,
  percentageBasisPoints: number,
): number {
  assertXof(basisXof, "basisXof");
  if (
    !Number.isInteger(percentageBasisPoints) ||
    percentageBasisPoints < 0 ||
    percentageBasisPoints > 10_000
  ) {
    throw new RangeError(
      "percentageBasisPoints must be an integer from 0 to 10000",
    );
  }
  return Math.round((basisXof * percentageBasisPoints) / 10_000);
}

export function deriveBillingServiceAmountXof(
  option: Pick<
    BillingServiceOptionTemplate,
    "calculation" | "amountXof" | "percentageBasisPoints" | "basisServiceKind"
  >,
  selectedServiceAmounts: Partial<Record<BillingServiceKind, number>>,
): number {
  if (option.calculation === "fixed") {
    if (option.amountXof === null) {
      throw new Error("Fixed billing service option has no amount");
    }
    return assertXof(option.amountXof, "amountXof");
  }
  if (
    option.basisServiceKind === null ||
    option.percentageBasisPoints === null
  ) {
    throw new Error(
      "Percentage billing service option has no basis configuration",
    );
  }
  const basis = selectedServiceAmounts[option.basisServiceKind];
  if (basis === undefined) {
    throw new Error(
      `Missing ${option.basisServiceKind} amount for percentage service option`,
    );
  }
  return percentageOfXof(basis, option.percentageBasisPoints);
}

export type BillingBasisAmounts = Record<BillingAdjustmentBasis, number>;

export function calculateBillingAdjustmentAmountXof(
  definition: Pick<
    BillingAdjustmentDefinitionTemplate,
    "basis" | "calculation" | "percentageBasisPoints" | "fixedAmountXof"
  >,
  basisAmounts: Partial<BillingBasisAmounts>,
  manualAmountXof?: number,
): number {
  if (definition.calculation === "percentage") {
    if (definition.percentageBasisPoints === null) {
      throw new Error("Percentage adjustment has no percentage");
    }
    const basis = basisAmounts[definition.basis];
    if (basis === undefined) {
      throw new Error(`Missing ${definition.basis} adjustment basis`);
    }
    return percentageOfXof(basis, definition.percentageBasisPoints);
  }
  if (definition.calculation === "fixed") {
    if (definition.fixedAmountXof === null) {
      throw new Error("Fixed adjustment has no amount");
    }
    return assertXof(definition.fixedAmountXof, "fixedAmountXof");
  }
  if (manualAmountXof === undefined) {
    throw new Error("Manual adjustment requires an amount");
  }
  return assertXof(manualAmountXof, "manualAmountXof");
}

export interface BillingAmountSelection {
  kind: BillingServiceKind;
  amountXof: number;
}

export interface BillingAmountAdjustment {
  effect: BillingAdjustmentEffect;
  amountXof: number;
}

export interface BillingProfileTotals {
  grossChargesXof: number;
  discountXof: number;
  additionalChargesXof: number;
  netBilledXof: number;
}

export function deriveBillingProfileTotals(
  selections: readonly BillingAmountSelection[],
  adjustments: readonly BillingAmountAdjustment[],
): BillingProfileTotals {
  const kinds = new Set<BillingServiceKind>();
  let grossChargesXof = 0;
  for (const selection of selections) {
    if (kinds.has(selection.kind)) {
      throw new Error(`Duplicate ${selection.kind} billing selection`);
    }
    kinds.add(selection.kind);
    grossChargesXof += assertXof(selection.amountXof, "selection amountXof");
  }
  assertXof(grossChargesXof, "grossChargesXof");

  let discountXof = 0;
  let additionalChargesXof = 0;
  for (const adjustment of adjustments) {
    const amount = assertXof(adjustment.amountXof, "adjustment amountXof");
    if (adjustment.effect === "discount") discountXof += amount;
    else additionalChargesXof += amount;
  }
  assertXof(discountXof, "discountXof");
  assertXof(additionalChargesXof, "additionalChargesXof");
  const netBilledXof = grossChargesXof + additionalChargesXof - discountXof;
  if (netBilledXof < 0) {
    throw new RangeError(
      "Billing adjustments cannot make the net bill negative",
    );
  }
  assertXof(netBilledXof, "netBilledXof");
  return {
    grossChargesXof,
    discountXof,
    additionalChargesXof,
    netBilledXof,
  };
}

export function deriveBillingBalance(
  netBilledXof: number,
  paidXof: number,
): { outstandingXof: number; accountCreditXof: number } {
  assertXof(netBilledXof, "netBilledXof");
  assertXof(paidXof, "paidXof");
  return {
    outstandingXof: Math.max(0, netBilledXof - paidXof),
    accountCreditXof: Math.max(0, paidXof - netBilledXof),
  };
}

export interface BillingProfileReconciliationInput {
  profileGrossChargesXof: number;
  profileNetBilledXof: number;
  invoiceTotalXof: number;
  componentGrossAmountsXof: readonly number[];
  componentNetAmountsXof: readonly number[];
  adjustments: readonly BillingAmountAdjustment[];
}

export function billingProfileReconciliationWarnings(
  input: BillingProfileReconciliationInput,
): string[] {
  const warnings: string[] = [];
  const componentGross = input.componentGrossAmountsXof.reduce(
    (sum, value) => sum + assertXof(value, "component gross amount"),
    0,
  );
  const componentNet = input.componentNetAmountsXof.reduce(
    (sum, value) => sum + assertXof(value, "component net amount"),
    0,
  );
  const adjustmentNet = input.adjustments.reduce(
    (sum, row) =>
      sum +
      (row.effect === "discount" ? -1 : 1) *
        assertXof(row.amountXof, "adjustment amount"),
    0,
  );

  if (componentGross !== input.profileGrossChargesXof) {
    warnings.push("component_gross_does_not_match_profile");
  }
  if (componentNet !== input.profileNetBilledXof) {
    warnings.push("component_net_does_not_match_profile");
  }
  if (input.profileNetBilledXof !== input.invoiceTotalXof) {
    warnings.push("profile_net_does_not_match_invoice");
  }
  if (componentGross + adjustmentNet !== input.profileNetBilledXof) {
    warnings.push("gross_plus_adjustments_does_not_match_net");
  }
  return warnings;
}

export function assertBillingProfileReconciliation(
  input: BillingProfileReconciliationInput,
): void {
  const warnings = billingProfileReconciliationWarnings(input);
  if (warnings.length > 0) {
    throw new Error(
      `Billing profile does not reconcile: ${warnings.join(", ")}`,
    );
  }
}

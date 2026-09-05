/**
 * The fee catalog the billing workbook needs.
 *
 * The workbook prices four housing tiers, an annual insurance line and a housing
 * deposit set at 10% of the tier. A catalog component carries exactly one amount,
 * so each tier is its own key rather than one `housing` key with a variable value.
 * That keeps every invoice on the standard package: a student is priced by which
 * components are SELECTED, and the amounts always come from the catalog.
 *
 * Every added key is `defaultSelected: false`, so approving the revision selects
 * nothing new and no student's total moves.
 *
 * `insurance` and `application_fee` are reserved keys (fee-components.ts:118).
 * `student_insurance` is not, and passes FEE_COMPONENT_KEY.
 */

export interface CatalogComponent {
  key: string;
  label: string;
  description: string;
  costCenterCode: string;
  annualAmountXof: number;
  defaultSelected: boolean;
  sortOrder: number;
}

/** Already approved in production as fee schedule revision 4. */
export const EXISTING_COMPONENTS: readonly CatalogComponent[] = [
  {
    key: "tuition",
    label: "Tuition",
    description: "Annual tuition",
    costCenterCode: "9100",
    annualAmountXof: 2_975_000,
    defaultSelected: true,
    sortOrder: 0,
  },
  {
    key: "housing",
    label: "Housing — double",
    description: "Annual student housing, shared double room",
    costCenterCode: "3700",
    annualAmountXof: 680_000,
    defaultSelected: true,
    sortOrder: 1,
  },
  {
    key: "cafeteria",
    label: "Cafeteria",
    description: "Annual cafeteria plan",
    costCenterCode: "3600",
    annualAmountXof: 630_000,
    defaultSelected: true,
    sortOrder: 2,
  },
];

export const ADDED_COMPONENTS: readonly CatalogComponent[] = [
  {
    key: "housing_double_ac",
    label: "Housing — double with AC",
    description:
      "Annual student housing, shared double room with air conditioning",
    costCenterCode: "3700",
    annualAmountXof: 800_000,
    defaultSelected: false,
    sortOrder: 3,
  },
  {
    key: "housing_individual",
    label: "Housing — individual",
    description: "Annual student housing, single room",
    costCenterCode: "3700",
    annualAmountXof: 1_360_000,
    defaultSelected: false,
    sortOrder: 4,
  },
  {
    key: "housing_individual_ac",
    label: "Housing — individual with AC",
    description: "Annual student housing, single room with air conditioning",
    costCenterCode: "3700",
    annualAmountXof: 1_600_000,
    defaultSelected: false,
    sortOrder: 5,
  },
  {
    key: "student_insurance",
    label: "Student insurance",
    description: "Annual student insurance",
    costCenterCode: "9100",
    annualAmountXof: 10_000,
    defaultSelected: false,
    sortOrder: 6,
  },
  {
    key: "housing_deposit",
    label: "Housing deposit — double",
    description: "Refundable housing deposit, 10% of the double-room rate",
    costCenterCode: "3700",
    annualAmountXof: 68_000,
    defaultSelected: false,
    sortOrder: 7,
  },
  {
    key: "housing_deposit_double_ac",
    label: "Housing deposit — double with AC",
    description: "Refundable housing deposit, 10% of the double-with-AC rate",
    costCenterCode: "3700",
    annualAmountXof: 80_000,
    defaultSelected: false,
    sortOrder: 8,
  },
  {
    key: "housing_deposit_individual",
    label: "Housing deposit — individual",
    description: "Refundable housing deposit, 10% of the single-room rate",
    costCenterCode: "3700",
    annualAmountXof: 136_000,
    defaultSelected: false,
    sortOrder: 9,
  },
  {
    key: "housing_deposit_individual_ac",
    label: "Housing deposit — individual with AC",
    description: "Refundable housing deposit, 10% of the single-with-AC rate",
    costCenterCode: "3700",
    annualAmountXof: 160_000,
    defaultSelected: false,
    sortOrder: 10,
  },
];

export const TARGET_CATALOG: readonly CatalogComponent[] = [
  ...EXISTING_COMPONENTS,
  ...ADDED_COMPONENTS,
];

export type HousingTier =
  "none" | "double" | "double_ac" | "individual" | "individual_ac";

export const HOUSING_KEY_BY_TIER: Record<HousingTier, string | null> = {
  none: null,
  double: "housing",
  double_ac: "housing_double_ac",
  individual: "housing_individual",
  individual_ac: "housing_individual_ac",
};

export const DEPOSIT_KEY_BY_TIER: Record<HousingTier, string | null> = {
  none: null,
  double: "housing_deposit",
  double_ac: "housing_deposit_double_ac",
  individual: "housing_deposit_individual",
  individual_ac: "housing_deposit_individual_ac",
};

/** Exactly one of these may be selected on any invoice. Nothing in the fee-schedule
 * validator enforces mutual exclusivity, so the planner must. */
export const HOUSING_KEYS: readonly string[] = Object.values(
  HOUSING_KEY_BY_TIER,
).filter((key): key is string => key !== null);

export const DEPOSIT_KEYS: readonly string[] = Object.values(
  DEPOSIT_KEY_BY_TIER,
).filter((key): key is string => key !== null);

const AMOUNT_BY_KEY = new Map(
  TARGET_CATALOG.map((component) => [component.key, component.annualAmountXof]),
);

export function catalogAmountXof(key: string): number {
  const amount = AMOUNT_BY_KEY.get(key);
  if (amount === undefined) throw new Error(`Unknown catalog component ${key}`);
  return amount;
}

/** The exact `components` array for PUT /finance/admin/fee-plan. */
export function feePlanRevisionPayload(): readonly CatalogComponent[] {
  return TARGET_CATALOG;
}

import { BadRequestException } from "@nestjs/common";

export const FEE_COMPONENT_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * Invoice, invoice-component, and installment amounts are stored as PostgreSQL
 * INTEGER values. Keep the package below that physical ceiling with additional
 * room for operational adjustments and legacy arithmetic.
 */
export const MAX_FEE_PACKAGE_TOTAL_XOF = 2_000_000_000;

export type FeeComponentDefinition = {
  id?: string | null;
  key: string;
  label: string;
  description?: string | null;
  costCenterCode: string;
  annualAmountXof: number;
  defaultSelected: boolean;
  sortOrder: number;
};

export const CORE_FEE_COMPONENTS: Record<
  "tuition" | "housing" | "cafeteria",
  {
    label: string;
    description: string;
    costCenterCode: string;
    sortOrder: number;
  }
> = {
  tuition: {
    label: "Tuition",
    description: "Annual tuition",
    costCenterCode: "9100",
    sortOrder: 0,
  },
  housing: {
    label: "Housing",
    description: "Annual student housing",
    costCenterCode: "3700",
    sortOrder: 1,
  },
  cafeteria: {
    label: "Cafeteria",
    description: "Annual cafeteria plan",
    costCenterCode: "3600",
    sortOrder: 2,
  },
};

/** Deterministic whole-XOF split: earlier sequence positions receive the remainder. */
export function splitEvenlyXof(totalXof: number, count: number): number[] {
  if (
    !Number.isSafeInteger(totalXof) ||
    totalXof < 0 ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    throw new BadRequestException(
      "Fee totals and installment counts are invalid",
    );
  }
  const base = Math.floor(totalXof / count);
  const remainder = totalXof - base * count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/**
 * The single aggregate invariant for every selected annual package. Callers
 * pass only the components selected for the global package or student account.
 */
export function feePackageTotalXof(
  components: readonly Pick<FeeComponentDefinition, "annualAmountXof">[],
): number {
  let total = 0;
  for (const component of components) {
    if (
      !Number.isSafeInteger(component.annualAmountXof) ||
      component.annualAmountXof < 0
    ) {
      throw new BadRequestException(
        "Fee package components must be non-negative whole XOF values",
      );
    }
    total += component.annualAmountXof;
    if (total > MAX_FEE_PACKAGE_TOTAL_XOF) {
      throw new BadRequestException(
        "An annual fee package cannot exceed 2,000,000,000 XOF",
      );
    }
  }
  return total;
}

export function validateFeeComponents(
  components: readonly FeeComponentDefinition[],
): FeeComponentDefinition[] {
  if (components.length === 0 || components.length > 50) {
    throw new BadRequestException(
      "A fee schedule needs between 1 and 50 components",
    );
  }
  const keys = new Set<string>();
  return components.map((component, index) => {
    const key = component.key.trim().toLowerCase();
    const label = component.label.trim();
    const description = component.description?.trim() || null;
    const costCenterCode = component.costCenterCode.trim();
    if (!FEE_COMPONENT_KEY.test(key)) {
      throw new BadRequestException(
        "Component keys must start with a lowercase letter and contain only lowercase letters, numbers, or underscores (40 characters maximum)",
      );
    }
    if (["application_fee", "insurance"].includes(key)) {
      throw new BadRequestException(
        `${key} is reserved for a separate operational fee and cannot be an annual student charge`,
      );
    }
    if (keys.has(key))
      throw new BadRequestException(`Duplicate fee component ${key}`);
    keys.add(key);
    if (!label || label.length > 80) {
      throw new BadRequestException(
        "Component labels must be 1 to 80 characters",
      );
    }
    if (description && description.length > 240) {
      throw new BadRequestException(
        "Component descriptions cannot exceed 240 characters",
      );
    }
    if (!costCenterCode || costCenterCode.length > 8) {
      throw new BadRequestException(
        "Component cost centers must be 1 to 8 characters",
      );
    }
    const core = CORE_FEE_COMPONENTS[key as keyof typeof CORE_FEE_COMPONENTS];
    if (core && core.costCenterCode !== costCenterCode) {
      throw new BadRequestException(
        `${core.label} must use cost center ${core.costCenterCode}`,
      );
    }
    if (
      !Number.isSafeInteger(component.annualAmountXof) ||
      component.annualAmountXof <= 0 ||
      component.annualAmountXof > 100_000_000
    ) {
      throw new BadRequestException(
        "Component amounts must be positive whole XOF values up to 100,000,000",
      );
    }
    const sortOrder = component.sortOrder ?? index;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
      throw new BadRequestException(
        "Component sort order must be between 0 and 999",
      );
    }
    return {
      id: component.id ?? null,
      key,
      label,
      description,
      costCenterCode,
      annualAmountXof: component.annualAmountXof,
      defaultSelected: component.defaultSelected !== false,
      sortOrder,
    };
  });
}

export function requireCoreFeeComponents(
  components: readonly FeeComponentDefinition[],
): FeeComponentDefinition[] {
  const keys = new Set(components.map((component) => component.key));
  const missing = Object.keys(CORE_FEE_COMPONENTS).filter(
    (key) => !keys.has(key),
  );
  if (missing.length > 0) {
    throw new BadRequestException(
      `Core fee components cannot be deleted: ${missing.join(", ")}`,
    );
  }
  return [...components];
}

export function displayFeeComponentLabel(key: string) {
  return (
    CORE_FEE_COMPONENTS[key as keyof typeof CORE_FEE_COMPONENTS]?.label ??
    key
      .split("_")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ")
  );
}
